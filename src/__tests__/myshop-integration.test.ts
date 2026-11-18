import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  verifyMyShopSignature, buildEventKey, resolveItem, lineTotal, last4,
  STOCK_COMMIT_EVENTS, STOCK_RELEASE_EVENTS, MYSHOP_SECRET_NAMES,
  buildVariantSyncPayload, VARIANT_SYNC_PATH, VARIANT_SYNC_LOG_PATH,
  type MappingRow,
} from "../../supabase/functions/_shared/myshop.ts";

const SECRET = "s3cret-myshop";
const body = JSON.stringify({ event: { name: "ORDER.CREATED", timestamp: 1 }, orderNumber: "MS001" });
const sign = (secret: string, raw: string) => createHmac("sha256", secret).update(raw).digest("base64");

describe("myshop webhook signature", () => {
  it("accepts a correctly signed raw body", () => {
    expect(verifyMyShopSignature(body, sign(SECRET, body), SECRET)).toBe(true);
  });
  it("rejects wrong secret, missing, tampered and malformed signatures", () => {
    expect(verifyMyShopSignature(body, sign("other", body), SECRET)).toBe(false);
    expect(verifyMyShopSignature(body, null, SECRET)).toBe(false);
    expect(verifyMyShopSignature(body + " ", sign(SECRET, body), SECRET)).toBe(false);
    expect(verifyMyShopSignature(body, "!!!not-base64!!!", SECRET)).toBe(false);
    expect(verifyMyShopSignature(body, sign(SECRET, body), "")).toBe(false);
  });
});

describe("dedupe key", () => {
  it("prefers the request id and is stable per event otherwise", () => {
    const p = JSON.parse(body);
    expect(buildEventKey(p, "req-1")).toBe("req:req-1");
    expect(buildEventKey(p, null)).toBe(buildEventKey(p, null));
    expect(buildEventKey(p, null)).not.toBe(buildEventKey({ ...p, orderNumber: "MS002" }, null));
  });
});

describe("product resolution never invents products", () => {
  const mappings: MappingRow[] = [
    { myshop_product_id: "P1", myshop_variant_id: "V1", sku: null, barcode: null, product_id: "local-1", variant_id: null },
  ];
  const catalog = [
    { id: "local-2", code: "SKU-2", barcode: "8850001" },
    { id: "local-3", code: "SKU-3", barcode: null },
  ];
  it("explicit mapping wins", () => {
    const r = resolveItem({ productId: "P1", variantId: "V1", sku: "SKU-2" }, mappings, catalog);
    expect(r).toMatchObject({ product_id: "local-1", matched_by: "mapping" });
  });
  it("falls back to sku then barcode", () => {
    expect(resolveItem({ productId: "PX", sku: "sku-2" }, mappings, catalog).matched_by).toBe("sku");
    expect(resolveItem({ productId: "PX", barcode: "8850001" }, mappings, catalog).matched_by).toBe("barcode");
  });
  it("flags unknown items instead of creating one", () => {
    const r = resolveItem({ productId: "PX", sku: "nope" }, mappings, catalog);
    expect(r.product_id).toBeNull();
    expect(r.matched_by).toBeNull();
  });
});

describe("totals, secret naming and stock events", () => {
  it("uses the discounted price when present", () => {
    expect(lineTotal({ quantity: 3, price: 100, discountedPrice: 80 })).toBe(240);
    expect(lineTotal({ quantity: 2, price: 50 })).toBe(100);
    expect(lineTotal({})).toBe(0);
  });
  it("masks secrets to last 4", () => {
    expect(last4("abcdef1234")).toBe("1234");
    expect(last4("")).toBeNull();
  });
  it("keeps per-channel secret names separate", () => {
    expect(MYSHOP_SECRET_NAMES.apiKey("2001")).not.toBe(MYSHOP_SECRET_NAMES.apiKey("2002"));
    expect(MYSHOP_SECRET_NAMES.apiKey("2001")).not.toBe(MYSHOP_SECRET_NAMES.webhookSecret("2001"));
  });
  it("only commits stock on committed events and restores on cancel", () => {
    expect(STOCK_COMMIT_EVENTS.has("ORDER.READY_TO_SHIP")).toBe(true);
    expect(STOCK_COMMIT_EVENTS.has("ORDER.CREATED")).toBe(false);
    expect(STOCK_RELEASE_EVENTS.has("ORDER.CANCELED")).toBe(true);
  });
});

describe("variant sync payload (absolute, LINE SHOPPING current API)", () => {
  it("sends inventoryId + price + onHandNumber when both sides are enabled", () => {
    const plan = buildVariantSyncPayload({ myshopVariantId: "12345", price: 250, stock: 7, syncPrice: true, syncStock: true });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.payload).toEqual({ inventoryId: 12345, price: 250, onHandNumber: 7 });
    // the API rejects a plain `id` for the default variant
    expect(plan.payload).not.toHaveProperty("id");
    // never the legacy delta/prices shapes
    expect(plan.payload).not.toHaveProperty("quantity");
    expect(plan.payload).not.toHaveProperty("amount");
    expect(plan.payload).not.toHaveProperty("instantDiscount");
    expect(plan.payload).not.toHaveProperty("variants");
  });

  it("sends only the enabled side", () => {
    const priceOnly = buildVariantSyncPayload({ myshopVariantId: 9, price: 100, stock: 5, syncPrice: true, syncStock: false });
    const stockOnly = buildVariantSyncPayload({ myshopVariantId: 9, price: 100, stock: 5, syncPrice: false, syncStock: true });
    expect(priceOnly.ok && priceOnly.payload).toEqual({ inventoryId: 9, price: 100 });
    expect(stockOnly.ok && stockOnly.payload).toEqual({ inventoryId: 9, onHandNumber: 5 });
  });

  it("skips (no API call) when the variant id is missing or not numeric", () => {
    for (const bad of [null, undefined, "", "  ", "abc", "0", "-3", "12.5"]) {
      const plan = buildVariantSyncPayload({ myshopVariantId: bad as any, price: 1, stock: 1, syncPrice: true, syncStock: true });
      expect(plan.ok).toBe(false);
      expect(plan.ok === false && plan.reason.length > 0).toBe(true);
    }
  });

  it("refuses to build anything when both switches are off", () => {
    expect(buildVariantSyncPayload({ myshopVariantId: 1, price: 1, stock: 1, syncPrice: false, syncStock: false }).ok).toBe(false);
  });

  it("targets PATCH /myshop/v1/products/{id}/variant", () => {
    expect(VARIANT_SYNC_PATH("P77")).toBe("/myshop/v1/products/P77/variant");
    expect(VARIANT_SYNC_LOG_PATH).toBe("/myshop/v1/products/{id}/variant");
    expect(VARIANT_SYNC_PATH("P77")).not.toContain("/prices");
    expect(VARIANT_SYNC_PATH("P77")).not.toContain("/inventory");
  });
});

describe("myshop-admin sync loop uses the variant endpoint only", () => {
  it("has no adjust/prices endpoint left in the function source", async () => {
    const src = await readFile("supabase/functions/myshop-admin/index.ts", "utf8");
    expect(src).toContain("VARIANT_SYNC_PATH");
    expect(src).not.toContain("/adjust");
    expect(src).not.toContain("/prices");
    expect(src).not.toMatch(/quantity:\s*Number/);
  });
});

describe("webhook maps the current shipping address fields", () => {
  it("reads recipientName / phoneNumber", async () => {
    const src = await readFile("supabase/functions/myshop-webhook/index.ts", "utf8");
    expect(src).toContain("shippingAddress?.recipientName");
    expect(src).toContain("shippingAddress?.phoneNumber");
    expect(src).toContain("shipping_address: payload?.shippingAddress");
  });
});
