/**
 * Deterministic Thai "document command" parser for FILM SHOP.
 *
 * Shared verbatim by the edge functions (Deno) and the browser bundle
 * (src/film-shop/lib/docCommand.ts re-exports this file), so a typed
 * command, a spoken command and a LINE message all resolve identically.
 *
 * Rules:
 * - never guess customer, shop, price, VAT, payment state or issue date
 * - every total is computed here in code, never by an AI model
 * - anything unknown is reported in `missing` as a Thai label
 */

export type DocCommandType =
  | "job_order"
  | "quotation"
  | "delivery_note"
  | "receipt"
  | "tax_receipt";

export type ShopKey = "film" | "colorlab" | "printing";

export const DOC_TYPE_LABELS: Record<DocCommandType, string> = {
  job_order: "ใบสั่งจ้าง",
  quotation: "ใบเสนอราคา",
  delivery_note: "ใบส่งของ",
  receipt: "ใบเสร็จรับเงิน",
  tax_receipt: "ใบเสร็จรับเงิน/ใบกำกับภาษี",
};

export const SHOP_LABELS: Record<ShopKey, string> = {
  film: "NATTAWORKS (FILM SHOP)",
  colorlab: "นัฐภรณ์ คัลเลอร์แล็ป",
  printing: "นัฐภรณ์ การพิมพ์",
};

export interface DraftItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface DraftFields {
  docType: DocCommandType;
  shopKey: ShopKey | null;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerTaxId?: string;
  project?: string;
  items: DraftItem[];
  discount: number;
  /** none = no VAT line, exclusive = add 7% on top, inclusive = price already includes VAT */
  vatMode: "none" | "exclusive" | "inclusive";
  vatRate: number;
  whtRate: number;
  deposit: number;
  paymentStatus: "unpaid" | "deposit" | "paid";
  paymentMethod?: string;
  /** ISO-8601 with the +07:00 (Asia/Bangkok) offset */
  dueAtISO?: string;
  notes?: string;
  missing: string[];
}

export interface DraftTotals {
  subtotal: number;
  discount: number;
  net: number;
  vatAmount: number;
  whtAmount: number;
  total: number;
  amountDue: number;
}

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Deterministic totals. The only place the numbers are produced. */
export function computeDraftTotals(
  items: Array<Pick<DraftItem, "quantity" | "unitPrice" | "discount">>,
  opts: {
    discount?: number;
    vatMode?: DraftFields["vatMode"];
    vatRate?: number;
    whtRate?: number;
    deposit?: number;
  } = {},
): DraftTotals {
  const vatMode = opts.vatMode ?? "none";
  const vatRate = Number(opts.vatRate ?? 7) || 0;
  const whtRate = Number(opts.whtRate ?? 0) || 0;
  const deposit = money(opts.deposit ?? 0);

  const subtotal = money(
    items.reduce(
      (s, i) =>
        s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) - (Number(i.discount) || 0),
      0,
    ),
  );
  const discount = money(opts.discount ?? 0);
  const net = money(Math.max(0, subtotal - discount));

  let base = net;
  let vatAmount = 0;
  if (vatMode === "exclusive") {
    vatAmount = money(net * (vatRate / 100));
  } else if (vatMode === "inclusive") {
    base = money(net / (1 + vatRate / 100));
    vatAmount = money(net - base);
  }
  const whtAmount = money(base * (whtRate / 100));
  const total = money(vatMode === "exclusive" ? net + vatAmount - whtAmount : net - whtAmount);
  return {
    subtotal,
    discount,
    net,
    vatAmount,
    whtAmount,
    total,
    amountDue: money(Math.max(0, total - deposit)),
  };
}

export const ITEM_UNITS = "(ชิ้น|อัน|ตัว|แผ่น|ผืน|ใบ|ชุด|ม้วน|เมตร|ตร\\.?ม\\.?|กล่อง|งาน)";

const DOC_TYPE_PATTERNS: Array<[DocCommandType, RegExp]> = [
  ["tax_receipt", /(ใบกำกับภาษี|ใบเสร็จ\s*\/?\s*ใบกำกับ|tax\s*invoice)/i],
  ["receipt", /(ใบเสร็จ|ใบเสร็จรับเงิน|receipt)/i],
  ["quotation", /(ใบเสนอราคา|เสนอราคา|quotation|quote)/i],
  ["delivery_note", /(ใบส่งของ|ใบส่งสินค้า|delivery)/i],
  ["job_order", /(ใบสั่งจ้าง|สั่งจ้าง|ใบสั่งงาน|work\s*order|job\s*order)/i],
];

const SHOP_PATTERNS: Array<[ShopKey, RegExp]> = [
  ["film", /(nattaworks|นัฐเวิร์ค|นัทเวิร์ค|film\s*shop|ฟิล์มช็อป)/i],
  ["colorlab", /(คัลเลอร์แล็ป|คัลเลอร์แลป|color\s*lab)/i],
  ["printing", /(การพิมพ์|โรงพิมพ์|printing)/i],
];

export const DOC_FIELD_LABELS = {
  docType: "ประเภทเอกสาร",
  shop: "ร้าน",
  customerName: "ชื่อลูกค้า",
  items: "รายการ",
  unitPrice: "ราคาต่อหน่วย",
  dueAt: "วันนัดรับ",
  paymentStatus: "สถานะการชำระเงิน",
  taxId: "เลขผู้เสียภาษี",
} as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function bkkParts(now: Date) {
  const d = new Date(now.getTime() + 7 * 3600_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

function addDays(y: number, m: number, d: number, days: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function iso(y: number, m: number, d: number, hh: number, mm: number) {
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+07:00`;
}

const THAI_WEEKDAYS: Array<[number, RegExp]> = [
  [0, /วันอาทิตย์/],
  [1, /วันจันทร์/],
  [2, /วันอังคาร/],
  [3, /วันพุธ/],
  [4, /วันพฤหัส(บดี)?/],
  [5, /วันศุกร์/],
  [6, /วันเสาร์/],
];

const TH_MONTH_NAMES: Array<[number, RegExp]> = [
  [1, /ม\.?ค\.?|มกราคม/],
  [2, /ก\.?พ\.?|กุมภาพันธ์/],
  [3, /มี\.?ค\.?|มีนาคม/],
  [4, /เม\.?ย\.?|เมษายน/],
  [5, /พ\.?ค\.?|พฤษภาคม/],
  [6, /มิ\.?ย\.?|มิถุนายน/],
  [7, /ก\.?ค\.?|กรกฎาคม/],
  [8, /ส\.?ค\.?|สิงหาคม/],
  [9, /ก\.?ย\.?|กันยายน/],
  [10, /ต\.?ค\.?|ตุลาคม/],
  [11, /พ\.?ย\.?|พฤศจิกายน/],
  [12, /ธ\.?ค\.?|ธันวาคม/],
];

function parseClock(text: string): { hh: number; mm: number } | undefined {
  if (/เที่ยงคืน/.test(text)) return { hh: 0, mm: 0 };
  if (/เที่ยงวัน|เที่ยง(?!คืน)/.test(text)) return { hh: 12, mm: 0 };
  const m = text.match(/(\d{1,2})[:.](\d{2})\s*(?:น\.?)?/);
  if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return { hh: Number(m[1]), mm: Number(m[2]) };
  const m2 = text.match(/(\d{1,2})\s*โมง(เย็น|เช้า)?/);
  if (m2) {
    let hh = Number(m2[1]);
    if (m2[2] === "เย็น" && hh < 12) hh += 12;
    if (hh <= 23) return { hh, mm: 0 };
  }
  return undefined;
}

/**
 * Resolve Thai relative/absolute dates in Asia/Bangkok.
 * Returns undefined when the text says nothing explicit — never a guess.
 */
export function resolveThaiDate(text: string, now: Date = new Date()): string | undefined {
  const nb = bkkParts(now);
  const time = parseClock(text);
  const DEFAULT_HOUR = 17;

  const numeric = text.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?/);
  if (numeric) {
    const d = Number(numeric[1]);
    const m = Number(numeric[2]);
    let y = numeric[3] ? Number(numeric[3]) : nb.year;
    if (numeric[3] && String(numeric[3]).length === 2) y = 2000 + y;
    if (y > 2400) y -= 543;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return iso(y, m, d, time?.hh ?? DEFAULT_HOUR, time?.mm ?? 0);
    }
  }

  const named = text.match(/(\d{1,2})\s*([ก-๙]{2,10}\.?[ก-๙]?\.?)\s*(\d{2,4})?/);
  if (named) {
    const mm = TH_MONTH_NAMES.find(([, re]) => re.test(named[2]));
    if (mm) {
      let y = named[3] ? Number(named[3]) : nb.year;
      if (String(named[3] ?? "").length === 2) y = 2000 + y;
      if (y > 2400) y -= 543;
      const d = Number(named[1]);
      if (d >= 1 && d <= 31) return iso(y, mm[0], d, time?.hh ?? DEFAULT_HOUR, time?.mm ?? 0);
    }
  }

  let offset: number | undefined;
  if (/มะรืน/.test(text)) offset = 2;
  else if (/พรุ่งนี้/.test(text)) offset = 1;
  else if (/วันนี้/.test(text)) offset = 0;
  else {
    const inDays = text.match(/อีก\s*(\d{1,2})\s*วัน/);
    if (inDays) offset = Number(inDays[1]);
  }
  if (offset === undefined) {
    const wd = THAI_WEEKDAYS.find(([, re]) => re.test(text));
    if (wd) {
      const wanted = wd[0];
      let delta = (wanted - nb.weekday + 7) % 7;
      if (delta === 0) delta = 7; // "วันศุกร์" said on a Friday means next Friday
      offset = delta;
    }
  }
  if (offset !== undefined) {
    const t = addDays(nb.year, nb.month, nb.day, offset);
    return iso(t.y, t.m, t.d, time?.hh ?? DEFAULT_HOUR, time?.mm ?? 0);
  }
  return undefined;
}

/** "7 สิงหาคม 2569" — Buddhist-era Thai date for the preview/confirmation. */
const TH_MONTH_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export function formatThaiDate(isoText?: string | null): string {
  if (!isoText) return "-";
  const t = Date.parse(isoText);
  if (!Number.isFinite(t)) return "-";
  const d = new Date(t + 7 * 3600_000);
  return `${d.getUTCDate()} ${TH_MONTH_FULL[d.getUTCMonth()]} ${d.getUTCFullYear() + 543} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} น.`;
}

function labelled(text: string, aliases: string[]): string | undefined {
  for (const a of aliases) {
    const re = new RegExp(`(?:^|\\n|\\s)${a}\\s*[:：=]\\s*([^\\n]+)`, "i");
    const m = text.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return undefined;
}

function numberFrom(text?: string): number | undefined {
  if (!text) return undefined;
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

/** Detect the document intent of a free-form message (used by LINE too). */
export function detectDocIntent(text: string): DocCommandType | null {
  const flat = String(text || "").replace(/\n/g, " ");
  if (!/(ออก|ทำ|สร้าง|ขอ)/.test(flat) && !/ใบ(สั่งจ้าง|เสนอราคา|ส่งของ|เสร็จ|กำกับภาษี)/.test(flat)) {
    return null;
  }
  for (const [type, re] of DOC_TYPE_PATTERNS) if (re.test(flat)) return type;
  return null;
}

/**
 * Parse a typed / spoken / LINE command into editable draft fields.
 * Everything it cannot read confidently is listed in `missing`.
 */
export function parseDocCommand(rawText: string, now: Date = new Date()): DraftFields {
  const text = String(rawText || "").replace(/\r/g, "").trim();
  const flat = text.replace(/\n/g, " ");

  const docType = detectDocIntent(text) ?? "job_order";
  const shopKey = SHOP_PATTERNS.find(([, re]) => re.test(flat))?.[0] ?? null;

  const customerName =
    labelled(text, ["ชื่อลูกค้า", "ลูกค้า", "customer", "name"]) ||
    flat.match(/(?:ให้|ของ)\s*(คุณ[^\s,]{1,30}|บริษัท[^\s,]{2,40}|ร้าน[^\s,]{2,40}|โรงเรียน[^\s,]{2,40})/)?.[1];

  const customerPhone = (labelled(text, ["เบอร์", "โทร", "tel", "phone"]) ?? flat)
    .match(/(0\d{1,2}[- ]?\d{3}[- ]?\d{3,4})/)?.[1];
  const customerAddress = labelled(text, ["ที่อยู่", "address"]);
  const customerTaxId =
    labelled(text, ["เลขผู้เสียภาษี", "เลขประจำตัวผู้เสียภาษี", "tax\\s*id"]) ||
    flat.match(/\b(\d{13})\b/)?.[1];
  const project = labelled(text, ["โปรเจกต์", "โครงการ", "งาน", "project"]);

  // --- item line: "<description> <qty> <unit> ชิ้นละ <price>"
  const items: DraftItem[] = [];
  const qtyMatch = flat.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${ITEM_UNITS}`));
  const priceMatch =
    numberFrom(labelled(text, ["ราคาต่อหน่วย", "ราคา", "unit\\s*price"])) ??
    numberFrom(flat.match(/(?:ชิ้นละ|อันละ|ใบละ|ละ|หน่วยละ|ราคา)\s*([\d,]+(?:\.\d+)?)\s*(?:บาท)?/)?.[1]);
  const descLabel = labelled(text, ["รายการ", "item", "งาน"]);
  let description = descLabel ?? "";
  if (!description) {
    const m = flat.match(
      /(ป้ายไวนิล|ไวนิล|สติกเกอร์|สติ๊กเกอร์|โปสเตอร์|นามบัตร|ใบปลิว|โบรชัวร์|แบนเนอร์|ป้าย[ก-๙a-z]*|งานพิมพ์|งานออกแบบ)/i,
    );
    description = m?.[1] ?? "";
  }
  const quantity = qtyMatch ? Number(qtyMatch[1]) : undefined;
  const unit = qtyMatch?.[2] ?? "ชิ้น";
  if (description || quantity !== undefined || priceMatch !== undefined) {
    const q = quantity ?? 1;
    const p = priceMatch ?? 0;
    items.push({
      description,
      quantity: q,
      unit,
      unitPrice: p,
      discount: 0,
      total: money(q * p),
    });
  }

  const vatMode: DraftFields["vatMode"] = /(รวม\s*vat|รวมภาษี|vat\s*in)/i.test(flat)
    ? "inclusive"
    : /(vat|ภาษีมูลค่าเพิ่ม|แวต)/i.test(flat)
      ? "exclusive"
      : "none";
  const whtRate = /(หัก\s*ณ\s*ที่จ่าย|withholding)/i.test(flat)
    ? (numberFrom(flat.match(/หัก\s*ณ\s*ที่จ่าย\s*([\d.]+)\s*%/)?.[1]) ?? 3)
    : 0;

  const paymentStatus: DraftFields["paymentStatus"] = /(ชำระแล้ว|จ่ายแล้ว|ชำระเงินแล้ว|paid)/i.test(flat)
    ? "paid"
    : /(มัดจำ|วางมัดจำ|deposit)/i.test(flat)
      ? "deposit"
      : "unpaid";
  const paymentMethod = /(โอน|transfer)/i.test(flat)
    ? "โอนเงิน"
    : /(เงินสด|cash)/i.test(flat)
      ? "เงินสด"
      : /(บัตร|credit)/i.test(flat)
        ? "บัตรเครดิต"
        : undefined;
  const deposit = numberFrom(flat.match(/มัดจำ\s*([\d,]+(?:\.\d+)?)/)?.[1]) ?? 0;
  const discount = numberFrom(flat.match(/ส่วนลด\s*([\d,]+(?:\.\d+)?)/)?.[1]) ?? 0;

  const dueLabel = labelled(text, ["นัดรับ", "วันนัดรับ", "รับงาน", "กำหนด", "due"]);
  const dueAtISO = resolveThaiDate(dueLabel ?? flat, now);
  const notes = labelled(text, ["หมายเหตุ", "note", "remark"]);

  const fields: DraftFields = {
    docType,
    shopKey,
    customerName: customerName?.trim(),
    customerPhone,
    customerAddress,
    customerTaxId,
    project,
    items,
    discount,
    vatMode,
    vatRate: 7,
    whtRate,
    deposit,
    paymentStatus,
    paymentMethod,
    dueAtISO,
    notes,
    missing: [],
  };
  fields.missing = missingFields(fields);
  return fields;
}

/** Thai labels of everything still required before the document may be issued. */
export function missingFields(f: DraftFields): string[] {
  const missing: string[] = [];
  if (!f.shopKey) missing.push(DOC_FIELD_LABELS.shop);
  if (!f.customerName?.trim()) missing.push(DOC_FIELD_LABELS.customerName);
  if (!f.items.length || f.items.every((i) => !i.description.trim())) {
    missing.push(DOC_FIELD_LABELS.items);
  } else if (f.items.some((i) => !(Number(i.unitPrice) > 0) || !(Number(i.quantity) > 0))) {
    missing.push(DOC_FIELD_LABELS.unitPrice);
  }
  if (f.docType === "job_order" && !f.dueAtISO) missing.push(DOC_FIELD_LABELS.dueAt);
  if ((f.docType === "receipt" || f.docType === "tax_receipt") && f.paymentStatus !== "paid") {
    missing.push(DOC_FIELD_LABELS.paymentStatus);
  }
  if (f.docType === "tax_receipt" && !f.customerTaxId) missing.push(DOC_FIELD_LABELS.taxId);
  return missing;
}

/** Gate for the "ยืนยันออกเอกสาร" button; mirrors document_command_finalize(). */
export function canFinalize(f: DraftFields): { ok: boolean; reasons: string[] } {
  const reasons = missingFields(f);
  if ((f.docType === "receipt" || f.docType === "tax_receipt") && f.paymentStatus !== "paid") {
    const msg = "ออกใบเสร็จได้เมื่อสถานะเป็น “ชำระแล้ว” เท่านั้น";
    if (!reasons.includes(msg)) reasons.push(msg);
  }
  return { ok: reasons.length === 0, reasons };
}

/** Reply asking only for what is actually missing — never invented content. */
export function buildMissingPrompt(missing: string[]): string {
  return `ข้อมูลไม่ครบ รบกวนแจ้งเพิ่มเติมค่ะ:\n- ${missing.join("\n- ")}`;
}