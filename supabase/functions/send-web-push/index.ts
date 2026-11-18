// Sends Web Push ("แจ้งเตือนถาวร") to devices registered in push_subscriptions.
//
// Two callers:
//  • signed-in user with { self: true } — test push to their own devices;
//  • internal worker with x-worker-token — fan-out to an app/store audience.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import webpush from "npm:web-push@3.6.7";
import { callerKey, checkRateLimit, tooManyRequests } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@filmyynatta.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ error: "vapid_not_configured" }, 500);

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let payload: {
    self?: boolean; title?: string; body?: string; url?: string; tag?: string;
    app?: string; store_id?: string | null; user_ids?: string[]; notification_id?: string | null;
  };
  try { payload = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  // ---- Authorize -------------------------------------------------------
  const workerToken = req.headers.get("x-worker-token");
  let selfUserId: string | null = null;
  if (workerToken) {
    const { data: ok } = await admin.from("internal_worker_tokens").select("token").eq("token", workerToken).maybeSingle();
    if (!ok) return json({ error: "unauthorized" }, 401);
    // Worker fan-out throttle — protects devices from a stuck retry loop.
    const workerGate = checkRateLimit(callerKey(req, "send-web-push:worker", workerToken), { limit: 120, windowMs: 60_000 });
    if (!workerGate.ok) return tooManyRequests(workerGate, corsHeaders);
  } else {
    const jwt = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    const { data: userRes } = await admin.auth.getUser(jwt);
    if (!userRes?.user) return json({ error: "unauthorized" }, 401);
    selfUserId = userRes.user.id;
    // Signed-in test pushes are throttled hard: 5 per minute per user.
    const selfGate = checkRateLimit(callerKey(req, "send-web-push:self", selfUserId), { limit: 5, windowMs: 60_000 });
    if (!selfGate.ok) return tooManyRequests(selfGate, corsHeaders);
    // Signed-in callers may only push to their own devices.
    payload.self = true;
  }

  // ---- Audience --------------------------------------------------------
  let q = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("active", true);
  if (payload.self && selfUserId) q = q.eq("user_id", selfUserId);
  else {
    if (payload.app) q = q.eq("app", payload.app);
    if (payload.store_id) q = q.eq("store_id", payload.store_id);
    if (payload.user_ids?.length) q = q.in("user_id", payload.user_ids);
  }
  const { data: subs, error } = await q;
  if (error) return json({ error: error.message }, 500);
  if (!subs?.length) return json({ sent: 0, failed: 0, reason: "no_devices" });

  // ปุ่ม "เปิดรายการ" ต้องพาไปหน้าที่ถูกต้องพร้อมไฮไลต์รายการนั้น
  let targetUrl = payload.url ?? null;
  if (!targetUrl && payload.notification_id) {
    const { data: n } = await admin
      .from("film_ops_notifications")
      .select("id, kind, order_id, group_no")
      .eq("id", payload.notification_id)
      .maybeSingle();
    if (n) {
      const page = n.order_id
        ? "orders"
        : (Number(n.group_no) === 2 || String(n.kind || "").startsWith("nattaq") ? "inbox" : "alerts");
      const params = new URLSearchParams({ p: page, n: String(n.id) });
      if (n.order_id) params.set("o", String(n.order_id));
      targetUrl = `/receipts/film?${params.toString()}`;
    }
  }

  const message = JSON.stringify({
    title: payload.title ?? "FILM SHOP",
    body: payload.body ?? "",
    url: targetUrl ?? "/receipts/film?p=alerts",
    tag: payload.tag ?? "fs-notify",
    // ปุ่ม "อ่านแล้ว/รับเรื่อง" ในตัวแจ้งเตือนจะเรียก endpoint นี้จาก service worker
    notification_id: payload.notification_id ?? null,
    ack_url: `${SUPABASE_URL}/functions/v1/push-action`,
  });

  let sent = 0;
  let failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message,
        { TTL: 3600, urgency: "high" },
      );
      sent += 1;
      await admin.from("push_subscriptions").update({ last_seen_at: new Date().toISOString(), last_error: null }).eq("id", s.id);
    } catch (e) {
      failed += 1;
      const status = (e as { statusCode?: number })?.statusCode;
      const gone = status === 404 || status === 410; // device uninstalled / permission revoked
      console.error(`push failed [${status}] ${s.endpoint.slice(0, 48)}…: ${String(e)}`);
      await admin.from("push_subscriptions")
        .update({ active: !gone, last_error: `${status ?? "err"}: ${String(e).slice(0, 200)}` })
        .eq("id", s.id);
    }
  }));

  return json({ sent, failed });
});
