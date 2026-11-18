import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  countToday, isAcknowledged, isSent, matchesSearch, needsAction, statusLabel, tabOf, workDocsTo,
  workItemsToCsvRows, workStatusKey,
  type WorkItem,
} from "@/lib/workDocs";

const read = (p: string) => readFileSync(p, "utf8");

function item(p: Partial<WorkItem> = {}): WorkItem {
  return {
    kind: "order", id: "1", code: "PO-1", customerName: "ครูเอก", org: "โรงเรียนก",
    phone: "0800000000", source: "เว็บไซต์", lineUserId: "U1",
    createdAt: new Date().toISOString(), acknowledgedAt: null,
    deliveryFile: null, deliverySentAt: null,
    quoteFile: null, quoteSentAt: null, pricedAt: null, status: "", files: [], ...p,
  };
}

describe("flow เดียว: รับรายการ → ยืนยันรับ → ส่งใบส่งของ", () => {
  it("สถานะไล่ตามลำดับ 2 ขั้น ไม่มีขั้นเสนอราคา/ตรวจยอด", () => {
    const fresh = item();
    expect(isAcknowledged(fresh)).toBe(false);
    expect(statusLabel(fresh)).toBe("ยังไม่ยืนยัน");
    expect(needsAction(fresh)).toBe(false);

    const acked = item({ acknowledgedAt: new Date().toISOString() });
    expect(statusLabel(acked)).toBe("รับเรื่องแล้ว");
    expect(needsAction(acked)).toBe(true);
    expect(tabOf(acked)).toBe("pending");

    const sent = item({ acknowledgedAt: "2026-08-01T00:00:00Z", deliverySentAt: "2026-08-02T00:00:00Z" });
    expect(isSent(sent)).toBe(true);
    expect(needsAction(sent)).toBe(false);
    expect(tabOf(sent)).toBe("sent");
  });

  it("การ์ดหน้า 'วันนี้' นับจากข้อมูลจริง", () => {
    const rows = [
      item({ id: "a" }),
      item({ id: "b", acknowledgedAt: "2026-08-01T00:00:00Z" }),
      item({ id: "c", lineUserId: null }),
    ];
    expect(countToday(rows)).toEqual({ newOrders: 2, requisitions: 0, linePending: 1, todo: 1 });
  });

  it("ค้นหาได้ทั้งชื่อ หน่วยงาน เลขที่ และเบอร์", () => {
    const i = item();
    expect(matchesSearch(i, "เอก")).toBe(true);
    expect(matchesSearch(i, "PO-1")).toBe(true);
    expect(matchesSearch(i, "0800")).toBe(true);
    expect(matchesSearch(i, "ไม่มี")).toBe(false);
  });

  it("ลิงก์ไปหน้างานและเอกสารพร้อมตัวกรอง", () => {
    expect(workDocsTo()).toBe("/admin/work-docs");
    expect(workDocsTo({ filter: "order", tab: "pending" })).toBe("/admin/work-docs?filter=order&tab=pending");
    expect(workDocsTo({ todo: true })).toBe("/admin/work-docs?todo=1");
    expect(workDocsTo({ id: "x", filter: "order" })).toBe("/admin/work-docs?filter=order&id=x");
  });

   it("อ่านคำสั่งซื้อและใบเขียนเบิกจากมุมมองรวม และไม่เรียก LINE API จากหน้าเว็บ", () => {
     const lib = read("src/lib/workDocs.ts");
     expect(lib).toContain("customer_purchase_orders");
     expect(lib).toContain("school_requisitions");
     expect(lib).toContain("send-work-doc-notify");
     expect(lib).not.toContain("api.line.me");
   });

  it("edge function เป็นพนักงานเท่านั้น กันส่งซ้ำ และรองรับคำสั่งซื้อ 2 แหล่ง", () => {
    const fn = read("supabase/functions/send-work-doc-notify/index.ts");
    expect(fn).toContain("unauthorized");
    expect(fn).toContain("user_roles");
    expect(fn).toContain("order_notification_logs");
    expect(fn).toContain("deduplicated");
    expect(fn).toContain("received_ack");
    expect(fn).toContain("delivery_note");
  });

  it("รับเฉพาะ PDF และมีเมนูล่างสำหรับมือถือ", () => {
    expect(read("src/lib/workDocs.ts")).toContain("รับเฉพาะไฟล์ PDF เท่านั้น");
    const page = read("src/pages/admin/WorkDocs.tsx");
    expect(page).toContain('accept="application/pdf,.pdf"');
    expect(page).toContain("AdminBottomNav");
    expect(page).toContain("xl:grid-cols-[38fr_62fr]");
  });



  it("มีชิปเปลี่ยนสถานะ ปุ่มส่งออก CSV ปุ่มลบ และปุ่มเปิดแชทในหน้างานและเอกสาร", () => {
    const page = read("src/pages/admin/WorkDocs.tsx");
    expect(page).toContain("work-status-chips");
    expect(page).toContain("work-export-csv");
    expect(page).toContain("work-delete");
    expect(page).toContain("work-open-chat");
    // แชทต้อง lazy load เพื่อไม่ให้ useHubData ยิงคิวรีตอนเข้าหน้า
    expect(page).toContain('lazy(() => import("@/components/admin/work-docs/CustomerChatDialog"))');
    expect(page).not.toContain("useHubData");
  });

   it("ลบรายการต้องยืนยันก่อนเสมอ และออเดอร์เว็บเป็น soft delete", () => {
     expect(read("src/pages/admin/WorkDocs.tsx")).toContain("window.confirm");
     const lib = read("src/lib/workDocs.ts");
     expect(lib).toContain("deleted_at: new Date().toISOString()");
     expect(lib).toContain("customer_po_review_events");
     expect(lib).toContain("school_requisition_logs");
   });

  it("ส่งออก CSV ใช้ตัวช่วยเดิมและออกเฉพาะรายการที่กรองอยู่", () => {
    const page = read("src/pages/admin/WorkDocs.tsx");
    expect(page).toContain('import { downloadCsv } from "@/lib/csv"');
    expect(page).toContain("workItemsToCsvRows(visible)");
    const rows = workItemsToCsvRows([item({ code: "PO-9" })]);
    expect(rows[0]["เลขที่"]).toBe("PO-9");
  });

  it("สถานะดิบถูกแปลงเป็นคีย์กลางของชิป", () => {
    expect(workStatusKey(item({ kind: "web_order", status: "pending_quote" }))).toBe("submitted");
    expect(workStatusKey(item({ kind: "order", status: "preparing" }))).toBe("preparing");
  });
});
