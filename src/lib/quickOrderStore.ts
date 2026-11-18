import { z } from "zod";

export type QuickOrderMode = "work_order" | "delivery" | "quote";
export type DiscountKind = "pct" | "amt";
export type VatMode = "none" | "add" | "incl";

export type QuickOrderItem = {
  name: string;
  qty: string;
  unit: string;
  price: string;
};

export type QuickOrderState = {
  mode: QuickOrderMode;
  name: string;
  company: string;
  address: string;
  phone: string;
  taxId: string;
  items: QuickOrderItem[];
  note: string;
  discountKind: DiscountKind;
  discountPct: string;
  discountAmt: string;
  vatMode: VatMode;
};

export type QuickOrderTotals = {
  subtotal: number;
  discount: number;
  afterDiscount: number;
  base: number;
  vat: number;
  grand: number;
};

export type QuickOrderSubmission = {
  id: string;
  phone: string;
  name: string;
  mode: QuickOrderMode;
  state: QuickOrderState;
  totals: QuickOrderTotals;
  submittedAt: number;
  origin: string;
};

const DRAFT_KEY = "quickorder_draft_v1";
const SUBS_KEY = "quickorder_submissions_v1";

export function emptyItem(): QuickOrderItem {
  return { name: "", qty: "1", unit: "", price: "" };
}

export function emptyState(): QuickOrderState {
  return {
    mode: "quote",
    name: "",
    company: "",
    address: "",
    phone: "",
    taxId: "",
    items: [emptyItem()],
    note: "",
    discountKind: "pct",
    discountPct: "0",
    discountAmt: "0",
    vatMode: "none",
  };
}

/** Normalise a Thai phone to digits-only for matching. */
export function normPhone(p: string): string {
  return (p || "").replace(/\D/g, "");
}

export const phoneRegex = /^0[0-9]{8,9}$/;

export const quickOrderSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อลูกค้า").max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => phoneRegex.test(normPhone(v)), "เบอร์โทรไม่ถูกต้อง (0xxxxxxxxx)"),
  items: z
    .array(
      z.object({
        name: z.string(),
        qty: z.string(),
        unit: z.string(),
        price: z.string(),
      }),
    )
    .refine(
      (arr) => arr.some((it) => it.name.trim() && (parseFloat(it.qty) || 0) > 0),
      "ต้องมีอย่างน้อย 1 รายการ (ชื่อ + จำนวน)",
    ),
});

export function computeTotals(s: QuickOrderState): QuickOrderTotals {
  const subtotal = s.items.reduce((sum, it) => {
    const q = parseFloat(it.qty) || 0;
    const p = parseFloat(it.price) || 0;
    return sum + q * p;
  }, 0);
  let discount = 0;
  if (s.discountKind === "pct") {
    const d = Math.max(0, Math.min(100, parseFloat(s.discountPct) || 0));
    discount = (subtotal * d) / 100;
  } else {
    discount = Math.max(0, Math.min(subtotal, parseFloat(s.discountAmt) || 0));
  }
  const afterDiscount = Math.max(0, subtotal - discount);
  let base = afterDiscount;
  let vat = 0;
  let grand = afterDiscount;
  if (s.vatMode === "add") {
    base = afterDiscount;
    vat = base * 0.07;
    grand = base + vat;
  } else if (s.vatMode === "incl") {
    grand = afterDiscount;
    base = grand / 1.07;
    vat = grand - base;
  }
  return { subtotal, discount, afterDiscount, base, vat, grand };
}

// ---------- Draft ----------

function draftKey(shop: string) {
  return `${DRAFT_KEY}_${shop || "default"}`;
}

export function saveDraft(shop: string, state: QuickOrderState): void {
  try {
    localStorage.setItem(
      draftKey(shop),
      JSON.stringify({ state, savedAt: Date.now() }),
    );
  } catch {
    /* quota */
  }
}

export function loadDraft(
  shop: string,
): { state: QuickOrderState; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(draftKey(shop));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(shop: string): void {
  try {
    localStorage.removeItem(draftKey(shop));
  } catch {
    /* noop */
  }
}

export function draftHasContent(s: QuickOrderState): boolean {
  return (
    !!s.name.trim() ||
    !!s.phone.trim() ||
    !!s.company.trim() ||
    !!s.address.trim() ||
    !!s.note.trim() ||
    s.items.some((it) => it.name.trim() || parseFloat(it.price) > 0)
  );
}

// ---------- Submissions ----------

function subsKey(shop: string) {
  return `${SUBS_KEY}_${shop || "default"}`;
}

function readSubs(shop: string): QuickOrderSubmission[] {
  try {
    const raw = localStorage.getItem(subsKey(shop));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeSubs(shop: string, list: QuickOrderSubmission[]): void {
  try {
    localStorage.setItem(subsKey(shop), JSON.stringify(list.slice(-50)));
  } catch {
    /* noop */
  }
}

export function saveSubmission(
  shop: string,
  rec: Omit<QuickOrderSubmission, "id" | "submittedAt" | "origin">,
): QuickOrderSubmission {
  const full: QuickOrderSubmission = {
    ...rec,
    id: `qo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    submittedAt: Date.now(),
    origin: typeof window !== "undefined" ? window.location.origin : "",
  };
  const list = readSubs(shop);
  list.push(full);
  writeSubs(shop, list);
  return full;
}

export function listSubmissionsByPhone(
  shop: string,
  phone: string,
): QuickOrderSubmission[] {
  const digits = normPhone(phone);
  if (digits.length < 4) return [];
  return readSubs(shop)
    .filter((r) => normPhone(r.phone) === digits)
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

export function getSubmission(
  shop: string,
  id: string,
): QuickOrderSubmission | null {
  return readSubs(shop).find((r) => r.id === id) ?? null;
}

// ---------- Message builders ----------

const MODE_TITLE: Record<QuickOrderMode, string> = {
  work_order: "ใบสั่งจ้าง",
  delivery: "ใบส่งของ",
  quote: "ใบเสนอราคา",
};

const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function modeTitle(m: QuickOrderMode): string {
  return MODE_TITLE[m];
}

export function buildFullMessage(s: QuickOrderState, t: QuickOrderTotals): string {
  const lines: string[] = [];
  lines.push(`[${MODE_TITLE[s.mode]}]`);
  lines.push("");
  lines.push("— ข้อมูลลูกค้า —");
  if (s.name) lines.push(`ชื่อ: ${s.name}`);
  if (s.company) lines.push(`บริษัท/โรงเรียน: ${s.company}`);
  if (s.address) lines.push(`ที่อยู่: ${s.address}`);
  if (s.phone) lines.push(`โทร: ${s.phone}`);
  if (s.taxId) lines.push(`เลขผู้เสียภาษี: ${s.taxId}`);
  lines.push("");
  lines.push("— รายการ —");
  s.items.forEach((it, i) => {
    if (!it.name.trim()) return;
    const q = parseFloat(it.qty) || 0;
    const p = parseFloat(it.price) || 0;
    const line = `${i + 1}. ${it.name}  ×${q}${it.unit ? " " + it.unit : ""}${
      p ? ` @ ${fmt(p)} = ${fmt(q * p)}` : ""
    }`;
    lines.push(line);
  });
  lines.push("");
  lines.push("— สรุป —");
  lines.push(`ยอดรวม: ${fmt(t.subtotal)}`);
  if (t.discount > 0) {
    const dLabel =
      s.discountKind === "pct" ? `ส่วนลด ${s.discountPct}%` : "ส่วนลด";
    lines.push(`${dLabel}: -${fmt(t.discount)}`);
  }
  if (s.vatMode === "add") {
    lines.push(`ฐาน VAT: ${fmt(t.base)}`);
    lines.push(`VAT 7% (แยกนอก): ${fmt(t.vat)}`);
  } else if (s.vatMode === "incl") {
    lines.push(`ฐานก่อน VAT: ${fmt(t.base)}`);
    lines.push(`VAT 7% (รวมใน): ${fmt(t.vat)}`);
  }
  lines.push(`ยอดสุทธิ: ${fmt(t.grand)}`);
  if (s.note.trim()) {
    lines.push("");
    lines.push(`หมายเหตุ: ${s.note.trim()}`);
  }
  lines.push("");
  if (typeof window !== "undefined") {
    lines.push(`ส่งจาก: ${window.location.origin}${window.location.pathname}`);
  }
  return lines.join("\n");
}

export function buildShortMessage(s: QuickOrderState, t: QuickOrderTotals): string {
  const lines: string[] = [];
  const head = [`[${MODE_TITLE[s.mode]}]`];
  if (s.name) head.push(`คุณ${s.name}`);
  if (s.phone) head.push(s.phone);
  lines.push(head.join(" "));
  s.items.forEach((it, i) => {
    if (!it.name.trim()) return;
    const q = parseFloat(it.qty) || 0;
    const p = parseFloat(it.price) || 0;
    lines.push(
      `${i + 1}. ${it.name} ×${q}${it.unit ? " " + it.unit : ""}${
        p ? ` = ${fmt(q * p)}` : ""
      }`,
    );
  });
  lines.push(`สุทธิ: ${fmt(t.grand)}`);
  if (s.note.trim()) lines.push(`หมายเหตุ: ${s.note.trim()}`);
  return lines.join("\n");
}

export function buildTsvMessage(s: QuickOrderState): string {
  const rows: string[] = [];
  rows.push(["#", "รายการ", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม"].join("\t"));
  s.items.forEach((it, i) => {
    if (!it.name.trim()) return;
    const q = parseFloat(it.qty) || 0;
    const p = parseFloat(it.price) || 0;
    rows.push([String(i + 1), it.name, String(q), it.unit, fmt(p), fmt(q * p)].join("\t"));
  });
  return rows.join("\n");
}

export function fmtTHB(n: number): string {
  return fmt(n);
}