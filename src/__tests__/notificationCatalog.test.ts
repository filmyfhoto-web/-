import { describe, expect, it } from "vitest";
import {
  catalogFor, friendlyBody, friendlyTime, groupOf, isNoise, isRawErrorCode,
  matchesQuery, resolveActions,
} from "@/components/admin/hub/notificationCatalog";

const base = { type: null, title: null, body: null, link: null, ref_id: null };

describe("notificationCatalog", () => {
  it("จัดหมวดตามชนิดแจ้งเตือน", () => {
    expect(groupOf("new_order")).toBe("order");
    expect(groupOf("new_customer_order")).toBe("order");
    expect(groupOf("new_requisition")).toBe("requisition");
    expect(groupOf("line_login_failure")).toBe("line");
    expect(groupOf("webhook_failure")).toBe("system");
    expect(groupOf("something_else")).toBe("system");
  });

  it("แปลรหัสผิดพลาดเป็นภาษาพนักงาน", () => {
    expect(isRawErrorCode("state_invalid_or_expired")).toBe(true);
    expect(friendlyBody("state_invalid_or_expired")).toContain("ลิงก์เข้าสู่ระบบหมดอายุ");
    expect(friendlyBody("token_exchange_failed · trace abc")).toContain("ระบบ LINE ปฏิเสธ");
    expect(friendlyBody("ออเดอร์ SO-1 ถูกสร้างแล้ว")).toBe("ออเดอร์ SO-1 ถูกสร้างแล้ว");
    expect(friendlyBody(null, "ทำต่อ")).toBe("ทำต่อ");
  });

  it("ปุ่มตรงกับงานจริงและใช้ลิงก์ที่บันทึกไว้", () => {
    const order = resolveActions({ ...base, type: "new_order", link: "/admin/orders/x" });
    expect(order.at(-1)).toEqual({ label: "เปิดออเดอร์", to: "/admin/orders/x", variant: "primary" });

    const cust = resolveActions({ ...base, type: "new_customer_order" });
    expect(cust.map((a) => a.label)).toEqual(["จับคู่ลูกค้า", "เปิดออเดอร์"]);

    const login = resolveActions({ ...base, type: "line_login_failure" });
    expect(login.at(-1)?.label).toBe("ส่งลิงก์ใหม่");

     const req = resolveActions({ ...base, type: "new_requisition", ref_id: "req-1" });
     expect(req[0].to).toBe("/admin/work-docs?filter=requisition&kind=requisition&id=req-1");

    const staff = resolveActions({ ...base, type: "staff_line_approved" });
    expect(staff[0]).toEqual({ label: "อนุมัติพนักงาน", to: "/admin/staff-line", variant: "primary" });
  });

  it("ไม่ตามลิงก์ภายนอก", () => {
    const a = resolveActions({ ...base, type: "new_order", link: "//evil.com" });
    expect(a.at(-1)?.to).toBe("/admin/customer-purchase-orders");
  });

  it("ยุบแจ้งเตือนเทคนิคที่มีจำนวนมาก", () => {
    expect(isNoise("webhook_failure")).toBe(true);
    expect(isNoise("new_order")).toBe(false);
  });

  it("ค้นหาด้วยชื่อลูกค้าหรือเลขออเดอร์", () => {
    const n = { ...base, type: "new_order", title: "ออเดอร์ SO-2608-68226365", body: "ครูเอกรัตน์" };
    expect(matchesQuery(n, "SO-2608")).toBe(true);
    expect(matchesQuery(n, "เอกรัตน์")).toBe(true);
    expect(matchesQuery(n, "ไม่มี")).toBe(false);
    expect(matchesQuery(n, "  ")).toBe(true);
  });

  it("แสดงเวลาแบบอ่านง่าย", () => {
    const now = new Date(2026, 7, 25, 10, 0, 0);
    expect(friendlyTime(new Date(2026, 7, 25, 6, 56).toISOString(), now)).toContain("วันนี้");
    expect(friendlyTime(new Date(2026, 7, 24, 13, 47).toISOString(), now)).toContain("เมื่อวาน");
    expect(friendlyTime(new Date(2026, 7, 19, 18, 28).toISOString(), now)).not.toContain("วันนี้");
    expect(friendlyTime(null)).toBe("-");
  });


  it("มีคำอธิบายทุกชนิดที่รู้จัก", () => {
    expect(catalogFor("webhook_failure").label).toBe("การเชื่อมต่อ LINE ขัดข้อง");
    expect(catalogFor("unknown_type").hint.length).toBeGreaterThan(0);
  });
});

import { withinRange, matchesStatus, relatedLinks } from "@/components/admin/hub/notificationCatalog";

describe("ตัวกรองช่วงวันที่และสถานะ", () => {
  const now = new Date("2026-08-25T10:00:00Z");
  const iso = (d: string) => new Date(d).toISOString();

  it("กรองวันนี้ / 7 วัน / 30 วัน / ทั้งหมด", () => {
    expect(withinRange(iso("2026-08-25T01:00:00Z"), "today", now)).toBe(true);
    expect(withinRange(iso("2026-08-24T01:00:00Z"), "today", now)).toBe(false);
    expect(withinRange(iso("2026-08-20T01:00:00Z"), "7d", now)).toBe(true);
    expect(withinRange(iso("2026-08-10T01:00:00Z"), "7d", now)).toBe(false);
    expect(withinRange(iso("2026-08-10T01:00:00Z"), "30d", now)).toBe(true);
    expect(withinRange(iso("2026-01-01T01:00:00Z"), "30d", now)).toBe(false);
    expect(withinRange(iso("2020-01-01T01:00:00Z"), "all", now)).toBe(true);
  });

  it("กรองตามสถานะการอ่าน", () => {
    const base = { type: "new_order", title: null, body: null, link: null, ref_id: null };
    expect(matchesStatus({ ...base, read: false }, "unread")).toBe(true);
    expect(matchesStatus({ ...base, read: false }, "read")).toBe(false);
    expect(matchesStatus({ ...base, read: true }, "read")).toBe(true);
    expect(matchesStatus({ ...base, read: true }, "all")).toBe(true);
  });

   it("ลิงก์ที่เกี่ยวข้องครอบคลุมออเดอร์ ใบเบิก และ LINE OA", () => {
     const links = relatedLinks({ type: "new_order", title: null, body: null, link: "/admin/orders/abc", ref_id: null });
     expect(links[0].to).toBe("/admin/orders/abc");
     const tos = links.map((l) => l.to).join(" ");
     expect(tos).toContain("/admin/work-docs?filter=order");
     expect(tos).toContain("/admin/work-docs?filter=requisition");
     expect(tos).toContain("/admin/work-docs?match=1");
  });
});
