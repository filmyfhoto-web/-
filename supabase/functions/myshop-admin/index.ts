// Admin-only control panel backend for the LINE MyShop integration.
// Auth: signed-in owner/admin (same has_role pattern as line-credentials).
// Secrets (API key / webhook secret) are written into Supabase Vault via the
// service-role-only RPCs and are NEVER returned to the browser — only last4.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MYSHOP_SECRET_NAMES, VARIANT_SYNC_LOG_PATH, VARIANT_SYNC_PATH, buildVariantSyncPayload,
  last4, myshopFetch, resolveItem, type MappingRow,
} from "../_shared/myshop.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin0 = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // --- cron / worker access: hourly auto-publish only, never the whole panel ---
    const workerToken = req.headers.get("x-worker-token");
    let isWorker = false;
    if (workerToken) {
      const { data: tok } = await admin0
        .from("internal_worker_tokens").select("token").eq("name", "myshop_autopublish").maybeSingle();
      isWorker = !!tok?.token && tok.token === workerToken;
      if (!isWorker) return json({ ok: false, error: "unauthorized" }, 401);
    }

    const auth = req.headers.get("Authorization") || "";
    if (!isWorker) {
      if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
      const supa = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
      });
      const { data: userData } = await supa.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return json({ ok: false, error: "unauthorized" }, 401);
      const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
        supa.rpc("has_role", { _user_id: uid, _role: "admin" }),
        supa.rpc("has_role", { _user_id: uid, _role: "owner" }),
      ]);
      if (!isAdmin && !isOwner) return json({ ok: false, error: "forbidden" }, 403);
    }

    const admin = admin0;
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || "status");
    let channelId = String(body?.channel_id || "").trim();

    if (isWorker) {
      // The cron worker may only run the two unattended jobs:
      //   full_backfill -> hourly auto-publish of new products
      //   sync_mapped   -> hourly price/stock refresh of already-mapped products
      if (action !== "full_backfill" && action !== "sync_mapped") {
        return json({ ok: false, error: "forbidden" }, 403);
      }
      if (!channelId) {
        const q = admin.from("myshop_integrations").select("channel_id").eq("enabled", true);
        // auto-publish is opt-in; the price/stock refresh follows the per-shop
        // sync_products / sync_inventory switches checked further down.
        if (action === "full_backfill") q.eq("auto_publish_enabled", true);
        const { data: autoRow } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();
        channelId = String(autoRow?.channel_id ?? "");
      }
      if (!channelId) return json({ ok: true, skipped: "no_enabled_integration" });
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/myshop-webhook`;

    async function loadIntegration(cid: string) {
      const { data } = await admin.from("myshop_integrations").select("*").eq("channel_id", cid).maybeSingle();
      return data;
    }
    async function log(integrationId: string | null, entry: Record<string, unknown>) {
      await admin.from("myshop_sync_logs").insert({ integration_id: integrationId, ...entry });
    }
    async function apiKeyFor(cid: string): Promise<string | null> {
      const { data } = await admin.rpc("myshop_get_secret", { p_name: MYSHOP_SECRET_NAMES.apiKey(cid) });
      return (data as string) || null;
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    type RemoteProduct = {
      id: string; name: string | null; sku: string | null; barcode: string | null;
      inventoryId: string | number | null;
      variants: { id: string; sku: string | null; barcode: string | null; inventoryId: string | number | null; name: string | null }[];
    };

    /** Walks EVERY page of the MyShop catalogue (the old code only read page 1). */
    async function fetchAllRemoteProducts(key: string): Promise<{ items: RemoteProduct[]; pages: number; error: string | null }> {
      const out: RemoteProduct[] = [];
      const seen = new Set<string>();
      const perPage = 100;
      let page = 1;
      for (; page <= 100; page++) {
        const res = await myshopFetch(key, `/myshop/v1/products?page=${page}&perPage=${perPage}`);
        if (!res.ok) return { items: out, pages: page - 1, error: `${res.error ?? "error"} ${JSON.stringify(res.data ?? {}).slice(0, 200)}` };
        const raw: any[] = res.data?.items ?? res.data?.products ?? res.data?.data ?? [];
        for (const p of raw) {
          const id = String(p.id ?? p.productId ?? "");
          if (!id || seen.has(id)) continue;
          seen.add(id);
          out.push({
            id,
            name: p.name ?? null,
            sku: p.sku ?? p.code ?? null,
            barcode: p.barcode ?? null,
            inventoryId: p.inventoryId ?? p.inventory?.id ?? null,
            variants: (p.variants ?? []).map((v: any) => ({
              id: String(v.id ?? v.variantId ?? v.inventoryId ?? ""),
              sku: v.sku ?? null,
              barcode: v.barcode ?? null,
              inventoryId: v.inventoryId ?? v.inventory?.id ?? null,
              name: v.name ?? null,
            })),
          });
        }
        if (raw.length < perPage) break;
        await sleep(250); // stay well under the MyShop rate limit
      }
      return { items: out, pages: page, error: null };
    }

    // ---------------- status ----------------
    if (action === "status") {
      const { data: rows } = await admin
        .from("myshop_integrations")
        .select("id,channel_id,label,enabled,api_key_last4,webhook_secret_last4,sync_products,sync_inventory,sync_orders,last_tested_at,last_sync_at,status,last_error,category_presets,fallback_image_url,default_weight_kg,auto_publish_enabled,created_at,updated_at")
        .order("created_at", { ascending: true });
      const { data: logs } = await admin
        .from("myshop_sync_logs")
        .select("id,action,method,url_path,status_code,ok,error,created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      const { data: events } = await admin
        .from("myshop_webhook_events")
        .select("id,event_name,order_number,signature_valid,processed,error,received_at")
        .order("received_at", { ascending: false })
        .limit(20);
      const { data: orders } = await admin
        .from("myshop_orders")
        .select("id,order_number,order_status,payment_status,shipment_status,last_event,last_event_at,total_price,needs_mapping,stock_deducted,stock_restored,order_id")
        .order("created_at", { ascending: false })
        .limit(20);
      return json({ ok: true, webhook_url: webhookUrl, integrations: rows ?? [], logs: logs ?? [], events: events ?? [], orders: orders ?? [] });
    }

    if (!channelId) return json({ ok: false, error: "channel_id_required" }, 400);

    // ---------------- save credentials ----------------
    if (action === "save") {
      const apiKey = String(body?.api_key || "");
      const webhookSecret = String(body?.webhook_secret || "");
      const patch: Record<string, unknown> = {
        channel_id: channelId,
        label: body?.label ? String(body.label) : null,
        enabled: body?.enabled === undefined ? undefined : !!body.enabled,
        sync_products: body?.sync_products === undefined ? undefined : !!body.sync_products,
        sync_inventory: body?.sync_inventory === undefined ? undefined : !!body.sync_inventory,
        sync_orders: body?.sync_orders === undefined ? undefined : !!body.sync_orders,
      };
      if (body?.fallback_image_url !== undefined) {
        patch.fallback_image_url = String(body.fallback_image_url || "").trim() || null;
      }
      if (body?.default_weight_kg !== undefined) {
        patch.default_weight_kg = Math.min(999.99, Math.max(0.01, Number(body.default_weight_kg) || 0.1));
      }
      if (body?.auto_publish_enabled !== undefined) patch.auto_publish_enabled = !!body.auto_publish_enabled;
      // หมวดหมู่ที่ผู้ดูแลตั้งชื่อเอง: [{ name, category_id, is_default }]
      if (Array.isArray(body?.category_presets)) {
        patch.category_presets = body.category_presets
          .map((p: any) => ({
            name: String(p?.name ?? "").trim(),
            category_id: Math.floor(Number(p?.category_id ?? 0) || 0),
            is_default: !!p?.is_default,
          }))
          .filter((p: any) => p.name && p.category_id > 0)
          .slice(0, 100);
      }
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

      if (apiKey) {
        const { error } = await admin.rpc("myshop_set_secret", { p_name: MYSHOP_SECRET_NAMES.apiKey(channelId), p_value: apiKey });
        if (error) return json({ ok: false, error: "secret_write_failed", detail: error.message }, 500);
        patch.api_key_last4 = last4(apiKey);
      }
      if (webhookSecret) {
        const { error } = await admin.rpc("myshop_set_secret", { p_name: MYSHOP_SECRET_NAMES.webhookSecret(channelId), p_value: webhookSecret });
        if (error) return json({ ok: false, error: "secret_write_failed", detail: error.message }, 500);
        patch.webhook_secret_last4 = last4(webhookSecret);
      }

      const existing = await loadIntegration(channelId);
      const hasKey = !!(patch.api_key_last4 ?? existing?.api_key_last4);
      const hasSecret = !!(patch.webhook_secret_last4 ?? existing?.webhook_secret_last4);
      patch.status = hasKey && hasSecret ? (existing?.status === "connected" ? "connected" : "configured") : "awaiting_secrets";

      const { data, error } = await admin
        .from("myshop_integrations")
        .upsert(patch, { onConflict: "channel_id" })
        .select("id,channel_id,label,enabled,api_key_last4,webhook_secret_last4,sync_products,sync_inventory,sync_orders,status,last_error,category_presets,fallback_image_url,default_weight_kg,auto_publish_enabled")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 400);
      await log(data?.id ?? null, { action: "save_credentials", ok: true, meta: { api_key: !!apiKey, webhook_secret: !!webhookSecret } });
      return json({ ok: true, integration: data, webhook_url: webhookUrl });
    }

    const integration = await loadIntegration(channelId);
    if (!integration) return json({ ok: false, error: "integration_not_found" }, 404);

    /** รหัสหมวดหมู่: ใช้ค่าที่ส่งมา ถ้าไม่ส่งให้ใช้หมวดหมู่ที่ผู้ดูแลตั้งชื่อไว้เป็นค่าเริ่มต้น */
    function resolveCategoryId(): number {
      const explicit = Math.floor(Number(body?.category_id ?? 0) || 0);
      if (explicit > 0) return explicit;
      const byName = String(body?.category_name ?? "").trim().toLowerCase();
      const presets: any[] = Array.isArray((integration as any)?.category_presets) ? (integration as any).category_presets : [];
      const found =
        (byName ? presets.find((p) => String(p?.name ?? "").trim().toLowerCase() === byName) : null) ??
        presets.find((p) => p?.is_default) ??
        presets[0];
      return Math.floor(Number(found?.category_id ?? 0) || 0);
    }

    // ---------------- test connection ----------------
    if (action === "test") {
      const key = await apiKeyFor(channelId);
      if (!key) return json({ ok: false, error: "missing_api_key", message: "ยังไม่ได้บันทึก API Key" }, 400);
      const res = await myshopFetch(key, "/myshop/v1/products?perPage=1");
      await admin.from("myshop_integrations").update({
        last_tested_at: new Date().toISOString(),
        status: res.ok ? "connected" : "error",
        last_error: res.ok ? null : `${res.error ?? "error"}`,
      }).eq("id", integration.id);
      await log(integration.id, {
        action: "test_connection", method: "GET", url_path: "/myshop/v1/products",
        status_code: res.status, oap_request_id: res.requestId, ok: res.ok, error: res.error,
      });
      return json({ ok: res.ok, status: res.status, error: res.error, sample_count: Array.isArray(res.data?.items) ? res.data.items.length : undefined });
    }

    // ---------------- pull MyShop catalogue (metadata only) ----------------
    if (action === "pull_catalog") {
      // (read-only debug probe lives below)
    }

    // ---------------- read-only API probe (admin only, GET, /myshop/v1/* only) ----------------
    if (action === "probe_get") {
      const key = await apiKeyFor(channelId);
      if (!key) return json({ ok: false, error: "missing_api_key" }, 400);
      const paths: string[] = Array.isArray(body?.paths) ? body.paths.map(String) : [String(body?.path ?? "")];
      const out: any[] = [];
      for (const path of paths) {
        if (!path.startsWith("/myshop/v1/")) { out.push({ path, error: "bad_path" }); continue; }
        const res = await myshopFetch(key, path);
        out.push({ path, ok: res.ok, status: res.status, data: res.data });
      }
      return json({ ok: true, results: out });
    }

    if (action === "pull_catalog") {
      const key = await apiKeyFor(channelId);
      if (!key) return json({ ok: false, error: "missing_api_key" }, 400);
      const res = await myshopFetch(key, "/myshop/v1/products?perPage=100");
      await log(integration.id, { action: "pull_catalog", method: "GET", url_path: "/myshop/v1/products", status_code: res.status, oap_request_id: res.requestId, ok: res.ok, error: res.error });
      if (!res.ok) return json({ ok: false, error: res.error, status: res.status }, 200);
      const items: any[] = res.data?.items ?? res.data?.products ?? res.data?.data ?? [];
      // Metadata only — local products are never overwritten here.
      return json({ ok: true, remote_products: items.map((p) => ({
        id: String(p.id ?? p.productId ?? ""),
        name: p.name ?? null,
        sku: p.sku ?? null,
        barcode: p.barcode ?? null,
        variants: (p.variants ?? []).map((v: any) => ({
          id: String(v.id ?? v.variantId ?? ""), sku: v.sku ?? null, barcode: v.barcode ?? null,
          inventoryId: v.inventoryId ?? v.inventory?.id ?? null, name: v.name ?? null,
        })),
        inventoryId: p.inventoryId ?? p.inventory?.id ?? null,
      })) });
    }

    // ---------------- auto match by SKU / barcode ----------------
    if (action === "auto_match") {
      const remote: any[] = Array.isArray(body?.remote_products) ? body.remote_products : [];
      const { data: catalog } = await admin.from("products").select("id,code,barcode").is("deleted_at", null).limit(5000);
      const rows: any[] = [];
      for (const p of remote) {
        const targets = (p.variants?.length ? p.variants : [null]) as any[];
        for (const v of targets) {
          const hit = resolveItem(
            { productId: String(p.id), variantId: v ? String(v.id) : null, sku: v?.sku ?? p.sku, barcode: v?.barcode ?? p.barcode },
            [] as MappingRow[],
            (catalog ?? []) as any,
          );
          if (!hit.product_id) continue;
          rows.push({
            integration_id: integration.id,
            product_id: hit.product_id,
            variant_id: null,
            myshop_product_id: String(p.id),
            myshop_variant_id: v ? (String(v.id ?? "").trim() || String(v.inventoryId ?? "").trim() || null) : null,
            myshop_inventory_id: v?.inventoryId ?? p.inventoryId ?? null,
            sku: v?.sku ?? p.sku ?? null,
            barcode: v?.barcode ?? p.barcode ?? null,
            myshop_name: v?.name ?? p.name ?? null,
            match_source: hit.matched_by,
            sync_status: "mapped",
          });
        }
      }
      if (rows.length) {
        const { error } = await admin.from("myshop_product_mappings")
          .upsert(rows, { onConflict: "integration_id,myshop_product_id,myshop_variant_id", ignoreDuplicates: true });
        if (error) {
          for (const r of rows) await admin.from("myshop_product_mappings").insert(r).then(() => {}, () => {});
        }
      }
      await log(integration.id, { action: "auto_match", ok: true, meta: { matched: rows.length } });
      return json({ ok: true, matched: rows.length });
    }

    if (action === "list_mappings") {
      const { data } = await admin
        .from("myshop_product_mappings")
        .select("id,product_id,variant_id,myshop_product_id,myshop_variant_id,myshop_inventory_id,sku,barcode,myshop_name,match_source,sync_status,last_price_synced_at,last_stock_synced_at,last_error,products(name,code,barcode,stock,standard_price)")
        .eq("integration_id", integration.id)
        .order("created_at", { ascending: false })
        .limit(500);
      return json({ ok: true, mappings: data ?? [] });
    }

    if (action === "save_mapping") {
      const row = {
        integration_id: integration.id,
        product_id: body?.product_id ? String(body.product_id) : null,
        variant_id: body?.variant_id ? String(body.variant_id) : null,
        myshop_product_id: String(body?.myshop_product_id || ""),
        myshop_variant_id: body?.myshop_variant_id ? String(body.myshop_variant_id) : null,
        myshop_inventory_id: body?.myshop_inventory_id ? String(body.myshop_inventory_id) : null,
        sku: body?.sku ? String(body.sku) : null,
        barcode: body?.barcode ? String(body.barcode) : null,
        match_source: "manual",
        sync_status: body?.product_id ? "mapped" : "unmapped",
      };
      if (!row.myshop_product_id) return json({ ok: false, error: "myshop_product_id_required" }, 400);
      const { error } = await admin.from("myshop_product_mappings")
        .upsert(row, { onConflict: "integration_id,myshop_product_id,myshop_variant_id" });
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete_mapping") {
      const id = String(body?.id || "");
      if (!id) return json({ ok: false, error: "id_required" }, 400);
      await admin.from("myshop_product_mappings").delete().eq("id", id).eq("integration_id", integration.id);
      return json({ ok: true });
    }

    // ---------------- push local stock / price to MyShop ----------------
    if (action === "sync_mapped") {
      const key = await apiKeyFor(channelId);
      if (!key) return json({ ok: false, error: "missing_api_key" }, 400);
      const doStock = body?.stock !== false && integration.sync_inventory;
      const doPrice = body?.price !== false && integration.sync_products;
      if (!doStock && !doPrice) return json({ ok: false, error: "sync_disabled", message: "เปิดสวิตช์ซิงก์สต๊อก/ราคาก่อน" }, 400);

      const { data: maps } = await admin
        .from("myshop_product_mappings")
        .select("id,myshop_product_id,myshop_variant_id,myshop_inventory_id,product_id,products(stock,standard_price)")
        .eq("integration_id", integration.id)
        .not("product_id", "is", null)
        .limit(300);

      let priceOk = 0, stockOk = 0, failed = 0, skipped = 0;
      for (const m of (maps ?? []) as any[]) {
        const p = m.products;
        if (!p) continue;

        // One absolute PATCH per mapping — price and stock travel together when
        // both switches are on, so a partial write can never desync the pair.
        const plan = buildVariantSyncPayload({
          // The variant endpoint keys off the inventory id, not the variant id.
          myshopVariantId: m.myshop_inventory_id ?? m.myshop_variant_id,
          price: p.standard_price,
          stock: p.stock,
          syncPrice: doPrice,
          syncStock: doStock,
        });
        if (!plan.ok) {
          skipped++;
          await admin.from("myshop_product_mappings").update({ last_error: plan.reason, sync_status: "needs_variant" }).eq("id", m.id);
          await log(integration.id, { action: "sync_variant", ok: false, error: plan.reason, meta: { mapping_id: m.id, skipped: true } });
          continue;
        }

        const res = await myshopFetch(key, VARIANT_SYNC_PATH(String(m.myshop_product_id)), {
          method: "PATCH", body: plan.payload,
        });
        await log(integration.id, {
          action: "sync_variant", method: "PATCH", url_path: VARIANT_SYNC_LOG_PATH,
          status_code: res.status, oap_request_id: res.requestId, ok: res.ok, error: res.error,
          meta: {
            mapping_id: m.id,
            fields: Object.keys(plan.payload).filter((k) => k !== "inventoryId"),
            response: res.ok ? null : res.data,
          },
        });
        if (res.ok) {
          const now = new Date().toISOString();
          const patch: Record<string, unknown> = { last_error: null, sync_status: "mapped" };
          if (plan.syncsPrice) { priceOk++; patch.last_price_synced_at = now; }
          if (plan.syncsStock) { stockOk++; patch.last_stock_synced_at = now; }
          await admin.from("myshop_product_mappings").update(patch).eq("id", m.id);
        } else {
          failed++;
          const detail = typeof res.data?.message === "string"
            ? res.data.message
            : res.data ? JSON.stringify(res.data).slice(0, 300) : "";
          await admin.from("myshop_product_mappings")
            .update({ last_error: [res.error, detail].filter(Boolean).join(" — ") })
            .eq("id", m.id);
        }
      }
      await admin.from("myshop_integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", integration.id);
      return json({ ok: true, price_synced: priceOk, stock_synced: stockOk, failed, skipped });
    }

    // ---------------- detailed mapping report ----------------
    // Everything the operator needs to see WHY a product is / is not synced.
    if (action === "mapping_report") {
      const { data: maps } = await admin
        .from("myshop_product_mappings")
        .select("id,product_id,myshop_product_id,myshop_variant_id,sku,barcode,myshop_name,match_source,sync_status,last_price_synced_at,last_stock_synced_at,last_error,updated_at,products(name,code,barcode,stock,standard_price)")
        .eq("integration_id", integration.id)
        .order("updated_at", { ascending: false })
        .limit(1000);
      const rows = (maps ?? []) as any[];

      const classify = (m: any): { state: "ok" | "pending" | "problem"; reason: string | null } => {
        if (m.last_error) return { state: "problem", reason: m.last_error };
        if (!m.product_id) return { state: "problem", reason: "ยังไม่ได้จับคู่กับสินค้าในระบบ" };
        const vid = String(m.myshop_variant_id ?? "").trim();
        if (!vid || !Number.isInteger(Number(vid)) || Number(vid) <= 0) {
          return { state: "problem", reason: "ไม่มี MyShop variant ID ที่เป็นตัวเลข — ซิงก์สต๊อกไม่ได้" };
        }
        if (!m.last_stock_synced_at && !m.last_price_synced_at) {
          return { state: "pending", reason: "จับคู่แล้ว แต่ยังไม่เคยส่งข้อมูลขึ้น MyShop" };
        }
        return { state: "ok", reason: null };
      };

      const detailed = rows.map((m) => {
        const c = classify(m);
        return {
          id: m.id,
          state: c.state,
          reason: c.reason,
          product_name: m.products?.name ?? null,
          product_code: m.products?.code ?? null,
          stock: m.products?.stock ?? null,
          price: m.products?.standard_price ?? null,
          myshop_product_id: m.myshop_product_id,
          myshop_variant_id: m.myshop_variant_id,
          myshop_name: m.myshop_name,
          sku: m.sku ?? m.barcode ?? null,
          match_source: m.match_source,
          sync_status: m.sync_status,
          last_stock_synced_at: m.last_stock_synced_at,
          last_price_synced_at: m.last_price_synced_at,
          updated_at: m.updated_at,
        };
      });

      const mappedIds = new Set(rows.map((m) => m.product_id).filter(Boolean));
      const { data: catalog } = await admin
        .from("products").select("id,code,name,stock,standard_price,barcode,active,image_url")
        .is("deleted_at", null).limit(5000);
      // Why an unmapped product cannot be published yet — MyShop's hard requirements.
      const blockerOf = (p: any): string | null => {
        if (!String(p.image_url ?? "").trim()) return "ยังไม่มีรูปสินค้า";
        if (!(Number(p.standard_price ?? 0) > 0)) return "ราคาเป็น 0";
        if (!(Number(p.stock ?? 0) > 0)) return "สต๊อกเป็น 0";
        return null;
      };
      const unmapped = (catalog ?? [])
        .filter((p: any) => !mappedIds.has(p.id))
        .map((p: any) => ({ ...p, blocker: blockerOf(p) }));
      const blockerCounts: Record<string, number> = {};
      for (const p of unmapped) {
        const k = p.blocker ?? "พร้อมเผยแพร่";
        blockerCounts[k] = (blockerCounts[k] ?? 0) + 1;
      }

      return json({
        ok: true,
        summary: {
          local_products: (catalog ?? []).length,
          mappings: detailed.length,
          ok: detailed.filter((d) => d.state === "ok").length,
          pending: detailed.filter((d) => d.state === "pending").length,
          problem: detailed.filter((d) => d.state === "problem").length,
          unmapped_local: unmapped.length,
          publish_ready: unmapped.filter((p: any) => !p.blocker).length,
          missing_image: unmapped.filter((p: any) => p.blocker === "ยังไม่มีรูปสินค้า").length,
          blocker_counts: blockerCounts,
        },
        rows: detailed,
        unmapped_local: unmapped.slice(0, 1000),
      });
    }

    // ---------------- publish local products TO MyShop ----------------
    // ---------------- per-product timeline / payload / error log ----------------
    if (action === "product_detail") {
      const productId = String(body?.product_id || "").trim() || null;
      const mappingId = String(body?.mapping_id || "").trim() || null;
      if (!productId && !mappingId) return json({ ok: false, error: "missing_target" }, 400);

      let mapping: any = null;
      {
        let mq = admin.from("myshop_product_mappings")
          .select("*")
          .eq("integration_id", integration.id)
          .order("updated_at", { ascending: false })
          .limit(1);
        mq = mappingId ? mq.eq("id", mappingId) : mq.eq("product_id", productId!);
        const { data } = await mq;
        mapping = (data ?? [])[0] ?? null;
      }
      const pid = productId ?? mapping?.product_id ?? null;
      const { data: product } = pid
        ? await admin.from("products")
            .select("id,code,name,unit,barcode,stock,standard_price,image_url,weight_grams,active,updated_at")
            .eq("id", pid).maybeSingle()
        : { data: null as any };

      // What the next stock/price sync would actually send to MyShop.
      const plan = buildVariantSyncPayload({
        myshopVariantId: mapping?.myshop_inventory_id ?? mapping?.myshop_variant_id,
        price: product?.standard_price,
        stock: product?.stock,
        syncPrice: !!integration.sync_products,
        syncStock: !!integration.sync_inventory,
      });

      const filters: string[] = [];
      if (mapping?.id) filters.push(`meta->>mapping_id.eq.${mapping.id}`);
      if (pid) filters.push(`meta->>product_id.eq.${pid}`);
      const { data: logs } = filters.length
        ? await admin.from("myshop_sync_logs")
            .select("id,action,method,url_path,status_code,oap_request_id,ok,error,meta,created_at")
            .eq("integration_id", integration.id)
            .or(filters.join(","))
            .order("created_at", { ascending: false })
            .limit(100)
        : { data: [] as any[] };

      return json({
        ok: true,
        product: product ?? null,
        mapping,
        next_payload: plan.ok
          ? { path: VARIANT_SYNC_PATH(String(mapping?.myshop_product_id ?? "")), method: "PATCH", body: plan.payload }
          : null,
        next_payload_blocked: plan.ok ? null : plan.reason,
        logs: logs ?? [],
      });
    }

    // Creates products on MyShop for local items that are not mapped yet, then
    // stores the returned ids as a mapping so the normal stock sync takes over.
    if (action === "publish_products") {
      const key = await apiKeyFor(channelId);
      if (!key) return json({ ok: false, error: "missing_api_key" }, 400);
      const limit = Math.min(Math.max(Number(body?.limit ?? 25) || 25, 1), 100);
      const onlyIds: string[] = Array.isArray(body?.product_ids) ? body.product_ids.map(String) : [];

      // POST /myshop/v1/products requires: categoryId (integer from LINE's fixed
      // category table — there is no listing endpoint), code, imageUrls (1..7
      // public https URLs), and per variant price > 0, weight in kg (0.01..999.99)
      // and onHandNumber > 0. Anything that cannot satisfy this is reported, never guessed.
      const categoryId = resolveCategoryId();
      if (!categoryId || categoryId <= 0) {
        return json({ ok: false, error: "missing_category", message: "ยังไม่ได้ตั้งหมวดหมู่สินค้า — เพิ่มหมวดหมู่ (ตั้งชื่อเอง) ในหน้าตั้งค่า MyShop ก่อนเผยแพร่" }, 200);
      }
      const fallbackImage = String(body?.fallback_image_url ?? "").trim();
      const defaultWeightKg = Math.min(999.99, Math.max(0.01, Number(body?.default_weight_kg ?? 0.1) || 0.1));

      const { data: mapped } = await admin
        .from("myshop_product_mappings").select("product_id").eq("integration_id", integration.id);
      const mappedIds = new Set((mapped ?? []).map((m: any) => m.product_id).filter(Boolean));

      let q = admin.from("products")
        .select("id,code,name,description,barcode,stock,standard_price,unit,active,image_url,weight_grams")
        .is("deleted_at", null);
      if (onlyIds.length) q = q.in("id", onlyIds);
      const { data: candidates } = await q.limit(5000);

      const todo = (candidates ?? []).filter((p: any) => !mappedIds.has(p.id)).slice(0, limit);
      const results: any[] = [];
      let created = 0, failed = 0;

      for (const p of todo as any[]) {
        const image = String(p.image_url ?? "").trim() || fallbackImage;
        const price = Number(p.standard_price ?? 0) || 0;
        const stock = Math.max(0, Math.floor(Number(p.stock ?? 0) || 0));
        const blocker =
          !image ? "ยังไม่มีรูปสินค้า — MyShop บังคับต้องมีรูปอย่างน้อย 1 รูป"
          : price <= 0 ? "ราคาเป็น 0 — MyShop ไม่รับสินค้าราคา 0"
          : stock <= 0 ? "สต๊อกเป็น 0 — MyShop ต้องมีจำนวนคงเหลืออย่างน้อย 1 ตอนสร้างสินค้า"
          : null;
        if (blocker) {
          failed++;
          results.push({ product_id: p.id, code: p.code, name: p.name, ok: false, reason: blocker });
          continue;
        }
        const weightKg = Number(p.weight_grams) > 0
          ? Math.min(999.99, Math.max(0.01, Number(p.weight_grams) / 1000))
          : defaultWeightKg;
        const payload = {
          name: String(p.name ?? p.code ?? "สินค้า").slice(0, 120),
          code: String(p.code ?? p.id).slice(0, 60),
          categoryId,
          imageUrls: [image],
          description: p.description ? String(p.description).slice(0, 2000) : undefined,
          status: "ACTIVE",
          isDisplay: true,
          variants: [{
            name: p.unit ? String(p.unit) : "หน่วย",
            sku: p.code ? String(p.code) : undefined,
            barcode: p.barcode ? String(p.barcode) : undefined,
            price: Math.round(price * 100) / 100,
            weight: Math.round(weightKg * 100) / 100,
            onHandNumber: stock,
          }],
        };
        const res = await myshopFetch(key, "/myshop/v1/products", { method: "POST", body: payload });
        await log(integration.id, {
          action: "publish_product", method: "POST", url_path: "/myshop/v1/products",
          status_code: res.status, oap_request_id: res.requestId, ok: res.ok, error: res.error,
          meta: { product_id: p.id, code: p.code },
        });
        const d = res.data?.data ?? res.data ?? {};
        const remoteId = String(d.id ?? d.productId ?? "");
        if (!res.ok || !remoteId) {
          failed++;
          results.push({
            product_id: p.id, code: p.code, name: p.name, ok: false,
            reason: res.ok
              ? `MyShop ไม่ส่งรหัสสินค้ากลับมา (${JSON.stringify(res.data ?? {}).slice(0, 160)})`
              : `${res.error ?? "error"} ${JSON.stringify(res.data ?? {}).slice(0, 200)}`,
          });
          continue;
        }
        const variant = (d.variants ?? [])[0] ?? null;
        // Default-variant products come back with `id: null`; MyShop identifies
        // that variant by its inventoryId, which is what PATCH .../variant takes.
        const variantId = variant
          ? String(variant.id ?? variant.variantId ?? variant.inventoryId ?? "")
          : "";
        const { error: mapErr } = await admin.from("myshop_product_mappings").upsert({
          integration_id: integration.id,
          product_id: p.id,
          myshop_product_id: remoteId,
          myshop_variant_id: variantId || null,
          myshop_inventory_id: variant?.inventoryId ?? d.inventoryId ?? null,
          sku: p.code ?? null,
          barcode: p.barcode ?? null,
          myshop_name: p.name ?? null,
          match_source: "published",
          sync_status: variantId ? "mapped" : "needs_variant",
          last_error: variantId ? null : "MyShop ไม่ส่ง variant ID กลับมา — ต้องเปิดสินค้าใน MyShop แล้วจับคู่อีกครั้ง",
        }, { onConflict: "integration_id,myshop_product_id,myshop_variant_id" });
        if (mapErr) {
          failed++;
          results.push({ product_id: p.id, code: p.code, name: p.name, ok: false, myshop_product_id: remoteId, error: `mapping_save_failed: ${mapErr.message}` });
          continue;
        }
        created++;
        results.push({ product_id: p.id, code: p.code, name: p.name, ok: true, myshop_product_id: remoteId, myshop_variant_id: variantId || null });
      }

      await admin.from("myshop_integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", integration.id);
      return json({ ok: true, considered: todo.length, created, failed, skipped_already_mapped: (candidates ?? []).length - todo.length, results });
    }

    // ---------------- manual order pull (idempotent) ----------------
    // ---------------- ONE-CLICK FULL BACKFILL ----------------
    // Match every local product to MyShop, create what is missing (when MyShop's
    // hard requirements are met), then push absolute price/stock. Runs in bounded
    // batches and reports what is left, so the UI can call it in a loop.
    if (action === "full_backfill") {
      const key = await apiKeyFor(channelId);
      if (!key) return json({ ok: false, error: "missing_api_key" }, 400);

      const publishLimit = Math.min(Math.max(Number(body?.publish_limit ?? 30) || 30, 0), 60);
      const syncLimit = Math.min(Math.max(Number(body?.sync_limit ?? 120) || 120, 0), 300);
      const categoryId = resolveCategoryId();
      const fallbackImage = String(body?.fallback_image_url ?? (integration as any)?.fallback_image_url ?? "").trim();
      const defaultWeightKg = Math.min(
        999.99,
        Math.max(0.01, Number(body?.default_weight_kg ?? (integration as any)?.default_weight_kg ?? 0.1) || 0.1),
      );
      const doMatch = body?.match !== false;

      // หมวดหมู่ของร้านเรา → รหัสหมวดหมู่ MyShop (จับคู่ตามชื่อ preset)
      const presetList: any[] = Array.isArray((integration as any)?.category_presets)
        ? (integration as any).category_presets : [];
      const { data: localCats } = await admin.from("categories").select("id,name");
      const catNameById = new Map<string, string>((localCats ?? []).map((c: any) => [String(c.id), String(c.name ?? "")]));
      const presetByName = new Map<string, number>(
        presetList
          .filter((p) => Number(p?.category_id) > 0)
          .map((p) => [String(p.name ?? "").trim().toLowerCase(), Math.floor(Number(p.category_id))]),
      );
      const categoryIdFor = (p: any): number => {
        const name = catNameById.get(String(p?.category_id ?? "")) ?? "";
        return presetByName.get(name.trim().toLowerCase()) ?? categoryId;
      };

      const { count: beforeMappings } = await admin
        .from("myshop_product_mappings").select("id", { count: "exact", head: true })
        .eq("integration_id", integration.id);

      const { data: localAll } = await admin.from("products")
        .select("id,code,name,description,barcode,stock,standard_price,unit,active,image_url,weight_grams,category_id")
        .is("deleted_at", null).eq("active", true).limit(5000);
      const local = (localAll ?? []) as any[];

      const { data: mappedRows } = await admin.from("myshop_product_mappings")
        .select("product_id,myshop_product_id").eq("integration_id", integration.id);
      const mappedLocal = new Set((mappedRows ?? []).map((m: any) => m.product_id).filter(Boolean));
      const mappedRemote = new Set((mappedRows ?? []).map((m: any) => String(m.myshop_product_id)));

      const nk = (v: unknown) => {
        const t = String(v ?? "").trim().toLowerCase();
        return t.length ? t : null;
      };

      // ---- step 1: match against the FULL remote catalogue (never guess) ----
      let matched = 0;
      let catalogPages = 0;
      let catalogError: string | null = null;
      let remoteTotal = 0;
      if (doMatch) {
        const cat = await fetchAllRemoteProducts(key);
        catalogPages = cat.pages;
        catalogError = cat.error;
        remoteTotal = cat.items.length;

        // Build unique local indexes — a key that points at 2+ products is dropped
        // so an ambiguous code can never be matched to the wrong item.
        const index = new Map<string, string | null>();
        const put = (k: string | null, id: string) => {
          if (!k) return;
          index.set(k, index.has(k) && index.get(k) !== id ? null : id);
        };
        for (const p of local) { put(nk(p.code), p.id); put(nk(p.barcode), p.id); }

        const rows: any[] = [];
        const claimedLocal = new Set<string>();
        for (const rp of cat.items) {
          if (mappedRemote.has(rp.id)) continue;
          const v = rp.variants[0] ?? null;
          const candidates = [nk(v?.sku), nk(v?.barcode), nk(rp.sku), nk(rp.barcode)];
          let hit: string | null = null;
          let via: string | null = null;
          for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            if (!c) continue;
            const found = index.get(c);
            if (found) { hit = found; via = i === 0 || i === 2 ? "sku" : "barcode"; break; }
          }
          if (!hit || mappedLocal.has(hit) || claimedLocal.has(hit)) continue;
          claimedLocal.add(hit);
          rows.push({
            integration_id: integration.id,
            product_id: hit,
            variant_id: null,
            myshop_product_id: rp.id,
            myshop_variant_id: v ? (String(v.id ?? "").trim() || String(v.inventoryId ?? "").trim() || null) : null,
            myshop_inventory_id: v?.inventoryId ?? rp.inventoryId ?? null,
            sku: v?.sku ?? rp.sku ?? null,
            barcode: v?.barcode ?? rp.barcode ?? null,
            myshop_name: rp.name ?? null,
            match_source: via,
            sync_status: "mapped",
          });
        }
        for (const r of rows) {
          const { error } = await admin.from("myshop_product_mappings")
            .upsert(r, { onConflict: "integration_id,myshop_product_id,myshop_variant_id" });
          if (!error) { matched++; mappedLocal.add(r.product_id); mappedRemote.add(r.myshop_product_id); }
        }
        await log(integration.id, { action: "full_backfill_match", ok: !catalogError, error: catalogError, meta: { remote_total: remoteTotal, matched } });
      }

      // ---- step 2: create the still-unmapped ones on MyShop ----
      const unmapped = local.filter((p) => !mappedLocal.has(p.id));
      const blockerOf = (p: any): string | null => {
        const image = String(p.image_url ?? "").trim() || fallbackImage;
        if (!image) return "ยังไม่มีรูปสินค้า — MyShop บังคับต้องมีรูปอย่างน้อย 1 รูป";
        if (!(Number(p.standard_price ?? 0) > 0)) return "ราคาเป็น 0 — MyShop ไม่รับสินค้าราคา 0";
        if (!(Math.floor(Number(p.stock ?? 0)) > 0)) return "สต๊อกเป็น 0 — MyShop ต้องมีจำนวนคงเหลืออย่างน้อย 1 ตอนสร้างสินค้า";
        if (!String(p.code ?? "").trim()) return "ไม่มีรหัสสินค้า (SKU)";
        return null;
      };
      const publishable = unmapped.filter((p) => !blockerOf(p));
      const blocked = unmapped.filter((p) => !!blockerOf(p));
      const blockerCounts: Record<string, number> = {};
      for (const p of blocked) { const k = blockerOf(p)!; blockerCounts[k] = (blockerCounts[k] ?? 0) + 1; }

      let created = 0, createFailed = 0;
      const createErrors: any[] = [];
      if (categoryId > 0 && publishLimit > 0) {
        for (const p of publishable.slice(0, publishLimit)) {
          const image = String(p.image_url ?? "").trim() || fallbackImage;
          const weightKg = Number(p.weight_grams) > 0
            ? Math.min(999.99, Math.max(0.01, Number(p.weight_grams) / 1000))
            : defaultWeightKg;
          const payload = {
            name: String(p.name ?? p.code ?? "สินค้า").slice(0, 120),
            code: String(p.code ?? p.id).slice(0, 60),
            categoryId: categoryIdFor(p),
            imageUrls: [image],
            description: p.description ? String(p.description).slice(0, 2000) : undefined,
            status: "ACTIVE",
            isDisplay: true,
            variants: [{
              name: p.unit ? String(p.unit) : "หน่วย",
              sku: String(p.code),
              barcode: p.barcode ? String(p.barcode) : undefined,
              price: Math.round((Number(p.standard_price) || 0) * 100) / 100,
              weight: Math.round(weightKg * 100) / 100,
              onHandNumber: Math.floor(Number(p.stock) || 0),
            }],
          };
          const res = await myshopFetch(key, "/myshop/v1/products", { method: "POST", body: payload });
          await log(integration.id, {
            action: "publish_product", method: "POST", url_path: "/myshop/v1/products",
            status_code: res.status, oap_request_id: res.requestId, ok: res.ok, error: res.error,
            meta: { product_id: p.id, code: p.code, source: "full_backfill" },
          });
          const d = res.data?.data ?? res.data ?? {};
          const remoteId = String(d.id ?? d.productId ?? "");
          if (!res.ok || !remoteId) {
            createFailed++;
            createErrors.push({ code: p.code, name: p.name, reason: `${res.error ?? "no_id"} ${JSON.stringify(res.data ?? {}).slice(0, 200)}` });
            await sleep(300);
            continue;
          }
          const variant = (d.variants ?? [])[0] ?? null;
          const variantId = variant ? String(variant.id ?? variant.variantId ?? variant.inventoryId ?? "") : "";
          const { error: mapErr } = await admin.from("myshop_product_mappings").upsert({
            integration_id: integration.id,
            product_id: p.id,
            myshop_product_id: remoteId,
            myshop_variant_id: variantId || null,
            myshop_inventory_id: variant?.inventoryId ?? d.inventoryId ?? null,
            sku: p.code ?? null,
            barcode: p.barcode ?? null,
            myshop_name: p.name ?? null,
            match_source: "published",
            sync_status: variantId ? "mapped" : "needs_variant",
          }, { onConflict: "integration_id,myshop_product_id,myshop_variant_id" });
          if (mapErr) { createFailed++; createErrors.push({ code: p.code, reason: mapErr.message }); }
          else { created++; mappedLocal.add(p.id); }
          await sleep(300);
        }
      }

      // ---- step 3: push absolute price + stock for every mapping ----
      const doStock = !!integration.sync_inventory;
      const doPrice = !!integration.sync_products;
      let priceOk = 0, stockOk = 0, syncFailed = 0, skipped = 0, syncRemaining = 0;
      if ((doStock || doPrice) && syncLimit > 0) {
        const { data: maps } = await admin
          .from("myshop_product_mappings")
          .select("id,myshop_product_id,myshop_variant_id,myshop_inventory_id,product_id,last_stock_synced_at,products(stock,standard_price)")
          .eq("integration_id", integration.id)
          .not("product_id", "is", null)
          .order("last_stock_synced_at", { ascending: true, nullsFirst: true })
          .limit(syncLimit + 1);
        const batch = (maps ?? []) as any[];
        syncRemaining = Math.max(0, batch.length - syncLimit);
        for (const m of batch.slice(0, syncLimit)) {
          const p = m.products;
          if (!p) { skipped++; continue; }
          const plan = buildVariantSyncPayload({
            myshopVariantId: m.myshop_inventory_id ?? m.myshop_variant_id,
            price: p.standard_price, stock: p.stock, syncPrice: doPrice, syncStock: doStock,
          });
          if (!plan.ok) {
            skipped++;
            await admin.from("myshop_product_mappings").update({ last_error: plan.reason, sync_status: "needs_variant" }).eq("id", m.id);
            continue;
          }
          const res = await myshopFetch(key, VARIANT_SYNC_PATH(String(m.myshop_product_id)), { method: "PATCH", body: plan.payload });
          await log(integration.id, {
            action: "sync_variant", method: "PATCH", url_path: VARIANT_SYNC_LOG_PATH,
            status_code: res.status, oap_request_id: res.requestId, ok: res.ok, error: res.error,
            meta: { mapping_id: m.id, product_id: m.product_id, source: "full_backfill", response: res.ok ? null : res.data },
          });
          if (res.ok) {
            const now = new Date().toISOString();
            const patch: Record<string, unknown> = { last_error: null, sync_status: "mapped" };
            if (plan.syncsPrice) { priceOk++; patch.last_price_synced_at = now; }
            if (plan.syncsStock) { stockOk++; patch.last_stock_synced_at = now; }
            await admin.from("myshop_product_mappings").update(patch).eq("id", m.id);
          } else {
            syncFailed++;
            const detail = typeof res.data?.message === "string" ? res.data.message : res.data ? JSON.stringify(res.data).slice(0, 300) : "";
            await admin.from("myshop_product_mappings")
              .update({ last_error: [res.error, detail].filter(Boolean).join(" — ") }).eq("id", m.id);
          }
          await sleep(150);
        }
      }

      const { count: afterMappings } = await admin
        .from("myshop_product_mappings").select("id", { count: "exact", head: true })
        .eq("integration_id", integration.id);
      await admin.from("myshop_integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", integration.id);

      const remainingUnmapped = local.length - (afterMappings ?? 0);
      return json({
        ok: true,
        before: { mappings: beforeMappings ?? 0, active_products: local.length },
        after: { mappings: afterMappings ?? 0 },
        remote_catalog: { products: remoteTotal, pages: catalogPages, error: catalogError },
        matched, created, create_failed: createFailed, create_errors: createErrors.slice(0, 20),
        publishable_left: Math.max(0, publishable.length - created),
        blocked: blocked.length, blocker_counts: blockerCounts,
        price_synced: priceOk, stock_synced: stockOk, sync_failed: syncFailed, sync_skipped: skipped,
        remaining_unmapped: Math.max(0, remainingUnmapped),
        more: (categoryId > 0 && publishable.length - created > 0) || syncRemaining > 0,
        category_required: categoryId > 0 ? null : "ยังไม่ได้ตั้งหมวดหมู่สินค้า — ระบบจะจับคู่และซิงก์เท่านั้น ไม่สร้างสินค้าใหม่",
      });
    }

    if (action === "pull_orders") {
      const key = await apiKeyFor(channelId);
      if (!key) return json({ ok: false, error: "missing_api_key" }, 400);
      const params = new URLSearchParams({ perPage: "20" });
      if (body?.status) params.set("status", String(body.status));
      if (body?.from) params.set("startDate", String(body.from));
      if (body?.to) params.set("endDate", String(body.to));
      const res = await myshopFetch(key, `/myshop/v1/orders?${params.toString()}`);
      await log(integration.id, { action: "pull_orders", method: "GET", url_path: "/myshop/v1/orders", status_code: res.status, oap_request_id: res.requestId, ok: res.ok, error: res.error });
      if (!res.ok) return json({ ok: false, error: res.error, status: res.status });
      const items: any[] = res.data?.items ?? res.data?.orders ?? [];
      let upserted = 0;
      for (const o of items) {
        const orderNumber = String(o.orderNumber ?? o.orderNo ?? "");
        if (!orderNumber) continue;
        await admin.from("myshop_orders").upsert({
          integration_id: integration.id,
          order_number: orderNumber,
          channel_id: channelId,
          order_status: o.orderStatus ?? o.status ?? null,
          payment_status: o.paymentStatus ?? null,
          shipment_status: o.shipmentStatus ?? null,
          total_price: Number(o.totalPrice ?? 0) || 0,
          discount_amount: Number(o.discountAmount ?? 0) || 0,
          shipment_price: Number(o.shipmentPrice ?? 0) || 0,
          items_snapshot: o.orderItems ?? [],
          raw: o,
        }, { onConflict: "order_number" });
        upserted++;
      }
      await admin.from("myshop_integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", integration.id);
      return json({ ok: true, upserted });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("myshop-admin error", (e as Error)?.message);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
