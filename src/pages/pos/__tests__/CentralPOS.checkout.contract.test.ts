import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../CentralPOS.tsx"), "utf8");
// Thai error copy now lives in the shared checkout module used by both
// /pos and the touch register.
const CHECKOUT_SRC = fs.readFileSync(path.resolve(__dirname, "../posCheckout.ts"), "utf8");

describe("CentralPOS Stage-2 checkout wiring", () => {
  it("imports the variant picker + helpers and renders the dialog", () => {
    expect(SRC).toMatch(/from\s+"\.\/VariantPickerDialog"/);
    expect(SRC).toMatch(/from\s+"\.\/variantPicker"/);
    expect(SRC).toMatch(/<VariantPickerDialog/);
  });

  it("checkout button calls the pos_checkout RPC (no longer disabled)", () => {
    expect(SRC).toMatch(/rpc\(\s*"pos_checkout"/);
    // The previous placeholder tooltip must be gone
    expect(SRC).not.toMatch(/ระบบชำระเงิน\/ตัดสต๊อกจะเปิดในเฟสถัดไป/);
    expect(SRC).toMatch(/data-testid="pos-checkout"/);
  });

  it("checkout payload includes variant_id per line and idempotency key", () => {
    expect(SRC).toMatch(/variant_id:\s*l\.variant_id/);
    expect(SRC).toMatch(/p_idempotency_key:\s*idemRef\.current/);
  });

  it("cart lines use cartMergeKey so different variants stay as separate lines", () => {
    expect(SRC).toMatch(/cartMergeKey\(l\.product_id,\s*l\.variant_id\)/);
  });

  it("SKU-enabled products with one sellable variant auto-select via autoSelectVariant", () => {
    expect(SRC).toMatch(/autoSelectVariant\(vs\)/);
  });

  it("scans variant barcode/SKU directly through resolveScannedCode", () => {
    expect(SRC).toMatch(/resolveScannedCode\(/);
  });

  it("quantity is capped at line.stock so a shopper cannot exceed variant stock", () => {
    expect(SRC).toMatch(/Math\.min\(q,\s*cap\)/);
  });

  it("reloads catalog after a successful checkout so live stock refreshes", () => {
    expect(SRC).toMatch(/await\s+reload\(\)/);
  });

  it("Thai error mapping preserves clear feedback for the common RPC errors", () => {
    expect(SRC).toMatch(/mapCheckoutError\(/);
    expect(CHECKOUT_SRC).toMatch(/insufficient_stock/);
    expect(CHECKOUT_SRC).toMatch(/variant_inactive/);
    expect(CHECKOUT_SRC).toMatch(/variant_product_mismatch/);
    expect(CHECKOUT_SRC).toMatch(/variant_required/);
  });
});