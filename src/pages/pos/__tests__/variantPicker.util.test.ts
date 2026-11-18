import { describe, it, expect } from "vitest";
import {
  autoSelectVariant,
  cartMergeKey,
  isVariantSellable,
  resolveScannedCode,
  variantAttributesLabel,
  variantDisplayLabel,
  variantEffectivePrice,
  type VariantSummary,
} from "../variantPicker";

const v = (patch: Partial<VariantSummary>): VariantSummary => ({
  id: "v1",
  product_id: "p1",
  sku: "SKU-1",
  barcode: null,
  name: null,
  attributes: {},
  price_override: null,
  price: null,
  stock: 5,
  active: true,
  archived_at: null,
  ...patch,
});

describe("variantPicker helpers", () => {
  it("attributes label sorts keys deterministically for a stable display", () => {
    const label = variantAttributesLabel(
      v({ attributes: { ขนาด: "M", สี: "แดง" } }),
    );
    // Sorted (Thai alpha via default): ขนาด before สี
    expect(label).toBe("ขนาด: M / สี: แดง");
  });

  it("display label appends SKU in brackets and prefers explicit name", () => {
    expect(variantDisplayLabel(v({ name: "แดง M", sku: "R-M" }))).toBe("แดง M [R-M]");
    expect(variantDisplayLabel(v({ name: null, attributes: { สี: "แดง" }, sku: null }))).toBe(
      "สี: แดง",
    );
  });

  it("effective price prefers override, then variant price, then parent fallback", () => {
    expect(variantEffectivePrice(v({ price_override: 150 }), 100)).toBe(150);
    expect(variantEffectivePrice(v({ price: 120 }), 100)).toBe(120);
    expect(variantEffectivePrice(v({}), 100)).toBe(100);
  });

  it("isVariantSellable requires active, not archived, and stock > 0", () => {
    expect(isVariantSellable(v({}))).toBe(true);
    expect(isVariantSellable(v({ stock: 0 }))).toBe(false);
    expect(isVariantSellable(v({ active: false }))).toBe(false);
    expect(isVariantSellable(v({ archived_at: "2026-01-01" }))).toBe(false);
  });

  it("autoSelectVariant returns the only sellable variant, else null", () => {
    const a = v({ id: "a", stock: 0 });
    const b = v({ id: "b", stock: 3 });
    const c = v({ id: "c", stock: 5 });
    expect(autoSelectVariant([a, b])?.id).toBe("b");
    expect(autoSelectVariant([b, c])).toBeNull();
    expect(autoSelectVariant([a])).toBeNull();
  });

  it("cartMergeKey separates lines by variant_id and merges identical variants", () => {
    expect(cartMergeKey("p1", null)).not.toBe(cartMergeKey("p1", "v1"));
    expect(cartMergeKey("p1", "v1")).toBe(cartMergeKey("p1", "v1"));
    expect(cartMergeKey("p1", "v1")).not.toBe(cartMergeKey("p1", "v2"));
  });

  it("resolveScannedCode: variant barcode/SKU wins over parent, parent-only is a picker hit", () => {
    const products = [
      { id: "p1", code: "PROD-1", barcode: "P111" },
      { id: "p2", code: "PROD-2", barcode: null },
    ];
    const variants = [
      v({ id: "v1", product_id: "p1", sku: "V-SKU-A", barcode: "V111" }),
      v({ id: "v2", product_id: "p1", sku: "V-SKU-B", barcode: null }),
    ];
    expect(resolveScannedCode("V111", products, variants)).toEqual({
      product_id: "p1",
      variant_id: "v1",
    });
    expect(resolveScannedCode("v-sku-b", products, variants)).toEqual({
      product_id: "p1",
      variant_id: "v2",
    });
    expect(resolveScannedCode("P111", products, variants)).toEqual({
      product_id: "p1",
      variant_id: null,
    });
    expect(resolveScannedCode("PROD-2", products, variants)).toEqual({
      product_id: "p2",
      variant_id: null,
    });
    expect(resolveScannedCode("nope", products, variants)).toBeNull();
  });
});