// Public endpoint for LINE MyShop (LINE SHOPPING Open API) webhooks.
// Completely separate from the LINE Messaging webhook (`line-webhook`).
// Flow: read RAW body -> verify x-myshop-signature (HMAC-SHA256 + Base64)
// -> dedupe -> upsert order into the existing orders/order_items tables
// -> apply stock exactly once -> return 200 fast.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MYSHOP_SECRET_NAMES, buildEventKey, lineTotal, resolveItem,
  STOCK_COMMIT_EVENTS, STOCK_RELEASE_EVENTS, verifyMyShopSignature,
  type MappingRow, type MyShopLineItem,
} from "../_shared/myshop.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-myshop-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const raw = await req.text(); // RAW body first — never parse before verifying.
  const signature = req.headers.get("x-myshop-signature");
  const requestId = req.headers.get("x-request-id");
  const traceId = req.headers.get("x-line-oap-request-id");

  // Resolve the signing secret. Payload channel is only read AFTER verification,
  // so try every enabled integration's secret.
  const { data: integrations } = await admin
    .from("myshop_integrations")
    .select("id,channel_id,enabled,sync_orders")
    .eq("enabled", true);

  let matched: { id: string; channel_id: string; sync_orders: boolean } | null = null;
  for (const i of (integrations ?? []) as any[]) {
    const { data: secret } = await admin.rpc("myshop_get_secret", {
      p_name: MYSHOP_SECRET_NAMES.webhookSecret(i.channel_id),
    });
    if (secret && verifyMyShopSignature(raw, signature, String(secret))) { matched = i; break; }
  }

  if (!matched) {
    await admin.from("myshop_webhook_events").insert({
      event_key: `bad:${requestId ?? crypto.randomUUID()}`,
      request_id: requestId, trace_id: traceId, signature_valid: false,
      error: "invalid_signature", processed: false,
    }).then(() => {}, () => {});
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const eventName = String(payload?.event?.name ?? payload?.eventName ?? "");
  const orderNumber = String(payload?.orderNumber ?? payload?.order?.orderNumber ?? "");
  const eventKey = buildEventKey(payload, requestId);

  // Dedupe: LINE retries failed deliveries — the unique event_key makes the
  // second delivery a no-op instead of a second order / second stock movement.
  const { error: dupErr } = await admin.from("myshop_webhook_events").insert({
    event_key: eventKey, request_id: requestId, trace_id: traceId,
    signature_valid: true, event_name: eventName, order_number: orderNumber || null,
    raw: payload, processed: false,
  });
  if (dupErr) {
    if (String(dupErr.code) === "23505") return json({ ok: true, duplicate: true });
    console.error("myshop-webhook log error", dupErr.message);
  }

  try {
    if (!matched.sync_orders) {
      await finish(admin, eventKey, null, "orders_sync_disabled");
      return json({ ok: true, skipped: "orders_sync_disabled" });
    }
    if (!orderNumber) {
      await finish(admin, eventKey, null, "no_order_number");
      return json({ ok: true, skipped: "no_order_number" });
    }

    // Shipping address updates only touch the MyShop snapshot.
    if (eventName === "ORDER_DETAIL.SHIPPING_ADDRESS_UPDATED") {
      await admin.from("myshop_orders").update({
        shipping_address: payload?.shippingAddress ?? null,
        last_event: eventName,
        last_event_at: new Date().toISOString(),
      }).eq("order_number", orderNumber);
      await finish(admin, eventKey, null, null);
      return json({ ok: true });
    }

    const items: MyShopLineItem[] = Array.isArray(payload?.orderItems) ? payload.orderItems : [];
    const productIds = items.map((i) => String(i.productId ?? "")).filter(Boolean);
    const [{ data: mappings }, { data: catalog }] = await Promise.all([
      productIds.length
        ? admin.from("myshop_product_mappings")
            .select("myshop_product_id,myshop_variant_id,sku,barcode,product_id,variant_id")
            .in("myshop_product_id", productIds)
        : Promise.resolve({ data: [] as MappingRow[] } as any),
      admin.from("products").select("id,code,barcode").is("deleted_at", null).limit(5000),
    ]);

    const resolved = items.map((it) => resolveItem(it, (mappings ?? []) as MappingRow[], (catalog ?? []) as any));
    const needsMapping = resolved.some((r) => !r.product_id);

    const { data: existing } = await admin.from("myshop_orders").select("*").eq("order_number", orderNumber).maybeSingle();

    // Ensure a local order exists (source-tagged, no documents, no queue jobs).
    let localOrderId: string | null = existing?.order_id ?? null;
    if (!localOrderId) {
      const subtotal = items.reduce((s, i) => s + lineTotal(i), 0);
      const { data: created, error: oErr } = await admin.from("orders").insert({
        order_no: `MS-${orderNumber}`,
        status: "pending_quote",
        source: "LINE_MYSHOP",
        external_order_no: orderNumber,
        subtotal,
        discount: Number(payload?.discountAmount ?? 0) || 0,
        shipping_fee: Number(payload?.shipmentPrice ?? 0) || 0,
        total: Number(payload?.totalPrice ?? subtotal) || subtotal,
        is_guest: true,
        // Current MyShop payload uses recipientName / phoneNumber; older shapes
        // are kept as fallbacks. The full address is still snapshotted below.
        guest_name: payload?.shippingAddress?.recipientName ?? payload?.shippingAddress?.name ?? payload?.customer?.name ?? null,
        guest_phone: payload?.shippingAddress?.phoneNumber ?? payload?.shippingAddress?.phone ?? null,
        note: `นำเข้าจาก LINE MyShop (${orderNumber})`,
      }).select("id").maybeSingle();
      if (oErr) throw new Error(`order_insert: ${oErr.message}`);
      localOrderId = created?.id ?? null;

      if (localOrderId) {
        const rows = resolved.map((r) => ({
          order_id: localOrderId,
          product_id: r.product_id,
          product_name: r.item.name ?? r.item.sku ?? "สินค้า MyShop",
          product_code: r.item.sku ?? null,
          qty: Number(r.item.quantity ?? 0) || 0,
          price: Number(r.item.discountedPrice ?? r.item.price ?? 0) || 0,
          total: lineTotal(r.item),
          note: r.product_id ? `จับคู่โดย ${r.matched_by}` : "ยังไม่จับคู่สินค้า (needs mapping)",
        }));
        if (rows.length) {
          const { error: iErr } = await admin.from("order_items").insert(rows);
          if (iErr) throw new Error(`items_insert: ${iErr.message}`);
        }
      }
    }

    await admin.from("myshop_orders").upsert({
      integration_id: matched.id,
      order_number: orderNumber,
      order_id: localOrderId,
      channel_id: payload?.shop?.channelId ?? matched.channel_id,
      order_status: payload?.orderStatus ?? payload?.order?.status ?? null,
      payment_status: payload?.paymentStatus ?? null,
      shipment_status: payload?.shipmentStatus ?? null,
      last_event: eventName,
      last_event_at: new Date().toISOString(),
      total_price: Number(payload?.totalPrice ?? 0) || 0,
      discount_amount: Number(payload?.discountAmount ?? 0) || 0,
      shipment_price: Number(payload?.shipmentPrice ?? 0) || 0,
      shipping_address: payload?.shippingAddress ?? null,
      items_snapshot: items,
      raw: payload,
      needs_mapping: needsMapping,
    }, { onConflict: "order_number" });

    // Stock: deduct once when committed, restore once on cancellation.
    if (STOCK_COMMIT_EVENTS.has(eventName)) {
      await admin.rpc("myshop_apply_order_stock", { p_order_number: orderNumber, p_direction: "deduct" });
    } else if (STOCK_RELEASE_EVENTS.has(eventName)) {
      await admin.rpc("myshop_apply_order_stock", { p_order_number: orderNumber, p_direction: "restore" });
    }

    await finish(admin, eventKey, null, null);
    return json({ ok: true, order_number: orderNumber, needs_mapping: needsMapping });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    console.error("myshop-webhook process error", msg);
    await finish(admin, eventKey, msg, null);
    // 200 keeps LINE from hammering retries for a problem a retry cannot fix;
    // the event row keeps the error for the admin log.
    return json({ ok: false, error: msg }, 200);
  }
});

async function finish(admin: any, eventKey: string, error: string | null, skipped: string | null) {
  await admin.from("myshop_webhook_events").update({
    processed: !error,
    processed_at: new Date().toISOString(),
    error: error ?? (skipped ? `skipped:${skipped}` : null),
  }).eq("event_key", eventKey).then(() => {}, () => {});
}
