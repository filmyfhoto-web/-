// Server-side sender for the admin LINE group.
//
// SECURITY: the caller may only pass a *notification record id*. The
// destination and the channel access token are resolved on the server, so a
// compromised client can never push to an arbitrary LINE destination. Errors
// are stored redacted (no token, no groupId, no message body).

import { createClient } from "npm:@supabase/supabase-js@2";
import { pushLineMessages } from "../_shared/linePush.ts";
import { loadLineChannels } from "../_shared/lineChannels.ts";
import { buildTestFlex, maskDestination, NOTIFY_KINDS } from "../_shared/adminGroupCommands.ts";
import { buildOrderGroupText } from "../_shared/orderGroupNotify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COOLDOWN_MS = 30_000;
const MAX_ATTEMPTS = 3;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- caller must be a signed-in owner/admin -------------------------------
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data: userRes } = await admin.auth.getUser(jwt);
  const uid = userRes?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "owner" || r.role === "admin");
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const notificationId: string | null = body?.notification_id ?? null;
  const storeId: string = String(body?.store_id || "default");
  // "admin_group" = ห้องแอดมิน, "queue_group" = คิว NATTA.Q, "doc_group" = ออกเอกสาร,
  // "order_group" = กลุ่มแจ้งเตือนคำสั่งซื้อจากเว็บแอปลูกค้า
  const channelType: string = ["queue_group", "doc_group", "order_group"].includes(
    String(body?.channel_type || ""),
  )
    ? String(body.channel_type)
    : "admin_group";
  // ตอนนี้ผูกได้หลายห้องต่อประเภท — ระบุห้องตรงๆ ได้
  const channelId: string | null = body?.channel_id ? String(body.channel_id) : null;
  // dry-run = ส่งการ์ด "คำสั่งซื้อใหม่" ของจริง (ข้อความชุดเดียวกับตอนลูกค้าสั่งซื้อ)
  // แต่ใช้ข้อมูลตัวอย่าง และไม่แตะออเดอร์/สต๊อกใด ๆ
  const dryRunOrder: boolean = body?.dry_run_order === true;
  const kind: string = notificationId ? "notification" : "test";
  // ปุ่ม "ลองส่งใหม่" ของแอดมิน — ข้าม dedup/cooldown แล้วส่งซ้ำจริง
  const force: boolean = body?.force === true;

  // --- resolve destination server-side --------------------------------------
  let chQuery = admin
    .from("line_notification_channels")
    .select("id, line_destination_id, is_active, store_id, channel_type")
    .eq("is_active", true)
    // ส่งได้เฉพาะกลุ่ม/ห้องที่เชิญบอทเข้าไปแล้ว — ห้ามส่งแชทส่วนตัวของ OA (U...)
    .or("line_destination_id.like.C%,line_destination_id.like.R%")
    .order("is_hub", { ascending: false })
    .limit(1);
  chQuery = channelId
    ? chQuery.eq("id", channelId)
    : chQuery.eq("store_id", storeId).eq("channel_type", channelType);
  const { data: chRows } = await chQuery;
  const ch = (chRows ?? [])[0] as { id: string; line_destination_id: string } | undefined;

  if (!ch?.line_destination_id) return json({ error: "no_active_admin_group" }, 409);
  if (!/^[CR]/.test(ch.line_destination_id)) {
    return json({ error: "not_a_group_destination" }, 409);
  }

  const channels = await loadLineChannels(admin);
  // ห้อง "รันคิว" ส่งด้วยบอท NATTA.Q AI (runqueue) เสมอ ไม่ว่าจะมาจากร้านไหน
  const destStore =
    String((ch as any).channel_type || channelType) === "queue_group"
      ? "runqueue"
      : String((ch as any).store_id || storeId);
  const token =
    channels.find((c) => c.id === destStore)?.token ||
    channels.find((c) => c.token)?.token ||
    "";
  if (!token) return json({ error: "line_not_configured" }, 409);

  // --- build the message -----------------------------------------------------
  let messages: unknown[] = [buildTestFlex()];
  let idem = `test:${ch.id}:${Math.floor(Date.now() / COOLDOWN_MS)}`;
  if (dryRunOrder && !notificationId) {
    const origin = (Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("PUBLIC_APP_ORIGIN") || "https://www.filmyynatta.com").replace(/\/$/, "");
    const now = new Date().toISOString();
    const sampleId = `dryrun-${Date.now()}`;
    const text = [
      "🧪 ทดสอบระบบ (dry-run) — ไม่ใช่ออเดอร์จริง",
      buildOrderGroupText(
        {
          orderId: sampleId,
          orderNo: "TEST-0000",
          customerName: "ลูกค้าทดสอบ",
          itemCount: 2,
          total: 1250,
          source: "เว็บแอปลูกค้า",
          createdAt: now,
        },
        `${origin}/admin/customer-purchase-orders`,
      ),
    ].join("\n");
    messages = [{ type: "text", text }];
    idem = `order_dryrun:${ch.id}:${Date.now()}`;
  } else if (notificationId) {
    const { data: n } = await admin
      .from("film_ops_notifications")
      .select("id, title, body, kind, severity, order_id, group_no")
      .eq("id", notificationId)
      .maybeSingle();
    if (!n) return json({ error: "notification_not_found" }, 404);
    idem = `notify:${ch.id}:${n.id}`;
    const label = NOTIFY_KINDS.includes(String(n.kind) as any) ? String(n.kind) : String(n.severity || "แจ้งเตือน");
    const origin = Deno.env.get("PUBLIC_APP_ORIGIN") || "https://filmyynatta.com";
    // เปิดหน้าที่ถูกต้องและไฮไลต์รายการนั้นทันที
    const page = n.order_id
      ? "orders"
      : (Number(n.group_no) === 2 || String(n.kind || "").startsWith("nattaq") ? "inbox" : "alerts");
    const params = new URLSearchParams({ p: page, n: String(n.id) });
    if (n.order_id) params.set("o", String(n.order_id));
    const openUrl = `${origin}/receipts/film?${params.toString()}`;
    const title = String(n.title || "").slice(0, 200);
    const bodyText = n.body ? String(n.body).slice(0, 600) : "";
    // ปุ่มจัดการในตัวแจ้งเตือน: เปิดรายการทันที / รับเรื่อง / อ่านแล้ว
    messages = [{
      type: "flex",
      altText: `[${label}] ${title}`,
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box", layout: "vertical", spacing: "sm",
          contents: [
            { type: "text", text: `[${label}]`, size: "xs", color: "#8A6A78", weight: "bold" },
            { type: "text", text: title || "แจ้งเตือน", size: "sm", weight: "bold", wrap: true },
            ...(bodyText ? [{ type: "text", text: bodyText, size: "xs", color: "#666666", wrap: true }] : []),
          ],
        },
        footer: {
          type: "box", layout: "vertical", spacing: "sm",
          contents: [
            { type: "button", style: "primary", height: "sm", color: "#6B1E3C",
              action: { type: "uri", label: "เปิดรายการ", uri: openUrl } },
            { type: "box", layout: "horizontal", spacing: "sm", contents: [
              { type: "button", style: "secondary", height: "sm",
                action: { type: "postback", label: "รับเรื่อง", data: `opsn:ack:${n.id}`, displayText: "รับเรื่องแล้ว" } },
              { type: "button", style: "secondary", height: "sm",
                action: { type: "postback", label: "อ่านแล้ว", data: `opsn:read:${n.id}`, displayText: "อ่านแล้ว" } },
            ] },
          ],
        },
      },
    }];
  }
  if (force) idem = `${idem}:retry:${Date.now()}`;

  // --- dedup / cooldown ------------------------------------------------------
  const { data: prior } = await admin
    .from("line_delivery_logs")
    .select("id, status, attempts, created_at")
    .eq("idempotency_key", idem)
    .maybeSingle();
  if (prior && (prior.status === "sent" || (prior.attempts ?? 0) >= MAX_ATTEMPTS)) {
    return json({ ok: true, deduplicated: true, status: prior.status });
  }

  // --- membership pre-check --------------------------------------------------
  // LINE answers a bare 400 "Failed to send messages" when the bot is not (or no
  // longer) a member of the destination. Detect that up front so the admin gets
  // an actionable message instead of an opaque 502.
  const dest = ch.line_destination_id;
  const scope = dest.startsWith("C") ? "group" : dest.startsWith("R") ? "room" : null;
  if (scope) {
    const probe = await fetch(`https://api.line.me/v2/bot/${scope}/${dest}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (probe && probe.status === 404) {
      await probe.text().catch(() => "");
      await admin.from("line_notification_channels").update({
        is_active: false,
        last_test_status: "failed",
        last_test_at: new Date().toISOString(),
      }).eq("id", ch.id);
      await admin.from("line_delivery_logs").insert({
        channel_id: ch.id,
        notification_id: notificationId,
        kind,
        status: "failed",
        error_code: "bot_not_in_group",
        attempts: (prior?.attempts ?? 0) + 1,
        idempotency_key: idem,
        sender_store_id: destStore,
        updated_at: new Date().toISOString(),
      });
      return json({
        ok: false,
        error_code: "bot_not_in_group",
        error: "บอทไม่ได้อยู่ในห้องนี้แล้ว — เชิญบอท LINE OA เข้ากลุ่มอีกครั้ง แล้วพิมพ์ “เชื่อมห้องแอดมิน” ในกลุ่มเพื่อผูกใหม่",
        deduplicated: false,
      }, 200);
    }
    if (probe) await probe.text().catch(() => "");
  }

  const res = await pushLineMessages(token, ch.line_destination_id, messages, idem);
  const errorCode = res.ok ? null : (res.status ? `http_${res.status}` : "network_error");

  const logRow = {
    channel_id: ch.id,
    notification_id: notificationId,
    kind,
    status: res.ok ? "sent" : "failed",
    error_code: errorCode,
    provider_message_id: res.providerMessageId ?? null,
    attempts: (prior?.attempts ?? 0) + 1,
    idempotency_key: idem,
    sender_store_id: destStore,
    updated_at: new Date().toISOString(),
  };
  if (prior) await admin.from("line_delivery_logs").update(logRow).eq("id", prior.id);
  else await admin.from("line_delivery_logs").insert(logRow);

  await admin.from("line_notification_channels").update({
    last_test_status: kind === "test" ? (res.ok ? "success" : "failed") : undefined,
    last_test_at: kind === "test" ? new Date().toISOString() : undefined,
    last_verified_at: res.ok ? new Date().toISOString() : undefined,
  }).eq("id", ch.id);

  console.log(`send-line-notification ${kind} → ${maskDestination(ch.line_destination_id)} ok=${res.ok}`);
  return json({
    ok: res.ok,
    error_code: errorCode,
    error: res.ok
      ? null
      : errorCode === "http_400"
        ? "LINE ปฏิเสธข้อความ (400) — ตรวจว่าบอทยังอยู่ในห้องและโทเคนของร้านถูกต้อง"
        : `ส่งไม่สำเร็จ (${errorCode})`,
    deduplicated: res.deduplicated ?? false,
  }, 200);
});
