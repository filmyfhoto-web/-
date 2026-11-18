import { createClient } from "npm:@supabase/supabase-js@2";
import { pickPublicOrigin, guestShopUrl } from "./_urls.ts";
import { enqueueNotification, kickDispatch } from "../_shared/notifyOutbox.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LINE_ADMIN = Deno.env.get("LINE_ADMIN_USER_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    // Guests on /s can call this without a user JWT, so we cannot require
    // authentication here. Instead, enforce a one-shot guard: a given
    // link_requests row can only trigger a LINE push once. Once its status
    // moves out of 'pending' (or notified_at is set), replays return without
    // sending another push or mutating the audit row. This blocks the
    // notification-spam / audit-pollution vector called out by the scanner
    // while keeping the guest flow working.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { request_id } = await req.json();
    if (!request_id) return new Response(JSON.stringify({ ok: false, error: "missing request_id" }), { status: 400, headers: cors });

    const { data: r, error } = await admin.from("link_requests").select("*").eq("id", request_id).maybeSingle();
    if (error || !r) throw new Error(error?.message || "not found");

    if (r.status !== "pending" || r.notified_at) {
      // Already handled — treat replays as no-ops so callers cannot force
      // additional admin pushes or overwrite the audit trail.
      return new Response(JSON.stringify({ ok: true, deduped: true }), { headers: cors });
    }

    if (!LINE_ADMIN) {
      await admin.from("link_requests").update({ status: "failed", error: "LINE_ADMIN_USER_ID not configured" }).eq("id", request_id);
      return new Response(JSON.stringify({ ok: false, reason: "no_admin" }), { headers: cors });
    }

    // Resolve origin via the shared helper so the reason is logged when the
    // PUBLIC_APP_URL secret is missing or malformed.
    const picked = pickPublicOrigin(Deno.env.get("PUBLIC_APP_URL"), req);
    console.log(
      `[link-request-notify] link origin resolved: ${picked.origin || "<empty>"} (source=${picked.source}${picked.reason ? ", reason=" + picked.reason : ""})`,
    );
    const origin = picked.origin;
    const suggest = guestShopUrl(origin, r.matched_slug);
    const adminUrl = `${origin}/admin/customers`;

    const lines = [
      "มีลูกค้าขอลิงก์โรงเรียน",
      `ชื่อโรงเรียน: ${r.school_name}`,
      "กรุณาตรวจสอบและส่งลิงก์โรงเรียนให้ลูกค้า",
    ];
    if (suggest) lines.push(`ลิงก์ที่ตรงอยู่แล้ว: ${suggest}`);
    lines.push(`จัดการ: ${adminUrl}`);
    const text = lines.join("\n");

    // Delivery is owned by the central outbox worker — this function only
    // queues the event (idempotent per link request).
    const queued = await enqueueNotification(admin, {
      event_type: "link_request",
      ref_type: "link_request",
      ref_id: request_id,
      recipient: LINE_ADMIN,
      text,
      audience: "admin",
    });
    if (!queued.queued) {
      await admin.from("link_requests").update({ status: "failed", error: queued.error || "enqueue failed" }).eq("id", request_id);
      return new Response(JSON.stringify({ ok: false, error: queued.error }), { headers: cors });
    }
    await kickDispatch(admin);
    await admin.from("link_requests").update({ status: "sent", notified_at: new Date().toISOString(), error: null }).eq("id", request_id);
    return new Response(JSON.stringify({ ok: true, queued: true, outbox_id: queued.id ?? null }), { headers: cors });
  } catch (e) {
    console.error("link-request-notify error", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), { status: 500, headers: cors });
  }
});