// Pure message builders for LINE notifications.
// Kept free of Deno / Supabase imports so the same module can be unit-tested
// under vitest (jsdom/node) while still being importable from the edge
// function runtime.

export type StatusCode =
  | "pending_quote"
  | "quoted"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export const STATUS_LABEL: Record<StatusCode, string> = {
  pending_quote: "รอเสนอราคา",
  quoted: "เสนอราคาแล้ว",
  approved: "ยืนยันออเดอร์",
  rejected: "ปฏิเสธ",
  completed: "เสร็จสมบูรณ์",
  cancelled: "ยกเลิก",
};

export function fmtMoney(v: unknown): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export interface OrderCtx {
  order_no: string;
  customer_name: string;
  customer_phone?: string | null;
  project_type?: string | null;
  total: number | string;
  cancelled_reason?: string | null;
  detail_url?: string | null;
  pdf_url?: string | null;
  xlsx_url?: string | null;
}

export interface QuotationCtx {
  document_no: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  project_type?: string | null;
  grand_total: number | string;
  detail_url?: string | null;
  pdf_url?: string | null;
  xlsx_url?: string | null;
}

export interface PurchaseOrderCtx {
  po_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  organization?: string | null;
  subtotal: number | string;
  request_quotation?: boolean | null;
  request_delivery_note?: boolean | null;
  items_count?: number | string | null;
}

function joinLines(lines: Array<string | false | null | undefined>): string {
  return lines.filter(Boolean).join("\n");
}

function linkLines(ctx: { detail_url?: string | null; pdf_url?: string | null; xlsx_url?: string | null }): string[] {
  return [
    ctx.detail_url ? `🔗 รายละเอียด: ${ctx.detail_url}` : "",
    ctx.pdf_url ? `📄 PDF: ${ctx.pdf_url}` : "",
    ctx.xlsx_url ? `📊 Excel: ${ctx.xlsx_url}` : "",
  ].filter(Boolean);
}

export function buildNewOrderAdminMessage(ctx: OrderCtx): string {
  return joinLines([
    `🛒 มีออเดอร์ใหม่`,
    `เลขที่: ${ctx.order_no}`,
    `ลูกค้า: ${ctx.customer_name || "-"}`,
    `เบอร์: ${ctx.customer_phone || "-"}`,
    ctx.project_type ? `ประเภทงาน: ${ctx.project_type}` : "",
    `ยอดประมาณ: ${fmtMoney(ctx.total)} บาท`,
    `สถานะ: ${STATUS_LABEL.pending_quote}`,
    ...linkLines(ctx),
  ]);
}

export function buildNewOrderCustomerAck(ctx: Pick<OrderCtx, "order_no">): string {
  return joinLines([
    `✅ ได้รับคำสั่งซื้อแล้ว`,
    `เลขที่: ${ctx.order_no}`,
    `ทางร้านจะติดต่อกลับเพื่อเสนอราคา ขอบคุณค่ะ`,
  ]);
}

export function buildStatusUpdateMessage(
  ctx: OrderCtx,
  status: StatusCode,
): string {
  return joinLines([
    `📦 อัปเดตออเดอร์ ${ctx.order_no}`,
    `ลูกค้า: ${ctx.customer_name || "-"}`,
    `สถานะ: ${STATUS_LABEL[status]}`,
    status === "cancelled" && ctx.cancelled_reason
      ? `เหตุผล: ${ctx.cancelled_reason}`
      : "",
    `ยอดประมาณ: ${fmtMoney(ctx.total)} บาท`,
    ...linkLines(ctx),
  ]);
}

export function buildNewQuotationAdminMessage(ctx: QuotationCtx): string {
  return joinLines([
    `📝 ใบเสนอราคาใหม่`,
    `เลขที่: ${ctx.document_no}`,
    `ลูกค้า: ${ctx.customer_name || "-"}`,
    `เบอร์: ${ctx.customer_phone || "-"}`,
    ctx.project_type ? `ประเภทงาน: ${ctx.project_type}` : "",
    `ยอด: ${fmtMoney(ctx.grand_total)} บาท`,
    ...linkLines(ctx),
  ]);
}

// Shop (นัฐภรณ์) — สั่งจ้างอิเล็กทรอนิกส์ที่ทริกจากหน้า MyOrderDetail
export function buildShopWorkOrderAdminMessage(ctx: OrderCtx): string {
  return joinLines([
    `🧾 ใบสั่งจ้างอิเล็กทรอนิกส์`,
    `เลขที่: ${ctx.order_no}`,
    `ลูกค้า: ${ctx.customer_name || "-"}`,
    `เบอร์: ${ctx.customer_phone || "-"}`,
    ctx.project_type ? `หมายเหตุ: ${ctx.project_type}` : "",
    `ยอด: ${fmtMoney(ctx.total)} บาท`,
    ...linkLines(ctx),
  ]);
}

export function buildPurchaseOrderAdminMessage(ctx: PurchaseOrderCtx): string {
  const requests = [
    ctx.request_quotation ? "ขอใบเสนอราคา" : "",
    ctx.request_delivery_note ? "ขอใบส่งของ" : "",
  ].filter(Boolean).join(" · ");
  return joinLines([
    `🧾 ใบสั่งสินค้าใหม่`,
    `เลขที่: ${ctx.po_number || "-"}`,
    `ลูกค้า: ${ctx.customer_name || "-"}`,
    `เบอร์: ${ctx.customer_phone || "-"}`,
    ctx.organization ? `หน่วยงาน: ${ctx.organization}` : "",
    ctx.items_count != null ? `จำนวนรายการ: ${ctx.items_count}` : "",
    requests ? `คำขอ: ${requests}` : "",
    `ยอดประมาณ: ${fmtMoney(ctx.subtotal)} บาท`,
  ]);
}

export function buildLinkConfirmMessage(fullName?: string | null): string {
  return joinLines([
    `✅ ผูกบัญชีกับ LINE สำเร็จ`,
    `สวัสดีคุณ ${fullName || ""} จากนี้จะได้รับแจ้งเตือนสถานะคำสั่งซื้อผ่าน LINE นี้`,
  ]);
}

export function isValidStatus(s: unknown): s is StatusCode {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(STATUS_LABEL, s);
}
/** สถานะที่ถือว่า "เอกสารพร้อมให้ดาวน์โหลด" */
export function docsReady(status: StatusCode): boolean {
  return status === "quoted" || status === "approved" || status === "completed";
}

/**
 * ข้อความอัปเดตสถานะสำหรับ "ลูกค้า" — ใช้ deep link หน้ารายละเอียดของลูกค้า
 * และเพิ่มลิงก์เอกสารเมื่อพร้อมดาวน์โหลด
 */
export function buildCustomerStatusUpdateMessage(
  ctx: OrderCtx & { docs_url?: string | null },
  status: StatusCode,
): string {
  return joinLines([
    `📦 อัปเดตคำสั่งซื้อ ${ctx.order_no}`,
    `สถานะ: ${STATUS_LABEL[status]}`,
    status === "cancelled" && ctx.cancelled_reason ? `เหตุผล: ${ctx.cancelled_reason}` : "",
    `ยอดประมาณ: ${fmtMoney(ctx.total)} บาท`,
    ctx.detail_url ? `🔗 ดูรายละเอียด: ${ctx.detail_url}` : "",
    docsReady(status) && ctx.docs_url ? `📄 ดาวน์โหลดเอกสาร: ${ctx.docs_url}` : "",
  ]);
}

/** ข้อความยืนยันว่าร้านได้รับคำสั่งซื้อแล้ว พร้อม deep link ของลูกค้า */
export function buildCustomerOrderAck(
  ctx: Pick<OrderCtx, "order_no"> & { detail_url?: string | null },
): string {
  return joinLines([
    `✅ ได้รับคำสั่งซื้อแล้ว`,
    `เลขที่: ${ctx.order_no}`,
    `ทางร้านจะติดต่อกลับเพื่อเสนอราคา ขอบคุณค่ะ`,
    ctx.detail_url ? `🔗 ติดตามสถานะ: ${ctx.detail_url}` : "",
  ]);
}
