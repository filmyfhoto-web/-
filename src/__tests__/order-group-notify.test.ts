import { describe, it, expect } from "vitest";
import {
  buildOrderGroupText,
  pickOrderGroupDestinations,
  ORDER_GROUP_CHANNEL_TYPE,
} from "../../supabase/functions/_shared/orderGroupNotify.ts";
import {
  interpretProfileStatus,
  blocksOrder,
  checkFriendshipViaMessagingApi,
} from "../../supabase/functions/_shared/lineFriendCheck.ts";
import { parseAdminGroupTarget } from "../../supabase/functions/_shared/adminGroupCommands.ts";
import { mapBindingToGate } from "@/components/customer/LineOrderGate";

describe("order group destinations", () => {
  it("keeps only the first active LINE group/room id (group-only, no duplicates)", () => {
    expect(
      pickOrderGroupDestinations([
        { line_destination_id: "Cabc1234567890", is_active: true },
        { line_destination_id: "Rdef1234567890", is_active: true },
        { line_destination_id: "Uuser1234567890", is_active: true }, // 1:1 user
        { line_destination_id: "Cold1234567890", is_active: false },
        { line_destination_id: "", is_active: true },
        { line_destination_id: null, is_active: true },
      ]),
    ).toEqual([{ dest: "Cabc1234567890", storeId: null }]);
  });

  it("skips 1:1 chats and disabled rooms entirely", () => {
    expect(
      pickOrderGroupDestinations([
        { line_destination_id: "Uuser1234567890", is_active: true },
        { line_destination_id: "Cold1234567890", is_active: false },
      ]),
    ).toEqual([]);
  });


  it("carries the owning store so the right LINE OA token is used", () => {
    expect(
      pickOrderGroupDestinations([
        { line_destination_id: "Cabc1234567890", is_active: true, store_id: "runqueue" },
      ]),
    ).toEqual([{ dest: "Cabc1234567890", storeId: "runqueue" }]);
  });

  it("dedupes duplicated rooms", () => {
    expect(
      pickOrderGroupDestinations([
        { line_destination_id: "Cabc1234567890", is_active: true },
        { line_destination_id: "Cabc1234567890", is_active: true },
      ]),
    ).toHaveLength(1);
  });

  it("renders a Thai card with order no, customer and admin link", () => {
    const text = buildOrderGroupText(
      {
        orderId: "o1", orderNo: "SO-0001", customerName: "โรงเรียนน่าน",
        itemCount: 3, total: 1250, source: "เว็บแอปลูกค้า",
        createdAt: "2026-08-18T03:00:00.000Z",
      },
      "https://example.com/admin?order=o1",
    );
    expect(text).toContain("🛒 คำสั่งซื้อใหม่");
    expect(text).toContain("SO-0001");
    expect(text).toContain("โรงเรียนน่าน");
    expect(text).toContain("1,250 บาท");
    expect(text).toContain("https://example.com/admin?order=o1");
  });

  it("shows รอเสนอราคา when total is unknown", () => {
    const text = buildOrderGroupText(
      { orderId: "o", orderNo: "SO-2", customerName: "x", itemCount: 1, total: null, source: "เว็บแอปลูกค้า", createdAt: new Date().toISOString() },
      "https://x",
    );
    expect(text).toContain("รอเสนอราคา");
  });

  it("uses a dedicated channel type separate from queue/doc rooms", () => {
    expect(ORDER_GROUP_CHANNEL_TYPE).toBe("order_group");
    expect(ORDER_GROUP_CHANNEL_TYPE).not.toBe("queue_group");
  });
});

describe("server-side friendship gate", () => {
  it("200 = friend, 404 = not friend, others unknown", () => {
    expect(interpretProfileStatus(200)).toEqual({ confirmed: true, status: "confirmed" });
    expect(interpretProfileStatus(404)).toEqual({ confirmed: false, status: "not_friend" });
    expect(interpretProfileStatus(500).status).toBe("unknown");
    expect(interpretProfileStatus(401).status).toBe("unknown");
  });

  it("blocks only an explicit not_friend; unknown/config_missing fall back to allow", () => {
    expect(blocksOrder("not_friend")).toBe(true);
    expect(blocksOrder("confirmed")).toBe(false);
    expect(blocksOrder("unknown")).toBe(false);
    expect(blocksOrder("config_missing")).toBe(false);
  });

  it("never calls LINE without a token", async () => {
    let called = false;
    const res = await checkFriendshipViaMessagingApi(undefined, "U1", (async () => {
      called = true; return new Response("", { status: 200 });
    }) as unknown as typeof fetch);
    expect(called).toBe(false);
    expect(res.status).toBe("config_missing");
  });

  it("treats network failures as unknown, not as a friend", async () => {
    const res = await checkFriendshipViaMessagingApi("tok", "U1", (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch);
    expect(res).toEqual({ confirmed: false, status: "unknown" });
  });

  it("confirms a real friend", async () => {
    const res = await checkFriendshipViaMessagingApi("tok", "U1", (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch);
    expect(res.confirmed).toBe(true);
  });
});

describe("order group LINE command", () => {
  it("maps the Thai connect command to order_group", () => {
    expect(parseAdminGroupTarget("เชื่อมกลุ่มออเดอร์")).toEqual({
      command: "connect", channelType: "order_group", raw: "เชื่อมกลุ่มออเดอร์",
    });
  });
  it("does not collide with the queue room command", () => {
    expect(parseAdminGroupTarget("เชื่อมกลุ่มรันคิว")?.channelType).not.toBe("order_group");
  });
});

describe("checkout gate mapping", () => {
  it("only a linked+friend binding may submit", () => {
    expect(mapBindingToGate("linked")).toBe("ready");
    expect(mapBindingToGate("needs_friend")).toBe("needs_friend");
    expect(mapBindingToGate("unlinked")).toBe("needs_login");
    expect(mapBindingToGate("loading")).toBe("checking");
    expect(mapBindingToGate("boom")).toBe("error");
  });
});
