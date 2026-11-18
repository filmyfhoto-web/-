// Film Shop Inbox — staff → customer outbound message (LINE push).
//
// Credentials never leave the server: the channel token is resolved here from
// the same registry the webhook uses. The frontend only sends conversation_id,
// text and a client idempotency key.
import { createClient } from "npm:@supabase/supabase-js@2";
import { pushLineMessages } from "../_shared/linePush.ts";
import { loadLineChannels } from "../_shared/lineChannels.ts";
import { recordMessage, touchConversation, messagePreview } from "../_shared/inboxStore.ts";
import {
  buildLineAttachmentMessages,
  validateOutboundAttachments,
  type NormalizedAttachment,
} from "../_shared/inboxAttachments.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const REASON_TH: Record<string, string> = {
  unauthorized: "กรุณาเข้าสู่ระบบอีกครั้ง",
  forbidden: "ไม่มีสิทธิ์ส่งข้อความให้ลูกค้า",
  invalid_json: "รูปแบบข้อมูลไม่ถูกต้อง",
  missing_params: "ข้อมูลไม่ครบ กรุณาลองใหม่",
  conversation_not_found: "ไม่พบบทสนทนานี้",
  not_configured: "ยังไม่ได้ตั้งค่า LINE OA ของร้านนี้",
  no_recipient: "บทสนทนานี้ยังไม่มีปลายทาง LINE",
  line_api_error: "LINE ตอบกลับข้อผิดพลาด ลองส่งใหม่อีกครั้ง",
  exception: "เกิดข้อผิดพลาดชั่วคราว",
  message_not_found: "ไม่พบข้อความที่ต้องการส่งใหม่",
  retry_not_allowed: "ส่งใหม่ได้เฉพาะข้อความที่ส่งไม่สำเร็จเท่านั้น",
  attachment_invalid: "ไฟล์แนบไม่ถูกต้อง",
  attachment_too_many: "แนบไฟล์ได้สูงสุด 4 ไฟล์ต่อข้อความ",
  attachment_path_invalid: "ไฟล์แนบไม่อยู่ในบทสนทนานี้",
  attachment_size_invalid: "ขนาดไฟล์แนบไม่ถูกต้อง",
  attachment_image_too_large: "รูปภาพต้องไม่เกิน 10 MB ตามข้อจำกัดของ LINE",
  attachment_file_too_large: "ไฟล์ต้องไม่เกิน 25 MB",
  attachment_url_failed: "สร้างลิงก์ไฟล์แนบไม่สำเร็จ",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function fail(reason: string, extra: Record<string, unknown> = {}) {
  return json({ ok: false, reason, message_th: REASON_TH[reason] ?? reason, ...extra });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("missing_params");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return fail("unauthorized");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });

  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user) return fail("unauthorized");

  const { data: isStaff } = await admin.rpc("is_staff", { _user_id: user.id });
  if (!isStaff) return fail("forbidden");

  let body: any;
  try { body = await req.json(); } catch { return fail("invalid_json"); }

  const conversationId = String(body?.conversation_id || "");
  const retryMessageId = String(body?.retry_message_id || "");
  let text = String(body?.text ?? "").trim();
  let clientKey = String(body?.idempotency_key || "").slice(0, 120);
  if (!conversationId) return fail("missing_params");

  const { data: conv } = await admin
    .from("film_conversations")
    .select("id, channel, store_id, external_user_id, external_thread_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return fail("conversation_not_found");
  if (conv.channel !== "line") return fail("not_configured", { message_th: "ช่องทางนี้ยังไม่รองรับการตอบกลับ" });

  const to = (conv.external_user_id as string) || (conv.external_thread_id as string) || "";
  if (!to) return fail("no_recipient");

  // Per-store channel resolution ONLY. Falling back to another shop's token
  // would silently send the reply from the wrong Official Account.
  const channels = await loadLineChannels(admin);
  const channel = channels.find((c) => c.id === conv.store_id);
  if (!channel?.token) {
    return fail("not_configured", { setup_required: true, store_id: conv.store_id });
  }

  let messageId: string | null = null;
  let attachments: NormalizedAttachment[] = [];

  if (retryMessageId) {
    // ---- Retry path: reuse the SAME row and the SAME idempotency key. ----
    const { data: prev } = await admin
      .from("film_messages")
      .select("id, conversation_id, direction, delivery_status, text, attachments, idempotency_key")
      .eq("id", retryMessageId)
      .maybeSingle();
    if (!prev || prev.conversation_id !== conversationId || prev.direction !== "outbound") {
      return fail("message_not_found");
    }
    if (prev.delivery_status !== "failed") {
      return fail("retry_not_allowed", { message_id: prev.id, status: prev.delivery_status });
    }
    messageId = prev.id as string;
    text = String(prev.text ?? "").trim();
    clientKey = String(prev.idempotency_key || `retry:${prev.id}`).slice(0, 120);
    attachments = (Array.isArray(prev.attachments) ? prev.attachments : []) as NormalizedAttachment[];
    await admin.from("film_messages")
      .update({ delivery_status: "pending", error_code: null }).eq("id", messageId);
  } else {
    // ---- First send ----
    const validated = validateOutboundAttachments(conversationId, body?.attachments);
    if (!validated.ok) return fail(validated.reason);
    attachments = validated.items;
    if (!clientKey || (!text && attachments.length === 0)) return fail("missing_params");

    // Record as pending first — the unique idempotency index turns a
    // double-click or a retried request into a no-op.
    try {
      const rec = await recordMessage(admin, {
        conversationId,
        direction: "outbound",
        channel: "line",
        text: text || null,
        attachments,
        deliveryStatus: "pending",
        senderUserId: user.id,
        idempotencyKey: clientKey,
      });
      messageId = rec.id;
      if (rec.duplicate) {
        const { data: prev } = await admin.from("film_messages")
          .select("id, delivery_status").eq("idempotency_key", clientKey).maybeSingle();
        // A duplicate key is a double-click: never send twice, whatever the state.
        return json({ ok: true, duplicate: true, message_id: prev?.id ?? null, status: prev?.delivery_status ?? "pending" });
      }
    } catch (e) {
      console.error("inbox outbound record failed", String((e as Error)?.message || e));
      return fail("exception");
    }
  }

  // Build the LINE payload: text first, then image messages, then a link line
  // for every attachment LINE cannot push natively.
  const built = await buildLineAttachmentMessages(admin, attachments);
  const bodyLines = [text, ...built.linkLines].filter(Boolean);
  const messages: unknown[] = [];
  if (bodyLines.length > 0) messages.push({ type: "text", text: bodyLines.join("\n\n").slice(0, 4900) });
  messages.push(...built.messages);

  if (messages.length === 0) {
    if (messageId) {
      await admin.from("film_messages")
        .update({ delivery_status: "failed", error_code: "attachment_url_failed" }).eq("id", messageId);
    }
    return fail("attachment_url_failed", { message_id: messageId, status: "failed" });
  }

  // Push through the shared LINE adapter (retry key = idempotency key, so a
  // retry of a timed-out send is de-duplicated by LINE itself).
  const res = await pushLineMessages(channel.token, to, messages, clientKey);

  const nowIso = new Date().toISOString();
  if (messageId) {
    await admin.from("film_messages").update({
      delivery_status: res.ok ? "sent" : "failed",
      error_code: res.ok ? null : String(res.error || `http_${res.status ?? 0}`).slice(0, 80),
      sent_at: nowIso,
    }).eq("id", messageId);
  }

  if (res.ok) {
    await touchConversation(admin, conversationId, {
      preview: messagePreview(text, attachments.length),
      at: nowIso,
    });
    return json({ ok: true, message_id: messageId, status: "sent", retried: Boolean(retryMessageId) });
  }
  return fail("line_api_error", { message_id: messageId, status: "failed" });
});
