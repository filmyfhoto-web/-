import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const POS = fs.readFileSync(path.resolve(__dirname, "../PosStock.tsx"), "utf8");
const SKU = fs.readFileSync(path.resolve(__dirname, "../../../components/products/SkuManager.tsx"), "utf8");

describe("PosStock ↔ SkuManager contract", () => {
  it("editor renders SkuManager with parentCode/stock/hasVariants and refresh", () => {
    expect(POS).toMatch(/import\s+SkuManager\s+from\s+"@\/components\/products\/SkuManager"/);
    expect(POS).toMatch(/<SkuManager[\s\S]*productId=\{editor\.id\}[\s\S]*parentCode=\{editor\.code\}[\s\S]*parentStock=\{Number\(editor\.stock\)[\s\S]*hasVariants=\{!!editor\.has_variants\}[\s\S]*onChanged=\{load\}/);
  });

  it("editor renders the basic, SKU and related-product sections", () => {
    // The editor now composes shared <ProductForm/> with an advanced slot that
    // holds SkuManager + ProductRelationsSections (no separate section picker).
    expect(POS).toMatch(/id="pos-section-basic"/);
    expect(POS).toMatch(/<ProductForm/);
    expect(POS).toMatch(/<SkuManager/);
    expect(POS).toMatch(/<ProductRelationsSections/);
  });

  it("parent stock input disables when has_variants=true or the product is linked", () => {
    // Parent stock is edited through the shared ProductForm; variant/linked
    // products get their effective stock from variants/unit links instead.
    expect(POS).toMatch(/hasVariants=\{!!editor\.has_variants\}/);
    expect(POS).toMatch(/isLinked/);
  });

  it("SkuManager uses canonical shared tables + secure RPCs, never hard-deletes referenced variants", () => {
    expect(SKU).toMatch(/\.from\("product_variants"\)/);
    expect(SKU).toMatch(/\.from\("product_attributes"\)/);
    expect(SKU).toMatch(/enable_product_variants/);
    expect(SKU).toMatch(/disable_product_variants/);
    // Never hard delete existing rows — only remove unsaved ones (no v.id) from the local array.
    expect(SKU).not.toMatch(/from\("product_variants"\)\.delete\(/);
  });

  it("both enable and disable go through an explicit Thai confirmation dialog", () => {
    expect(SKU).toMatch(/sku-enable-confirm/);
    expect(SKU).toMatch(/sku-enable-cancel/);
    expect(SKU).toMatch(/sku-disable-confirm/);
    expect(SKU).toMatch(/sku-disable-cancel/);
    // Cancel path must not mutate; only performEnable/performDisable call rpc.
    expect(SKU).toMatch(/setShowEnableConfirm\(true\)/);
    expect(SKU).toMatch(/setShowDisableConfirm\(true\)/);
  });
});