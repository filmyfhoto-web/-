/**
 * POS receipt + printing preferences.
 *
 * Single source of truth shared by PosSettings (settings UI),
 * PosReceiptPrint (printable receipt) and PosSaleSuccessDialog.
 * Stored per device in localStorage under `pos.settings.v1`; the last paper
 * size actually used is remembered per branch under `pos.receipt.paper.v1`.
 */

export type PosPaperSize = "80mm" | "58mm" | "A4";

export const POS_SETTINGS_KEY = "pos.settings.v1";
export const POS_PAPER_KEY = "pos.receipt.paper.v1";

export interface PosSettingsPrefs {
  storeLabel: string;
  currency: string;
  paperSize: PosPaperSize;
  autoPrint: boolean;
  copies: number;
  vatEnabled: boolean;
  vatRate: number;
  vatIncluded: boolean;
  receiptPrefix: string;
  dateFormat: "th" | "iso";
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeTaxId: string;
  receiptFooter: string;
}

export const DEFAULT_POS_SETTINGS: PosSettingsPrefs = {
  storeLabel: "",
  currency: "THB",
  paperSize: "80mm",
  autoPrint: false,
  copies: 1,
  vatEnabled: false,
  vatRate: 7,
  vatIncluded: false,
  receiptPrefix: "R",
  dateFormat: "th",
  storeName: "",
  storeAddress: "",
  storePhone: "",
  storeTaxId: "",
  receiptFooter: "ขอบคุณที่ใช้บริการ",
};

export const PAPER_LABEL: Record<PosPaperSize, string> = {
  "80mm": "ใบเสร็จ 80 มม.",
  "58mm": "ใบเสร็จ 58 มม.",
  A4: "A4",
};

function isPaper(v: unknown): v is PosPaperSize {
  return v === "80mm" || v === "58mm" || v === "A4";
}

export function loadPosSettings(): PosSettingsPrefs {
  try {
    const raw = localStorage.getItem(POS_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_POS_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PosSettingsPrefs>;
    const merged = { ...DEFAULT_POS_SETTINGS, ...parsed };
    if (!isPaper(merged.paperSize)) merged.paperSize = DEFAULT_POS_SETTINGS.paperSize;
    merged.copies = Math.min(5, Math.max(1, Number(merged.copies) || 1));
    merged.vatRate = Math.min(30, Math.max(0, Number(merged.vatRate) || 0));
    return merged;
  } catch {
    return { ...DEFAULT_POS_SETTINGS };
  }
}

export function savePosSettings(prefs: PosSettingsPrefs): void {
  try {
    localStorage.setItem(POS_SETTINGS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage disabled — settings stay session-only */
  }
}

/** Remember the paper the operator last printed with, per branch/device. */
export function loadReceiptPaper(branch?: string | null): PosPaperSize {
  const key = branch || "default";
  try {
    const raw = localStorage.getItem(POS_PAPER_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, unknown>;
      if (isPaper(map?.[key])) return map[key] as PosPaperSize;
      if (isPaper(map?.default)) return map.default as PosPaperSize;
    }
  } catch {
    /* ignore */
  }
  return loadPosSettings().paperSize;
}

export function saveReceiptPaper(paper: PosPaperSize, branch?: string | null): void {
  const key = branch || "default";
  try {
    let map: Record<string, string> = {};
    const raw = localStorage.getItem(POS_PAPER_KEY);
    if (raw) map = JSON.parse(raw) as Record<string, string>;
    map[key] = paper;
    map.default = paper;
    localStorage.setItem(POS_PAPER_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** `@page` rules per paper size: rolls use continuous height, A4 keeps margins. */
export function paperPageCss(paper: PosPaperSize): string {
  if (paper === "58mm") return "@page { size: 58mm auto; margin: 2mm; }";
  if (paper === "A4") return "@page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }";
  return "@page { size: 80mm auto; margin: 3mm; }";
}

/** Rendered width of the receipt body for a paper size. */
export function paperBodyWidth(paper: PosPaperSize): string {
  if (paper === "58mm") return "54mm";
  if (paper === "A4") return "186mm";
  return "74mm";
}

/** Base font size in px — thermal Thai text must stay readable. */
export function paperFontPx(paper: PosPaperSize): number {
  if (paper === "58mm") return 11;
  if (paper === "A4") return 13;
  return 12;
}

export interface VatBreakdown {
  enabled: boolean;
  rate: number;
  base: number;
  vat: number;
  total: number;
  inclusive: boolean;
}

/**
 * Derive the VAT breakdown for a receipt total. The charged total is never
 * modified here — VAT is always extracted from the amount actually charged so
 * the printed figures add up exactly.
 */
export function computeVat(
  total: number,
  prefs: Pick<PosSettingsPrefs, "vatEnabled" | "vatRate" | "vatIncluded">,
): VatBreakdown {
  const rate = Number(prefs.vatRate) || 0;
  const grand = Number(total) || 0;
  if (!prefs.vatEnabled || rate <= 0) {
    return { enabled: false, rate: 0, base: grand, vat: 0, total: grand, inclusive: false };
  }
  const base = grand / (1 + rate / 100);
  return {
    enabled: true,
    rate,
    base: round2(base),
    vat: round2(grand - base),
    total: grand,
    inclusive: !!prefs.vatIncluded,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Thai-timezone formatting used across receipts (Asia/Bangkok). */
export function formatThaiDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function formatBaht(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}