import type { DocThemeEntry, DocThemeMap, RdsStore } from "../types";

// Default HEX colors per document type (used when store has no override)
export const DEFAULT_DOC_THEME: Record<string, Required<DocThemeEntry>> = {
  quotation:   { title: "#7c3aed", header: "#7c3aed" },
  delivery:    { title: "#059669", header: "#059669" },
  tax_invoice: { title: "#1d4ed8", header: "#1d4ed8" },
  receipt:     { title: "#e11d48", header: "#e11d48" },
  invoice:     { title: "#64748b", header: "#64748b" },
  // Colorlab-only virtual bucket that unifies "receipt" + "tax_invoice"
  // under one tab / shortcut / heading. Reuses the receipt accent so
  // historical color coding remains stable.
  receipt_tax: { title: "#e11d48", header: "#e11d48" },
};

// Active tab order shown in create flows / settings (invoice hidden).
export const DOC_TYPE_ORDER = ["quotation", "delivery", "tax_invoice", "receipt"] as const;

// Canonical Thai labels for each stored document_type.
export const DOC_TYPE_LABEL: Record<string, string> = {
  quotation: "ใบเสนอราคา",
  delivery: "ใบส่งของ",
  tax_invoice: "ใบกำกับภาษี",
  receipt: "ใบเสร็จรับเงิน",
  invoice: "ใบแจ้งหนี้ (เลิกใช้)",
  // Virtual combined label — only surfaced when the active store is colorlab.
  receipt_tax: "ใบเสร็จรับเงิน/ใบกำกับภาษี",
};

const DEFAULT_ALLOWED = ["quotation", "delivery", "tax_invoice", "receipt"] as const;
// Non-VAT printing store: no ใบกำกับภาษี in create menus / filters.
const PRINTING_ALLOWED = ["quotation", "delivery", "receipt"] as const;

export type AllowedDocType = typeof DEFAULT_ALLOWED[number];

export const ALL_DOC_TYPES = DEFAULT_ALLOWED;

export function allowedDocTypesForStore(
  slug: string | null | undefined,
): readonly AllowedDocType[] {
  if (slug === "printing") return PRINTING_ALLOWED as unknown as readonly AllowedDocType[];
  // Colorlab issues only three documents: ใบเสร็จรับเงิน / ใบส่งของ / ใบเสนอราคา.
  // (Its receipt already prints the combined receipt + tax-invoice heading.)
  if (slug === "colorlab") return PRINTING_ALLOWED as unknown as readonly AllowedDocType[];
  return DEFAULT_ALLOWED;
}

export function isDocTypeAllowedForStore(
  slug: string | null | undefined,
  type: string | null | undefined,
): boolean {
  if (!type) return false;
  const list = allowedDocTypesForStore(slug);
  // "invoice" is legacy and read-only — always viewable, never creatable
  // via `isDocTypeAllowedForStore` gates (which guard creation flows).
  return (list as readonly string[]).includes(type);
}

export function getDocLabelForStore(
  _slug: string | null | undefined,
  docType: string | null | undefined,
): string {
  return getDocLabel(docType);
}

export function displayDocLabelForStore(
  slug: string | null | undefined,
  docType: string | null | undefined,
): string {
  // Colorlab merges receipt/tax_invoice into one label — apply for the
  // virtual bucket and for the underlying stored types so historical rows
  // in list/table columns show the combined name too.
  if (
    slug === "colorlab" &&
    (docType === "receipt" || docType === "tax_invoice" || docType === "invoice" || docType === "receipt_tax")
  ) {
    return DOC_TYPE_LABEL.receipt_tax;
  }
  return getDocLabelForStore(slug, docType);
}

export function tabBucketForStore(
  slug: string | null | undefined,
  docType: string,
): string {
  if (
    slug === "colorlab" &&
    (docType === "receipt" || docType === "tax_invoice" || docType === "invoice")
  ) {
    return "receipt_tax";
  }
  // Map legacy invoice rows into the tax_invoice tab so they remain visible.
  if (docType === "invoice") return "tax_invoice";
  return docType;
}

export function docTypesForTab(
  slug: string | null | undefined,
  tab: string,
): string[] {
  if (slug === "colorlab" && tab === "receipt_tax") {
    return ["receipt", "tax_invoice", "invoice"];
  }
  if (tab === "tax_invoice") return ["tax_invoice", "invoice"];
  return [tab];
}

export function visibleTabsForStore(
  slug: string | null | undefined,
): readonly string[] {
  if (slug === "colorlab") {
    return ["quotation", "delivery", "receipt_tax"] as const;
  }
  if (slug === "printing") {
    // Non-VAT store hides the tax_invoice tab. Legacy tax_invoice rows
    // remain visible under "ทั้งหมด".
    return ["quotation", "delivery", "receipt"] as const;
  }
  return DOC_TYPE_ORDER as unknown as readonly string[];
}

export function getDocLabel(docType: string | null | undefined): string {
  if (!docType) return "เอกสาร";
  return DOC_TYPE_LABEL[docType] ?? docType;
}

export function resolveDocTheme(
  docType: string,
  store: RdsStore | null | undefined,
): { title: string; header: string } {
  const fallback = DEFAULT_DOC_THEME[docType];
  const override = (store?.doc_theme as DocThemeMap | undefined)?.[docType];
  return {
    title: override?.title || fallback?.title || "",
    header: override?.header || fallback?.header || "",
  };
}

// Convert HEX (#rrggbb) to "H S% L%" triplet usable inside hsl(var(--brand))
export function hexToHslTriplet(hex: string): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}