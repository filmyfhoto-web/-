/**
 * Pure helpers backing the POS "scanned product" feedback panel.
 *
 * Kept side-effect free (no React, no supabase) so the scan classification,
 * image fallback chain and stale-response guard are trivially unit-testable
 * and shared between the cashier UI and the tests.
 */
import {
  type VariantSummary,
  isVariantSellable,
  variantAttributesLabel,
  variantDisplayLabel,
  variantEffectivePrice,
} from "./variantPicker";

export type ScanProductLike = {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  standard_price: number | null;
  stock: number | null;
  unit: string | null;
  image_url: string | null;
  active?: boolean;
  has_variants?: boolean;
};

export type ScanStatus =
  | "added"
  | "variant_required"
  | "unavailable"
  | "not_found"
  | "invalid";

export type ScanClassification = {
  status: ScanStatus;
  code: string;
  product: ScanProductLike | null;
  variant: VariantSummary | null;
  /** Thai, cashier-facing. Never contains cost price. */
  message: string;
};

/**
 * Image fallback chain: SKU variant image → parent product image → null.
 * `null` means the UI should render the neutral stationery placeholder.
 */
export function pickScanImage(
  variant: { image_url?: string | null } | null | undefined,
  product: { image_url?: string | null } | null | undefined,
): string | null {
  const v = variant?.image_url?.trim();
  if (v) return v;
  const p = product?.image_url?.trim();
  if (p) return p;
  return null;
}

/** Effective sale price shown to the cashier (never the cost price). */
export function scanDisplayPrice(
  product: ScanProductLike | null,
  variant: VariantSummary | null,
): number | null {
  if (!product) return null;
  const base = Number(product.standard_price ?? 0);
  if (variant) return variantEffectivePrice(variant, base);
  return Number.isFinite(base) ? base : null;
}

/** SKU / attribute label for the scanned line, or null when not applicable. */
export function scanVariantLabel(variant: VariantSummary | null): string | null {
  if (!variant) return null;
  return variantDisplayLabel(variant);
}

export function scanAttributesLabel(variant: VariantSummary | null): string | null {
  if (!variant) return null;
  const l = variantAttributesLabel(variant);
  return l || null;
}

/**
 * Decide what a scanned (already normalized) code means for the cart.
 * `stockOf` lets the caller supply derived/effective stock for wrapper units.
 */
export function classifyScan(
  code: string,
  products: ScanProductLike[],
  variants: VariantSummary[],
  opts: {
    stockOf?: (p: ScanProductLike) => number;
    /**
     * Mirrors the store's existing over-sell policy. The POS caps cart
     * quantities at available stock today, so this defaults to `false`; when a
     * store allows selling into negative stock the caller passes `true` and a
     * zero-stock scan still lands in the cart.
     */
    allowNegativeStock?: boolean;
  } = {},
): ScanClassification {
  const q = (code || "").trim();
  const base = { code: q, product: null, variant: null } as const;
  if (!q) return { ...base, status: "invalid", message: "ไม่พบรหัสบาร์โค้ด" };
  const allowNegative = opts.allowNegativeStock === true;

  const lower = q.toLowerCase();
  const variant =
    variants.find(
      (v) =>
        (v.barcode || "").toLowerCase() === lower ||
        (v.sku || "").toLowerCase() === lower,
    ) ?? null;

  if (variant) {
    const parent = products.find((p) => p.id === variant.product_id) ?? null;
    if (!parent) {
      return { ...base, status: "not_found", message: `ไม่พบสินค้านี้ (บาร์โค้ด ${q})` };
    }
    if (!variant.active || variant.archived_at != null) {
      return {
        code: q,
        product: parent,
        variant,
        status: "unavailable",
        message: `ตัวเลือกนี้ถูกปิดการขาย: ${parent.name}`,
      };
    }
    if (!allowNegative && Number(variant.stock ?? 0) <= 0) {
      return {
        code: q,
        product: parent,
        variant,
        status: "unavailable",
        message: `สินค้าหมดสต๊อก: ${parent.name} (คงเหลือ 0)`,
      };
    }
    return { code: q, product: parent, variant, status: "added", message: "เพิ่มลงตะกร้าแล้ว" };
  }

  const product =
    products.find(
      (p) =>
        (p.barcode || "").toLowerCase() === lower ||
        (p.code || "").toLowerCase() === lower,
    ) ?? null;
  if (!product) {
    return { ...base, status: "not_found", message: `ไม่พบสินค้านี้ (บาร์โค้ด ${q})` };
  }
  if (product.active === false) {
    return {
      code: q,
      product,
      variant: null,
      status: "unavailable",
      message: `สินค้านี้ถูกปิดการขาย: ${product.name}`,
    };
  }

  if (product.has_variants) {
    const own = variants.filter((v) => v.product_id === product.id);
    const sellable = own.filter(isVariantSellable);
    if (sellable.length === 0) {
      return {
        code: q,
        product,
        variant: null,
        status: "unavailable",
        message: `ไม่มีตัวเลือกที่พร้อมขาย: ${product.name}`,
      };
    }
    if (sellable.length === 1) {
      return { code: q, product, variant: sellable[0], status: "added", message: "เพิ่มลงตะกร้าแล้ว" };
    }
    return {
      code: q,
      product,
      variant: null,
      status: "variant_required",
      message: `เลือกตัวเลือกสินค้า: ${product.name}`,
    };
  }

  const stock = opts.stockOf ? Number(opts.stockOf(product)) : Number(product.stock ?? 0);
  if (!allowNegative && stock <= 0) {
    return {
      code: q,
      product,
      variant: null,
      status: "unavailable",
      message: `สินค้าหมดสต๊อก: ${product.name} (คงเหลือ 0)`,
    };
  }
  return { code: q, product, variant: null, status: "added", message: "เพิ่มลงตะกร้าแล้ว" };
}

/** What the recent-scan panel renders. */
export type ScanResultView = {
  /** monotonic sequence — guards against stale async responses. */
  seq: number;
  status: ScanStatus;
  code: string;
  productId: string | null;
  variantId: string | null;
  name: string | null;
  productCode: string | null;
  barcode: string | null;
  sku: string | null;
  attributes: string | null;
  variantLabel: string | null;
  price: number | null;
  unit: string | null;
  /** stock remaining for the scanned line (variant stock when applicable) */
  stock: number | null;
  imageUrl: string | null;
  message: string;
  at: number;
};

export function toScanResultView(
  c: ScanClassification,
  seq: number,
  at: number = Date.now(),
  stockOverride?: number | null,
): ScanResultView {
  const p = c.product;
  const v = c.variant;
  const stock =
    stockOverride != null
      ? Number(stockOverride)
      : v
        ? Number(v.stock ?? 0)
        : p
          ? Number(p.stock ?? 0)
          : null;
  return {
    seq,
    status: c.status,
    code: c.code,
    productId: p?.id ?? null,
    variantId: v?.id ?? null,
    name: p?.name ?? null,
    productCode: p?.code ?? null,
    barcode: v?.barcode ?? p?.barcode ?? null,
    sku: v?.sku ?? null,
    attributes: scanAttributesLabel(v),
    variantLabel: scanVariantLabel(v),
    price: scanDisplayPrice(p, v),
    unit: p?.unit ?? null,
    stock: p ? stock : null,
    imageUrl: pickScanImage(v as { image_url?: string | null } | null, p),
    message: c.message,
    at,
  };
}

/**
 * Stale-response guard: only accept an incoming result when its sequence is
 * newer than what is already displayed.
 */
export function acceptScanResult(
  current: ScanResultView | null,
  incoming: ScanResultView,
): ScanResultView {
  if (current && current.seq >= incoming.seq) return current;
  return incoming;
}
