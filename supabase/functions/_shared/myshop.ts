// Shared, dependency-light helpers for the LINE MyShop (LINE SHOPPING Open API)
// integration. Pure functions live here so they can be unit tested with vitest
// without booting an edge function.
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export const MYSHOP_BASE_URL = "https://developers-oaplus.line.biz";

/** Vault secret names — never expose the values, only the last 4 characters. */
export const MYSHOP_SECRET_NAMES = {
  apiKey: (channelId: string) => `myshop_api_key_${slug(channelId)}`,
  webhookSecret: (channelId: string) => `myshop_webhook_secret_${slug(channelId)}`,
};

function slug(v: string) {
  return String(v || "default").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) || "default";
}

export function last4(v: string | null | undefined): string | null {
  const t = String(v ?? "").trim();
  return t.length >= 4 ? t.slice(-4) : t ? "*".repeat(t.length) : null;
}

/**
 * MyShop signs the RAW request body with HMAC-SHA256 using the webhook secret
 * and sends it Base64 encoded in `x-myshop-signature`. Compare in constant time
 * and ALWAYS verify before parsing/mutating the JSON.
 */
export function verifyMyShopSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  } catch {
    return false;
  }
  let got: Buffer;
  try {
    got = Buffer.from(signature.trim(), "base64");
  } catch {
    return false;
  }
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

export type MyShopEventLike = {
  event?: { name?: string; timestamp?: string | number };
  orderNumber?: string;
  order?: { orderNumber?: string };
};

/** Stable dedupe key: prefer the request id, otherwise event+order+timestamp. */
export function buildEventKey(payload: MyShopEventLike, requestId: string | null): string {
  if (requestId) return `req:${requestId}`;
  const name = payload?.event?.name ?? "unknown";
  const order = payload?.orderNumber ?? payload?.order?.orderNumber ?? "unknown";
  const ts = payload?.event?.timestamp ?? "0";
  return `evt:${name}:${order}:${ts}`;
}

/** Events that mean "the order is committed" → deduct local stock exactly once. */
export const STOCK_COMMIT_EVENTS = new Set(["ORDER.READY_TO_SHIP", "ORDER.COMPLETED"]);
/** Events that release the order → restore stock only if it had been deducted. */
export const STOCK_RELEASE_EVENTS = new Set(["ORDER.CANCELED", "ORDER.CANCELLED"]);

export type MyShopLineItem = {
  productId?: string | null;
  variantId?: string | null;
  sku?: string | null;
  barcode?: string | null;
  name?: string | null;
  quantity?: number | null;
  price?: number | null;
  discountedPrice?: number | null;
};

export type MappingRow = {
  myshop_product_id: string;
  myshop_variant_id: string | null;
  sku: string | null;
  barcode: string | null;
  product_id: string | null;
  variant_id: string | null;
};

export type LocalCatalogRow = {
  id: string;
  code: string | null;
  barcode: string | null;
};

export type ResolvedItem = {
  item: MyShopLineItem;
  product_id: string | null;
  variant_id: string | null;
  matched_by: "mapping" | "sku" | "barcode" | null;
};

/**
 * Explicit mapping wins, then SKU, then barcode. When nothing matches we do NOT
 * invent a product — the line item is preserved and flagged `needs_mapping`.
 */
export function resolveItem(
  item: MyShopLineItem,
  mappings: MappingRow[],
  catalog: LocalCatalogRow[],
): ResolvedItem {
  const pid = item.productId ? String(item.productId) : null;
  const vid = item.variantId ? String(item.variantId) : null;
  const m = mappings.find(
    (x) => pid && x.myshop_product_id === pid && (x.myshop_variant_id ?? null) === (vid ?? null),
  ) ?? mappings.find((x) => pid && x.myshop_product_id === pid && !x.myshop_variant_id);
  if (m?.product_id) {
    return { item, product_id: m.product_id, variant_id: m.variant_id ?? null, matched_by: "mapping" };
  }
  const sku = norm(item.sku);
  if (sku) {
    const hit = catalog.find((c) => norm(c.code) === sku);
    if (hit) return { item, product_id: hit.id, variant_id: null, matched_by: "sku" };
  }
  const barcode = norm(item.barcode);
  if (barcode) {
    const hit = catalog.find((c) => norm(c.barcode) === barcode);
    if (hit) return { item, product_id: hit.id, variant_id: null, matched_by: "barcode" };
  }
  return { item, product_id: null, variant_id: null, matched_by: null };
}

function norm(v: string | null | undefined) {
  const t = String(v ?? "").trim().toLowerCase();
  return t.length ? t : null;
}

export function lineTotal(item: MyShopLineItem): number {
  const qty = Number(item.quantity ?? 0) || 0;
  const price = Number(item.discountedPrice ?? item.price ?? 0) || 0;
  return qty * price;
}

/** Minimal typed fetch wrapper for the LINE SHOPPING Open API. */
export async function myshopFetch(
  apiKey: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: any; requestId: string | null; error: string | null }> {
  const url = `${MYSHOP_BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const requestId = res.headers.get("x-line-oap-request-id");
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
    return { ok: res.ok, status: res.status, data, requestId, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, data: null, requestId: null, error: String((e as Error)?.message || e) };
  }
}

// ---------------------------------------------------------------------------
// Variant sync (absolute values, local DB is the source of truth)
// ---------------------------------------------------------------------------
// PATCH /myshop/v1/products/{productId}/variant takes ABSOLUTE values and only
// touches the fields we send. We deliberately do NOT use:
//   - PUT /inventory/{id}/adjust  → its body is { amount } and is a DELTA
//   - PATCH /products/{id}/prices → requires { instantDiscount, variants[] } and
//     would clear an existing instant discount when omitted.
export const VARIANT_SYNC_PATH = (productId: string) => `/myshop/v1/products/${productId}/variant`;
export const VARIANT_SYNC_LOG_PATH = "/myshop/v1/products/{id}/variant";

export type VariantSyncPayload = { inventoryId: number; price?: number; onHandNumber?: number };

export type VariantSyncPlan =
  | { ok: true; payload: VariantSyncPayload; syncsPrice: boolean; syncsStock: boolean }
  | { ok: false; reason: string };

/**
 * Build the PATCH body for one mapping. Only the enabled sides are included so
 * a price-only sync never rewrites stock (and vice versa). A mapping without a
 * numeric MyShop variant id is skipped — never guessed.
 */
export function buildVariantSyncPayload(input: {
  /** MyShop inventory id of the variant — the only id this endpoint accepts. */
  myshopVariantId: string | number | null | undefined;
  price?: number | null;
  stock?: number | null;
  syncPrice: boolean;
  syncStock: boolean;
}): VariantSyncPlan {
  if (!input.syncPrice && !input.syncStock) return { ok: false, reason: "ไม่ได้เปิดซิงก์ทั้งราคาและสต๊อก" };
  const raw = input.myshopVariantId;
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: false, reason: "ไม่มี MyShop variant ID — ต้องจับคู่ variant ก่อนจึงจะซิงก์ได้" };
  }
  const id = Number(String(raw).trim());
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: `MyShop variant ID ไม่ใช่ตัวเลข (${String(raw)}) — ข้ามรายการนี้` };
  }
  const payload: VariantSyncPayload = { inventoryId: id };
  if (input.syncPrice) payload.price = Number(input.price ?? 0);
  if (input.syncStock) payload.onHandNumber = Number(input.stock ?? 0);
  return { ok: true, payload, syncsPrice: input.syncPrice, syncsStock: input.syncStock };
}
