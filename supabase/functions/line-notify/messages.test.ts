import { describe, it, expect } from "vitest";
import {
  buildLinkConfirmMessage,
  buildNewOrderAdminMessage,
  buildNewOrderCustomerAck,
  buildNewQuotationAdminMessage,
  buildStatusUpdateMessage,
  fmtMoney,
  isValidStatus,
  STATUS_LABEL,
} from "./messages";

const baseOrder = {
  order_no: "ORD-2025-0001",
  customer_name: "บริษัท ตัวอย่าง จำกัด",
  customer_phone: "0812345678",
  project_type: "พิมพ์นามบัตร",
  total: 1250.5,
  detail_url: "https://app.example.com/admin/orders/abc-123",
};

describe("LINE message builders — new order (E2E content contract)", () => {
  it("admin message contains all required fields", () => {
    const msg = buildNewOrderAdminMessage(baseOrder);
    // เลขออเดอร์
    expect(msg).toContain(baseOrder.order_no);
    // ชื่อ
    expect(msg).toContain(baseOrder.customer_name);
    // เบอร์โทร
    expect(msg).toContain(baseOrder.customer_phone);
    // ประเภทงาน
    expect(msg).toContain(baseOrder.project_type);
    // ยอดเงินโดยประมาณ (formatted)
    expect(msg).toContain("1,250.50");
    // สถานะ
    expect(msg).toContain(STATUS_LABEL.pending_quote);
    // ลิงก์รายละเอียด
    expect(msg).toContain(baseOrder.detail_url);
  });

  it("customer acknowledgement references the order number", () => {
    const ack = buildNewOrderCustomerAck(baseOrder);
    expect(ack).toContain(baseOrder.order_no);
    expect(ack).toMatch(/ได้รับคำสั่งซื้อ/);
  });

  it("omits empty optional rows but never breaks", () => {
    const msg = buildNewOrderAdminMessage({
      ...baseOrder,
      customer_phone: "",
      project_type: null,
      detail_url: null,
    });
    expect(msg).toContain(baseOrder.order_no);
    expect(msg).not.toContain("ประเภทงาน:");
    expect(msg).not.toContain("🔗 รายละเอียด:");
    expect(msg).not.toContain("📄 PDF:");
    expect(msg).toContain("เบอร์: -");
  });
});

describe("LINE message builders — document links", () => {
  it("renders detail/pdf/xlsx links when provided", () => {
    const msg = buildNewOrderAdminMessage({
      ...baseOrder,
      detail_url: "https://app.x/admin/orders/1",
      pdf_url: "https://app.x/admin/orders/1?export=pdf",
      xlsx_url: "https://app.x/admin/orders/1?export=xlsx",
    });
    expect(msg).toContain("🔗 รายละเอียด: https://app.x/admin/orders/1");
    expect(msg).toContain("📄 PDF: https://app.x/admin/orders/1?export=pdf");
    expect(msg).toContain("📊 Excel: https://app.x/admin/orders/1?export=xlsx");
  });

  it("status update renders link block too", () => {
    const msg = buildStatusUpdateMessage(
      { ...baseOrder, pdf_url: "https://p/p.pdf", xlsx_url: "https://p/p.xlsx" },
      "approved",
    );
    expect(msg).toContain("📄 PDF: https://p/p.pdf");
    expect(msg).toContain("📊 Excel: https://p/p.xlsx");
  });

  it("quotation renders link block too", () => {
    const msg = buildNewQuotationAdminMessage({
      document_no: "QT-1",
      grand_total: 1,
      detail_url: "https://q/q",
      pdf_url: "https://q/q.pdf",
      xlsx_url: "https://q/q.xlsx",
    });
    expect(msg).toContain("🔗 รายละเอียด: https://q/q");
    expect(msg).toContain("📄 PDF: https://q/q.pdf");
    expect(msg).toContain("📊 Excel: https://q/q.xlsx");
  });
});

describe("LINE message builders — status update", () => {
  it("renders Thai label for each known status", () => {
    for (const s of Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>) {
      const msg = buildStatusUpdateMessage(baseOrder, s);
      expect(msg).toContain(`สถานะ: ${STATUS_LABEL[s]}`);
      expect(msg).toContain(baseOrder.order_no);
    }
  });

  it("includes cancellation reason only when cancelled", () => {
    const withReason = buildStatusUpdateMessage(
      { ...baseOrder, cancelled_reason: "ลูกค้าขอยกเลิก" },
      "cancelled",
    );
    expect(withReason).toContain("เหตุผล: ลูกค้าขอยกเลิก");

    const completed = buildStatusUpdateMessage(
      { ...baseOrder, cancelled_reason: "ลูกค้าขอยกเลิก" },
      "completed",
    );
    expect(completed).not.toContain("เหตุผล:");
  });

  it("isValidStatus guards bad inputs", () => {
    expect(isValidStatus("pending_quote")).toBe(true);
    expect(isValidStatus("approved")).toBe(true);
    expect(isValidStatus("nope")).toBe(false);
    expect(isValidStatus(null)).toBe(false);
    expect(isValidStatus(undefined)).toBe(false);
    expect(isValidStatus(42)).toBe(false);
  });
});

describe("LINE message builders — new quotation", () => {
  it("admin quotation message contains required fields", () => {
    const msg = buildNewQuotationAdminMessage({
      document_no: "QT-2025-0042",
      customer_name: "ลูกค้าทดสอบ",
      customer_phone: "0900000000",
      project_type: "พิมพ์แผ่นพับ",
      grand_total: 9999,
      detail_url: "https://app.example.com/receipts",
    });
    expect(msg).toContain("QT-2025-0042");
    expect(msg).toContain("ลูกค้าทดสอบ");
    expect(msg).toContain("0900000000");
    expect(msg).toContain("พิมพ์แผ่นพับ");
    expect(msg).toContain("9,999.00");
    expect(msg).toContain("https://app.example.com/receipts");
  });
});

describe("LINE message builders — link confirm", () => {
  it("greets the user by name when known", () => {
    expect(buildLinkConfirmMessage("สมชาย")).toMatch(/สวัสดีคุณ สมชาย/);
    expect(buildLinkConfirmMessage("สมชาย")).toMatch(/ผูกบัญชีกับ LINE สำเร็จ/);
  });
  it("handles missing name gracefully", () => {
    expect(buildLinkConfirmMessage(null)).toMatch(/ผูกบัญชีกับ LINE สำเร็จ/);
    expect(buildLinkConfirmMessage(undefined)).toMatch(/ผูกบัญชีกับ LINE สำเร็จ/);
  });
});

describe("fmtMoney", () => {
  it("formats Thai numbers with two decimal places", () => {
    expect(fmtMoney(0)).toBe("0.00");
    expect(fmtMoney(1234.5)).toBe("1,234.50");
    expect(fmtMoney("9999")).toBe("9,999.00");
    expect(fmtMoney(null)).toBe("0.00");
    expect(fmtMoney(undefined)).toBe("0.00");
    expect(fmtMoney("not-a-number")).toBe("0.00");
  });
});