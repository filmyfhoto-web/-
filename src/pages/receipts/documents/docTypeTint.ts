import type { DocumentType } from "./useDocumentForm";

/**
 * Per-document-type visual tint used on document-management surfaces
 * (PrintPreview toolbar, DocumentsList rows, form header chip).
 *
 * - `bg`  — very-light fill for surfaces/rows (uses CSS var + alpha)
 * - `dot` — solid indicator color for a small circle beside the label
 * - `ring`— border/ring color for chips
 *
 * Colors come from CSS custom properties declared in `src/index.css`, so the
 * theme (base and per-store overrides) can retint them without code changes.
 * Never applied to `#doc-print` — printed output stays untouched.
 */
export function docTypeTint(type: DocumentType | string | null | undefined): {
  bg: string;
  dot: string;
  ring: string;
  label: string;
} {
  const key = (type ?? "receipt") as string;
  const label =
    key === "quotation" ? "ใบเสนอราคา"
    : key === "delivery" ? "ใบส่งของ"
    : key === "tax_invoice" ? "ใบกำกับภาษี/ใบเสร็จ"
    : "ใบเสร็จรับเงิน";
  return {
    bg: `hsl(var(--doc-tint-${key}) / 0.35)`,
    dot: `hsl(var(--doc-tint-${key}-dot))`,
    ring: `hsl(var(--doc-tint-${key}-dot) / 0.4)`,
    label,
  };
}