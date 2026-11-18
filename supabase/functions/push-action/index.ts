// Quick actions fired from a Web Push notification ("อ่านแล้ว" / "รับเรื่อง").
//
// The service worker has no user JWT, so the caller proves ownership with the
// push subscription secret (endpoint + auth key) that only that device and the
// server know. Anything else is rejected.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { callerKey, checkRateLimit, tooManyRequests } from "../_shared/rateLimit.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Throttle: a looping service worker (or a replayed ack) must not hammer
  // this endpoint. 30 acks / minute per device-IP is far above real usage.
  const ipGate = checkRateLimit(callerKey(req, "push-action"), { limit: 30, windowMs: 60_000 });
  if (!ipGate.ok) return tooManyRequests(ipGate, corsHeaders);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: { endpoint?: string; auth?: string; notification_id?: string; action?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const endpoint = String(body.endpoint ?? "");
  const authKey = String(body.auth ?? "");
  const action = body.action === "ack" ? "ack" : "read";
  if (!endpoint || !authKey) return json({ error: "unauthorized" }, 401);

  const { data: sub } = await admin
    .from("push_subscriptions")
    .select("id, user_id, auth")
    .eq("endpoint", endpoint)
    .eq("active", true)
    .maybeSingle();
  if (!sub || sub.auth !== authKey) return json({ error: "unauthorized" }, 401);

  // Per-device throttle once identity is proven — 20 actions / minute.
  const devGate = checkRateLimit(`push-action:sub:${sub.id}`, { limit: 20, windowMs: 60_000 });
  if (!devGate.ok) return tooManyRequests(devGate, corsHeaders);

  const now = new Date().toISOString();
  await admin.from("push_subscriptions").update({ last_seen_at: now }).eq("id", sub.id);

  const notificationId = body.notification_id ? String(body.notification_id) : null;
  if (!notificationId) return json({ ok: true, updated: 0 });

  // Only the intended recipient (or an owner/admin) may read/ack an alert.
  // The push-subscription secret proves *which device* called, so the check
  // below binds the action to that device's signed-in user — never to the
  // notification id alone (that would be an IDOR: any staff device could ack
  // another person's alert just by knowing the id).
  const { data: notif } = await admin
    .from("film_ops_notifications")
    .select("id, assignee_user_id")
    .eq("id", notificationId)
    .maybeSingle();
  if (!notif) return json({ error: "not_found" }, 404);

  if (!sub.user_id) return json({ error: "forbidden" }, 403);

  if (notif.assignee_user_id !== sub.user_id) {
    // Not the assignee — allow only owner/admin, and only for alerts that are
    // assigned to nobody or to someone else they supervise. Plain staff can
    // never touch an alert that is not theirs, and an unassigned alert still
    // requires a privileged account.
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", sub.user_id);
    const privileged = (roles ?? []).some((r: { role: string }) => r.role === "owner" || r.role === "admin");
    if (!privileged) return json({ error: "forbidden" }, 403);

    const { data: prof } = await admin
      .from("profiles")
      .select("staff_active")
      .eq("id", sub.user_id)
      .maybeSingle();
    if (prof && prof.staff_active === false) return json({ error: "forbidden" }, 403);
  }

  const patch: Record<string, unknown> = { read_at: now };
  if (action === "ack") {
    patch.status = "ack";
    patch.acknowledged_at = now;
    patch.acknowledged_by = sub.user_id;
  }
  const { error } = await admin.from("film_ops_notifications").update(patch).eq("id", notificationId);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, updated: 1, action });
});
