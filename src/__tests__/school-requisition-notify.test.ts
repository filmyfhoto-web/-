import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildRequisitionText, requisitionIdempotencyKey, shortRef,
} from "../../supabase/functions/_shared/requisitionGroupNotify";
import { pickOrderGroupDestinations, buildOrderGroupText } from "../../supabase/functions/_shared/orderGroupNotify";

const P = {
  id: "11112222-3333-4444-5555-666677778888",
  schoolName: "โรงเรียนทดสอบ",
  projectName: "โครงการจัดซื้อ",
  preparedBy: "ครูเอ",
  itemCount: 3,
  total: 1250,
  submittedAt: "2026-01-02T03:04:05.000Z",
};

describe("ใบเขียนเบิก → กลุ่ม LINE รับออเดอร์ (กลุ่มเดียวกัน)", () => {
  it("หัวข้อความและรายละเอียดครบตามที่ตกลง", () => {
    const text = buildRequisitionText(P, "https://www.filmyynatta.com/admin/school-requisitions?id=" + P.id);
    expect(text).toContain("ใบเขียนเบิกใหม่");
    expect(text).toContain(shortRef(P.id));
    expect(text).toContain("โรงเรียนทดสอบ");
    expect(text).toContain("โครงการจัดซื้อ");
    expect(text).toContain("ครูเอ");
    expect(text).toContain("จำนวนรายการ: 3");
    expect(text).toContain("ไม่ตัดสต๊อก");
    expect(text).toContain("/admin/school-requisitions?id=");
    expect(text).not.toContain("id-preview--");
  });

  it("ออเดอร์ใช้หัวข้อ คำสั่งซื้อใหม่", () => {
    const text = buildOrderGroupText(
      { orderId: "o1", orderNo: "SO-1", customerName: "ก", itemCount: 1, total: 100, source: "web", createdAt: P.submittedAt },
      "https://www.filmyynatta.com/admin/orders/o1",
    );
    expect(text).toContain("คำสั่งซื้อใหม่");
  });

  it("ปลายทางใช้ตัวเลือกกลุ่มเดียวกับออเดอร์ (order_group)", () => {
    const dests = pickOrderGroupDestinations([
      { line_destination_id: "Cabcdef0123456789", is_active: true, store_id: null },
      { line_destination_id: "Cabcdef0123456789", is_active: true, store_id: null },
      { line_destination_id: "Uzzzz", is_active: true, store_id: null },
    ]);
    expect(dests.map((d) => d.dest)).toEqual(["Cabcdef0123456789"]);
  });

  it("idempotency key คงที่ต่อใบ+ปลายทาง", () => {
    const a = requisitionIdempotencyKey(P.id, "C123");
    expect(a).toBe(requisitionIdempotencyKey(P.id, "C123"));
    expect(a).toContain(":submitted:");
    expect(a).not.toBe(requisitionIdempotencyKey(P.id, "C999"));
  });

  it("edge function ไม่แตะสต๊อกและตรวจสิทธิ์ผู้ใช้", () => {
    const src = readFileSync("supabase/functions/school-requisition-notify/index.ts", "utf8");
    expect(src).not.toMatch(/from\("stock_movements"\)|from\("products"\)/);
    expect(src).toContain("auth.getUser");
    expect(src).toContain("not_submitted");
  });
});

describe("ลูกค้าต้องเข้าสู่ระบบก่อนส่ง", () => {
  const lib = readFileSync("src/lib/schoolRequisition.ts", "utf8");
  const page = readFileSync("src/pages/SchoolRequisition.tsx", "utf8");

  it("saveRequisition ปฏิเสธ submitted เมื่อไม่มี session", () => {
    expect(lib).toContain('if (payload.status === "submitted") throw new Error(REQUIRE_LOGIN_ERROR);');
  });

  it("guest ไม่มีทางได้ local record สถานะ submitted", () => {
    expect(lib).toMatch(/status: "draft",\s*\n\s*items: payload.items/);
  });

  it("หน้าลูกค้าเก็บฟอร์มค้างและพาไป login พร้อม next", () => {
    expect(page).toContain("savePendingRequisition(");
    expect(page).toContain('nav(`/login?next=${encodeURIComponent(here || "/school-requisition")}`)');
    expect(page).toContain("sanitizeNext(");
    expect(page).toContain("กรุณาเข้าสู่ระบบก่อนส่งใบเขียนเบิก");
    expect(page).toContain("readPendingRequisition");
    expect(page).toContain("clearPendingRequisition");
  });

  it("ส่งรายการที่ค้างไว้ให้อัตโนมัติหลังล็อกอิน", () => {
    expect(page).toContain("autoSubmitRef");
    expect(page).toContain("if (!pendingIntent || signedIn !== true || autoSubmitRef.current) return;");
    expect(page).toContain("void onSubmit();");

  });

  it("กันส่งซ้ำด้วย submitting guard", () => {
    expect(page).toContain("if (submittingRef.current) return;");
  });

  it("ไม่มีการเขียนสต๊อกใน flow ใบเขียนเบิก", () => {
    expect(lib).not.toMatch(/from\("stock_movements"\)|from\("products"\)/);
    expect(page).not.toMatch(/from\("stock_movements"\)/);
  });
});
