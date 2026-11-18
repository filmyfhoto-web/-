/**
 * ลิงก์ลึกของออเดอร์ที่ถูกส่งเข้ากลุ่ม LINE จาก Edge Functions
 * (`/admin/orders/:id`, `?export=pdf|xlsx`).
 *
 * ก่อนหน้านี้ route นี้ redirect ทิ้ง `:id` และ query ทั้งหมด ทำให้แอดมิน
 * ที่กดลิงก์จากไลน์เด้งไปหน้ารวมโดยไม่รู้ว่างานไหน — ฟังก์ชันในไฟล์นี้เป็น
 * pure helper ที่ประกอบปลายทางให้ถูกต้องเสมอ (มีเทสต์ครอบ)
 */

export type OrderExportFormat = "csv" | "xlsx" | "pdf";

const VALID_EXPORTS: OrderExportFormat[] = ["csv", "xlsx", "pdf"];

/** อ่านค่า ?export= จาก query string (รับได้ทั้งมี/ไม่มี `?` นำหน้า) */
export function parseOrderExport(search: string | null | undefined): OrderExportFormat | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = (params.get("export") || "").toLowerCase().trim();
  return (VALID_EXPORTS as string[]).includes(raw) ? (raw as OrderExportFormat) : null;
}

/** เฉพาะรูปแบบที่หน้าออเดอร์ดาวน์โหลดได้จริง (pdf ใช้พิมพ์จากหน้าเอกสารแทน) */
export function downloadableExport(exp: OrderExportFormat | null): "csv" | "xlsx" | null {
  return exp === "csv" || exp === "xlsx" ? exp : null;
}

function withExport(path: string, exp: OrderExportFormat | null): string {
  return exp ? `${path}&export=${exp}` : path;
}

/** ปลายทางเมื่อ id เป็นใบสั่งซื้อของลูกค้า (customer_purchase_orders) */
export function buildCpoDeepLink(id: string, exp: OrderExportFormat | null = null): string {
  return withExport(`/admin/customer-purchase-orders?focus=${encodeURIComponent(id)}`, exp);
}

/** ปลายทางเมื่อ id เป็นออเดอร์ทั่วไป (orders) */
export function buildOrderAlertsDeepLink(id: string, exp: OrderExportFormat | null = null): string {
  return withExport(`/admin/orders/${encodeURIComponent(id)}?focus=1`, exp);
}

/** ปลายทางจริงของออเดอร์ทั่วไปหลังยุบหน้าแจ้งเตือนเข้า “งานและเอกสาร” */
export function buildWorkDocsOrderLink(id: string): string {
  return `/admin/work-docs?filter=order&kind=web_order&id=${encodeURIComponent(id)}`;
}

/** ปลายทางจริงของใบเขียนเบิกในมุมมองรวม */
export function buildWorkDocsRequisitionLink(id: string): string {
  return `/admin/work-docs?filter=requisition&kind=requisition&id=${encodeURIComponent(id)}`;
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLikelyOrderId(id: string | null | undefined): boolean {
  return !!id && UUID_RE.test(id.trim());
}
