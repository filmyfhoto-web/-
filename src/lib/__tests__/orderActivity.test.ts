import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  insert: vi.fn().mockResolvedValue({ error: null }),
  rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
const { insert, rpc } = h;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ insert: h.insert }),
    rpc: h.rpc,
  },
}));

import { logOrderAction, orderActionLabel, summarizeDetail, fetchOrderActivity } from "@/lib/orderActivity";

describe("orderActivity", () => {
  beforeEach(() => { insert.mockClear(); rpc.mockClear(); });

  it("writes an order-scoped audit row with the current user", async () => {
    await logOrderAction("ord-1", "order_ack", { order_no: "SO-1" });
    expect(insert).toHaveBeenCalledWith({
      user_id: "u1",
      action: "order_ack",
      target_type: "order",
      target_id: "ord-1",
      detail: { order_no: "SO-1" },
    });
  });

  it("translates known actions to Thai and passes unknown ones through", () => {
    expect(orderActionLabel("order_line_resend")).toBe("ส่ง LINE ซ้ำ");
    expect(orderActionLabel("weird_action")).toBe("weird_action");
  });

  it("summarises detail payloads", () => {
    expect(summarizeDetail({ order_no: "SO-1", doc_type: "quotation" })).toBe(
      "เลขที่: SO-1 · ชนิดเอกสาร: quotation",
    );
    expect(summarizeDetail(null)).toBe("");
  });

  it("reads history through the staff-only RPC", async () => {
    await fetchOrderActivity("ord-1");
    expect(rpc).toHaveBeenCalledWith("get_order_activity_log", { _order_id: "ord-1" });
  });
});