// Stage 2 POS: pure helpers for the variant picker + cart-line variant merging.
// Kept side-effect free so it is trivially unit-testable and shared between
// the checkout UI, barcode scanner and tests.

export type VariantSummary = {
  id: string;
  product_id: string;
  sku: string | null;
  barcode: string | null;
  name: string | null;
  attributes: Record<string, string>;
  price_override: number | null;
  price: number | null;
  stock: number;
  active: boolean;
  archived_at: string | null;
  /** optional per-SKU image; used first by the POS scan feedback panel */
  image_url?: string | null;
};

export function variantAttributesLabel(v: Pick<VariantSummary, "attributes">): string {
  const attrs = v.attributes || {};
  const parts = Object.keys(attrs)
    .sort()
    .map((k) => `${k}: ${String((attrs as Record<string, string>)[k] ?? "")}`);
  return parts.join(" / ");
}

export function variantDisplayLabel(v: VariantSummary): string {
  const attrs = variantAttributesLabel(v);
  const base = v.name?.trim() || attrs || v.sku || "ตัวเลือก";
  return v.sku ? `${base} [${v.sku}]` : base;
}

export function variantEffectivePrice(v: VariantSummary, fallback: number): number {
  const override = v.price_override;
  if (override != null && Number.isFinite(Number(override))) return Number(override);
  if (v.price != null && Number.isFinite(Number(v.price))) return Number(v.price);
  return fallback;
}

export function isVariantSellable(v: VariantSummary): boolean {
  return v.active && v.archived_at == null && Number(v.stock) > 0;
}

/**
 * When a barcode/SKU string is scanned, resolve it to a specific parent+variant
 * pair. Variant barcode/SKU wins (takes you straight into the cart); the parent
 * barcode/code alone should open the picker instead.
 */
export function resolveScannedCode(
  code: string,
  products: { id: string; code: string | null; barcode: string | null }[],
  variants: Pick<VariantSummary, "id" | "product_id" | "sku" | "barcode">[],
): { product_id: string; variant_id: string | null } | null {
  const q = (code || "").trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  const v = variants.find(
    (x) =>
      (x.barcode || "").toLowerCase() === lower ||
      (x.sku || "").toLowerCase() === lower,
  );
  if (v) return { product_id: v.product_id, variant_id: v.id };
  const p = products.find(
    (x) =>
      (x.barcode || "").toLowerCase() === lower ||
      (x.code || "").toLowerCase() === lower,
  );
  if (p) return { product_id: p.id, variant_id: null };
  return null;
}

/**
 * Auto-select rule: for SKU-enabled products with exactly one sellable variant,
 * pick that variant so the cashier never has to open the picker.
 */
export function autoSelectVariant(
  variants: VariantSummary[],
): VariantSummary | null {
  const sellable = variants.filter(isVariantSellable);
  if (sellable.length === 1) return sellable[0];
  return null;
}

/**
 * Cart merge key — identical product AND identical variant merge into one line.
 * Different variants of the same product stay as separate lines.
 */
export function cartMergeKey(product_id: string, variant_id: string | null): string {
  return `${product_id}::${variant_id ?? ""}`;
}