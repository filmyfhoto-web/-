import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const rowsFixture = [
  { id: "n1", type: "order_created", title: "รับคำสั่งซื้อแล้ว", body: "TEST-NOTIFY", ref_id: "o1", link: "/my-orders/o1", read: false, created_at: "2026-08-06T13:00:00Z" },
  { id: "n2", type: "order_status", title: "อัปเดตสถานะคำสั่งซื้อ", body: "TEST-NOTIFY: เสนอราคาแล้ว", ref_id: "o1", link: "/my-orders/o1", read: true, created_at: "2026-08-06T13:04:00Z" },
];

const h = vi.hoisted(() => {
  const subscribe = vi.fn();
  const on = vi.fn().mockReturnValue({ subscribe });
  return { rpc: vi.fn().mockResolvedValue({ data: true, error: null }), removeChannel: vi.fn(), on, subscribe };
});
const rpc = h.rpc;
const on = h.on;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: rowsFixture, error: null }) }),
        }),
      }),
    }),
    rpc: h.rpc,
    channel: vi.fn(() => ({ on: h.on })),
    removeChannel: h.removeChannel,
  },
}));

import { useCustomerNotifications } from "@/hooks/useCustomerNotifications";

describe("แจ้งเตือนออเดอร์ฝั่งลูกค้า", () => {
  beforeEach(() => rpc.mockClear());

  it("โหลดรายการของผู้ใช้ตัวเองและนับ unread ถูกต้อง", async () => {
    const { result } = renderHook(() => useCustomerNotifications());
    await waitFor(() => expect(result.current.items?.length).toBe(2));
    expect(result.current.unread).toBe(1);
  });

  it("mark as read เรียก RPC และลด badge", async () => {
    const { result } = renderHook(() => useCustomerNotifications());
    await waitFor(() => expect(result.current.items?.length).toBe(2));
    await act(async () => { await result.current.markRead("n1"); });
    expect(rpc).toHaveBeenCalledWith("mark_notification_read", { p_id: "n1" });
    expect(result.current.unread).toBe(0);
  });

  it("subscribe realtime เฉพาะแถวของผู้ใช้", async () => {
    renderHook(() => useCustomerNotifications());
    await waitFor(() => expect(on).toHaveBeenCalled());
    expect(on.mock.calls[0][1]).toMatchObject({ table: "notifications", filter: "user_id=eq.u1" });
  });
});

describe("migration แจ้งเตือนออเดอร์", () => {
  const dir = "supabase/migrations";
  const sql = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");

  it("มี unique index กันแจ้งเตือนซ้ำ", () => {
    expect(sql).toContain("notifications_dedup_uidx");
  });

  it("มี trigger ตอนสร้างออเดอร์และตอนเปลี่ยนสถานะ", () => {
    expect(sql).toContain("trg_orders_notify_created");
    expect(sql).toContain("trg_order_status_notify");
  });

  it("ผูกลูกค้าจาก customer_id หรือ line_user_id", () => {
    expect(sql).toContain("order_customer_user_id");
  });
});

describe("หน้าแจ้งเตือนลูกค้า", () => {
  const page = readFileSync("src/pages/customer/CustomerNotifications.tsx", "utf8");
  it("เปิดออเดอร์ที่ถูกต้องและ mark as read", () => {
    expect(page).toContain("markRead(id)");
    expect(page).toContain("/my-orders/");
  });
  it("มี badge ยังไม่อ่าน", () => {
    expect(page).toContain("notif-unread-badge");
  });
});
