import { describe, it, expect } from "vitest";
import { resolveProductShops, normalizeKey, type ImportShopMap } from "../useProductShopMap";

const map: ImportShopMap = {
  storeShop: { s1: "colorlab", s2: "print" },
  byProductId: { p1: ["colorlab"], p9: ["colorlab", "print"] },
  byBarcode: { "8850001": ["print"] },
  bySku: { "sku-a": ["colorlab"] },
  byName: { "กระดาษ a4": ["print"] },
};

describe("resolveProductShops", () => {
  it("prefers product_shops over everything else", () => {
    const r = resolveProductShops({ id: "p1", barcode: "8850001", product_line: "print" }, map);
    expect(r).toEqual({ shops: ["colorlab"], via: "product_shops" });
  });

  it("keeps products imported into both shops in both tabs", () => {
    expect(resolveProductShops({ id: "p9" }, map).shops).toEqual(["colorlab", "print"]);
  });

  it("falls back to barcode, then sku, then name", () => {
    expect(resolveProductShops({ id: "x", barcode: "8850001" }, map).via).toBe("barcode");
    expect(resolveProductShops({ id: "x", code: "SKU-A" }, map)).toEqual({ shops: ["colorlab"], via: "sku" });
    expect(resolveProductShops({ id: "x", name: " กระดาษ   A4 " }, map)).toEqual({ shops: ["print"], via: "name" });
  });

  it("uses the manual product_line only when no import source matches", () => {
    expect(resolveProductShops({ id: "x", product_line: "colorlab" }, map)).toEqual({ shops: ["colorlab"], via: "product_line" });
  });

  it("lands unmatched products in POS and flags them as fallback", () => {
    expect(resolveProductShops({ id: "x", name: "ของใหม่", product_line: "other" }, map)).toEqual({ shops: ["pos"], via: "fallback" });
  });

  it("normalizes keys", () => {
    expect(normalizeKey("  A  b ")).toBe("a b");
    expect(normalizeKey(null)).toBe("");
  });
});
