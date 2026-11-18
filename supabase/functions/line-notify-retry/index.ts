import { createClient } from "npm:@supabase/supabase-js@2";
import { enqueueNotification, kickDispatch } from "../_shared/notifyOutbox.ts";

// COMPATIBILITY FACADE — the legacy "retry these log rows" endpoint.
// It no longer pushes to LINE. Each requested row becomes a NEW auditable
// `manual_resend` event in `notification_outbox`, delivered by the worker.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error: authErr } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
    if (authErr || !claims?.claims) return json(401, { error: "unauthorized" });
    const userId = claims.claims.sub as string;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isStaff = (roles ?? []).some((r: any) => r.role === "owner" || r.role === "admin");
    if (!isStaff) return json(403, { error: "forbidden" });

    const { ids } = await req.json().catch(() => ({}));
    const idList: string[] = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
    if (!idList.length) return json(400, { error: "ids required" });

    // Rate limit deliberate resends per staff user.
    const { data: rateOk } = await admin.rpc("notification_manual_rate_ok", {
      p_user_id: userId, p_max: 10, p_window_seconds: 60,
    });
    if (rateOk === false) return json(429, { error: "rate_limited" });

    const { data: rows, error: loadErr } = await admin
      .from("line_notifications")
      .select("id, recipient, message, retry_count, sent_status, idempotency_key, order_id, document_id, customer_id, type, kind, direction")
      .in("id", idList);
    if (loadErr) return json(500, { error: loadErr.message });

    const results: any[] = [];
    for (const row of rows ?? []) {
      if (!row.recipient || !row.message) {
        results.push({ id: row.id, ok: false, reason: "missing recipient/message" });
        continue;
      }
      const nextAttempt = (row.retry_count ?? 0) + 1;
      const r = await enqueueNotification(admin, {
        event_type: "manual_resend",
        ref_type: row.document_id ? "document" : "order",
        ref_id: (row.order_id as string) || (row.document_id as string) || null,
        recipient: row.recipient,
        text: row.message,
        audience: row.direction === "to_customer" ? "customer" : "admin",
        // A deliberate resend is a NEW event: version includes the attempt so
        // it never collides with the original, but a double-click on the same
        // attempt still collapses to a single row.
        version: `manual:${row.id}:${nextAttempt}`,
        created_by: userId,
        meta: { manual_resend: true, source_log_id: row.id },
      });
      await admin.from("line_notifications")
        .update({ retry_count: nextAttempt, last_attempt_at: new Date().toISOString() })
        .eq("id", row.id);
      results.push({ id: row.id, queued: r.queued, outbox_id: r.id ?? null, retry_count: nextAttempt });
    }

    await kickDispatch(admin);
    return json(200, { ok: true, results });
  } catch (e) {
    console.error("line-notify-retry", e);
    return json(500, { error: String((e as any)?.message || e) });
  }
});