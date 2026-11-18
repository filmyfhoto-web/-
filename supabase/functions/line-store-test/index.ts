// Per-store LINE connection test (admin/owner only).
//
// Calls LINE's read-only bot info endpoint with the channel access token of
// ONE store. Tokens and secrets never leave the server and are never logged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { envCredentials } from "../_shared/lineChannels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Fetch with timeout + retry limited to 429/5xx (never on 4xx auth errors). */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status !== 429 && res.status < 500) return res;
      last = res;
    } catch (e) {
      if (i === attempts - 1) throw e;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** i));
  }
  return last ?? new Response("upstream unavailable", { status: 503 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
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

  const body = await req.json().catch(() => ({}));
  const storeId = String((body as any)?.store_id || "").trim();
  if (!storeId) return json({ ok: false, error: "missing_store_id" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: row } = await admin
    .from("line_credentials")
    .select("id, channel_access_token, channel_secret, bot_basic_id, display_name, bot_display_name")
    .eq("id", storeId)
    .maybeSingle();

  const env = envCredentials(storeId);
  const token = env.token || (row?.channel_access_token as string | null) || "";
  if (!token) {
    return json({
      ok: false,
      store_id: storeId,
      reason: "no_token",
      message_th: "ยังไม่ได้ตั้งค่า Access Token ของร้านนี้",
      has_secret: Boolean(env.secret || row?.channel_secret),
    });
  }

  const t0 = Date.now();
  try {
    const res = await fetchWithRetry("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const latency = Date.now() - t0;
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      return json({
        ok: false,
        store_id: storeId,
        reason: res.status === 401 ? "invalid_token" : "line_api_error",
        status: res.status,
        detail,
        latency_ms: latency,
        message_th: res.status === 401
          ? "Access Token ไม่ถูกต้องหรือหมดอายุ"
          : `LINE ตอบกลับข้อผิดพลาด (${res.status})`,
      });
    }
    const info = await res.json();
    return json({
      ok: true,
      store_id: storeId,
      latency_ms: latency,
      bot: {
        displayName: info?.displayName ?? null,
        basicId: info?.basicId ?? null,
        pictureUrl: info?.pictureUrl ?? null,
      },
      has_secret: Boolean(env.secret || row?.channel_secret),
      message_th: "เชื่อมต่อ LINE OA สำเร็จ",
    });
  } catch (e) {
    return json({
      ok: false,
      store_id: storeId,
      reason: "network_error",
      detail: String((e as Error)?.message || e).slice(0, 200),
      message_th: "เชื่อมต่อ LINE ไม่สำเร็จ (หมดเวลา)",
    });
  }
});
