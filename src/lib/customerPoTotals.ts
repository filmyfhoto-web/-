/**
 * Client-side totals for the "คำสั่งซื้อ" (customer purchase order) workspace.
 * Mirrors the numbers persisted on `customer_purchase_orders`.
 */

export interface CpoItem {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  discount?: number;
}

export interface CpoTotalsInput {
  items: CpoItem[];
  discount?: number;
  vat_enabled?: boolean;
  vat_rate?: number;
  wht_enabled?: boolean;
  wht_rate?: number;
}

export interface CpoTotals {
  subtotal: number;
  base: number;
  vat: number;
  wht: number;
  net: number;
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function itemTotal(it: CpoItem): number {
  const gross = (Number(it.quantity) || 0) * (Number(it.price) || 0);
  return round2(Math.max(gross - (Number(it.discount) || 0), 0));
}

export function cpoTotals(inp: CpoTotalsInput): CpoTotals {
  const subtotal = round2(inp.items.reduce((s, it) => s + itemTotal(it), 0));
  const base = round2(Math.max(subtotal - (Number(inp.discount) || 0), 0));
  const vat = inp.vat_enabled ? round2((base * (Number(inp.vat_rate) || 0)) / 100) : 0;
  const wht = inp.wht_enabled ? round2((base * (Number(inp.wht_rate) || 0)) / 100) : 0;
  const net = round2(base + vat - wht);
  return { subtotal, base, vat, wht, net };
}

export type CpoReviewStatus =
  | "not_sent"
  | "awaiting_customer"
  | "revision_requested"
  | "confirmed"
  | "documented";

export const CPO_REVIEW_LABEL: Record<CpoReviewStatus, string> = {
  not_sent: "ยังไม่ส่งตรวจ",
  awaiting_customer: "รอลูกค้าตรวจ",
  revision_requested: "ขอแก้ไข",
  confirmed: "ลูกค้ายืนยันแล้ว",
  documented: "ออกเอกสารแล้ว",
};

export const CPO_REVIEW_TONE: Record<CpoReviewStatus, string> = {
  not_sent: "bg-slate-100 text-slate-700 border-slate-200",
  awaiting_customer: "bg-sky-50 text-sky-700 border-sky-200",
  revision_requested: "bg-amber-50 text-amber-800 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  documented: "bg-blue-900/5 text-blue-900 border-blue-900/20",
};

/** Main pipeline bucket used by the list tabs. */
export type CpoBucket = "new" | "working" | "done";

export function bucketOf(review: string): CpoBucket {
  if (review === "documented") return "done";
  if (review === "not_sent") return "new";
  return "working";
}

/** True when a real document may be issued. */
export function canIssueDocument(review: string): boolean {
  return review === "confirmed";
}

export function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}