import { describe, expect, it } from "vitest";
import {
  customerOrderUrls,
  customerDocsUrl,
  customerHistoryUrl,
} from "../../supabase/functions/line-notify/urls";
import {
  buildCustomerOrderAck,
  buildCustomerStatusUpdateMessage,
  docsReady,
} from "../../supabase/functions/line-notify/messages";

const ORIGIN = "https://www.filmyynatta.com";
const ID = "11111111-2222-3333-4444-555555555555";

describe("customer LINE deep links", () => {
  it("ชี้ไปหน้ารายละเอียดของลูกค้า ไม่ใช่หน้าแอดมิน", () => {
    const u = customerOrderUrls(ORIGIN, ID);
    expect(u.detail_url).toBe(`${ORIGIN}/my-orders/${ID}`);
    expect(u.detail_url).not.toContain("/admin/");
  });

  it("ไม่มี origin ก็ไม่สร้างลิงก์เพี้ยน", () => {
    expect(customerOrderUrls("", ID).detail_url).toBeNull();
    expect(customerDocsUrl("")).toBeNull();
  });

  it("ลิงก์เอกสารและประวัติของลูกค้า", () => {
    expect(customerDocsUrl(ORIGIN)).toBe(`${ORIGIN}/account/documents`);
    expect(customerHistoryUrl(ORIGIN)).toBe(`${ORIGIN}/account/history`);
  });
});

describe("customer status messages", () => {
  const ctx = {
    order_no: "SO-001",
    customer_name: "โรงเรียนทดสอบ",
    total: 1200,
    detail_url: `${ORIGIN}/my-orders/${ID}`,
    docs_url: `${ORIGIN}/account/documents`,
  };

  it("ส่งรายการแล้ว → มี deep link ติดตามสถานะ", () => {
    const t = buildCustomerOrderAck({ order_no: "SO-001", detail_url: ctx.detail_url });
    expect(t).toContain("ได้รับคำสั่งซื้อแล้ว");
    expect(t).toContain(ctx.detail_url);
  });

  it("อนุมัติแล้ว → มีลิงก์ดาวน์โหลดเอกสาร", () => {
    const t = buildCustomerStatusUpdateMessage(ctx, "approved");
    expect(t).toContain("ยืนยันออเดอร์");
    expect(t).toContain(ctx.detail_url);
    expect(t).toContain(ctx.docs_url);
  });

  it("ยกเลิก → ไม่โชว์ลิงก์เอกสาร", () => {
    const t = buildCustomerStatusUpdateMessage({ ...ctx, cancelled_reason: "ลูกค้าขอยกเลิก" }, "cancelled");
    expect(t).toContain("ลูกค้าขอยกเลิก");
    expect(t).not.toContain(ctx.docs_url);
  });

  it("docsReady ครอบเฉพาะสถานะที่มีเอกสาร", () => {
    expect(docsReady("quoted")).toBe(true);
    expect(docsReady("completed")).toBe(true);
    expect(docsReady("pending_quote")).toBe(false);
  });
});
