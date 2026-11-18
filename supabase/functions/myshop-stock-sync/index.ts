// Outbound stock synchroniser: local DB (stock_movements) -> LINE MyShop.
//
// The local database is the single source of truth. Every stock movement
// enqueues an ABSOLUTE target quantity into `public.stock_sync_outbox`
// (coalesced to one row per integration+product+variant), and this worker
// pushes that absolute value to MyShop.
//
// Modes (POST body):
//   { action: "drain", limit?: number }  – cron worker token OR owner/admin
//
// Idempotency/safety:
//   * rows are claimed with FOR UPDATE SKIP LOCKED via myshop_stock_claim()
//   * pushing an absolute value is naturally idempotent
//   * a mapping without a numeric MyShop variant id is SKIPPED, never guessed
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MYSHOP_SECRET_NAMES,
  VARIANT_SYNC_LOG_PATH,
  VARIANT_SYNC_PATH,
  buildVariantSyncPayload,
  myshopFetch,
} from "../_shared/myshop.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Admin = ReturnType<typeof createClient>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function hasWorkerToken(admin: Admin, req: Request): Promise<boolean> {
  const presented = req.headers.get("x-worker-token") || "";
  if (!presented) return false;
  const { data } = await admin
    .from("internal_worker_tokens").select("token").eq("name", "myshop_stock_sync").maybeSingle();
  const expected = String((data as { token?: string } | null)?.token || "");
  if (!expected || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
  return diff === 0;
}

async function isStaffCaller(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const supa = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: claims } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return false;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data } = await admin.from("user_roles").select("role").eq("user_id", uid);
  return (data ?? []).some((r: { role?: string }) => r.role === "owner" || r.role === "admin");
}

type ClaimRow = {
  id: string;
  integration_id: string;
  channel_id: string;
  mapping_id: string | null;
  myshop_product_id: string | null;
  myshop_variant_id: string | null;
  product_id: string;
  variant_id: string | null;
  target_stock: number;
  attempts: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const action = String((body as { action?: string })?.action || "drain");
  if (action !== "drain") return json({ error: "unknown_action" }, 400);

  if (!(await hasWorkerToken(admin, req)) && !(await isStaffCaller(req))) {
    return json({ error: "unauthorized" }, 401);
  }

  const limit = Math.min(Math.max(Number((body as { limit?: number })?.limit ?? 50) || 50, 1), 200);
  const { data: run } = await admin
    .from("stock_sync_worker_runs").insert({}).select("id").maybeSingle();
  const runId = (run as { id?: string } | null)?.id ?? null;

  let processed = 0, succeeded = 0, failed = 0, skipped = 0;
  let fatal: string | null = null;

  try {
    const { data: claimed, error } = await admin.rpc("myshop_stock_claim", { p_limit: limit });
    if (error) throw new Error(error.message);
    const rows = (claimed ?? []) as ClaimRow[];

    // One API key lookup per integration, not per row.
    const keys = new Map<string, string | null>();
    async function apiKeyFor(channelId: string): Promise<string | null> {
      if (keys.has(channelId)) return keys.get(channelId) ?? null;
      const { data } = await admin.rpc("myshop_get_secret", { p_name: MYSHOP_SECRET_NAMES.apiKey(channelId) });
      const key = data ? String(data) : null;
      keys.set(channelId, key);
      return key;
    }

    for (const row of rows) {
      processed++;
      const plan = buildVariantSyncPayload({
        myshopVariantId: row.myshop_variant_id,
        stock: Number(row.target_stock ?? 0),
        syncPrice: false,
        syncStock: true,
      });
      if (!plan.ok) {
        skipped++;
        await admin.rpc("myshop_stock_complete", { p_id: row.id, p_status: "skipped", p_error: plan.reason });
        continue;
      }
      const key = await apiKeyFor(row.channel_id);
      if (!key) {
        failed++;
        await admin.rpc("myshop_stock_complete", {
          p_id: row.id, p_status: "failed", p_error: `ไม่พบ API key ของร้าน MyShop (${row.channel_id})`,
        });
        continue;
      }
      if (!row.myshop_product_id) {
        skipped++;
        await admin.rpc("myshop_stock_complete", { p_id: row.id, p_status: "skipped", p_error: "ไม่มี MyShop product ID" });
        continue;
      }
      const res = await myshopFetch(key, VARIANT_SYNC_PATH(row.myshop_product_id), {
        method: "PATCH",
        body: plan.payload,
      });
      if (res.ok) {
        succeeded++;
        await admin.rpc("myshop_stock_complete", { p_id: row.id, p_status: "succeeded" });
      } else {
        failed++;
        await admin.rpc("myshop_stock_complete", {
          p_id: row.id, p_status: "failed",
          p_error: `${res.error ?? "error"} ${JSON.stringify(res.data ?? {}).slice(0, 300)}`,
        });
      }
      await admin.from("myshop_sync_logs").insert({
        integration_id: row.integration_id,
        action: "stock_push",
        ok: res.ok,
        method: "PATCH",
        url_path: VARIANT_SYNC_LOG_PATH,
        status_code: res.status,
        oap_request_id: res.requestId,
        error: res.ok ? null : String(res.error ?? "error").slice(0, 500),
        meta: { product_id: row.product_id, variant_id: row.variant_id, on_hand: plan.payload.onHandNumber },
      });
    }
  } catch (e) {
    fatal = String((e as Error)?.message || e);
  }

  if (runId) {
    await admin.from("stock_sync_worker_runs")
      .update({ finished_at: new Date().toISOString(), processed, succeeded, failed, skipped, error: fatal })
      .eq("id", runId);
  }
  return json({ ok: !fatal, processed, succeeded, failed, skipped, error: fatal }, fatal ? 500 : 200);
});
