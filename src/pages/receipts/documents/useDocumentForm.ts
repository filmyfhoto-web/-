import { useMemo, useState, useCallback } from "react";
import type { RdsStore } from "../types";

export type VatMode = "none" | "exclusive" | "inclusive" | "inclusive_note";
export type PriceType = "exclude_vat" | "include_vat" | "no_vat";
export type DocumentType = "receipt" | "delivery" | "quotation" | "tax_invoice";
export type PaperSize = "A4" | "A5" | "Letter" | "Legal" | "80mm" | "custom";
export type PrintMode = "fit_a4" | "fit_height" | "actual";
export type DocTemplate = "modern" | "classic" | "compact" | "formal";
export type StatusWorkflow = "draft" | "pending" | "approved" | "cancelled";
/**
 * New unified "companion set" picker. Replaces the legacy
 * `also_issue_receipt` toggle + the ad-hoc "ออกใบเสร็จพร้อมใบส่งของ"
 * shortcut. Each companion gets its own running document number
 * allocated per type (QT / DN / RC / …).
 */
export type CompanionSet = "none" | "delivery" | "receipt" | "both";

export const STATUS_LABEL: Record<StatusWorkflow, string> = {
  draft: "ร่าง",
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  cancelled: "ยกเลิก",
};

export const TEMPLATE_LABEL: Record<DocTemplate, string> = {
  modern: "ใบเสร็จสมัยใหม่",
  classic: "คลาสสิก",
  compact: "กระชับ",
  formal: "ทางการ",
};

export interface DocItem {
  key: string;
  product_id: string | null;
  name: string;
  description: string;
  price: number;
  quantity: number;
  unit: string;
  discount_percent: number;
  discount_amount: number;
}

export interface DocFormState {
  document_type: DocumentType;
  paper_size: PaperSize;
  print_mode?: PrintMode;
  auto_fit_a4?: boolean;
  print_scale?: number | null;
  font_scale?: number | null;
  template?: DocTemplate;
  /** Selected editable layout (rds_document_layouts.id). Null = fall back to defaults. */
  layout_id?: string | null;
  status_workflow?: StatusWorkflow;
  /** Issue extra companion docs alongside the main one (default "none"). */
  companion_set?: CompanionSet;
  /** Source document this row was created from (e.g. QT-0005). Read-only label. */
  related_document_no?: string | null;
  show_payment_method?: boolean;
  show_payment_date?: boolean;
  show_footer_document_date?: boolean;
  document_date: string; // yyyy-mm-dd
  show_document_date: boolean;
  vat_mode: VatMode;
  vat_rate: number;
  price_type: PriceType;
  withholding_tax_enabled: boolean;
  withholding_tax_rate: number;
  discount_amount: number; // bill-level discount
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_tax_id: string;
  customer_branch: string;
  payment_method: string;
  notes: string;
  project_name?: string;
  /**
   * Internal sale classification. Staff/store-only — never shown on any
   * customer-facing print template, PDF, or customer view. Used purely for
   * back-office filtering and reporting.
   */
  internal_sale_type?: "bill_only" | "real_goods";
  items: DocItem[];
}

let _k = 0;
export const newKey = () => `r${Date.now()}_${_k++}`;

export function emptyItem(): DocItem {
  return {
    key: newKey(),
    product_id: null,
    name: "",
    description: "",
    price: 0,
    quantity: 1,
    unit: "",
    discount_percent: 0,
    discount_amount: 0,
  };
}

export function defaultsForStore(store: RdsStore | null): Partial<DocFormState> {
  if (!store) return {};
  return {
    vat_mode: store.vat_enabled ? "exclusive" : "none",
    vat_rate: store.vat_enabled ? Number(store.default_vat_rate ?? 7) : 0,
    price_type: store.vat_enabled ? "exclude_vat" : "no_vat",
  };
}

export function calcLineTotal(it: DocItem): number {
  const gross = (it.price || 0) * (it.quantity || 0);
  const pct = gross * ((it.discount_percent || 0) / 100);
  return Math.max(0, gross - pct - (it.discount_amount || 0));
}

export type ItemIssueField = "name" | "price" | "quantity";
export interface ItemIssue {
  index: number;
  fields: ItemIssueField[];
  reason: string;
}

/**
 * Validate items before saving. Skips fully-empty rows; flags rows that have
 * partial data but cannot be saved (missing name, invalid qty/price).
 */
export function validateItems(items: DocItem[]): { valid: boolean; issues: ItemIssue[]; nonEmpty: number } {
  const issues: ItemIssue[] = [];
  let nonEmpty = 0;
  items.forEach((it, index) => {
    const hasName = !!(it.name && it.name.trim());
    const hasPrice = Number.isFinite(it.price) && it.price !== 0;
    const hasOtherContent = !!(
      it.product_id ||
      (it.description && it.description.trim()) ||
      (it.unit && it.unit.trim()) ||
      (it.discount_percent && it.discount_percent !== 0) ||
      (it.discount_amount && it.discount_amount !== 0)
    );
    if (!hasName && !hasPrice && !hasOtherContent) return; // untouched default row — skip
    nonEmpty++;
    const fields: ItemIssueField[] = [];
    const reasons: string[] = [];
    if (!hasName) {
      fields.push("name");
      reasons.push("ไม่มีชื่อรายการ");
    }
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
      fields.push("quantity");
      reasons.push("จำนวนต้องมากกว่า 0");
    }
    if (!Number.isFinite(it.price) || it.price < 0) {
      fields.push("price");
      reasons.push("ราคาต้องเป็นตัวเลข ≥ 0");
    }
    if (fields.length) {
      issues.push({ index, fields, reason: reasons.join(" · ") });
    }
  });
  return { valid: issues.length === 0 && nonEmpty > 0, issues, nonEmpty };
}

export interface Totals {
  subtotal: number;
  discount_total: number;
  amount_before_vat: number;
  vat_amount: number;
  grand_total: number;
  withholding_tax_amount: number;
  net_total: number;
}

export function computeTotals(state: DocFormState): Totals {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const subtotal = state.items.reduce((s, it) => s + calcLineTotal(it), 0);
  const billDiscount = state.discount_amount || 0;
  const discount_total = billDiscount; // line discounts already in line_total
  const afterDiscount = Math.max(0, subtotal - billDiscount);
  const rate = state.vat_rate || 0;
  let amount_before_vat = 0;
  let vat_amount = 0;
  let grand_total = 0;

  if (state.vat_mode === "none") {
    amount_before_vat = round2(afterDiscount);
    vat_amount = 0;
    grand_total = round2(afterDiscount);
  } else if (state.vat_mode === "exclusive") {
    amount_before_vat = round2(afterDiscount);
    vat_amount = round2(amount_before_vat * (rate / 100));
    grand_total = round2(amount_before_vat + vat_amount);
  } else {
    // inclusive / inclusive_note
    grand_total = round2(afterDiscount);
    amount_before_vat = round2(grand_total / (1 + rate / 100));
    vat_amount = round2(grand_total - amount_before_vat);
  }

  const withholding_tax_amount = state.withholding_tax_enabled
    ? round2(amount_before_vat * ((state.withholding_tax_rate || 0) / 100))
    : 0;
  const net_total = round2(grand_total - withholding_tax_amount);

  // Dev-only invariant: บรรทัด "ก่อน VAT + VAT = ยอดรวม" ต้องตรงเป๊ะ
  // หากผิดเพี้ยน (ผลของ floating point) ให้ log เพื่อจับ regression
  if (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production") {
    const diff = Math.abs(amount_before_vat + vat_amount - grand_total);
    if (diff > 0.01) {
      // eslint-disable-next-line no-console
      console.warn("[computeTotals] VAT invariant broken", { amount_before_vat, vat_amount, grand_total, diff });
    }
  }

  return {
    subtotal: round2(subtotal),
    discount_total: round2(discount_total),
    amount_before_vat,
    vat_amount,
    grand_total,
    withholding_tax_amount,
    net_total,
  };
}

export function useDocumentForm(initial?: Partial<DocFormState>) {
  const makeInitial = (override: Partial<DocFormState> = {}): DocFormState => ({
    document_type: "receipt",
    paper_size: "A4",
    print_mode: "fit_a4",
    auto_fit_a4: true,
    print_scale: null,
    font_scale: null,
    template: "modern",
    layout_id: null,
    status_workflow: "draft",
    companion_set: "none",
    related_document_no: null,
    document_date: new Date().toISOString().slice(0, 10),
    show_document_date: true,
    vat_mode: "none",
    vat_rate: 0,
    price_type: "no_vat",
    withholding_tax_enabled: false,
    withholding_tax_rate: 3,
    discount_amount: 0,
    customer_id: null,
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    customer_tax_id: "",
    customer_branch: "",
    payment_method: "cash",
    notes: "",
    project_name: "",
    internal_sale_type: "real_goods",
    items: [emptyItem()],
    ...override,
  });
  const [state, setState] = useState<DocFormState>(() => makeInitial(initial));
  const resetForm = useCallback(
    (override: Partial<DocFormState> = {}) => setState(makeInitial(override)),
    []
  );

  const patch = useCallback((p: Partial<DocFormState>) => setState((s) => ({ ...s, ...p })), []);
  const setItem = useCallback((idx: number, p: Partial<DocItem>) => {
    setState((s) => ({
      ...s,
      items: s.items.map((it, i) => (i === idx ? { ...it, ...p } : it)),
    }));
  }, []);
  const addItem = useCallback(() => setState((s) => ({ ...s, items: [...s.items, emptyItem()] })), []);
  const addItems = useCallback(
    (rows: Partial<DocItem>[]) =>
      setState((s) => ({
        ...s,
        items: [...s.items.filter((it) => it.name || it.price), ...rows.map((r) => ({ ...emptyItem(), ...r }))],
      })),
    []
  );
  const removeItem = useCallback(
    (idx: number) =>
      setState((s) => ({ ...s, items: s.items.length > 1 ? s.items.filter((_, i) => i !== idx) : s.items })),
    []
  );
  const moveItem = useCallback((from: number, to: number) => {
    setState((s) => {
      const arr = [...s.items];
      const [r] = arr.splice(from, 1);
      arr.splice(to, 0, r);
      return { ...s, items: arr };
    });
  }, []);

  const totals = useMemo(() => computeTotals(state), [state]);

  return { state, setState, patch, setItem, addItem, addItems, removeItem, moveItem, totals, resetForm };
}