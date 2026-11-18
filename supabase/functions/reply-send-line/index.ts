// Send a manual staff reply to a customer via LINE Push API.
// - Requires the caller to be authenticated staff (is_staff RPC).
// - Falls back gracefully when LINE token is missing or the order has no bound line_user_id.
// - Logs every attempt into public.order_replies for the audit history.
// - Always returns Thai-friendly `message_th` so the UI can display a
//   user-friendly toast without crashing the page.
//
// Delivery goes through the SAME server-side outbox as every other
// order-related message (`public.notification_outbox`): this function only
// validates, records the reply in history as `queued`, enqueues the job with a
// `client_request_id`-derived idempotency key and kicks the worker. There is
// no direct push here any more, so a double-click, a retry or a browser that
// dies mid-request can never produce two messages on the customer's phone.
// The pre-flight checks (feature off, no LINE token, customer not linked) are
// still answered synchronously, so the UI keeps its "copy the text" fallback.
import { createClient } from "npm:@supabase/supabase-js@2";
import { notifyOrderEvent } from "../_shared/orderEvents.ts";
import { resolveStoreLineToken } from "../_shared/lineToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Human-readable Thai fallback messages so the browser toast never surfaces
// a raw error code to the shop owner.
const REASON_TH: Record<string, string> = {
  not_configured: "ยังไม่ได้ตั้งค่า LINE OA — ระบบจะคัดลอกข้อความให้แทน",
  disabled: "ปิดการใช้งาน LINE OA อยู่ — ระบบจะคัดลอกข้อความให้แทน",
  no_line_user: "ลูกค้ายังไม่ได้ผูก LINE — ระบบจะคัดลอกข้อความให้แทน",
  line_api_error: "LINE ตอบกลับข้อผิดพลาด — คัดลอกข้อความไว้ให้แล้ว",
  exception: "เกิดข้อผิดพลาดชั่วคราว — คัดลอกข้อความไว้ให้แล้ว",
  order_not_found: "ไม่พบออเดอร์นี้",
  missing_params: "ข้อมูลไม่ครบ กรุณาลองใหม่",
  unauthorized: "กรุณาเข้าสู่ระบบอีกครั้ง",
  forbidden: "ไม่มีสิทธิ์ส่งข้อความให้ลูกค้า",
  invalid_json: "รูปแบบข้อมูลไม่ถูกต้อง",
  method_not_allowed: "วิธีการเรียกไม่ถูกต้อง",
};

function fail(reason: string, extra: Record<string, unknown> = {}, status = 200) {
  return json({ ok: false, reason, message_th: REASON_TH[reason] ?? reason, ...extra }, status);
}

/** Deterministic UUID (v4-shaped) from a stable string — same input, same key. */
export async function retryKeyFrom(seed: string): Promise<string> {
  const buf = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  const h = Array.from(buf.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", {}, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return fail("unauthorized", {}, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return fail("unauthorized", {}, 401);

  const { data: staffOk } = await admin.rpc("is_staff", { _user_id: userId });
  if (!staffOk) return fail("forbidden", {}, 403);

  let body: any;
  try { body = await req.json(); } catch { return fail("invalid_json", {}, 400); }

  const orderId: string | undefined = body?.order_id;
  const message: string = String(body?.message ?? "").trim();
  const templateType: string | null = body?.template_type ?? null;
  const templateId: string | null = body?.template_id ?? null;
  const directLineUser: string | undefined = body?.line_user_id;
  // The client may pass its own id; otherwise the reply content itself is the
  // dedup seed, bucketed per minute so an intentional repeat later still sends.
  const clientRequestId: string = String(
    body?.client_request_id ?? `${orderId ?? directLineUser}:${userId}:${message}:${Math.floor(Date.now() / 60000)}`,
  );
  if (!message) return fail("missing_params", {}, 400);
  if (!orderId && !directLineUser) return fail("missing_params", {}, 400);

  // Global feature toggle. If admins disabled the LINE integration in
  // line_oa_settings, always fall through to copy mode.
  const { data: cfg } = await admin
    .from("line_oa_settings")
    .select("enabled, default_reply_mode")
    .limit(1)
    .maybeSingle();
  const featureEnabled = cfg?.enabled !== false;
  const forcedCopy = cfg?.default_reply_mode === "copy_only";

  // Resolve LINE userId either directly (Inbox direct chat) or through the order.
  let lineUserId: string | null = null;
  if (directLineUser) {
    lineUserId = directLineUser;
  }
  if (orderId) {
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("id, customer_id, line_user_id")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr || !order) return fail("order_not_found", {}, 404);
    if (!lineUserId) {
      lineUserId = (order.line_user_id as string | null) ?? null;
      if (!lineUserId && order.customer_id) {
        const { data: prof } = await admin
          .from("profiles")
          .select("line_user_id")
          .eq("id", order.customer_id)
          .maybeSingle();
        lineUserId = (prof?.line_user_id as string | null) ?? null;
      }
    }
  }

  // Staff display name for history
  const { data: staffProf } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const staffName = staffProf?.full_name || staffProf?.email || null;

  // Which store's OA is this conversation on? Replies must go out on the same
  // channel the customer wrote to — never with another store's token.
  let storeId = String(body?.store_id ?? "").trim();
  if (!storeId && lineUserId) {
    const { data: thread } = await admin
      .from("inbox_threads")
      .select("store_id")
      .eq("line_user_id", lineUserId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    storeId = String(thread?.store_id || "").trim();
  }
  if (!storeId) storeId = "default";

  async function logReply(fields: {
    channel: string; status: string;
    line_message_id?: string | null; error_message?: string | null;
  }) {
    if (!orderId) {
      // Direct-to-LINE (Inbox) has no order to attach the reply to; skip DB log.
      // Reset the inbox_threads unread counter so the UI reflects that we replied.
      if (lineUserId && fields.status === "sent") {
        try {
          await admin.from("inbox_threads").upsert({
            store_id: storeId,
            line_user_id: lineUserId,
            last_replied_at: new Date().toISOString(),
            replied_by: userId,
            unread_count: 0,
            updated_at: new Date().toISOString(),
          } as any, { onConflict: "store_id,line_user_id" });
        } catch (e) {
          console.error("[reply-send-line] inbox thread update failed:", (e as Error)?.message);
        }
      }
      return;
    }
    try {
      await admin.from("order_replies").insert({
        order_id: orderId,
        message,
        channel: fields.channel,
        template_type: templateType,
        template_id: templateId,
        status: fields.status,
        line_message_id: fields.line_message_id ?? null,
        error_message: fields.error_message ?? null,
        replied_by: userId,
        replied_by_name: staffName,
      });
    } catch (e) {
      // Never let history logging break the reply flow — just print for debug.
      console.error("[reply-send-line] logReply failed:", (e as Error)?.message);
    }
  }

  if (!featureEnabled || forcedCopy) {
    return fail(forcedCopy ? "disabled" : "disabled");
  }
  const storeToken = await resolveStoreLineToken(admin, storeId);
  if (!storeToken && !LINE_TOKEN) {
    return fail("not_configured");
  }
  if (!lineUserId) {
    return fail("no_line_user");
  }

  try {
    // One event = one outbox row. The key is derived from the caller's
    // client_request_id, so retries and double-clicks collapse onto the row
    // that already exists instead of queuing a second message.
    const idempotencyKey = `staff_reply:${await retryKeyFrom(clientRequestId)}`;
    // Replies attached to an order are order traffic, so they use the shared
    // order-event contract; replies to a bare LINE user keep their own key.
    const { data: outboxId, error: enqErr } = orderId
      ? await enqueueOrderReply()
      : await admin.rpc("notification_outbox_enqueue", {
        p_event_type: "staff_reply",
        p_ref_type: "line_user",
        p_ref_id: null,
        p_recipient: lineUserId,
        p_payload: {
          text: message.slice(0, 4900),
          template_type: templateType,
          replied_by: userId,
          store_id: storeId,
        },
        p_idempotency_key: idempotencyKey,
        p_channel: "line",
        p_binding_id: null,
        p_created_by: userId,
        p_client_request_id: clientRequestId.slice(0, 100),
      });

    async function enqueueOrderReply() {
      const r = await notifyOrderEvent(admin, {
        event: "order_reply",
        refType: "order",
        orderId,
        recipient: lineUserId,
        text: message.slice(0, 4900),
        audience: "customer",
        transition: idempotencyKey,
        createdBy: userId,
        clientRequestId: clientRequestId.slice(0, 100),
        meta: { template_type: templateType, replied_by: userId, store_id: storeId },
      });
      return { data: r.id ?? null, error: null as { message: string } | null };
    }
    if (enqErr) {
      await logReply({ channel: "line", status: "failed", error_message: String(enqErr.message).slice(0, 400) });
      return fail("exception", { detail: enqErr.message });
    }

    await logReply({ channel: "line", status: "queued" });

    // Kick the worker so staff replies don't wait for the 1-minute cron tick.
    // Failure here is harmless: the cron picks the row up on its next pass.
    try {
      const { data: tokenRow } = await admin
        .from("internal_worker_tokens").select("token").eq("name", "notify_dispatch").maybeSingle();
      if (tokenRow?.token) {
        await fetch(`${SUPABASE_URL}/functions/v1/notify-dispatch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: ANON_KEY,
            "x-worker-token": String(tokenRow.token),
          },
          body: JSON.stringify({ action: "drain", limit: 10, source: "reply" }),
        });
      }
    } catch (e) {
      console.error("[reply-send-line] worker kick failed:", (e as Error)?.message);
    }

    return json({
      ok: true,
      queued: true,
      outbox_id: outboxId,
      idempotency_key: idempotencyKey,
      message_th: "เข้าคิวส่งผ่าน LINE OA แล้ว — ระบบจะส่งให้ลูกค้าอัตโนมัติ",
    });
  } catch (e: any) {
    await logReply({
      channel: "line",
      status: "failed",
      error_message: String(e?.message ?? e).slice(0, 400),
    });
    return fail("exception", { detail: String(e?.message ?? e) });
  }
});