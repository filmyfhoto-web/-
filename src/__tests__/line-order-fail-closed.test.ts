import { describe, it, expect, vi } from "vitest";
import {
  checkFriendshipViaMessagingApi,
  blocksOrder,
  orderGateDecision,
} from "../../supabase/functions/_shared/lineFriendCheck.ts";
import { pickOrderGroupDestinations } from "../../supabase/functions/_shared/orderGroupNotify.ts";
import { mapLineOrderError } from "@/lib/lineOrderErrors";

/** จำลอง edge function ส่วนที่เป็น gate: not_friend ต้องบล็อกก่อนเกิด side effect ใด ๆ */
async function submitWithGate(opts: {
  token?: string;
  fetchImpl: typeof fetch;
  clientClaimsFriend?: boolean;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  const outbox: unknown[] = [];
  const friend = await checkFriendshipViaMessagingApi(opts.token, "U123", opts.fetchImpl);
  const decision = orderGateDecision(friend.status);
  if (decision.allow !== true) {
    const blocked = decision as Extract<typeof decision, { allow: false }>;
    return { ok: false as const, code: blocked.code, httpStatus: blocked.httpStatus, friend_status: friend.status, inserts, outbox };
  }
  inserts.push({ order_no: "SO-1", friendship_status: friend.status });
  outbox.push({ type: "order_group" });
  return { ok: true as const, friend_status: friend.status, inserts, outbox };
}

const resp = (status: number) => (async () => ({ status, text: async () => "" })) as unknown as typeof fetch;
const boom = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;

describe("friendship policy: identity fail-closed, friendship best-effort", () => {
  it("blocks only an explicitly confirmed not_friend", () => {
    expect(blocksOrder("confirmed")).toBe(false);
    expect(blocksOrder("not_friend")).toBe(true);
    expect(blocksOrder("unknown")).toBe(false);
    expect(blocksOrder("config_missing")).toBe(false);
  });

  it("maps statuses to decisions", () => {
    expect(orderGateDecision("confirmed")).toEqual({ allow: true });
    expect(orderGateDecision("not_friend").allow).toBe(false);
    expect((orderGateDecision("not_friend") as any).code).toBe("LINE_NOT_FRIEND");
    expect(orderGateDecision("unknown")).toEqual({ allow: true });
    expect(orderGateDecision("config_missing")).toEqual({ allow: true });
  });

  it("confirmed (HTTP 200) creates the order exactly once", async () => {
    const r = await submitWithGate({ token: "tok", fetchImpl: resp(200) });
    expect(r.ok).toBe(true);
    expect(r.inserts).toHaveLength(1);
    expect(r.outbox).toHaveLength(1);
  });

  it("HTTP 404 (not_friend) blocks and writes nothing", async () => {
    const r = await submitWithGate({ token: "tok", fetchImpl: resp(404) });
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("LINE_NOT_FRIEND");
    expect(r.inserts).toHaveLength(0);
    expect(r.outbox).toHaveLength(0);
  });

  it.each([401, 403, 429, 500, 502, 503])(
    "HTTP %s → unknown: order proceeds and records the true status, never 'confirmed'",
    async (status) => {
      const r = await submitWithGate({ token: "tok", fetchImpl: resp(status) });
      expect(r.ok).toBe(true);
      expect(r.friend_status).toBe("unknown");
      expect(r.inserts[0].friendship_status).toBe("unknown");
    },
  );

  it("network error → unknown, order still allowed for a verified LINE customer", async () => {
    const r = await submitWithGate({ token: "tok", fetchImpl: boom });
    expect(r.ok).toBe(true);
    expect(r.friend_status).toBe("unknown");
    expect(r.inserts[0].friendship_status).toBe("unknown");
  });

  it("missing channel token → config_missing fallback, never calls LINE, never fakes friend=true", async () => {
    const spy = vi.fn();
    const r = await submitWithGate({ token: undefined, fetchImpl: spy as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    expect(r.friend_status).toBe("config_missing");
    expect(r.inserts[0].friendship_status).toBe("config_missing");
    expect(spy).not.toHaveBeenCalled();
  });

  it("a forged client friend flag cannot unlock the gate", async () => {
    const r = await submitWithGate({ token: "tok", fetchImpl: resp(404), clientClaimsFriend: true });
    expect(r.ok).toBe(false);
    expect((r as any).code).toBe("LINE_NOT_FRIEND");
  });

  it("an unconfigured order group does not fail a confirmed order", async () => {
    expect(pickOrderGroupDestinations([])).toEqual([]);
    const r = await submitWithGate({ token: "tok", fetchImpl: resp(200) });
    expect(r.ok).toBe(true);
  });
});

describe("client error mapping (Thai cards)", () => {
  it("LINE_NOT_FRIEND → add friend card", () => {
    const m = mapLineOrderError("LINE_NOT_FRIEND");
    expect(m?.action).toBe("add_friend");
    expect(m?.openGate).toBe(true);
    expect(m?.message).toMatch(/เพิ่มเพื่อน/);
  });
  it("LINE_FRIEND_CHECK_UNAVAILABLE → recheck card", () => {
    const m = mapLineOrderError("LINE_FRIEND_CHECK_UNAVAILABLE");
    expect(m?.action).toBe("recheck");
    expect(m?.message).toMatch(/ลองตรวจสอบใหม่/);
  });
  it("LINE_CONFIG_MISSING → contact shop, no gate", () => {
    const m = mapLineOrderError("LINE_CONFIG_MISSING");
    expect(m?.action).toBe("contact_shop");
    expect(m?.openGate).toBe(false);
  });
  it("unknown codes fall through so catalog/cart keep working", () => {
    expect(mapLineOrderError("weird_error")).toBeNull();
    expect(mapLineOrderError(undefined)).toBeNull();
  });
});
