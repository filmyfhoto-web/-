/**
 * Purchase Order client-side math helpers.
 * Server (`_po_recalc_totals`) is the source of truth; these mirror the same
 * formula for live UI preview only.
 */

export interface POLineInput {
  qty: number;
  unit_cost: number;
  discount_amount?: number;
  discount_percent?: number;
}

export interface POTotalsInput {
  lines: POLineInput[];
  discount_amount?: number;
  shipping_cost?: number;
  other_cost?: number;
  vat_enabled?: boolean;
  vat_included?: boolean;
  vat_rate?: number; // percent
}

export interface POTotals {
  subtotal: number;
  taxable: number;
  vat: number;
  grand: number;
}

export function lineTotal(l: POLineInput): number {
  const gross = (l.qty || 0) * (l.unit_cost || 0);
  const pct = gross * ((l.discount_percent || 0) / 100);
  return Math.max(gross - (l.discount_amount || 0) - pct, 0);
}

export function poTotals(inp: POTotalsInput): POTotals {
  const subtotal = inp.lines.reduce((s, l) => s + lineTotal(l), 0);
  const disc = inp.discount_amount || 0;
  const ship = inp.shipping_cost || 0;
  const other = inp.other_cost || 0;
  const taxable = Math.max(subtotal - disc, 0) + ship + other;
  const rate = inp.vat_rate ?? 7;
  let vat = 0;
  let grand = taxable;
  if (inp.vat_enabled) {
    if (inp.vat_included) {
      vat = round2((taxable * rate) / (100 + rate));
      grand = taxable;
    } else {
      vat = round2((taxable * rate) / 100);
      grand = taxable + vat;
    }
  }
  return { subtotal: round2(subtotal), taxable: round2(taxable), vat, grand: round2(grand) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const PO_STATUS_LABEL_TH: Record<string, string> = {
  draft: "ร่าง",
  pending_approval: "รอการอนุมัติ",
  approved_waiting_receipt: "รอรับสินค้า",
  ordered: "รอรับสินค้า",
  received: "รับสินค้าแล้ว",
  cancelled: "ยกเลิก",
};

export const PO_STATUS_TINT: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved_waiting_receipt: "bg-sky-100 text-sky-800",
  ordered: "bg-sky-100 text-sky-800",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};
