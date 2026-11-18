import { describe, it, expect, vi } from "vitest";
import { checkFriendshipViaMessagingApi, interpretProfileStatus } from "./_friend";

describe("interpretProfileStatus", () => {
  it("200 → confirmed", () => {
    expect(interpretProfileStatus(200)).toEqual({ confirmed: true, status: "confirmed" });
  });
  it("404 → not_friend", () => {
    expect(interpretProfileStatus(404)).toEqual({ confirmed: false, status: "not_friend" });
  });
  it.each([401, 403, 500, 502, 0, null, undefined])("HTTP %s → unknown", (s) => {
    expect(interpretProfileStatus(s as number)).toEqual({ confirmed: false, status: "unknown" });
  });
});

describe("checkFriendshipViaMessagingApi", () => {
  it("returns config_missing when channel access token absent (never calls fetch)", async () => {
    const fetchSpy = vi.fn();
    const r = await checkFriendshipViaMessagingApi("", "Uabc", fetchSpy as any);
    expect(r).toEqual({ confirmed: false, status: "config_missing" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps HTTP 200 to confirmed and consumes body", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      text: async () => "ok",
    })) as any;
    const r = await checkFriendshipViaMessagingApi("tok", "Uabc", fetchImpl);
    expect(r).toEqual({ confirmed: true, status: "confirmed" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps HTTP 404 to not_friend", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 404, text: async () => "" })) as any;
    const r = await checkFriendshipViaMessagingApi("tok", "Uabc", fetchImpl);
    expect(r).toEqual({ confirmed: false, status: "not_friend" });
  });

  it("maps HTTP 500 to unknown", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 500, text: async () => "" })) as any;
    const r = await checkFriendshipViaMessagingApi("tok", "Uabc", fetchImpl);
    expect(r).toEqual({ confirmed: false, status: "unknown" });
  });

  it("network errors become unknown (never throw, never leak)", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("dns down"); }) as any;
    const r = await checkFriendshipViaMessagingApi("tok", "Uabc", fetchImpl);
    expect(r).toEqual({ confirmed: false, status: "unknown" });
  });

  it("encodes user id in URL", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return { status: 200, text: async () => "" };
    }) as any;
    await checkFriendshipViaMessagingApi("tok", "U/../evil", fetchImpl);
    expect(calls[0]).toContain("U%2F..%2Fevil");
    expect(calls[0]).not.toContain("U/../");
  });
});