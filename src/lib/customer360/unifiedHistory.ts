/**
 * Unified history — รวมประวัติของลูกค้าหนึ่งคนจากทุกแหล่งที่มีอยู่จริงในระบบ
 * (ออเดอร์ร้าน, ใบสั่งซื้อของลูกค้า, ใบเขียนเบิก, ไฟล์ Excel ที่ส่งเข้ามา)
 *
 * ใช้ที่เดียวทั้งหน้า "บัญชีของฉัน" และ Customer 360 ของแอดมิน
 * เพื่อไม่ให้ business logic กระจายหลายหน้า
 */
import { supabase } from "@/integrations/supabase/client";

export type HistoryType = "order" | "purchase_order" | "requisition" | "excel_intake";

export interface HistoryEntry {
  /** unique ต่อ 1 รายการ = `${type}:${id}` */
  key: string;
  id: string;
  type: HistoryType;
  typeLabel: string;
  /** เลขที่เอกสาร หรือชื่อรายการที่อ่านรู้เรื่อง */
  title: string;
  createdAt: string;
  status: string;
  statusLabel: string;
  source: string;
  amount?: number;
  deepLink: string;
}

export const HISTORY_TYPE_LABEL: Record<HistoryType, string> = {
  order: "ออเดอร์",
  purchase_order: "ใบสั่งซื้อ",
  requisition: "ใบเขียนเบิก",
  excel_intake: "ไฟล์ Excel",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง",
  submitted: "ส่งแล้ว",
  received: "ร้านรับเรื่องแล้ว",
  converted: "แปลงเป็นเอกสารแล้ว",
  rejected: "ตีกลับ",
  pending_quote: "รอเสนอราคา",
  quoted: "เสนอราคาแล้ว",
  approved: "อนุมัติแล้ว",
  picking: "กำลังจัดของ",
  ready: "พร้อมส่ง",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export function statusLabel(status?: string | null): string {
  if (!status) return "—";
  return STATUS_LABEL[status] ?? status;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function normalizeOrder(row: any): HistoryEntry {
  return {
    key: `order:${row.id}`,
    id: String(row.id),
    type: "order",
    typeLabel: HISTORY_TYPE_LABEL.order,
    title: row.order_no || "ออเดอร์",
    createdAt: row.created_at,
    status: row.status ?? "",
    statusLabel: statusLabel(row.status),
    source: row.source || "shop",
    amount: num(row.total),
    deepLink: `/my-orders/${row.id}`,
  };
}

export function normalizePurchaseOrder(row: any): HistoryEntry {
  return {
    key: `purchase_order:${row.id}`,
    id: String(row.id),
    type: "purchase_order",
    typeLabel: HISTORY_TYPE_LABEL.purchase_order,
    title: row.po_number || "ใบสั่งซื้อ",
    createdAt: row.created_at,
    status: row.status ?? "",
    statusLabel: statusLabel(row.status),
    source: row.source || "po",
    amount: num(row.net_total ?? row.subtotal),
    deepLink: `/purchase-order?id=${row.id}`,
  };
}

export function normalizeRequisition(row: any): HistoryEntry {
  return {
    key: `requisition:${row.id}`,
    id: String(row.id),
    type: "requisition",
    typeLabel: HISTORY_TYPE_LABEL.requisition,
    title: row.project_name || row.school_name || "ใบเขียนเบิก",
    createdAt: row.created_at,
    status: row.status ?? "",
    statusLabel: statusLabel(row.status),
    source: "school_requisition",
    amount: num(row.total),
    deepLink: "/my-account",
  };
}

export function normalizeExcelIntake(row: any): HistoryEntry {
  return {
    key: `excel_intake:${row.id}`,
    id: String(row.id),
    type: "excel_intake",
    typeLabel: HISTORY_TYPE_LABEL.excel_intake,
    title: row.filename || "ไฟล์ Excel",
    createdAt: row.created_at,
    status: row.status ?? "",
    statusLabel: statusLabel(row.status),
    source: "excel",
    amount: num(row.total),
    deepLink: `/account/excel?id=${row.id}`,
  };
}

/** เรียงล่าสุดก่อน + ตัดรายการซ้ำจากแหล่งเดียวกัน (กัน double-count) */
export function mergeHistory(groups: HistoryEntry[][]): HistoryEntry[] {
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const g of groups) {
    for (const e of g) {
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      out.push(e);
    }
  }
  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export interface HistorySummary {
  count: number;
  totalAmount: number;
  byType: Record<HistoryType, number>;
}

export function summarizeHistory(entries: HistoryEntry[]): HistorySummary {
  const byType: Record<HistoryType, number> = {
    order: 0, purchase_order: 0, requisition: 0, excel_intake: 0,
  };
  let totalAmount = 0;
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    byType[e.type] += 1;
    totalAmount += e.amount ?? 0;
  }
  return { count: seen.size, totalAmount, byType };
}

/** สินค้าที่สั่งบ่อย — คำนวณจากรายการที่มีจริงใน items ของแต่ละแหล่ง */
export function topItems(
  itemGroups: Array<Array<{ name?: string; product_name?: string; qty?: number; quantity?: number }>>,
  limit = 5,
): Array<{ name: string; qty: number; times: number }> {
  const map = new Map<string, { name: string; qty: number; times: number }>();
  for (const group of itemGroups) {
    for (const it of group ?? []) {
      const name = String(it?.name ?? it?.product_name ?? "").trim();
      if (!name) continue;
      const qty = Number(it?.qty ?? it?.quantity ?? 0) || 0;
      const cur = map.get(name) ?? { name, qty: 0, times: 0 };
      cur.qty += qty;
      cur.times += 1;
      map.set(name, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || b.times - a.times).slice(0, limit);
}

/**
 * ดึงประวัติของ "ลูกค้าคนนี้" — ทุก query ผูกกับ user id และถูกจำกัดซ้ำด้วย RLS
 * ฝั่งเซิร์ฟเวอร์ (ไม่ได้ใช้ตัวกรองฝั่ง client เป็นการรักษาความปลอดภัย)
 */
export async function fetchUnifiedHistory(userId: string, limit = 200) {
  const db = supabase as any;
  const [orders, pos, reqs, xls] = await Promise.all([
    db.from("orders").select("id, order_no, status, total, created_at, source")
      .eq("customer_id", userId).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(limit),
    db.from("customer_purchase_orders").select("id, po_number, status, subtotal, net_total, created_at, source")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
    db.from("school_requisitions").select("id, school_name, project_name, status, total, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
    db.from("customer_excel_intakes").select("id, filename, status, total, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
  ]);
  const err = orders.error || pos.error || reqs.error || xls.error;
  const entries = mergeHistory([
    (orders.data ?? []).map(normalizeOrder),
    (pos.data ?? []).map(normalizePurchaseOrder),
    (reqs.data ?? []).map(normalizeRequisition),
    (xls.data ?? []).map(normalizeExcelIntake),
  ]);
  return { entries, error: err ? String(err.message ?? err) : null };
}
