/**
 * สถานะเอกสารของออเดอร์ (ตาราง `documents`) สำหรับหน้าออเดอร์ลูกค้า
 * — ใช้บอกว่า "สร้างเอกสารแล้วหรือยัง" และดาวน์โหลดไฟล์ได้เมื่อมี url
 */

export interface OrderDocumentRow {
  id: string;
  order_id: string;
  doc_type?: string | null;
  doc_no?: string | null;
  url?: string | null;
  created_at?: string | null;
}

export const ORDER_DOC_TYPE_LABEL_TH: Record<string, string> = {
  quotation: "ใบเสนอราคา",
  purchase_order: "ใบสั่งซื้อ",
  delivery_note: "ใบส่งของ",
  invoice: "ใบแจ้งหนี้",
  receipt: "ใบเสร็จรับเงิน",
};

export function docTypeLabel(t?: string | null): string {
  const key = String(t ?? "").trim();
  return ORDER_DOC_TYPE_LABEL_TH[key] || key || "เอกสาร";
}

/** จัดกลุ่มเอกสารตามออเดอร์ (ใหม่สุดก่อน) */
export function groupDocsByOrder(rows: OrderDocumentRow[] = []): Record<string, OrderDocumentRow[]> {
  const out: Record<string, OrderDocumentRow[]> = {};
  for (const r of rows) {
    if (!r?.order_id) continue;
    (out[r.order_id] ||= []).push(r);
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  }
  return out;
}

export interface OrderDocStatus {
  count: number;
  downloadable: number;
  label: string;
  hasDocs: boolean;
}

export function orderDocStatus(docs: OrderDocumentRow[] = []): OrderDocStatus {
  const count = docs.length;
  const downloadable = docs.filter((d) => !!(d.url && d.url.trim())).length;
  if (!count) return { count: 0, downloadable: 0, hasDocs: false, label: "ยังไม่มีเอกสาร" };
  if (!downloadable) return { count, downloadable, hasDocs: true, label: `สร้างเอกสารแล้ว ${count} ใบ (ยังไม่มีไฟล์)` };
  return { count, downloadable, hasDocs: true, label: `เอกสารพร้อมดาวน์โหลด ${downloadable}/${count} ใบ` };
}

/** ชื่อที่แสดงในเมนูดาวน์โหลด */
export function docMenuLabel(d: OrderDocumentRow): string {
  const no = (d.doc_no ?? "").trim();
  return no ? `${docTypeLabel(d.doc_type)} · ${no}` : docTypeLabel(d.doc_type);
}
