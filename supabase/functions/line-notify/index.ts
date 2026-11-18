import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildLinkConfirmMessage,
  buildNewOrderAdminMessage,
  buildNewOrderCustomerAck,
  buildCustomerOrderAck,
  buildCustomerStatusUpdateMessage,
  buildNewQuotationAdminMessage,
  buildPurchaseOrderAdminMessage,
  buildStatusUpdateMessage,
  buildShopWorkOrderAdminMessage,
  isValidStatus,
  type StatusCode,
} from "./messages.ts";
import { orderUrls, docUrls, customerOrderUrls, customerDocsUrl } from "./urls.ts";
import { pickPublicOrigin } from "./urls.ts";
import { resolveLineToken } from "../_shared/lineToken.ts";
import { enqueueNotification, kickDispatch } from "../_shared/notifyOutbox.ts";
import { notifyOrderEvent, type OrderEvent, type OrderRefType } from "../_shared/orderEvents.ts";
import {
  buildFilmDeliveryText,
  filmStageMatchesStatus,
  isFilmDeliveryStage,
  loadFilmOrder,
  resolveFilmRecipient,
} from "../_shared/filmDelivery.ts";
import { loadOrderGroupDestinations } from "../_shared/orderGroupNotify.ts";


// COMPATIBILITY FACADE.
// This function no longer pushes order messages to LINE. It authorises the
// caller, builds the message text, and ENQUEUES it into
// `public.notification_outbox`. Delivery is done exclusively by the
// `notify-dispatch` worker (cron), which owns retries and provider-level
// dedup. Only the staff-only health/test kinds still push directly.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
const LINE_ADMIN = Deno.env.get("LINE_ADMIN_USER_ID");

/**
 * GROUP-ONLY POLICY.
 * แจ้งเตือนแอดมินทั้งหมดไปที่ "กลุ่ม LINE รับออเดอร์" เท่านั้น
 * ไม่ส่งเข้าแชทส่วนตัว (LINE_ADMIN_USER_ID / admin_line_recipients) อีกต่อไป
 */
async function loadAdminRecipients(admin: any): Promise<string[]> {
  const dests = await loadOrderGroupDestinations(admin);
  return dests.map((d) => d.dest);
}

/** สถานะไม่มีผลอีกแล้ว — ปลายทางเดียวคือกลุ่ม LINE รับออเดอร์ */
async function loadAdminRecipientsForStatus(admin: any, _status: string | null): Promise<string[]> {
  return await loadAdminRecipients(admin);
}


/**
 * Insert a pending log row keyed by idempotency_key. Returns { deduped:true }
 * when the key already exists (webhook retried). Otherwise returns the row id.
 */
async function reserveLog(admin: any, key: string, row: any): Promise<{ id?: string; deduped?: boolean }> {
  const { data, error } = await admin
    .from("line_notifications")
    .insert({ ...row, idempotency_key: key, sent_status: "pending", last_attempt_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) {
    // 23505 unique_violation = already sent; safe dedupe
    const code = (error as any).code || "";
    if (code === "23505" || /duplicate key/i.test(String(error.message))) {
      return { deduped: true };
    }
    // fall through: still try to send so we don't lose the message
    console.warn("reserveLog non-dupe error", error);
    return {};
  }
  return { id: data?.id };
}

async function finalizeLog(admin: any, id: string | undefined, result: any) {
  if (!id) return;
  try {
    await admin.from("line_notifications").update({
      sent_status: result?.ok ? "sent" : result?.skipped ? "skipped" : "failed",
      sent_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      error_message: result?.body ? String(result.body).slice(0, 500) : (result?.reason || null),
    }).eq("id", id);
  } catch (e) { console.warn("finalizeLog", e); }
}

/**
 * Single helper used for every LINE send. Guarantees one log row per
 * idempotency_key. If the key was already used, returns deduped without
 * calling LINE again.
 */
/**
 * Queue one message. Keeps the legacy `line_notifications` log row (the admin
 * LINE log page reads it) but hands actual delivery to the outbox. The log row
 * id travels in the payload so the dispatcher can finalize it.
 */
/** Map the legacy free-form `type`/`status` onto the closed event contract. */
function toOrderEvent(meta: Record<string, unknown>): OrderEvent {
  const raw = String(meta.type || meta.kind || "").toLowerCase();
  const status = String(meta.status || "").toLowerCase();
  if (raw.includes("cancel") || status.includes("cancel")) return "order_cancelled";
  if (raw.includes("quote") || status.includes("quote")) return "order_quoted";
  if (raw.includes("approve") || status.includes("approve")) return "order_price_confirmed";
  if (raw.includes("ready") || status.includes("ready")) return "order_ready";
  if (raw.includes("complete") || status.includes("complete")) return "order_completed";
  if (raw.includes("info") || raw.includes("request")) return "order_info_requested";
  if (raw.includes("reply")) return "order_reply";
  if (raw.includes("new") || status === "new") return "order_created";
  return "order_status_changed";
}

async function sendOnce(
  admin: any,
  key: string,
  to: string | undefined,
  text: string,
  meta: Record<string, unknown>,
  _opts?: { token?: string },
): Promise<any> {
  if (!to) {
    await reserveLog(admin, key, { ...meta, message: text, recipient: null });
    return { skipped: true, reason: "no_recipient" };
  }
  const reserved = await reserveLog(admin, key, { ...meta, message: text, recipient: to });
  if (reserved.deduped) return { ok: true, deduped: true };
  // Every order-related message goes through the shared order-event contract,
  // so its identity is event + table + order + recipient + channel + status.
  const res = await notifyOrderEvent(admin, {
    event: toOrderEvent(meta),
    refType: (meta.document_id ? "document" : "order") as OrderRefType,
    orderId: (meta.order_id as string) || (meta.document_id as string) || (meta.ref_id as string) || null,
    recipient: to,
    text,
    audience: meta.direction === "to_customer" ? "customer" : "admin",
    transition: (meta.status as string) || key,
    meta: { log_id: reserved.id ?? null, legacy_key: key, source_type: meta.type ?? meta.kind ?? null },
  });
  return { ok: res.queued, queued: res.queued, outbox_id: res.id ?? null, error: res.error };
}

/**
 * Staff-only test path. It ALSO goes through the outbox (no direct push
 * anywhere in this function) and the worker is nudged straight after, so the
 * result the operator reads is the server-side row — identical on a reload or
 * on another device.
 */
async function sendTestNow(
  admin: any,
  key: string,
  to: string,
  text: string,
  meta: Record<string, unknown>,
): Promise<any> {
  const reserved = await reserveLog(admin, key, { ...meta, message: text, recipient: to });
  if (reserved.deduped) return { ok: true, deduped: true };
  const res = await enqueueNotification(admin, {
    event_type: String(meta.type || "admin_line_test"),
    ref_type: "admin_line_test",
    ref_id: null,
    recipient: to,
    text,
    audience: "admin",
    version: key,
    meta: { log_id: reserved.id ?? null, legacy_key: key },
  });
  await kickDispatch(admin);
  return { ok: res.queued, queued: res.queued, outbox_id: res.id ?? null, error: res.error };
}

function originFromReq(req: Request, fallback?: string | null): string {
  // Central helper: honours PUBLIC_APP_URL, falls back to the canonical custom domain,
  // then to the request origin. Logged so we can trace why a link uses a particular host.
  const picked = pickPublicOrigin(Deno.env.get("PUBLIC_APP_URL"), req, fallback ?? null);
  console.log(
    `[line-notify] link origin resolved: ${picked.origin || "<empty>"} (source=${picked.source}${picked.reason ? ", reason=" + picked.reason : ""})`,
  );
  return picked.origin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error: authErr } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const { kind, order_id, status, document_id, purchase_order_id, idempotency_key: clientKey } = body || {};
    if (!kind) {
      return new Response(JSON.stringify({ error: "missing kind" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Prefer the admin-managed token stored in line_credentials (self-service page).
    LINE_TOKEN = await resolveLineToken(admin);
    const origin = originFromReq(req);
    // Server-derived idempotency key — never accept a client-supplied key as
    // the sole dedup source, otherwise a caller can bypass dedup by varying
    // the key and spam LINE recipients.
    const serverKey = [kind, order_id || document_id || purchase_order_id || userId, status || ""].filter(Boolean).join(":");
    const safeClientKey = clientKey ? String(clientKey).slice(0, 120).replace(/[^A-Za-z0-9:_-]/g, "") : "";
    const baseKey = safeClientKey ? `${serverKey}:${safeClientKey}` : serverKey;

    // Helper: load order with relations
    async function loadOrder(id: string) {
      const { data, error } = await admin
        .from("orders")
        .select("id, order_no, customer_id, status, total, cancelled_reason, note, is_guest, guest_name, guest_phone, school_name, line_user_id, organizations(name)")
        .eq("id", id).maybeSingle();
      if (error) console.warn("loadOrder error", error);
      if (!data) return null;
      let profile: any = null;
      if (data.customer_id) {
        const { data: p } = await admin
          .from("profiles")
          .select("full_name, phone, line_user_id")
          .eq("id", data.customer_id)
          .maybeSingle();
        profile = p;
      }
      return { ...data, profiles: profile };
    }

    async function isStaffUser(uid: string): Promise<boolean> {
      const { data } = await admin.from("user_roles").select("role").eq("user_id", uid);
      return (data ?? []).some((r: any) => r.role === "owner" || r.role === "admin");
    }

    const results: any = {};

    if (kind === "new_order" || kind === "status_update" || kind === "order_cancelled") {
      if (!order_id) {
        return new Response(JSON.stringify({ error: "missing order_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const order: any = await loadOrder(order_id);
      if (!order) {
        return new Response(JSON.stringify({ error: "order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const orgName = order.organizations?.name || order.school_name || order.profiles?.full_name || order.guest_name || "ลูกค้า";
      const phone = order.profiles?.phone || order.guest_phone || "-";
      // For guest orders (customer_id null) the LINE id lives directly on orders.
      const customerLineId = (order.line_user_id as string | undefined) || (order.profiles?.line_user_id as string | undefined);
      const urls = orderUrls(origin, order_id);
      // ลิงก์ที่ลูกค้าเปิดได้จริง (deep link จาก LINE → หน้ารายละเอียดคำสั่งซื้อ)
      const custUrls = customerOrderUrls(origin, order_id);
      const docsUrl = customerDocsUrl(origin);
      const orderCtx = {
        order_no: order.order_no,
        customer_name: orgName,
        customer_phone: phone,
        project_type: order.note || null,
        total: order.total,
        cancelled_reason: order.cancelled_reason,
        ...urls,
      };

      if (kind === "new_order") {
        // Ownership check: the order owner may notify. For guest orders
        // (customer_id null) only staff may trigger notifications — otherwise
        // any authenticated user could enumerate guest order UUIDs and spam
        // the admin + guest LINE recipient.
        if (order.customer_id) {
          if (order.customer_id !== userId) {
            return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } else if (!(await isStaffUser(userId))) {
          return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const text = buildNewOrderAdminMessage(orderCtx);
        const recipients = await loadAdminRecipientsForStatus(admin, "new");
        const admins: Record<string, unknown> = {};
        for (const to of recipients) {
          admins[to] = await sendOnce(admin, `${baseKey}:admin:${to}`, to, text,
            { order_id, type: kind, kind, direction: "to_admin" });
        }
        results.admin = admins;
        if (customerLineId) {
          const ack = buildCustomerOrderAck({ order_no: order.order_no, detail_url: custUrls.detail_url });
          results.customer = await sendOnce(admin, `${baseKey}:cust_ack`, customerLineId, ack,
            { customer_id: order.customer_id, order_id, type: "new_order_ack", kind, direction: "to_customer" });
          if (!recipients.includes(customerLineId)) {
            results.customer_oa_log = await sendOnce(admin, `${baseKey}:cust_oa`, customerLineId, text,
              { customer_id: order.customer_id, order_id, type: "new_order_oa_log", kind, direction: "to_customer" });
          }
        }
      } else if (kind === "status_update" || kind === "order_cancelled") {
        if (!(await isStaffUser(userId))) {
          return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const effectiveStatus: unknown = kind === "order_cancelled" ? "cancelled" : status;
        if (!isValidStatus(effectiveStatus)) {
          return new Response(JSON.stringify({ error: "invalid status" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const text = buildStatusUpdateMessage(orderCtx, effectiveStatus as StatusCode);
        const customerText = buildCustomerStatusUpdateMessage(
          { ...orderCtx, ...custUrls, docs_url: docsUrl },
          effectiveStatus as StatusCode,
        );
        results.customer = await sendOnce(admin, `${baseKey}:cust`, customerLineId, customerText,
          { customer_id: order.customer_id, order_id, type: kind, kind, direction: "to_customer" });
        const recipients = await loadAdminRecipientsForStatus(admin, effectiveStatus as string);
        const admins: Record<string, unknown> = {};
        for (const to of recipients) {
          if (to === customerLineId) continue;
          admins[to] = await sendOnce(admin, `${baseKey}:admin:${to}`, to, text,
            { order_id, type: kind, kind, direction: "to_admin" });
        }
        results.admin = admins;
      }
    } else if (kind === "film_delivery") {
      // แจ้งลูกค้า Film Shop ที่ผูก LINE ว่างาน "พร้อมส่งมอบ" / "ส่งมอบแล้ว" (staff เท่านั้น)
      if (!order_id) {
        return new Response(JSON.stringify({ error: "missing order_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!(await isStaffUser(userId))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const stage = body?.stage;
      if (!isFilmDeliveryStage(stage)) {
        return new Response(JSON.stringify({ error: "invalid stage" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const filmOrder = await loadFilmOrder(admin as never, order_id);
      if (!filmOrder) {
        return new Response(JSON.stringify({ error: "order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // กัน client ปลอม event: stage ต้องตรงกับสถานะจริงของออเดอร์
      if (!filmStageMatchesStatus(stage, filmOrder.status)) {
        return new Response(JSON.stringify({ error: "status mismatch", status: filmOrder.status }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const recipient = await resolveFilmRecipient(admin as never, filmOrder);
      if (!recipient.lineUserId) {
        // ไม่ผูก LINE → บันทึกว่าไม่ได้ส่ง (ห้ามคืนค่าหลอกว่าส่งแล้ว)
        results.customer = { skipped: true, reason: "no_line_binding" };
      } else {
        const text = buildFilmDeliveryText(stage, filmOrder, recipient.customerName);
        results.customer = await sendOnce(admin, `${baseKey}:film_delivery:${stage}`, recipient.lineUserId, text,
          { customer_id: filmOrder.customer_id, order_id, type: `film_delivery_${stage}`, kind, direction: "to_customer" });
      }
    } else if (kind === "new_quotation") {
      if (!document_id) {
        return new Response(JSON.stringify({ error: "missing document_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!(await isStaffUser(userId))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: doc } = await admin.from("rds_documents")
        .select("id, document_no, customer_name, customer_phone, grand_total, status, project_name, customer_id")
        .eq("id", document_id).maybeSingle();
      if (!doc) return new Response(JSON.stringify({ error: "doc not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const urls = docUrls(origin, document_id, doc.document_no);
      const text = buildNewQuotationAdminMessage({
        document_no: doc.document_no,
        customer_name: doc.customer_name,
        customer_phone: doc.customer_phone,
        project_type: doc.project_name,
        grand_total: doc.grand_total,
        ...urls,
      });
      const recipients = await loadAdminRecipients(admin);
      const admins: Record<string, unknown> = {};
      for (const to of recipients) {
        admins[to] = await sendOnce(admin, `${baseKey}:admin:${to}`, to, text,
          { document_id, type: kind, kind, direction: "to_admin" });
      }
      results.admin = admins;
      let custLineId: string | undefined;
      if (doc.customer_id) {
        const { data: prof } = await admin.from("profiles").select("line_user_id").eq("id", doc.customer_id).maybeSingle();
        custLineId = (prof?.line_user_id as string | undefined) || undefined;
      }
      if (custLineId && !recipients.includes(custLineId)) {
        results.customer_oa_log = await sendOnce(admin, `${baseKey}:cust_oa`, custLineId, text,
          { customer_id: doc.customer_id, document_id, type: "new_quotation_oa_log", kind, direction: "to_customer" });
      }
    } else if (kind === "purchase_order") {
      if (!purchase_order_id) {
        return new Response(JSON.stringify({ error: "missing purchase_order_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: po } = await admin
        .from("customer_purchase_orders")
        .select("id, po_number, user_id, customer_name, customer_phone, school_or_org, items, subtotal, request_quotation, request_delivery_note")
        .eq("id", purchase_order_id)
        .maybeSingle();
      if (!po) return new Response(JSON.stringify({ error: "purchase order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if ((po as any).user_id !== userId && !(await isStaffUser(userId))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const text = buildPurchaseOrderAdminMessage({
        po_number: (po as any).po_number,
        customer_name: (po as any).customer_name,
        customer_phone: (po as any).customer_phone,
        organization: (po as any).school_or_org,
        subtotal: (po as any).subtotal,
        request_quotation: (po as any).request_quotation,
        request_delivery_note: (po as any).request_delivery_note,
        items_count: Array.isArray((po as any).items) ? (po as any).items.length : null,
      });
      const recipients = await loadAdminRecipients(admin);
      const admins: Record<string, unknown> = {};
      for (const to of recipients) {
        admins[to] = await sendOnce(admin, `${baseKey}:admin:${to}`, to, text,
          { type: kind, kind, direction: "to_admin", ref_id: purchase_order_id });
      }
      results.admin = admins;
    } else if (kind === "link_confirm") {
      // After OAuth link, send confirm to the user themselves
      const { data: prof } = await admin.from("profiles").select("line_user_id, full_name").eq("id", userId).maybeSingle();
      const lineId = prof?.line_user_id as string | undefined;
      if (!lineId) return new Response(JSON.stringify({ error: "no line linked" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = buildLinkConfirmMessage(prof?.full_name);
      results.customer = await sendOnce(admin, `${baseKey}:link`, lineId, text,
        { customer_id: userId, type: kind, kind, direction: "to_customer" });
    } else if (kind === "shop_work_order") {
      // Shop (นัฐภรณ์): fired by the customer from MyOrderDetail. The RPC-based
      // ownership check runs on the client (only owners see the button); here
      // we accept the request and forward to admin recipients.
      if (!order_id) {
        return new Response(JSON.stringify({ error: "missing order_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const order: any = await admin
        .from("orders")
        .select("id, order_no, customer_id, total, note, guest_name, guest_phone, school_name, organizations(name)")
        .eq("id", order_id).maybeSingle().then((r: any) => r.data);
      if (!order) return new Response(JSON.stringify({ error: "order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Only owner (customer_id === userId) or staff may trigger.
      if (order.customer_id && order.customer_id !== userId && !(await isStaffUser(userId))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const urls = orderUrls(origin, order_id);
      const text = buildShopWorkOrderAdminMessage({
        order_no: order.order_no,
        customer_name: order.organizations?.name || order.school_name || order.guest_name || "ลูกค้า",
        customer_phone: order.guest_phone || null,
        project_type: order.note || null,
        total: order.total,
        ...urls,
      });
      const recipients = await loadAdminRecipients(admin);
      const admins: Record<string, unknown> = {};
      const nonce = String((body as any).idempotency_key || Date.now());
      for (const to of recipients) {
        admins[to] = await sendOnce(admin, `shop_work_order:${order_id}:${nonce}:admin:${to}`, to, text,
          { order_id, type: kind, kind, direction: "to_admin" });
      }
      results.admin = admins;
    } else if (kind === "admin_test") {
      // Send a test message to the admin line ID (staff only)
      const logActivity = async (detail: any) => {
        try {
          await admin.from("activity_logs").insert({
            user_id: userId, action: "line_admin_test", detail,
          });
        } catch (e) { console.warn("activity log", e); }
      };
      if (!(await isStaffUser(userId))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!LINE_ADMIN) {
        results.admin = { ok: false, skipped: true, reason: "LINE_ADMIN_USER_ID not configured",
          remediation: "ตั้งค่า secret LINE_ADMIN_USER_ID ให้เป็น User ID ของแอดมิน (รูปแบบ U + hex 32 ตัว)" };
        await logActivity({ ok: false, reason: "missing_admin_user_id" });
        return new Response(JSON.stringify({ ok: false, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Realtime shape validation — surface a clear remediation message
      const adminShapeOk = /^U[0-9a-f]{32}$/.test(LINE_ADMIN);
      if (!adminShapeOk) {
        results.admin = { ok: false, skipped: true, reason: "LINE_ADMIN_USER_ID format invalid",
          remediation: "ค่า LINE_ADMIN_USER_ID ต้องขึ้นต้นด้วย U ตามด้วย hex 32 ตัว (รวม 33 ตัว) — คัดลอกมาจาก /admin/line-webhook-events" };
        await logActivity({ ok: false, reason: "admin_user_id_bad_shape" });
        return new Response(JSON.stringify({ ok: false, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const text = "ทดสอบการส่งข้อความจากระบบ\nหากได้รับข้อความนี้ แสดงว่า LINE_ADMIN_USER_ID ถูกต้อง";
      results.admin = await sendTestNow(admin, `${baseKey}:admin_test`, LINE_ADMIN, text,
        { type: kind, kind, direction: "to_admin" });
      await logActivity(results.admin);
    } else if (kind === "test_recipient") {
      // ปิดถาวร: ระบบแจ้งเตือนเข้ากลุ่ม LINE เท่านั้น ไม่มีการทดสอบส่งหาแชทส่วนตัว
      return new Response(JSON.stringify({
        error: "gone",
        remediation: "ระบบส่งแจ้งเตือนเข้ากลุ่ม LINE เท่านั้น — ใช้ปุ่มทดสอบของกลุ่มแจ้งเตือนแทน",
      }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else {
      return new Response(JSON.stringify({ error: "invalid kind" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Nudge the worker so queued messages leave within seconds.
    await kickDispatch(admin);

    return new Response(JSON.stringify({ ok: true, queued: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("line-notify error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});