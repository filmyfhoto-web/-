// LINE Messaging API webhook — Mode B fallback for account linking.
// Receives "follow" and "message" events from LINE. When a user sends
// `link XXXXXX` (6-digit code from /account), we bind their LINE userId
// to the corresponding app profile via consume_line_link_code RPC.
//
// LINE retries webhooks on non-2xx; always return 200 unless the request
// is structurally bad. Idempotency is handled by consume_line_link_code
// (the code row's consumed_at gate) and by message id de-dup.

import { replyLineText, replyLineMessages, pushLineMessages } from "../_shared/linePush.ts";
import { broadcastLineLinked } from "../_shared/lineLinkRealtime.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { logCallbackFailure } from "../_shared/logCallbackFailure.ts";
import { ingestFilmJobMessage } from "../_shared/filmJobIntake.ts";
import { autoCreateJobFromChat } from "../_shared/nattaqAutoOrder.ts";
import { detectDocIntent } from "../_shared/docCommandParser.ts";
import { ingestDocCommand, fetchLineAudio, transcribeLineAudio } from "../_shared/docCommandIntake.ts";
import { loadLineChannels, matchChannelBySignature, LINE_CHANNEL_LABELS, type LineChannel } from "../_shared/lineChannels.ts";
import {
  applyIntakeMessage,
  parseIntakeCommand,
  parseIntakePostback,
  buildReviewFlex,
  buildConfirmedFlex,
  validateAttachment,
  type IntakeSession,
} from "../_shared/lineIntakeFlow.ts";
import {
  hitRateLimit,
  loadOpenSession,
  loadSessionById,
  persistSession,
  storeLineAttachment,
  confirmIntakeSession,
  notifyAdminRooms,
  lookupJob,
} from "../_shared/lineIntakeStore.ts";
import {
  parseAdminQuery,
  isMutatingCommand,
  MUTATION_REFUSAL,
  buildSystemStatusText,
  parseQueueChatCommand,
  buildQueueListFlex,
  buildQueueCloseFlex,
  buildQueueTakeFlex,
  queueDenyText,
  buildQueueMenuText,
  withQueueQuickReply,
} from "../_shared/adminRoomQueries.ts";
import {
  canTakeQueueStatus,
  buildTakeUpdate,
  matchEmployeeByIdentity,
  assigneeDisplay,
  normalizeEmail,
  normalizePhone,
} from "../_shared/queueTake.ts";
import {
  postbackToQueueText,
  buildCurrentJobFlex,
  sumItemTotals,
  thaiTime,
} from "../_shared/adminRoomQueries.ts";
import {
  parseDocBotCommand,
  applyDocBotCarryOver,
  buildDocBotMissingText,
  buildDocIssuedFlex,
  DOC_BOT_HELP,
  DOC_BOT_QUICK_REPLY,
  parseDocTemplateRequest,
  buildDocTemplateText,
  DOC_BOT_TEMPLATES,
} from "../_shared/docBotCommands.ts";
import {
  shopKeyFromSlug,
  parseDocOrderRefs,
  hasDocOrderRefs,
  buildAskOrderRefText,
  DOC_ORDER_QUICK_REPLY,
  isDocConfirmText,
  isDocCancelText,
  parseDocEditCommand,
  applyDocEditPatch,
  isDocEditHelpText,
  DOC_EDIT_HELP,
  buildDocPreviewFlex,
  parseOrderSelection,
  mergeSelectedOrders,
  buildOrderPickFlex,
  buildOrderPickSummaryText,
  DOC_ORDER_PICK_QUICK_REPLY,
  type DocOrderCandidate,
} from "../_shared/docBotFlow.ts";
import { issueDocFromLine } from "../_shared/docBotIssue.ts";
import {
  enforceQuotationFirst,
  parseSourceQuotationRef,
  isNextDocType,
} from "../_shared/quotationFirst.ts";
import { createNextDocFromQuotation } from "../_shared/docNextDoc.ts";
import {
  loadDocOnlyRoom,
  loadDocBotRoom,
  lockCommandToRoomShop,
  docOnlyStoreMissingText,
  DOC_ONLY_NOTICE,
} from "../_shared/docOnlyRoom.ts";
import {
  handleNdbPostback,
  handleNdbText,
  ndbSharedRoomText,
  type NdbContext,
} from "../_shared/nattaDocBotHandler.ts";
import {
  isNdbSupportedMessageType,
  ndbUnsupportedFileText,
  ndbUnsupportedMessageText,
} from "../_shared/nattaDocBot.ts";
import { ndbAudit } from "../_shared/nattaDocBotStore.ts";
import {
  NATTA_ATTACH_NO_DRAFT,
  NATTA_NO_PERMISSION,
  parseNattaCommand,
  parseNattaPostback,
} from "../_shared/nattaAccountant.ts";
import {
  handleNattaAccountant,
  handleNattaAttachment,
  handleNattaAudio,
  handleNattaPostback,
} from "../_shared/nattaAccountantHandler.ts";
import {
  fetchLineFile,
  extractDocFile,
  isSupportedDocFile,
  savePendingFileDraft,
  unsupportedDocFileMessage,
  loadPendingFileDraft,
  consumeFileDraft,
  loadLastIssuedDoc,
} from "../_shared/docFileIntake.ts";

/** NATTA.Q: คำที่บ่งชี้ว่าลูกค้ายืนยันสั่งงานในแชท */
const ORDER_INTENT_WORDS = ["คอนเฟิร์ม", "สั่งทำ", "เอาตามนี้", "ยืนยันสั่ง", "จัดเลย", "ทำตามนี้"];
export function detectOrderIntent(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return ORDER_INTENT_WORDS.some((w) => t.includes(w));
}
import {
  upsertConversation,
  recordMessage,
  touchConversation,
  messagePreview,
  type RecordMessageInput,
  type RecordMessageResult,
} from "../_shared/inboxStore.ts";
import {
  createIntakeFormToken,
  intakeFormUrl,
  isQueueIntakeRoom,
  cancelIntakeCardToken,
} from "../_shared/intakeFormLink.ts";
import { buildIntakeSingleCardFlex } from "../_shared/intakeExtractFlex.ts";
import { buildFollowWelcomeMessages } from "./followWelcome.ts";
import {
  buildFaqReply,
  buildOrderCreatedReply,
  buildStatusReply,
  ingestChatOrder,
  parseCustomerCommand,
} from "../_shared/customerLineBot.ts";

import {
  extractIntakeFromLineFile,
  isIntakeAiFile,
  buildIntakeCardSummary,
} from "../_shared/intakeAiExtract.ts";
import {
  parseAdminGroupTarget,
  decideAdminGroupAction,
  maskDestination,
  buildConnectedFlex,
  buildAlreadyLinkedFlex,
  buildTestFlex,
  buildStatusFlex,
  buildCancelConfirmFlex,
  buildTextMessage,
  parseSetStoreCommand,
  parseStoreInfoCommand,
  isHelpCommand,
  matchStore,
  storeLabelOf,
  buildStoreListText,
  buildHelpText,
  buildRoomBindingText,
  buildStoreOverwriteConfirmFlex,
  isConfirmStoreCommand,
  type AdminGroupState,
} from "../_shared/adminGroupCommands.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Optional: allow disabling HMAC only when explicitly opted-in for local dev.
const ALLOW_UNVERIFIED = (Deno.env.get("LINE_WEBHOOK_ALLOW_UNVERIFIED") || "") === "1";

/** Inbox writes must never break the webhook — swallow and report null. */
async function recordMessageSafe(admin: any, input: RecordMessageInput): Promise<RecordMessageResult | null> {
  try {
    return await recordMessage(admin, input);
  } catch (e) {
    console.warn("inbox recordMessage failed", String((e as Error)?.message || e));
    return null;
  }
}

/** ร้านที่ผูกกับห้องนี้ (ใช้เติมชื่อร้านให้เอกสารอัตโนมัติ) */
async function resolveRoomStore(admin: any, groupId: string | null) {
  const out: {
    storeId: string | null;
    storeLabel: string | null;
    storeSlug: string | null;
    shopKey: "film" | "colorlab" | "printing" | null;
  } = { storeId: null, storeLabel: null, storeSlug: null, shopKey: null };
  if (!groupId) return out;
  const { data: ch } = await admin
    .from("line_notification_channels")
    .select("store_id")
    .eq("line_destination_id", groupId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const storeId = (ch?.store_id as string | null) ?? null;
  if (!storeId || !/^[0-9a-f-]{36}$/i.test(storeId)) return out;
  out.storeId = storeId;
  const { data: st } = await admin.from("rds_stores").select("id, name, slug").eq("id", storeId).maybeSingle();
  out.storeLabel = ((st?.name as string | null) ?? "").trim() || null;
  out.storeSlug = ((st?.slug as string | null) ?? null);
  out.shopKey = shopKeyFromSlug(st?.slug as string | null);
  return out;
}

/** ดึงออเดอร์จริงเป็นรายใบ ตามเลขที่ออเดอร์ หรือช่วงวันที่ (+ชื่อลูกค้าถ้ามี) */
async function loadOrderCandidates(
  admin: any,
  refs: { orderNos: string[]; from?: string; to?: string },
  customerName?: string | null,
): Promise<DocOrderCandidate[]> {
  let q = admin.from("film_orders").select("id, order_no, customer_name, customer_phone, created_at").eq("is_test", false);
  if (refs.orderNos.length) {
    q = q.in("order_no", refs.orderNos);
  } else if (refs.from && refs.to) {
    q = q.gte("created_at", `${refs.from}T00:00:00+07:00`).lte("created_at", `${refs.to}T23:59:59+07:00`);
    if (customerName?.trim()) q = q.ilike("customer_name", `%${customerName.trim()}%`);
  } else {
    return [];
  }
  const { data: orders } = await q.order("created_at", { ascending: true }).limit(20);
  const rows = (orders ?? []) as any[];
  if (!rows.length) return [];
  const { data: itemRows } = await admin
    .from("film_order_items")
    .select("order_id, description, quantity, unit, unit_price, sort_order")
    .in("order_id", rows.map((o) => o.id))
    .order("sort_order", { ascending: true });
  const byOrder = new Map<string, any[]>();
  for (const i of ((itemRows ?? []) as any[])) {
    if (!(Number(i.quantity) > 0 && Number(i.unit_price) > 0)) continue;
    const list = byOrder.get(String(i.order_id)) ?? [];
    list.push(i);
    byOrder.set(String(i.order_id), list);
  }
  const candidates: DocOrderCandidate[] = [];
  for (const o of rows) {
    const items = (byOrder.get(String(o.id)) ?? []).map((i) => ({
      description: String(i.description || "รายการ"),
      quantity: Number(i.quantity),
      unit: String(i.unit || "ชิ้น"),
      unitPrice: Number(i.unit_price),
      discount: 0,
      total: Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100,
    }));
    if (!items.length) continue;
    candidates.push({
      orderNo: String(o.order_no ?? ""),
      customerName: (o.customer_name as string | null) || null,
      customerPhone: (o.customer_phone as string | null) || null,
      dateText: String(o.created_at ?? "").slice(0, 10),
      items,
      total: items.reduce((s, i) => s + i.total, 0),
    });
  }
  return candidates;
}

/** รวมทุกออเดอร์ที่พบเป็นชุดรายการเดียว (ใช้เมื่อระบุเลขที่ออเดอร์ตรง ๆ) */
async function loadOrderItemsForDoc(
  admin: any,
  refs: { orderNos: string[]; from?: string; to?: string },
  customerName?: string | null,
) {
  const candidates = await loadOrderCandidates(admin, refs, customerName);
  if (!candidates.length) return null;
  return mergeSelectedOrders(candidates, candidates.map((_, i) => i + 1));
}

const previewRef = (groupId: string) => `preview:${groupId}`;
const orderPickRef = (groupId: string) => `orderpick:${groupId}`;

async function savePreviewCommand(admin: any, groupId: string, command: any, lineUserId: string | null) {
  const f = command.fields;
  const t = command.totals;
  await admin.from("document_command_drafts").delete().eq("temp_ref", previewRef(groupId));
  await admin.from("document_command_drafts").insert({
    temp_ref: previewRef(groupId),
    doc_type: command.docType,
    shop_key: f.shopKey ?? "film",
    customer_name: f.customerName ?? null,
    customer_phone: f.customerPhone ?? null,
    customer_address: f.customerAddress ?? null,
    customer_tax_id: f.customerTaxId ?? null,
    project: f.project ?? null,
    notes: f.notes ?? null,
    discount: f.discount,
    vat_mode: f.vatMode,
    vat_rate: f.vatRate,
    wht_rate: f.whtRate,
    deposit: f.deposit,
    payment_status: f.paymentStatus,
    payment_method: f.paymentMethod ?? null,
    due_at: f.dueAtISO ?? null,
    subtotal: t.subtotal,
    vat_amount: t.vatAmount,
    wht_amount: t.whtAmount,
    total: t.total,
    missing_fields: command.missing ?? [],
    status: "draft",
    source: "line",
    parsed: { preview: command, room_id: groupId },
    line_user_id: lineUserId,
  });
}

async function loadPreviewCommand(admin: any, groupId: string | null) {
  if (!groupId) return null;
  const { data } = await admin
    .from("document_command_drafts")
    .select("id, parsed")
    .eq("temp_ref", previewRef(groupId))
    .eq("status", "draft")
    .maybeSingle();
  const cmd = (data?.parsed as any)?.preview;
  return cmd ? { id: data.id as string, command: cmd } : null;
}

async function clearPreviewCommand(admin: any, groupId: string) {
  await admin.from("document_command_drafts").delete().eq("temp_ref", previewRef(groupId));
}

/** เก็บรายการออเดอร์ที่รอให้เลือก (ช่วงวันที่เดียว หลายออเดอร์) */
async function saveOrderPick(
  admin: any,
  groupId: string,
  payload: { candidates: DocOrderCandidate[]; command: any; from?: string; to?: string },
  lineUserId: string | null,
) {
  await admin.from("document_command_drafts").delete().eq("temp_ref", orderPickRef(groupId));
  await admin.from("document_command_drafts").insert({
    temp_ref: orderPickRef(groupId),
    doc_type: payload.command.docType,
    shop_key: payload.command.fields.shopKey ?? "film",
    customer_name: payload.command.fields.customerName ?? null,
    status: "draft",
    source: "line",
    parsed: { order_pick: payload, room_id: groupId },
    line_user_id: lineUserId,
  });
}

async function loadOrderPick(admin: any, groupId: string | null) {
  if (!groupId) return null;
  const { data } = await admin
    .from("document_command_drafts")
    .select("id, parsed")
    .eq("temp_ref", orderPickRef(groupId))
    .eq("status", "draft")
    .maybeSingle();
  const pick = (data?.parsed as any)?.order_pick;
  return pick?.candidates?.length ? (pick as { candidates: DocOrderCandidate[]; command: any; from?: string; to?: string }) : null;
}

async function clearOrderPick(admin: any, groupId: string) {
  await admin.from("document_command_drafts").delete().eq("temp_ref", orderPickRef(groupId));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const raw = await req.text();
  const sig = req.headers.get("x-line-signature");

  // Best-effort logger — never let logging failures block the webhook response.
  const logger = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Every shop's OA points at this same URL — resolve which one signed it.
  // แยก URL รายร้านได้ด้วย ?ch=default / ?ch=shop2 หรือ path /line-webhook/shop2
  const reqUrl = new URL(req.url);
  const pathTail = reqUrl.pathname.replace(/\/+$/, "").split("/").pop() || "";
  const wantedChannel =
    (reqUrl.searchParams.get("ch") || reqUrl.searchParams.get("shop") ||
      (pathTail && pathTail !== "line-webhook" ? pathTail : "")).trim();

  const allChannels = await loadLineChannels(logger);
  const channels = wantedChannel
    ? allChannels.filter((c) => c.id === wantedChannel || c.id === `${wantedChannel}:env`)
    : allChannels;
  if (wantedChannel && channels.length === 0) {
    console.warn("line-webhook: unknown channel in URL", wantedChannel);
    return new Response(JSON.stringify({ ok: false, error: "unknown_channel" }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  let channel: LineChannel | null = matchChannelBySignature(channels, raw, sig);
  if (!channel && ALLOW_UNVERIFIED && channels.every((c) => !c.secret)) {
    console.warn("line-webhook: no channel secret configured — accepting (DEV ONLY)");
    channel = { id: "dev", label: "dev", secret: "", token: "" };
  }
  const sigOk = Boolean(channel);
  const LINE_TOKEN = channel?.token || "";

  async function reply(replyToken: string, text: string) {
    if (!LINE_TOKEN || !replyToken) return;
    try {
      await replyLineText(LINE_TOKEN, replyToken, text);
    } catch (e) {
      console.warn("line reply failed", e);
    }
  }

  async function getProfile(
    userId: string,
  ): Promise<{ displayName?: string; pictureUrl?: string; statusMessage?: string } | null> {
    if (!userId) return null;
    if (!LINE_TOKEN) return null;
    // Retry only on 429/5xx; never on 4xx (invalid token / user not a friend).
    for (let i = 0; i < 3; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      try {
        const r = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          headers: { Authorization: `Bearer ${LINE_TOKEN}` },
          signal: ctrl.signal,
        });
        if (r.ok) return await r.json();
        if (r.status !== 429 && r.status < 500) return null;
      } catch {
        /* network error — retry */
      } finally {
        clearTimeout(timer);
      }
      await new Promise((res) => setTimeout(res, 300 * 2 ** i));
    }
    return null;
  }

  /**
   * Keep the per-store customer profile fresh. Data is keyed by
   * (store_id, line_user_id) so the same person writing to two shops stays
   * two separate rows and can never leak across stores.
   */
  async function syncStoreCustomer(
    adminClient: any,
    userId: string,
    prof?: { displayName?: string; pictureUrl?: string; statusMessage?: string } | null,
  ) {
    const storeId = channel?.id || "default";
    const profile = prof ?? (await getProfile(userId));
    try {
      await adminClient.from("line_store_customers").upsert({
        store_id: storeId,
        line_user_id: userId,
        display_name: profile?.displayName ?? null,
        picture_url: profile?.pictureUrl ?? null,
        status_message: profile?.statusMessage ?? null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,line_user_id" });
    } catch (e) {
      console.warn("syncStoreCustomer failed", e);
    }
    if (profile?.displayName || profile?.pictureUrl) {
      try {
        await adminClient.from("line_account_links").upsert({
          line_user_id: userId,
          display_name: profile?.displayName ?? null,
          picture_url: profile?.pictureUrl ?? null,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: "line_user_id" });
      } catch (e) {
        console.warn("line_account_links upsert failed", e);
      }
    }
    return profile;
  }

  async function logEvent(row: Record<string, unknown>) {
    try {
      // audit trail: เวลาที่ประมวลผลเสร็จ + ระยะเวลา (คำนวณจาก __startedAt ถ้าส่งมา)
      const startedAt = Number((row as { __startedAt?: number }).__startedAt ?? 0);
      const clean = { ...row } as Record<string, unknown>;
      delete (clean as { __startedAt?: number }).__startedAt;
      await logger.from("line_webhook_events").insert({
        channel_id: channel?.id ?? null,
        channel_label: channel?.label ?? (channel?.id ? LINE_CHANNEL_LABELS[channel.id] ?? null : null),
        destination: (() => { try { return JSON.parse(raw)?.destination ?? null; } catch { return null; } })(),
        processed_at: new Date().toISOString(),
        duration_ms: startedAt ? Math.max(0, Date.now() - startedAt) : null,
        ...clean,
      });
    }
    catch (e) { console.warn("log webhook event failed", e); }
  }

  if (!sigOk) {
    console.warn("line-webhook signature mismatch");
    // Health probes / empty bodies ({} with no events) are not real LINE
    // deliveries — logging them floods the event table.
    let hasEvents = false;
    try { hasEvents = Array.isArray(JSON.parse(raw)?.events) && JSON.parse(raw).events.length > 0; } catch { /* ignore */ }
    if (!hasEvents) {
      return new Response("bad signature", { status: 401, headers: corsHeaders });
    }
    await logEvent({
      signature_ok: false,
      event_type: "signature_mismatch",
      raw: {
        headers: { "x-line-signature": sig ? "present" : "missing" },
        // Bot user id of the channel that sent this event — use it to pick the
        // right Messaging API channel when fixing the secret.
        destination: (() => { try { return JSON.parse(raw)?.destination ?? null; } catch { return null; } })(),
        secrets_tried: channels.filter((c) => c.secret).length,
        channels_known: channels.map((c) => c.id),
        body_preview: raw.slice(0, 300),
      },
      handler_error: "HMAC signature verification failed — ตรวจสอบ LINE_CHANNEL_SECRET ว่าตรงกับ channel ที่ส่ง webhook",
    });
    await logCallbackFailure({
      reason: "signature_mismatch",
      source: "line-webhook",
      status: 401,
      error: "HMAC signature verification failed",
      req,
      detail: {
        signature_header: sig ? "present" : "missing",
        body_preview: raw.slice(0, 200),
      },
    });
    return new Response("bad signature", { status: 401, headers: corsHeaders });
  }

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { /* ignore */ }
  const events: any[] = Array.isArray(payload.events) ? payload.events : [];

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Fast-ack: LINE ตัด timeout ที่ ~1 วินาที ────────────────────────────
  // งานหนักทั้งหมด (Profile API, storage, AI, LINE reply) ถูกย้ายไปทำเบื้องหลัง
  // ด้วย EdgeRuntime.waitUntil เพื่อให้ตอบ 200 กลับทันที และไม่เกิด redelivery
  // ซ้ำจากฝั่ง LINE. Idempotency ยังคงกันซ้ำด้วย line_webhook_dedup + unique
  // index บน film_messages.external_message_id
  const work = (async () => {
  if (events.length === 0) {
    await logEvent({
      signature_ok: true,
      event_type: "verify",
      raw: payload,
      handler_result: "verification ping (no events)",
    });
  }

  for (const ev of events) {
    // Idempotency: LINE retries deliveries, so process each webhookEventId once.
    const webhookEventId: string | undefined = ev?.webhookEventId;
    if (webhookEventId) {
      const { error: dupErr } = await admin
        .from("line_webhook_dedup")
        .insert({ webhook_event_id: webhookEventId, store_id: channel?.id ?? null });
      if (dupErr) {
        console.log("duplicate webhook event skipped");
        continue;
      }
    }
    const baseLog = {
      signature_ok: true,
      event_type: String(ev?.type || "unknown"),
      source_user_id: (ev?.source?.userId as string) || null,
      message_text: ev?.message?.type === "text" ? String(ev.message.text || "").slice(0, 1000) : null,
      reply_token: (ev?.replyToken as string) || null,
      raw: ev,
      // audit: ห้องกลุ่มที่แมป + จุดเริ่มจับเวลาของ event นี้
      group_id: (ev?.source?.groupId as string) || (ev?.source?.roomId as string) || null,
      ref_code: (ev?.webhookEventId as string) || (ev?.message?.id as string) || null,
      __startedAt: Date.now(),
    };
    try {
      const lineUserId: string | undefined = ev?.source?.userId;
      const replyToken: string | undefined = ev?.replyToken;

      /* ------------- Film Shop Inbox: normalize inbound messages ----------- */
      // Runs BEFORE every other handler so a DM is always visible in the inbox,
      // even when the intake state machine consumes the message afterwards.
      // Failures here are swallowed inside ingestInboundMessage: the inbox must
      // never break the existing LINE flows.
      if (
        ev.type === "message" &&
        lineUserId &&
        (ev?.source?.type ?? "user") === "user"
      ) {
        const m = ev.message ?? {};
        const mType = String(m.type || "");
        let cachedName: string | null = null;
        let cachedAvatar: string | null = null;
        try {
          const { data: cust } = await admin
            .from("line_store_customers")
            .select("display_name, picture_url")
            .eq("store_id", channel?.id || "default")
            .eq("line_user_id", lineUserId)
            .maybeSingle();
          cachedName = (cust?.display_name as string) ?? null;
          cachedAvatar = (cust?.picture_url as string) ?? null;
        } catch { /* profile cache is cosmetic */ }

        // ยังไม่เคยเก็บชื่อ/รูป → ดึงจาก LINE Profile API ทันที เพื่อให้ห้องแชต
        // มีรูปโปรไฟล์ตั้งแต่ข้อความแรก (แล้ว cache ลง line_store_customers)
        if (!cachedAvatar || !cachedName) {
          try {
            const fresh = await syncStoreCustomer(admin, lineUserId);
            cachedName = cachedName ?? fresh?.displayName ?? null;
            cachedAvatar = cachedAvatar ?? fresh?.pictureUrl ?? null;
          } catch { /* profile fetch is cosmetic */ }
        }

        const convId = await upsertConversation(admin, {
          channel: "line",
          storeId: channel?.id || "default",
          externalThreadId: lineUserId,
          externalUserId: lineUserId,
          displayName: cachedName,
          avatarUrl: cachedAvatar ?? null,
        });

        if (convId) {
          const attachments: Array<Record<string, unknown>> = [];
          if (mType !== "text" && m.id && LINE_TOKEN) {
            const stored = await storeLineAttachment(admin, LINE_TOKEN, {
              messageId: String(m.id),
              sessionId: convId, // private bucket folder = conversation
              seq: 1,
              fileName: (m.fileName as string) ?? null,
            });
            if (stored.ok) attachments.push({ kind: mType, name: stored.name, path: stored.path });
            else attachments.push({ kind: mType, name: (m.fileName as string) ?? mType, error: stored.reason });
          }
          const res = await recordMessageSafe(admin, {
            conversationId: convId,
            direction: "inbound",
            channel: "line",
            externalMessageId: m.id ? `${m.id}` : (webhookEventId ?? null),
            text: mType === "text" ? String(m.text || "").slice(0, 4000) : null,
            attachments,
            deliveryStatus: "sent",
            sentAt: ev.timestamp ? new Date(Number(ev.timestamp)).toISOString() : undefined,
          });
          if (res && !res.duplicate) {
            await touchConversation(admin, convId, {
              preview: messagePreview(mType === "text" ? m.text : null, attachments.length),
              incrementUnread: true,
            });

            // แจ้งเตือนห้องแอดมิน (กลุ่มเท่านั้น) — 1 ครั้งต่อ 1 ลูกค้า/บทสนทนา
            // จะแจ้งซ้ำอีกครั้งก็ต่อเมื่อแอดมินตอบกลับไปแล้ว (มีข้อความ outbound ใหม่กว่า)
            try {
              const { data: convRow } = await admin
                .from("film_conversations")
                .select("display_name, store_id")
                .eq("id", convId)
                .maybeSingle();

              // ครั้งล่าสุดที่เคยแจ้งเตือนบทสนทนานี้
              const { data: lastNotifyRows } = await admin
                .from("notification_outbox")
                .select("created_at")
                .eq("event_type", "film_inbox_message")
                .eq("ref_id", convId)
                .order("created_at", { ascending: false })
                .limit(1);
              const lastNotifyAt = lastNotifyRows?.[0]?.created_at
                ? Date.parse(lastNotifyRows[0].created_at as string)
                : 0;

              // ครั้งล่าสุดที่แอดมินตอบกลับลูกค้ารายนี้
              const { data: lastOutRows } = await admin
                .from("film_messages")
                .select("created_at")
                .eq("conversation_id", convId)
                .eq("direction", "outbound")
                .order("created_at", { ascending: false })
                .limit(1);
              const lastOutAt = lastOutRows?.[0]?.created_at
                ? Date.parse(lastOutRows[0].created_at as string)
                : 0;

              const shouldNotify = lastNotifyAt === 0 || lastOutAt > lastNotifyAt;
              if (shouldNotify) {
                const origin0 = Deno.env.get("PUBLIC_APP_ORIGIN") || "https://filmyynatta.com";
                const inboxUrl = `${origin0}/receipts/film?p=inbox`;
                const who = (convRow?.display_name as string) || "ลูกค้า LINE";
                const preview = messagePreview(mType === "text" ? m.text : null, attachments.length) || "(ไฟล์แนบ)";
                await notifyAdminRooms(admin, {
                  storeId: (convRow?.store_id as string) || channel?.id || "default",
                  eventType: "film_inbox_message",
                  refId: convId,
                  text: `💬 ข้อความใหม่จาก ${who}\n“${preview}”\nเปิดกล่องข้อความ: ${inboxUrl}`,
                  url: inboxUrl,
                  idemSuffix: String(res.id ?? convId),
                });
              }
            } catch (e) {
              console.warn("inbox admin notify failed", String((e as Error)?.message || e));
            }

            // NATTA.Q (กลุ่ม 2): AI ตรวจจับข้อความยืนยันสั่งงานจากแชท
            if (mType === "text") {
              try {
                const chatText = String(m.text || "");
                if (detectOrderIntent(chatText)) {
                  const { data: convRow2 } = await admin
                    .from("film_conversations")
                    .select("display_name, store_id")
                    .eq("id", convId)
                    .maybeSingle();
                  const origin2 = Deno.env.get("PUBLIC_APP_ORIGIN") || "https://filmyynatta.com";
                  const taskCode = `NATTA-Q-${String(convId).replace(/-/g, "").slice(0, 6).toUpperCase()}`;
                  const storeId2 = (convRow2?.store_id as string) || channel?.id || "default";

                  // สร้างงานเข้าคิวอัตโนมัติถ้าข้อมูลในแชทครบ (ไม่ครบ = ไม่สร้างงานผี)
                  let auto: Awaited<ReturnType<typeof autoCreateJobFromChat>> | null = null;
                  try {
                    auto = await autoCreateJobFromChat(admin, {
                      conversationId: convId,
                      messageId: m.id ? String(m.id) : null,
                      lineUserId: ev?.source?.userId ?? null,
                      displayName: (convRow2?.display_name as string) ?? null,
                      channelId: channel?.id ?? null,
                      confirmText: chatText,
                    });
                  } catch (e) {
                    console.warn("nattaq auto order failed", String((e as Error)?.message || e));
                  }
                  const orderUrl = auto?.orderId
                    ? `${origin2}/receipts/film?p=orders&order=${auto.orderId}`
                    : `${origin2}/receipts/film?p=inbox`;
                  const autoLine = auto?.orderNo
                    ? `✅ สร้างงานเข้าคิวอัตโนมัติแล้ว: ${auto.orderNo}`
                    : auto?.missing?.length
                      ? `⚠️ ยังสร้างงานอัตโนมัติไม่ได้ ขาด: ${auto.missing.join(", ")}`
                      : "";
                  await admin.rpc("film_raise_ops_notification", {
                    p_kind: "nattaq_auto_order",
                    p_severity: "urgent",
                    p_title: `🤖 NATTA.Q ออเดอร์อัตโนมัติ (${taskCode})`,
                    p_body: [
                      `AI ตรวจพบการรับงานจาก: ${(convRow2?.display_name as string) || "ลูกค้า LINE"}`,
                      `“${chatText.slice(0, 180)}”`,
                      autoLine,
                    ].filter(Boolean).join("\n"),
                    p_order_id: auto?.orderId ?? null,
                    p_job_id: null,
                    p_dept: null,
                    p_assignee: null,
                    p_dedup_key: `nattaq_auto_order:${convId}:${res.id ?? ""}`,
                    p_cooldown_minutes: 5,
                    p_store_id: storeId2,
                    p_group_no: 2,
                  });
                  await notifyAdminRooms(admin, {
                    storeId: storeId2,
                    eventType: "nattaq_auto_order",
                    refId: convId,
                    text: [
                      `🤖 NATTA.Q ตรวจพบการรับงานจากแชท (${taskCode})`,
                      autoLine,
                      `เปิดดู: ${orderUrl}`,
                    ].filter(Boolean).join("\n"),
                    url: orderUrl,
                    idemSuffix: `nattaq:${res.id ?? convId}`,
                    channelType: "queue_group",
                  });
                }
              } catch (e) {
                console.warn("nattaq detect failed", String((e as Error)?.message || e));
              }
            }
          }
        }
      }

      /* ---------------- Admin LINE group ("ห้องแอดมิน") flow --------------- */
      const sourceType: string | undefined = ev?.source?.type;
      const groupId: string | undefined = ev?.source?.groupId;
      const storeId = channel?.id || "default";
      const origin = Deno.env.get("PUBLIC_APP_ORIGIN") || "https://filmyynatta.com";
      const settingsUrl = `${origin}/admin/line-settings`;

      /**
       * ห้องบอทเอกสารของ 2 ร้าน (นัฐภรณ์ การพิมพ์ / นัฐภรณ์ คัลเลอร์แล็ป)
       * = โหมดออกเอกสารเท่านั้น ไม่แตะระบบรันคิวงาน/เปิดงาน/เปลี่ยนสถานะงาน
       */
      const docOnlyRoom = await loadDocOnlyRoom(admin, groupId ?? null);
      /**
       * ห้องที่ “ใช้คำสั่งเอกสารได้” — รวมห้องรันคิวที่เปิด doc_commands_enabled
       * ห้องแบบนี้ยังรันคิวได้ตามเดิม บอทเอกสารจะทำงานเฉพาะคำสั่งเอกสารที่ชัดเจนเท่านั้น
       */
      const docBotRoom = await loadDocBotRoom(admin, groupId ?? null);

      /**
       * Resolve the app user behind a LINE userId and confirm owner/admin.
       *
       * A staff member can be bound through any of three paths, so all three
       * are accepted — otherwise a legitimately approved admin gets the
       * "ยังไม่ได้ยืนยันสิทธิ์แอดมิน" card and can never link a group:
       *   1. profiles.line_user_id (customer-style binding)
       *   2. staff_line_bindings (status = 'approved', /admin/staff-line)
       *   3. film_admin_line_links (Film Shop admin link tokens)
       */
      async function resolveAdminProfileId(uid?: string): Promise<string | null> {
        if (!uid) return null;
        const candidates: string[] = [];

        // รายชื่อผู้จัดการ Film Shop ที่เจ้าของตั้งเองในหน้าตั้งค่า (ไม่ต้องมี role ในฐานข้อมูล)
        const { data: mgr } = await admin
          .from("film_shop_managers")
          .select("line_user_id, is_active, created_by")
          .eq("line_user_id", uid)
          .eq("is_active", true)
          .maybeSingle();
        if (mgr) return (mgr.created_by as string | null) ?? uid;

        const { data: prof } = await admin
          .from("profiles").select("id").eq("line_user_id", uid).maybeSingle();
        if (prof?.id) candidates.push(prof.id as string);


        const { data: bind } = await admin
          .from("staff_line_bindings")
          .select("user_id,status").eq("line_user_id", uid).eq("status", "approved").limit(1);
        for (const b of (bind ?? []) as any[]) if (b.user_id) candidates.push(b.user_id as string);

        const { data: links } = await admin
          .from("film_admin_line_links")
          .select("user_id").eq("line_user_id", uid).limit(5);
        for (const l of (links ?? []) as any[]) if (l.user_id) candidates.push(l.user_id as string);

        const unique = Array.from(new Set(candidates));
        if (!unique.length) return null;

        const { data: roles } = await admin
          .from("user_roles").select("user_id,role").in("user_id", unique);
        const hit = (roles ?? []).find((r: any) => r.role === "owner" || r.role === "admin");
        return hit ? (hit.user_id as string) : null;
      }

      async function loadGroupState(gid: string, channelType = "admin_group"): Promise<AdminGroupState> {
        const { data: rows } = await admin
          .from("line_notification_channels")
          .select("id, is_active, line_destination_id, linked_at")
          .eq("store_id", storeId)
          .eq("channel_type", channelType);
        const list = (rows ?? []) as any[];
        const existing = list.find((r) => r.line_destination_id === gid) ?? null;
        const otherActive = list.find((r) => r.is_active && r.line_destination_id !== gid) ?? null;
        return {
          existing: existing ? { id: existing.id, is_active: existing.is_active } : null,
          otherActive: otherActive
            ? { id: otherActive.id, isGroup: /^[CR]/.test(String(otherActive.line_destination_id ?? "")) }
            : null,
        };
      }

      async function replyFlex(messages: unknown[]) {
        if (!replyToken) return;
        await replyLineMessages(LINE_TOKEN, replyToken, messages);
      }

      async function logDelivery(channelId: string | null, kind: string, ok: boolean, errorCode?: string) {
        try {
          await admin.from("line_delivery_logs").insert({
            channel_id: channelId,
            kind,
            status: ok ? "sent" : "failed",
            error_code: ok ? null : (errorCode || "unknown").slice(0, 60),
            attempts: 1,
            idempotency_key: webhookEventId ? `${kind}:${webhookEventId}` : null,
          });
        } catch (e) { console.warn("delivery log failed"); }
      }

      async function deactivate(channelId: string) {
        await admin.from("line_notification_channels")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", channelId);
      }

      // 0b) ปุ่มจัดการในตัวแจ้งเตือน: อ่านแล้ว / รับเรื่อง
      if (ev.type === "postback" && typeof ev?.postback?.data === "string" && ev.postback.data.startsWith("opsn:")) {
        const [, act, notifId] = ev.postback.data.split(":");
        const adminProfileId = await resolveAdminProfileId(lineUserId);
        if (!adminProfileId) {
          await logEvent({ ...baseLog, handler_result: "ops notification postback rejected (not admin)" });
          continue;
        }
        const now = new Date().toISOString();
        const patch: Record<string, unknown> = { read_at: now };
        if (act === "ack") {
          patch.status = "ack";
          patch.acknowledged_at = now;
          patch.acknowledged_by = adminProfileId;
        }
        const { error: upErr } = await admin.from("film_ops_notifications").update(patch).eq("id", notifId);
        await replyFlex([buildTextMessage(
          upErr
            ? "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
            : act === "ack" ? "รับเรื่องแล้ว ✅ (ทำเครื่องหมายอ่านแล้วให้ด้วย)" : "ทำเครื่องหมายอ่านแล้ว ✅",
        )]);
        await logEvent({ ...baseLog, handler_result: `ops notification ${act}${upErr ? " failed" : ""}` });
        continue;
      }

      // 0c) ม่วงจดให้ (ผู้ช่วยบัญชี Film Shop) — เฉพาะช่อง `natta`, แชทส่วนตัว, แอดมินที่มีสิทธิ์
      //     ปุ่มยืนยัน/ยกเลิก/แนบหลักฐาน และไฟล์แนบของร่างที่รอยืนยัน
      if (channel?.id === "natta" && lineUserId && (ev?.source?.type ?? "user") === "user") {
        const isPb = ev.type === "postback" && typeof ev?.postback?.data === "string" &&
          String(ev.postback.data).startsWith("natta");
        const isAudio = ev.type === "message" && ev.message?.type === "audio" && ev?.message?.id;
        const isMedia = ev.type === "message" &&
          (ev.message?.type === "image" || ev.message?.type === "file" || ev.message?.type === "audio") &&
          ev?.message?.id;
        if (isPb || isMedia) {
          const adminProfileId = await resolveAdminProfileId(lineUserId);
          if (adminProfileId) {
            const nctx = {
              admin,
              lineUserId,
              messageId: (ev?.message?.id as string) || null,
              eventId: webhookEventId,
              isAuthorized: true,
              lineToken: LINE_TOKEN,
            };
            let res: { handled: boolean; reply?: string; flex?: unknown; info?: string } = { handled: false };
            if (isPb) {
              const pb = parseNattaPostback(String(ev.postback.data));
              if (pb) res = await handleNattaPostback(nctx, pb);
            } else if (isAudio) {
              // ข้อความเสียงในช่อง natta — ถอดเสียงแล้วเข้ากระบวนการรอยืนยันเหมือนพิมพ์เอง
              res = await handleNattaAudio(nctx, { messageId: String(ev.message.id) });
              if (!res.handled) {
                res = { handled: true, reply: "ยังฟังข้อความเสียงไม่ได้ค่ะ พิมพ์รายการมาได้เลยนะคะ", info: "natta:audio unhandled" };
              }
            } else {
              // รูป/ไฟล์ในช่อง natta ต้องถูกจัดการโดยผู้ช่วยเสมอ — ห้ามหลุดไป intake ของลูกค้า/งาน
              res = await handleNattaAttachment(nctx, {
                messageId: String(ev.message.id),
                fileName: (ev?.message?.fileName as string) || null,
              });
              if (!res.handled) res = { handled: true, reply: NATTA_ATTACH_NO_DRAFT, info: "natta:attach no draft" };
            }
            if (res.handled) {
              if (res.flex) await sendMessages([res.flex]);
              else if (res.reply) await sendMessages([{ type: "text", text: res.reply }]);
              await logEvent({ ...baseLog, handler_result: res.info || "natta assistant" });
              continue;
            }
          } else if (isMedia) {
            // ไม่ใช่แอดมิน Film Shop — ตอบข้อความไม่มีสิทธิ์ แล้วจบ (ไม่ส่งต่อ)
            await sendMessages([{ type: "text", text: NATTA_NO_PERMISSION }]);
            await logEvent({ ...baseLog, handler_result: "natta:media denied" });
            continue;
          }
        }
      }


      // 1) postback confirmations
      if (ev.type === "postback" && typeof ev?.postback?.data === "string" && ev.postback.data.startsWith("store_map:")) {
        const data: string = ev.postback.data;
        if (data === "store_map:abort") {
          await replyFlex([buildTextMessage("ยกเลิกแล้ว ห้องนี้ยังผูกกับร้านเดิมตามปกติ")]);
          await logEvent({ ...baseLog, handler_result: "store map confirm aborted" });
          continue;
        }
        if (data.startsWith("store_map:confirm:") && groupId) {
          const storeId = data.slice("store_map:confirm:".length);
          const { data: storeRow } = await admin
            .from("line_credentials")
            .select("id, display_name")
            .eq("id", storeId)
            .maybeSingle();
          if (!storeRow) {
            await replyFlex([buildTextMessage("ไม่พบร้านนี้ในระบบแล้ว กรุณาพิมพ์ รายชื่อร้าน แล้วลองใหม่")]);
            await logEvent({ ...baseLog, handler_result: "store map confirm: store missing" });
            continue;
          }
          const { data: roomRows } = await admin
            .from("line_notification_channels")
            .select("id, is_active")
            .eq("line_destination_id", groupId);
          const ids = ((roomRows ?? []) as any[]).filter((r) => r.is_active !== false).map((r) => r.id);
          if (!ids.length) {
            await replyFlex([buildTextMessage("ห้องนี้ยังไม่ได้เชื่อมกับระบบ พิมพ์ ช่วยเหลือ เพื่อดูคำสั่งเชื่อมห้อง")]);
            await logEvent({ ...baseLog, handler_result: "store map confirm: room not linked" });
            continue;
          }
          const nowIso = new Date().toISOString();
          await admin
            .from("line_notification_channels")
            .update({ store_id: storeId, last_verified_at: nowIso, updated_at: nowIso })
            .in("id", ids);
          const label = (storeRow as any).display_name || storeId;
          await replyFlex([buildTextMessage(
            `เปลี่ยนร้านของห้องนี้เป็น “${label}” แล้ว\nอัปเดตล่าสุด ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} น.`,
          )]);
          await logEvent({ ...baseLog, handler_result: `store map confirmed → ${storeId}` });
          continue;
        }
        await logEvent({ ...baseLog, handler_result: "store map postback ignored" });
        continue;
      }

      if (ev.type === "postback" && typeof ev?.postback?.data === "string" && ev.postback.data.startsWith("admin_group:")) {
        const data: string = ev.postback.data;
        const adminProfileId = await resolveAdminProfileId(lineUserId);
        if (!adminProfileId) {
          await logEvent({ ...baseLog, handler_result: "admin_group postback rejected (not admin)" });
          continue;
        }
        if (data === "admin_group:cancel_abort") {
          await replyFlex([buildTextMessage("ยกเลิกคำสั่งแล้ว ห้องนี้ยังรับแจ้งเตือนตามปกติ")]);
          await logEvent({ ...baseLog, handler_result: "admin_group cancel aborted" });
          continue;
        }
        if (data.startsWith("admin_group:cancel_confirm:")) {
          const cid = data.split(":")[2] || "";
          await deactivate(cid);
          await replyFlex([buildTextMessage("ปิดการเชื่อมห้องแอดมินแล้ว ห้องนี้จะไม่ได้รับแจ้งเตือนอีก")]);
          await logEvent({ ...baseLog, handler_result: "admin_group deactivated" });
          continue;
        }
        if (data === "admin_group:test") {
          let state: AdminGroupState = { existing: null, otherActive: null };
          if (groupId) {
            state = await loadGroupState(groupId, "admin_group");
            if (!state.existing) state = await loadGroupState(groupId, "queue_group");
          }
          if (!state.existing?.is_active) {
            await replyFlex([buildTextMessage("ห้องนี้ยังไม่ได้เชื่อมกับระบบแจ้งเตือน")]);
          } else {
            const r = await replyLineMessages(LINE_TOKEN, replyToken ?? "", [buildTestFlex()]);
            await logDelivery(state.existing.id, "test", r.ok, r.error ? `http_${r.status ?? 0}` : undefined);
            await admin.from("line_notification_channels")
              .update({ last_test_status: r.ok ? "success" : "failed", last_test_at: new Date().toISOString(), last_verified_at: new Date().toISOString() })
              .eq("id", state.existing.id);
          }
          await logEvent({ ...baseLog, handler_result: "admin_group test via postback" });
          continue;
        }
        await logEvent({ ...baseLog, handler_result: "admin_group postback ignored" });
        continue;
      }

      /* ---------------- Film Shop: รับงานและรันคิวผ่าน LINE OA ---------------- */

      const appOrigin = Deno.env.get("PUBLIC_APP_ORIGIN") || "https://filmyynatta.com";

      async function sendMessages(messages: unknown[]) {
        if (!LINE_TOKEN || messages.length === 0) return;
        // ตอบด้วย replyToken ก่อนเสมอ (ฟรีและเร็วกว่า) ถ้า reply ใช้ไม่ได้
        // (โทเคนหมดอายุ/ถูกใช้ไปแล้ว) ให้ push เข้าห้องเดิมแทน ข้อความจะได้ไม่หาย
        const target = groupId || lineUserId || "";
        try {
          if (replyToken) {
            const r = await replyLineMessages(LINE_TOKEN, replyToken, messages);
            if (r.ok) return;
          }
          if (target) await pushLineMessages(LINE_TOKEN, target, messages);
        } catch (e) {
          console.warn("line reply failed", String((e as Error)?.message || e));
        }
      }

      async function finishIntake(session: IntakeSession & { id: string }) {
        const res = await confirmIntakeSession(admin, session);
        const trackUrl = `${appOrigin}/track/${encodeURIComponent(res.orderNo)}`;
        await sendMessages([
          buildConfirmedFlex({
            orderNo: res.orderNo,
            jobs: res.jobs,
            dueAt: session.dueAt,
            trackUrl,
            isTest: session.isTest,
          }),
        ]);
        if (!res.duplicate) {
          await notifyAdminRooms(admin, {
            storeId,
            eventType: "film_order_created",
            refId: res.orderId,
            text: `🆕 งานใหม่จาก LINE ${res.orderNo}${session.isTest ? " [TEST]" : ""}\nลูกค้า: ${session.customerName ?? "-"}\nงานย่อย ${res.jobs.length} รายการ\nเปิดห้องควบคุม: ${appOrigin}/admin/control-room`,
            url: `${appOrigin}/admin/control-room`,
            idemSuffix: res.orderId,
          });
        }
        return res;
      }

      /* --------- 1a-NDB) NATTA DOC BOT (กลุ่มพนักงาน โหมดเอกสารเท่านั้น) --------- */
      /* 1a-NDB-0) อินพุตที่บอทเอกสารทำงานต่อไม่ได้ (สติกเกอร์/เสียง/วิดีโอ/ตำแหน่ง ฯลฯ)
         ตอบให้ชัดว่าต้องส่งอะไร แล้วจบทันที — ไม่สร้างร่างและไม่ออกเลขเอกสารซ้ำ */
      if (
        docOnlyRoom && groupId && ev.type === "message" &&
        !isNdbSupportedMessageType(String(ev.message?.type || ""))
      ) {
        const mType = String(ev.message?.type || "unknown");
        await sendMessages([{ type: "text", text: ndbUnsupportedMessageText(mType) }]);
        await ndbAudit(admin, {
          groupId,
          lineUserId: lineUserId ?? null,
          action: "unsupported_message",
          detail: { messageType: mType },
        });
        await logEvent({
          ...baseLog,
          handler_result: `ndb unsupported message (${mType})`,
          doc_type: null,
        });
        continue;
      }

      if (
        docBotRoom && groupId && lineUserId &&
        (ev.type === "postback" || (ev.type === "message" && ev.message?.type === "text"))
      ) {
        const ndbData = ev.type === "postback" ? String(ev?.postback?.data || "") : "";
        let ndbText = ev.type === "message" ? String(ev.message?.text || "") : "";
        // ห้องรันคิวที่เปิดคำสั่งเอกสาร: รับเฉพาะคำสั่งเอกสารที่ชัดเจน ไม่ทับคำสั่งคิว
        if (!docBotRoom.docOnly && !ndbData.startsWith("ndb?")) {
          ndbText = (await ndbSharedRoomText(admin, groupId, lineUserId, ndbText)) ?? "";
        }
        if (ndbData.startsWith("ndb?") || ndbText.trim()) {
          const roomStore = await resolveRoomStore(admin, groupId);
          if (!roomStore.storeId || !roomStore.shopKey) {
            await sendMessages([{ type: "text", text: docOnlyStoreMissingText(docBotRoom.label) }]);
            await logEvent({ ...baseLog, handler_result: "ndb: store not mapped" });
            continue;
          }
          const { data: ndbPermRaw } = await admin.rpc("line_queue_command_allowed", {
            _line_user_id: lineUserId,
            _channel_id: docBotRoom.id,
          });
          const ndbPerm = (ndbPermRaw ?? {}) as { allowed?: boolean; reason?: string; user_id?: string | null };
          if (!ndbPerm.allowed) {
            // ไม่มีสิทธิ์ = ปฏิเสธทั้ง postback และข้อความ แล้วจบ ไม่ให้ไหลไป handler เดิม
            await sendMessages([
              { type: "text", text: queueDenyText(String(ndbPerm.reason || ""), `${appOrigin}/admin/line-groups`) },
            ]);
            await logEvent({ ...baseLog, handler_result: `ndb denied ${ndbPerm.reason ?? "unknown"}` });
            continue;
          } else {
            let ndbActor: string | null = null;
            if (ndbPerm.user_id) {
              const { data: prof } = await admin
                .from("profiles").select("full_name").eq("id", ndbPerm.user_id).maybeSingle();
              ndbActor = (prof as { full_name?: string } | null)?.full_name ?? null;
            }
            const ndbCtx: NdbContext = {
              admin,
              groupId,
              lineUserId,
              eventId: webhookEventId ?? null,
              shopKey: roomStore.shopKey,
              storeId: roomStore.storeId,
              storeSlug: roomStore.storeSlug,
              storeLabel: roomStore.storeLabel ?? docBotRoom.label,
              channelId: docBotRoom.id,
              appOrigin,
              lineToken: LINE_TOKEN,
              actorLabel: ndbActor,
              send: sendMessages,
            };
            try {
              const res = ndbData.startsWith("ndb?")
                ? await handleNdbPostback(ndbCtx, ndbData)
                : await handleNdbText(ndbCtx, ndbText);
              if (res.handled) {
                await logEvent({
                  ...baseLog,
                  handler_result: res.note ?? "ndb handled",
                  doc_type: (() => {
                    const n = String(res.note || "");
                    if (n.includes("quotation")) return "quotation";
                    const m = n.match(/next doc ([a-z_]+)/);
                    return m ? m[1] : null;
                  })(),
                  ref_code: (() => {
                    const m = String(res.note || "").match(/[A-Z]{2}\d{6,}/);
                    return m ? m[0] : baseLog.ref_code;
                  })(),
                });
                continue;
              }
            } catch (e) {
              const msg = String((e as Error)?.message || e);
              console.error("[ndb] failed", msg);
              await logEvent({ ...baseLog, handler_result: "ndb failed", handler_error: msg });
            }
          }
        }
      }

      // 1b) postback ของใบรับงานชั่วคราว
      // (ห้องบอทเอกสาร: ข้ามทั้งหมด — ไม่มีการเปิดงาน/เข้าคิวในห้องนี้)
      if (!docOnlyRoom && ev.type === "postback" && typeof ev?.postback?.data === "string") {
        // ยกเลิกการ์ด "รับงานใหม่" (การ์ดเดียวจบ) — ปิดลิงก์ฟอร์มทันที
        const cardData = String(ev.postback.data);
        if (cardData.startsWith("intake_ocr:")) {
          const [, cardKey, act] = cardData.split(":");
          if (act === "cancel" && cardKey) {
            const cancelled = await cancelIntakeCardToken(admin, {
              cardKey,
              groupId: groupId ?? "",
              lineUserId: lineUserId ?? "",
              channelKey: storeId,
            });
            await sendMessages([withQueueQuickReply({
              type: "text",
              text: cancelled
                ? "ยกเลิกใบรับงานนี้แล้วค่ะ"
                : "การ์ดนี้หมดอายุ ใช้ไปแล้ว หรือไม่ใช่ของผู้กดค่ะ",
            })]);
            await logEvent({
              ...baseLog,
              handler_result: cancelled ? "intake card cancelled" : "intake card cancel not found",
            });
            continue;
          }
        }
        const pb = parseIntakePostback(ev.postback.data);
        if (pb) {
          const session = await loadSessionById(admin, pb.sessionId);
          if (!session || session.status !== "draft") {
            await sendMessages([{ type: "text", text: "ใบรับงานนี้ปิดไปแล้วค่ะ พิมพ์ “สั่งงาน” เพื่อเริ่มใหม่" }]);
            await logEvent({ ...baseLog, handler_result: "film_intake postback stale" });
            continue;
          }
          if (pb.action === "cancel") {
            await admin.from("film_line_intake_sessions").update({ status: "cancelled" }).eq("id", session.id);
            await sendMessages([{ type: "text", text: "ยกเลิกใบรับงานชั่วคราวแล้วค่ะ" }]);
            await logEvent({ ...baseLog, handler_result: "film_intake cancelled" });
            continue;
          }
          if (pb.action === "edit") {
            const next = { ...session, state: "items" as const, items: [] };
            await persistSession(admin, next, { lineUserId: lineUserId ?? "", storeId, sourceType, roomId: groupId, eventId: webhookEventId });
            await sendMessages([{ type: "text", text: "แก้ไขรายการงานได้เลยค่ะ พิมพ์รายการใหม่ทีละบรรทัด แล้วพิมพ์ “จบรายการ”" }]);
            await logEvent({ ...baseLog, handler_result: "film_intake edit" });
            continue;
          }
          try {
            const res = await finishIntake(session);
            await logEvent({ ...baseLog, handler_result: `film_intake confirmed ${res.orderNo}${res.duplicate ? " (duplicate)" : ""}` });
          } catch (e) {
            await sendMessages([{ type: "text", text: "เปิดงานไม่สำเร็จ กรุณาลองใหม่อีกครั้งค่ะ" }]);
            await logEvent({ ...baseLog, handler_result: "film_intake confirm failed", handler_error: String((e as Error)?.message || e) });
          }
          continue;
        }
      }

      // 1c) ไฟล์แนบจากลูกค้าระหว่างเปิดใบรับงาน
      if (
        !docOnlyRoom && ev.type === "message" && lineUserId &&
        (ev.message?.type === "image" || ev.message?.type === "file")
      ) {
        const session = await loadOpenSession(admin, lineUserId);
        if (session) {
          const declared = ev.message?.type === "file"
            ? validateAttachment({ mime: null, bytes: Number(ev.message?.fileSize ?? 0) })
            : { ok: true as const };
          if (!declared.ok) {
            await sendMessages([{ type: "text", text: `แนบไฟล์ไม่ได้ค่ะ: ${declared.reason}` }]);
            await logEvent({ ...baseLog, handler_result: "film_intake attachment rejected" });
            continue;
          }
          const stored = await storeLineAttachment(admin, LINE_TOKEN, {
            messageId: String(ev.message?.id || ""),
            sessionId: session.id,
            seq: session.attachments.length + 1,
            fileName: ev.message?.fileName ?? null,
          });
          if (!stored.ok) {
            await sendMessages([{ type: "text", text: `แนบไฟล์ไม่สำเร็จ: ${stored.reason}` }]);
            await logEvent({ ...baseLog, handler_result: "film_intake attachment failed" });
            continue;
          }
          const next = { ...session, attachments: [...session.attachments, { name: stored.name, path: stored.path }] };
          await persistSession(admin, next, { lineUserId, storeId, sourceType, roomId: groupId, eventId: webhookEventId });
          await sendMessages([{ type: "text", text: `รับไฟล์แล้วค่ะ (${next.attachments.length} ไฟล์)` }]);
          await logEvent({ ...baseLog, handler_result: "film_intake attachment stored" });
          continue;
        }
      }

      // 1c-2) ไฟล์รายการสินค้า (PDF/Excel/รูป) ในห้องเอกสารที่ผูกไว้ → อ่านด้วย AI เก็บเป็นร่างของห้อง
      if (
        ev.type === "message" && groupId &&
        (ev.message?.type === "image" || ev.message?.type === "file")
      ) {
        const { data: fileRoom } = await admin
          .from("line_notification_channels")
          .select("id, queue_commands_enabled, channel_type, store_id, is_active")
          .eq("line_destination_id", groupId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        const aiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
        const fileName = String(ev.message?.fileName ?? "");
        if (fileRoom && aiKey) {
          const { data: filePermRaw } = await admin.rpc("line_queue_command_allowed", {
            _line_user_id: lineUserId ?? "",
            _channel_id: fileRoom.id,
          });
          const filePerm = (filePermRaw ?? {}) as { allowed?: boolean };
          if (filePerm.allowed) {
            try {
              const payload = await fetchLineFile(String(ev.message?.id || ""), LINE_TOKEN, fileName || null);

              // กลุ่มรันคิว + ไฟล์รูป/PDF → อ่านด้วย AI แล้วส่งการ์ด "รับงานใหม่" ใบเดียว (prefill ฟอร์ม)
              if (isQueueIntakeRoom(fileRoom as any) && isIntakeAiFile(payload.mime, payload.fileName)) {
                const srcMsgId = String(ev.message?.id || webhookEventId || "");
                try {
                  const extracted = await extractIntakeFromLineFile(payload, aiKey);
                  const summary = buildIntakeCardSummary(extracted);
                  const made = await createIntakeFormToken(admin, {
                    channelKey: storeId,
                    groupId,
                    lineUserId: lineUserId ?? "",
                    storeLabel: channel?.label ?? null,
                    prefill: extracted,
                    source: "file",
                    sourceMessageId: srcMsgId || null,
                  });
                  // ไฟล์เดิม (messageId ซ้ำ) → ไม่ส่งการ์ดซ้ำ
                  if (!made.duplicate) {
                    await sendMessages([withQueueQuickReply(buildIntakeSingleCardFlex({
                      sessionId: made.cardKey,
                      fromFile: true,
                      reviewCount: summary.reviewCount,
                      formUrl: intakeFormUrl(appOrigin, made.token),
                      lines: summary.lines,
                    }))]);
                  }
                  await logEvent({
                    ...baseLog,
                    handler_result: `intake file card${made.duplicate ? " (duplicate)" : ""}`,
                    ref_code: srcMsgId,
                  });
                } catch (e) {
                  const why = String((e as Error)?.message || e);
                  const made = await createIntakeFormToken(admin, {
                    channelKey: storeId,
                    groupId,
                    lineUserId: lineUserId ?? "",
                    storeLabel: channel?.label ?? null,
                    source: "file",
                    sourceMessageId: srcMsgId ? `${srcMsgId}:manual` : null,
                  });
                  if (!made.duplicate) {
                    await sendMessages([withQueueQuickReply(buildIntakeSingleCardFlex({
                      sessionId: made.cardKey,
                      fromFile: false,
                      reviewCount: 0,
                      formUrl: intakeFormUrl(appOrigin, made.token),
                      lines: [
                        { no: 1, label: "ลูกค้า", value: "ยังไม่ได้ระบุ", found: false },
                        { no: 2, label: "โทร", value: "ยังไม่ได้ระบุ", found: false },
                        { no: 3, label: "รายการงาน", value: "ยังไม่ได้ระบุ", found: false },
                        { no: 4, label: "กำหนดรับ", value: "ยังไม่ได้ระบุ", found: false },
                      ],
                    }))]);
                  }
                  await logEvent({ ...baseLog, handler_result: "intake file read failed", handler_error: why });
                }
                continue;
              }

              if (!isSupportedDocFile(payload.mime, payload.fileName)) {
                const why = unsupportedDocFileMessage(payload.mime, payload.fileName);
                await sendMessages([{ type: "text", text: ndbUnsupportedFileText(why) }]);
                await ndbAudit(admin, {
                  groupId,
                  lineUserId: lineUserId ?? null,
                  action: "unsupported_file",
                  detail: { mime: payload.mime, fileName: payload.fileName },
                });
                await logEvent({
                  ...baseLog,
                  handler_result: `doc file: unsupported type (${payload.mime})`,
                  ref_code: String(ev.message?.id || ""),
                });
                continue;
              }
              const extract = await extractDocFile(payload, aiKey);
              if (!extract.items.length) {
                await sendMessages([{ type: "text", text: "อ่านไฟล์แล้วแต่ยังไม่พบรายการที่มีจำนวนและราคาชัดเจนค่ะ ลองส่งไฟล์ที่มีตารางรายการ/ราคาอีกครั้งนะคะ" }]);
                await logEvent({ ...baseLog, handler_result: "doc file: no items" });
                continue;
              }
              const saved = await savePendingFileDraft(admin, {
                messageId: String(ev.message?.id || webhookEventId || `${Date.now()}`),
                roomId: groupId,
                lineUserId: lineUserId ?? null,
                fileName: payload.fileName,
                extract,
              });
              const preview = extract.items
                .slice(0, 5)
                .map((i) => `• ${i.description} ${i.quantity} ${i.unit} × ${i.unitPrice.toLocaleString("en-US")}`)
                .join("\n");
              const more = extract.items.length > 5 ? `\n… และอีก ${extract.items.length - 5} รายการ` : "";
              await sendMessages([{
                type: "text",
                text: [
                  `📄 อ่านไฟล์แล้วค่ะ (${extract.items.length} รายการ)`,
                  extract.customerName ? `ลูกค้า: ${extract.customerName}` : "ยังไม่พบชื่อลูกค้าในไฟล์",
                  "",
                  preview + more,
                  "",
                  "พิมพ์ต่อได้เลย เช่น “ออกใบเสนอราคา การพิมพ์” (ถ้าไฟล์ไม่มีชื่อลูกค้า ให้พิมพ์ “ลูกค้า: ชื่อ” เพิ่ม)",
                ].join("\n"),
              }]);
              await logEvent({
                ...baseLog,
                handler_result: `doc file parsed ${extract.items.length} items${saved.duplicate ? " (duplicate)" : ""}`,
              });
            } catch (e) {
              const msg = String((e as Error)?.message || e);
              await sendMessages([{ type: "text", text: `❌ อ่านไฟล์ไม่สำเร็จค่ะ (${msg.slice(0, 100)})` }]);
              await logEvent({ ...baseLog, handler_result: "doc file failed", handler_error: msg });
            }
            continue;
          }
        }
      }

      // 1d) คำสั่งอ่านอย่างเดียวในห้องแอดมิน
      // ปุ่มในการ์ด "งานปัจจุบัน · NATTA.Q" ส่ง postback `nq:<action>` เข้ามา
      // → แปลงเป็นข้อความคำสั่งไทยเดิม แล้วเดินผ่าน dispatcher ตัวเดียวกับที่ผู้ใช้พิมพ์เอง
      const nqPost = ev.type === "postback" && typeof ev?.postback?.data === "string"
        ? postbackToQueueText(ev.postback.data)
        : null;
      if (((ev.type === "message" && ev.message?.type === "text") || nqPost) && sourceType !== "user") {
        const text = nqPost ? nqPost.text : String(ev.message?.text || "");

        // 1d-00) วิธีใช้คำสั่งออกเอกสาร
        if (/^(วิธีออกเอกสาร|ช่วยเหลือเอกสาร|help doc)$/i.test(text.trim())) {
          await sendMessages([{ type: "text", text: DOC_BOT_HELP }]);
          await logEvent({ ...baseLog, handler_result: "doc bot help" });
          continue;
        }

        // 1d-00a2) ชุดคำสั่งพร้อมก๊อป — พิมพ์ “ตัวอย่างคำสั่ง”
        if (/^(ตัวอย่างคำสั่ง|คำสั่งตัวอย่าง|ก๊อปคำสั่ง|copy คำสั่ง)$/i.test(text.trim())) {
          const tRoom = await resolveRoomStore(admin, groupId);
          const order: Array<keyof typeof DOC_BOT_TEMPLATES> = [
            "receipt",
            "quotation",
            "delivery_note",
            "tax_receipt",
          ];
          const msgs: unknown[] = order.map((t) => ({
            type: "text",
            text: buildDocTemplateText(t as never, tRoom.shopKey, tRoom.storeLabel),
          }));
          msgs.push({
            type: "text",
            text: "📋 กดค้างที่ข้อความด้านบน → “คัดลอก” แล้วแก้ค่าให้ตรงงาน ก่อนส่งกลับมาในห้องนี้ได้เลยค่ะ",
            quickReply: DOC_BOT_QUICK_REPLY,
          });
          await sendMessages(msgs);
          await logEvent({ ...baseLog, handler_result: "doc bot copy templates" });
          continue;
        }

        // 1d-00c) ตัวอย่างคำสั่งรายชนิดเอกสาร
        const tplType = parseDocTemplateRequest(text);
        if (tplType) {
          const tplRoom = await resolveRoomStore(admin, groupId);
          await sendMessages([{
            type: "text",
            text: buildDocTemplateText(tplType, tplRoom.shopKey, tplRoom.storeLabel),
            quickReply: DOC_BOT_QUICK_REPLY,
          }]);
          await logEvent({ ...baseLog, handler_result: `doc bot template ${tplType}` });
          continue;
        }

        // 1d-00d) มีร่างพรีวิวค้างอยู่ในห้องนี้ — รองรับ ยืนยัน / ยกเลิก / แก้ไข
        let docCmd = parseDocBotCommand(text);
        let docConfirmed = false;
        let docPickNote: string | null = null;
        // 1d-00c2) มีรายการออเดอร์รอเลือกอยู่ในห้องนี้
        if (!docCmd && groupId) {
          const pick = await loadOrderPick(admin, groupId);
          if (pick) {
            if (isDocCancelText(text)) {
              await clearOrderPick(admin, groupId);
              await sendMessages([{ type: "text", text: "ยกเลิกการเลือกออเดอร์แล้วค่ะ ยังไม่ได้ออกเอกสารใด ๆ" }]);
              await logEvent({ ...baseLog, handler_result: "doc bot order pick cancelled" });
              continue;
            }
            const sel = parseOrderSelection(text, pick.candidates.length);
            if (sel) {
              const merged = mergeSelectedOrders(pick.candidates, sel.indexes);
              if (!merged) {
                await sendMessages([{ type: "text", text: "ออเดอร์ที่เลือกไม่มีรายการค่ะ ลองเลือกใหม่อีกครั้งนะคะ" }]);
                await logEvent({ ...baseLog, handler_result: "doc bot order pick empty" });
                continue;
              }
              await clearOrderPick(admin, groupId);
              docCmd = applyDocBotCarryOver(pick.command, merged);
              if (!docCmd.fields.project) {
                docCmd.fields.project = `อ้างอิงออเดอร์ ${merged.orderNos.join(", ")}`;
              }
              docPickNote = buildOrderPickSummaryText(pick.candidates, sel.indexes);
            }
          }
        }
        if (!docCmd && groupId) {
          const pv = await loadPreviewCommand(admin, groupId);
          if (pv) {
            if (isDocCancelText(text)) {
              await clearPreviewCommand(admin, groupId);
              await sendMessages([{ type: "text", text: "ยกเลิกร่างเอกสารแล้วค่ะ ยังไม่ได้ออกเลขที่ใด ๆ" }]);
              await logEvent({ ...baseLog, handler_result: "doc bot preview cancelled" });
              continue;
            }
            if (isDocConfirmText(text)) {
              docCmd = pv.command;
              docConfirmed = true;
            } else if (isDocEditHelpText(text)) {
              await sendMessages([{ type: "text", text: DOC_EDIT_HELP, quickReply: DOC_ORDER_QUICK_REPLY }]);
              await logEvent({ ...baseLog, handler_result: "doc bot edit help" });
              continue;
            } else {
              const patch = parseDocEditCommand(text);
              if (patch) {
                const edited = applyDocEditPatch(pv.command, patch);
                await savePreviewCommand(admin, groupId, edited, lineUserId);
                const room = await resolveRoomStore(admin, groupId);
                const msgs: unknown[] = [{
                  type: "flex",
                  altText: "ตัวอย่างเอกสาร (แก้ไขแล้ว)",
                  contents: buildDocPreviewFlex(edited, { storeLabel: room.storeLabel }),
                  quickReply: DOC_ORDER_QUICK_REPLY,
                }];
                if (edited.missing.length) {
                  msgs.push({ type: "text", text: buildDocBotMissingText(edited.docType, edited.missing) });
                }
                await sendMessages(msgs);
                await logEvent({ ...baseLog, handler_result: "doc bot preview edited" });
                continue;
              }
            }
          }
        }

        // 1d-01) บอทออกใบเสร็จรับเงิน / ใบจัดจ้าง แล้วส่งภาพให้ลูกค้า
        if (docCmd && groupId) {
          const { data: docRoom } = await admin
            .from("line_notification_channels")
            .select("id")
            .eq("line_destination_id", groupId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          if (!docRoom) {
            await sendMessages([{ type: "text", text: "ห้องนี้ยังไม่ได้ผูกกับระบบค่ะ พิมพ์ “เชื่อมห้องเอกสาร” ก่อนนะคะ" }]);
            await logEvent({ ...baseLog, handler_result: "doc bot: room not bound" });
            continue;
          }
          const { data: docPermRaw } = await admin.rpc("line_queue_command_allowed", {
            _line_user_id: lineUserId ?? "",
            _channel_id: docRoom.id,
          });
          const docPerm = (docPermRaw ?? {}) as { allowed?: boolean; reason?: string; user_id?: string | null };
          if (!docPerm.allowed) {
            await sendMessages([{ type: "text", text: queueDenyText(String(docPerm.reason || ""), `${appOrigin}/admin/line-groups`) }]);
            await logEvent({ ...baseLog, handler_result: `doc bot: denied ${docPerm.reason ?? "unknown"}` });
            continue;
          }
          const docRoomStore = await resolveRoomStore(admin, groupId);
          // ห้องบอทเอกสาร: ต้องผูกร้านไว้จริงเท่านั้น ห้าม fallback ข้ามร้าน
          if (docOnlyRoom && (!docRoomStore.storeId || !docRoomStore.shopKey)) {
            await sendMessages([{ type: "text", text: docOnlyStoreMissingText(docOnlyRoom.label) }]);
            await logEvent({ ...baseLog, handler_result: "doc-only room: store not mapped" });
            continue;
          }
          // ── กฎเหล็ก: ทุกงานต้องเริ่มจากใบเสนอราคา ───────────────────────────
          // 1) "สร้างใบส่งของจาก QT-xxxx" → สร้างต่อจากใบเสนอราคาที่ออกเลขแล้วเท่านั้น
          const srcQuotationNo = docConfirmed ? null : parseSourceQuotationRef(text);
          if (srcQuotationNo && isNextDocType(docCmd.docType)) {
            let nextActor: string | null = (docPerm.user_id as string | null) ?? null;
            const res = await createNextDocFromQuotation(admin, {
              sourceDocNo: srcQuotationNo,
              docType: docCmd.docType,
              storeId: docRoomStore.storeId,
              storeLabel: docRoomStore.storeLabel,
              actorUserId: nextActor,
              createdSource: "line_bot",
            });
            await sendMessages([{ type: "text", text: res.message }]);
            await logEvent({
              ...baseLog,
              handler_result: `doc bot next-doc ${docCmd.docType} from ${srcQuotationNo}: ${res.ok ? res.docNo : "blocked"}`,
            });
            continue;
          }
          // 2) งานใหม่ → บังคับเป็นใบเสนอราคา และตัด "พร้อม: ใบส่งของ/ใบเสร็จ" ออก
          if (!docConfirmed) {
            const enforced = enforceQuotationFirst(docCmd, null);
            if (enforced.notices.length) {
              docCmd = enforced.command;
              await sendMessages([{ type: "text", text: enforced.notices.join("\n\n") }]);
            }
          }
          // ร้านของห้องนี้ — ห้องเอกสารบังคับใช้ร้านของห้องเสมอ (ห้ามข้ามร้าน)
          if (docOnlyRoom && docRoomStore.shopKey) {
            const locked = lockCommandToRoomShop(docCmd, docRoomStore.shopKey);
            docCmd = locked.command;
            if (locked.overridden && !docConfirmed) {
              await sendMessages([{
                type: "text",
                text: `ℹ️ ห้องนี้เป็นห้องเอกสารของ “${docRoomStore.storeLabel ?? ""}” — ระบบใช้ร้านของห้องนี้เท่านั้นค่ะ`,
              }]);
            }
          } else if (!docConfirmed && docRoomStore.shopKey) {
            docCmd = applyDocBotCarryOver(docCmd, { shopKey: docRoomStore.shopKey });
          }
          // อ้างอิงเลขที่ออเดอร์ / ช่วงวันที่ → ดึงรายการจริงมาเติม
          if (!docConfirmed) {
            const refs = parseDocOrderRefs(text);
            if (hasDocOrderRefs(refs)) {
              const candidates = await loadOrderCandidates(admin, refs, docCmd.fields.customerName);
              // ช่วงวันที่เดียวแต่เจอหลายออเดอร์ → ให้เลือกก่อน แล้วค่อยสรุป/ยืนยัน
              if (!refs.orderNos.length && candidates.length > 1) {
                await saveOrderPick(admin, groupId, { candidates, command: docCmd, from: refs.from, to: refs.to }, lineUserId);
                await sendMessages([{
                  type: "flex",
                  altText: `พบ ${candidates.length} ออเดอร์ในช่วงวันที่ — เลือกก่อนออกเอกสาร`,
                  contents: buildOrderPickFlex(candidates, docCmd.docType, {
                    storeLabel: docRoomStore.storeLabel,
                    from: refs.from,
                    to: refs.to,
                  }),
                  quickReply: DOC_ORDER_PICK_QUICK_REPLY,
                }]);
                await logEvent({ ...baseLog, handler_result: `doc bot order pick ${candidates.length}` });
                continue;
              }
              const fromOrders = candidates.length
                ? mergeSelectedOrders(candidates, candidates.map((_, i) => i + 1))
                : null;
              if (fromOrders) {
                docCmd = applyDocBotCarryOver(docCmd, fromOrders);
                if (!docCmd.fields.project) {
                  docCmd.fields.project = `อ้างอิงออเดอร์ ${fromOrders.orderNos.join(", ")}`;
                }
              } else {
                await sendMessages([{
                  type: "text",
                  text: "ไม่พบออเดอร์ตามที่ระบุค่ะ ลองตรวจเลขที่ออเดอร์หรือช่วงวันที่อีกครั้ง หรือพิมพ์รายการเองได้เลย",
                }]);
                await logEvent({ ...baseLog, handler_result: "doc bot: order refs not found" });
                continue;
              }
            }
          }
          // เติมข้อมูลจากไฟล์แนบล่าสุดในห้อง แล้วจากเอกสารใบก่อนหน้า (เฉพาะช่องที่ยังว่าง)
          let fileDraftId: string | null = null;
          if (docCmd.missing.length) {
            const pending = await loadPendingFileDraft(admin, groupId);
            if (pending) {
              const merged = applyDocBotCarryOver(docCmd, pending.extract);
              if (merged.missing.length < docCmd.missing.length) {
                docCmd = merged;
                fileDraftId = pending.id;
              }
            }
          }
          if (docCmd.missing.length) {
            const prev = await loadLastIssuedDoc(admin, groupId);
            if (prev) docCmd = applyDocBotCarryOver(docCmd, prev);
          }
          // ยังไม่มีรายการเลย → ถามเลขที่ออเดอร์ / ช่วงวันที่ก่อน
          if (!docCmd.fields.items.length) {
            await sendMessages([{
              type: "text",
              text: buildAskOrderRefText(docCmd.docType),
            }]);
            await logEvent({ ...baseLog, handler_result: "doc bot: ask order refs" });
            continue;
          }
          if (docCmd.missing.length) {
            await sendMessages([{ type: "text", text: buildDocBotMissingText(docCmd.docType, docCmd.missing) }]);
            await logEvent({ ...baseLog, handler_result: `doc bot: missing ${docCmd.missing.length}` });
            continue;
          }
          // โหมดพรีวิว — แสดงสรุปให้ตรวจก่อน แล้วต้องพิมพ์ “ยืนยัน” จึงออกเลขจริง
          if (!docConfirmed) {
            await savePreviewCommand(admin, groupId, docCmd, lineUserId);
            await sendMessages([
              ...(docPickNote ? [{ type: "text", text: docPickNote }] : []),
              {
                type: "flex",
                altText: "ตัวอย่างเอกสารก่อนออกจริง",
                contents: buildDocPreviewFlex(docCmd, { storeLabel: docRoomStore.storeLabel }),
                quickReply: DOC_ORDER_QUICK_REPLY,
              },
            ]);
            await logEvent({ ...baseLog, handler_result: `doc bot preview ${docCmd.docType}` });
            continue;
          }
          let docActor: string | null = null;
          if (docPerm.user_id) {
            const { data: prof } = await admin
              .from("profiles").select("full_name").eq("id", docPerm.user_id).maybeSingle();
            docActor = (prof as { full_name?: string } | null)?.full_name ?? null;
          }
          try {
            const issued = await issueDocFromLine(admin, {
              command: docCmd,
              messageId: String(ev.message?.id || webhookEventId || `${Date.now()}`),
              lineUserId: lineUserId ?? "",
              channelId: docRoom.id as string,
              actorLabel: docActor,
              lineToken: LINE_TOKEN,
              appOrigin,
              roomId: groupId,
            });
            if (fileDraftId) await consumeFileDraft(admin, fileDraftId, issued.docNo);
            await clearPreviewCommand(admin, groupId);
            const messages: unknown[] = [
              buildDocIssuedFlex({
                docType: docCmd.docType,
                docNo: issued.docNo,
                shopKey: (docCmd.fields.shopKey ?? "film") as "film" | "colorlab" | "printing",
                customerName: docCmd.fields.customerName ?? "-",
                itemCount: docCmd.fields.items.length,
                amountDue: docCmd.totals.amountDue,
                sentTo: issued.sentTo,
                imageUrl: issued.imageUrl,
                companionDocNos: issued.companionDocNos,
                docsUrl: `${appOrigin}/film-shop/receipts`,
              }),
            ];
            const allDocNos = [issued.docNo, ...(issued.companionDocNos ?? [])];
            if (issued.pdfUrl) {
              messages.push({
                type: "text",
                text: `📄 ไฟล์ PDF ${allDocNos.join(" · ")}\n${issued.pdfUrl}\n(กดลิงก์เพื่อเปิด/บันทึกไฟล์ ลิงก์ใช้ได้ 30 วัน)`,
              });
            }
            if (issued.sendError) {
              messages.push({
                type: "text",
                text: issued.sendError === "customer_not_linked"
                  ? "ℹ️ ยังส่งภาพให้ลูกค้าไม่ได้ เพราะเบอร์นี้ยังไม่ได้ผูก LINE กับร้านค่ะ (เอกสารออกเรียบร้อยแล้ว)"
                  : "ℹ️ ส่งภาพให้ลูกค้าไม่สำเร็จ ลองส่งซ้ำจากหน้าเอกสารในเว็บนะคะ",
              });
            }
            await sendMessages(messages);
            await logEvent({
              ...baseLog,
              handler_result: `doc bot: ${docCmd.docType} ${issued.docNo}${issued.already ? " (already)" : ""}${issued.sentTo ? " sent" : ""}`,
            });
          } catch (e) {
            const msg = String((e as Error)?.message || e);
            await sendMessages([{ type: "text", text: `❌ ออกเอกสารไม่สำเร็จค่ะ (${msg.slice(0, 120)})\nลองใหม่อีกครั้ง หรือออกจากหน้าเอกสารในเว็บ` }]);
            await logEvent({ ...baseLog, handler_result: "doc bot failed", handler_error: msg });
          }
          continue;
        }

        // 1d-0) คำสั่งรันคิว (เช็คคิว / สรุปงาน) — เฉพาะห้องที่ผูกไว้แล้วเท่านั้น
        const qc = parseQueueChatCommand(text);
        // ห้องบอทเอกสาร: ไม่มีระบบรันคิวงาน — ตอบชี้แจงแล้วจบ ไม่แตะตารางงานใด ๆ
        if (qc && docOnlyRoom) {
          await sendMessages([{ type: "text", text: DOC_ONLY_NOTICE }]);
          await logEvent({ ...baseLog, handler_result: "doc-only room: queue command ignored" });
          continue;
        }
        if (qc && groupId) {
          const { data: boundRoom } = await admin
            .from("line_notification_channels")
            .select("id, display_name")
            .eq("line_destination_id", groupId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          if (!boundRoom) {
            await sendMessages([{ type: "text", text: `ห้องนี้ยังไม่ได้ผูกกับระบบคิวค่ะ พิมพ์ "เชื่อมกลุ่มรันคิว" ก่อนนะคะ` }]);
            await logEvent({ ...baseLog, handler_result: "queue chat: room not bound" });
            continue;
          }
          // สิทธิ์ต่อห้อง + ต่อบัญชีผู้ส่ง (ตัดสินในฐานข้อมูล ห้ามเชื่อ payload จาก LINE)
          const { data: permRaw } = await admin.rpc("line_queue_command_allowed", {
            _line_user_id: lineUserId ?? "",
            _channel_id: boundRoom.id,
          });
          const perm = (permRaw ?? {}) as { allowed?: boolean; reason?: string; user_id?: string | null };
          if (!perm.allowed) {
            await sendMessages([{
              type: "text",
              text: queueDenyText(String(perm.reason || ""), `${appOrigin}/admin/line-groups`),
            }]);
            await logEvent({ ...baseLog, handler_result: `queue chat: denied ${perm.reason ?? "unknown"}` });
            continue;
          }
          let actor: string | null = null;
          if (perm.user_id) {
            const { data: prof } = await admin
              .from("profiles").select("full_name").eq("id", perm.user_id).maybeSingle();
            actor = (prof as { full_name?: string } | null)?.full_name ?? null;
          }
          const OPEN = ["done", "cancelled"];
          // สรุปจำนวนคิวล่าสุด ณ วินาทีที่ตอบกลับ (นับใหม่ทุกครั้งหลังทำคำสั่ง)
          const queueStats = async () => {
            const startOfDay = new Date();
            startOfDay.setUTCHours(startOfDay.getUTCHours() + 7);
            startOfDay.setUTCHours(0, 0, 0, 0);
            startOfDay.setUTCHours(startOfDay.getUTCHours() - 7);
            const [openRes, runRes, doneRes] = await Promise.all([
              admin.from("film_order_jobs").select("id", { count: "exact", head: true })
                .not("status", "in", `("done","cancelled")`),
              admin.from("film_order_jobs").select("id", { count: "exact", head: true })
                .eq("status", "producing"),
              admin.from("film_order_jobs").select("id", { count: "exact", head: true })
                .eq("status", "done").gte("done_at", startOfDay.toISOString()),
            ]);
            const total = openRes.count ?? 0;
            const running = runRes.count ?? 0;
            return { running, waiting: Math.max(0, total - running), total, doneToday: doneRes.count ?? 0 };
          };
          if (qc.kind === "queue_list") {
            // (การ์ดคิว + ปุ่มลัด 4 ปุ่ม)
            const { data: jobs } = await admin
              .from("film_order_jobs")
              .select("job_no,queue_code,title,status,priority,created_at,film_orders(customer_name)")
              .not("status", "in", `(${OPEN.map((s) => `"${s}"`).join(",")})`)
              .order("status", { ascending: true })
              .order("priority", { ascending: true })
              .order("created_at", { ascending: true })
              .limit(15);
            const sorted = (jobs ?? []).slice().sort((a: any, b: any) =>
              (a.status === "producing" ? 0 : 1) - (b.status === "producing" ? 0 : 1));
            const listJobs = sorted.map((j: any) => ({ ...j, customer_name: j.film_orders?.customer_name ?? null }));
            await sendMessages([withQueueQuickReply(
              buildQueueListFlex(listJobs, `${appOrigin}/admin/control-room`, await queueStats()),
            )]);
            await logEvent({ ...baseLog, handler_result: "queue chat: list" });
            continue;
          }
          if (qc.kind === "menu") {
            await sendMessages([withQueueQuickReply({ type: "text", text: buildQueueMenuText() })]);
            await logEvent({ ...baseLog, handler_result: "queue chat: menu" });
            continue;
          }

          /* ---- งานที่ควรโฟกัสตอนนี้ (ใช้ร่วมกับการ์ด "งานปัจจุบัน" และปุ่มออกเอกสาร) ---- */
          const JOB_COLS =
            "id,job_no,queue_code,title,status,priority,planned_finish_at,assigned_employee_id,assigned_at,order_id,film_orders(customer_name)";
          const loadFocusJob = async (jobId?: string | null) => {
            if (jobId) {
              const { data } = await admin.from("film_order_jobs").select(JOB_COLS).eq("id", jobId).maybeSingle();
              if (data) return data as any;
            }
            const { data: running } = await admin.from("film_order_jobs").select(JOB_COLS)
              .eq("status", "producing").order("updated_at", { ascending: false }).limit(1).maybeSingle();
            if (running) return running as any;
            const { data: waiting } = await admin.from("film_order_jobs").select(JOB_COLS)
              .not("status", "in", `("done","cancelled")`)
              .order("priority", { ascending: true }).order("created_at", { ascending: true })
              .limit(1).maybeSingle();
            return (waiting ?? null) as any;
          };
          /** ยอดโดยประมาณ = ผลรวมรายการจริงของออเดอร์ (สูตรเดียวกับเอกสาร) */
          const orderAmount = async (orderId?: string | null) => {
            if (!orderId) return null;
            const { data } = await admin.from("film_order_items").select("total").eq("order_id", orderId);
            return sumItemTotals(data as any);
          };
          const employeeName = async (empId?: string | null) => {
            if (!empId) return null;
            const { data } = await admin.from("film_employees").select("name").eq("id", empId).maybeSingle();
            return (data as { name?: string } | null)?.name ?? null;
          };
          /** เหตุการณ์ "รับงาน" ล่าสุดของ job — ใช้เป็น fallback ชื่อผู้รับบนการ์ด */
          const lastTakeEvent = async (jobId?: string | null) => {
            if (!jobId) return null;
            const { data } = await admin
              .from("film_order_events")
              .select("note,created_at")
              .eq("order_job_id", jobId).eq("action", "queue_take")
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            return (data as { note?: string | null } | null) ?? null;
          };
          /**
           * หา film_employees ที่ตรงกับผู้ใช้ LINE คนนี้แบบไม่เดา:
           * perm.user_id → profiles(email/phone) → film_employees active ที่ match พอดีคนเดียว
           */
          const resolveEmployeeId = async (): Promise<string | null> => {
            if (!perm.user_id) return null;
            const { data: prof } = await admin
              .from("profiles").select("email,phone").eq("id", perm.user_id).maybeSingle();
            const identity = { email: (prof as any)?.email ?? null, phone: (prof as any)?.phone ?? null };
            if (!normalizeEmail(identity.email) && !normalizePhone(identity.phone)) return null;
            const { data: emps } = await admin
              .from("film_employees").select("id,email,phone,is_active").eq("is_active", true);
            return matchEmployeeByIdentity(emps as any, identity).employeeId;
          };
          const toCurrentBrief = async (job: any) => job ? ({
            id: job.id,
            job_no: job.job_no,
            queue_code: job.queue_code,
            title: job.title,
            status: job.status,
            customer_name: job.film_orders?.customer_name ?? null,
            due: job.planned_finish_at ? thaiTime(job.planned_finish_at) : null,
            assignee: assigneeDisplay({
              employeeName: await employeeName(job.assigned_employee_id),
              lastTakeNote: job.assigned_employee_id ? null : (await lastTakeEvent(job.id))?.note ?? null,
            }),
            amount_due: await orderAmount(job.order_id),
          }) : null;

          // "ตอนนี้ทำอะไร / งานปัจจุบัน / รีเฟรช" → การ์ดเดียวจบ อ่านสถานะสดจากฐานข้อมูลเสมอ
          if (qc.kind === "current_job") {
            const job = await loadFocusJob(nqPost?.jobId);
            await sendMessages([buildCurrentJobFlex(await toCurrentBrief(job), {
              controlRoomUrl: `${appOrigin}/admin/control-room`,
              stats: await queueStats(),
            })]);
            await logEvent({ ...baseLog, handler_result: `queue chat: current ${job?.job_no ?? "-"}` });
            continue;
          }

          // ปุ่มเอกสาร — ไม่ออกเลขจากบอท (ออกเลขจริงทำในเว็บที่ล็อกอินเท่านั้น)
          // ถ้าเคยออกแล้วให้บอกเลขเดิม เพื่อไม่ให้กดซ้ำแล้วเกิดเอกสารซ้ำ
          if (qc.kind === "doc_job_order" || qc.kind === "doc_receipt") {
            const wantType = qc.kind === "doc_job_order" ? "job_order" : "receipt";
            const label = qc.kind === "doc_job_order" ? "ใบสั่งจ้าง" : "ใบเสร็จรับเงิน";
            const job = await loadFocusJob(nqPost?.jobId);
            if (!job) {
              await sendMessages([withQueueQuickReply({ type: "text", text: `ยังไม่มีงานให้ออก${label}ค่ะ` })]);
              await logEvent({ ...baseLog, handler_result: `queue chat: doc ${wantType} no job` });
              continue;
            }
            const { data: existing } = await admin
              .from("film_invoices").select("invoice_number,created_at")
              .eq("source_order_id", job.order_id).eq("type", wantType)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            const docsUrl = `${appOrigin}/film-shop?p=group-queue&q=documents`;
            const jobLabelText = job.queue_code || job.job_no || "-";
            await sendMessages([withQueueQuickReply({
              type: "text",
              text: existing
                ? `📄 งาน ${jobLabelText} เคยออก${label}แล้ว เลขที่ ${(existing as any).invoice_number} — ไม่ออกซ้ำค่ะ\n${docsUrl}`
                : `📄 งาน ${jobLabelText} พร้อมออก${label}ค่ะ\nกดออกเลขจริงในเว็บที่ล็อกอินเท่านั้น เพื่อกันเลขเอกสารซ้ำ:\n${docsUrl}`,
            })]);
            await logEvent({ ...baseLog, handler_result: `queue chat: doc ${wantType} ${existing ? "already" : "link"}` });
            continue;
          }
          // "รับงาน" → การ์ดเดียวจบ พร้อมปุ่มเปิดฟอร์มรับงาน (token อายุสั้น) + ปุ่มยกเลิก
          if (qc.kind === "intake_card") {
            try {
              const made = await createIntakeFormToken(admin, {
                channelKey: storeId,
                groupId,
                lineUserId: lineUserId ?? "",
                storeLabel: channel?.label ?? null,
                source: "command",
              });
              await sendMessages([withQueueQuickReply(buildIntakeSingleCardFlex({
                sessionId: made.cardKey,
                fromFile: false,
                reviewCount: 0,
                formUrl: intakeFormUrl(appOrigin, made.token),
                lines: [
                  { no: 1, label: "ลูกค้า", value: "ยังไม่ได้ระบุ", found: false },
                  { no: 2, label: "โทร", value: "ยังไม่ได้ระบุ", found: false },
                  { no: 3, label: "รายการงาน", value: "ยังไม่ได้ระบุ", found: false },
                  { no: 4, label: "กำหนดรับ", value: "ยังไม่ได้ระบุ", found: false },
                ],
              }))]);
              await logEvent({ ...baseLog, handler_result: "queue chat: intake card" });
            } catch (e) {
              await sendMessages([withQueueQuickReply({ type: "text", text: "เปิดฟอร์มรับงานไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ" })]);
              await logEvent({ ...baseLog, handler_result: "queue chat: intake card failed", handler_error: String((e as Error)?.message || e) });
            }
            continue;
          }
          if (qc.kind === "queue_take") {
            const { data: running } = await admin
              .from("film_order_jobs")
              .select("id,job_no,queue_code,title,status,order_id,assigned_employee_id,film_orders(customer_name)")
              .eq("status", "producing")
              .limit(1)
              .maybeSingle();
            if (running) {
              // กดซ้ำ = บอกว่าใครรับไปแล้ว ไม่เขียนทับผู้รับเดิม
              const holder = await employeeName((running as any).assigned_employee_id);
              await sendMessages([withQueueQuickReply(buildQueueTakeFlex(
                { ...running, customer_name: (running as any).film_orders?.customer_name ?? null },
                `${appOrigin}/admin/control-room`, holder ?? actor, await queueStats(),
              ))]);
              await logEvent({ ...baseLog, handler_result: "queue chat: take (already running)" });
              continue;
            }
            const { data: pick } = await admin
              .from("film_order_jobs")
              .select("id,job_no,queue_code,title,status,order_id,assigned_employee_id,film_orders(customer_name)")
              .not("status", "in", `("done","cancelled","producing")`)
              .order("priority", { ascending: true })
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (!pick || !canTakeQueueStatus((pick as any).status)) {
              await sendMessages([withQueueQuickReply(buildQueueTakeFlex(
                null, `${appOrigin}/admin/control-room`, actor, await queueStats(),
              ))]);
              await logEvent({ ...baseLog, handler_result: "queue chat: take (no waiting job)" });
              continue;
            }
            const takenAt = new Date().toISOString();
            // conditional update: guard ทั้ง id และ status เดิม → มีเพียง webhook เดียวที่ชนะ race
            const { data: tookRows } = await admin.from("film_order_jobs")
              .update(buildTakeUpdate({
                currentAssigneeId: (pick as any).assigned_employee_id ?? null,
                matchedEmployeeId: await resolveEmployeeId(),
                takenAt,
              }))
              .eq("id", pick.id)
              .eq("status", (pick as any).status)
              .select("id");
            if (!tookRows?.length) {
              // แพ้ race — ห้าม insert event ซ้ำ ให้อ่านสถานะล่าสุดแล้วบอกว่าใครรับไปแล้ว
              const latest = await loadFocusJob(pick.id);
              const holder = assigneeDisplay({
                employeeName: await employeeName((latest as any)?.assigned_employee_id),
                lastTakeNote: (await lastTakeEvent(pick.id))?.note ?? null,
              });
              await sendMessages([withQueueQuickReply(buildQueueTakeFlex(
                latest ? { ...(latest as any), customer_name: (latest as any).film_orders?.customer_name ?? null } : null,
                `${appOrigin}/admin/control-room`, holder ?? actor, await queueStats(),
              ))]);
              await logEvent({ ...baseLog, handler_result: "queue chat: take race lost" });
              continue;
            }
            await admin.from("film_order_events").insert({
              order_id: (pick as any).order_id,
              order_job_id: pick.id,
              from_status: (pick as any).status,
              to_status: "producing",
              action: "queue_take",
              note: actor ? `รับงานผ่าน LINE โดย ${actor}` : "รับงานผ่าน LINE",
              created_by: perm.user_id ?? null,
            });
            await sendMessages([withQueueQuickReply(buildQueueTakeFlex(
              { ...(pick as any), customer_name: (pick as any).film_orders?.customer_name ?? null },
              `${appOrigin}/admin/control-room`, actor, await queueStats(),
            ))]);
            await logEvent({ ...baseLog, handler_result: `queue chat: take ${pick?.job_no ?? "-"}` });
            continue;
          }
          // ปิดงานที่กำลังทำ แล้วดึงคิวถัดไปขึ้นมา
          const { data: current } = await admin
            .from("film_order_jobs")
            .select("id,job_no,queue_code,title,status,order_id,film_orders(customer_name)")
            .eq("status", "producing")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!current) {
            await sendMessages([buildQueueCloseFlex(null, null, `${appOrigin}/admin/control-room`, null, await queueStats())]);
            await logEvent({ ...baseLog, handler_result: "queue chat: no running job" });
            continue;
          }
          const { data: closedRows } = await admin
            .from("film_order_jobs")
            .update({ status: "done", done_at: new Date().toISOString() })
            .eq("id", current.id)
            .eq("status", "producing")
            .select("id");
          if (!closedRows?.length) {
            await sendMessages([{ type: "text", text: "มีคนปิดงานนี้ไปแล้วค่ะ ลองพิมพ์ \"เช็คคิว\" อีกครั้งนะคะ" }]);
            await logEvent({ ...baseLog, handler_result: "queue chat: close race" });
            continue;
          }
          // ยอดสรุปคิดจากรายการจริงของออเดอร์ (สูตรเดียวกับที่เอกสารใช้)
          const closedAmount = await orderAmount((current as any).order_id);
          await admin.from("film_order_events").insert({
            order_id: (current as any).order_id,
            order_job_id: current.id,
            from_status: "producing",
            to_status: "done",
            action: "queue_close",
            note: `สรุปงานผ่าน LINE${actor ? ` โดย ${actor}` : ""} · ยอด ${Number(closedAmount ?? 0).toLocaleString("th-TH")} บาท`,
            created_by: perm.user_id ?? null,
          });
          const { data: nextJob } = await admin
            .from("film_order_jobs")
            .select("id,job_no,queue_code,title,status,film_orders(customer_name)")
            .not("status", "in", `("done","cancelled","producing")`)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (nextJob) {
            await admin.from("film_order_jobs")
              .update({ status: "producing" })
              .eq("id", nextJob.id)
              .not("status", "in", `("done","cancelled")`);
          }
          await sendMessages([
            buildQueueCloseFlex(
              { ...current, customer_name: (current as any).film_orders?.customer_name ?? null },
              nextJob ? { ...nextJob, customer_name: (nextJob as any).film_orders?.customer_name ?? null } : null,
              `${appOrigin}/admin/control-room`, actor, await queueStats(),
            ),
            withQueueQuickReply({
              type: "text",
              text: `💰 ยอดรวมจากรายการจริง ${Number(closedAmount ?? 0).toLocaleString("th-TH")} บาท — พร้อมออกเอกสารค่ะ`,
            }),
          ]);
          await logEvent({ ...baseLog, handler_result: `queue chat: closed ${current.job_no ?? current.id}` });
          continue;
        }

        if (isMutatingCommand(text)) {
          await sendMessages([{ type: "text", text: `${MUTATION_REFUSAL}\n${appOrigin}/admin/control-room` }]);
          await logEvent({ ...baseLog, handler_result: "admin room mutation refused" });
          continue;
        }
        const q = parseAdminQuery(text);
        if (q && docOnlyRoom) {
          await sendMessages([{ type: "text", text: DOC_ONLY_NOTICE }]);
          await logEvent({ ...baseLog, handler_result: "doc-only room: queue query ignored" });
          continue;
        }
        if (q) {
          if (q.kind === "system_status") {
            const [{ count: pending }, { count: failed }, { count: openJobs }, { data: rooms }] = await Promise.all([
              admin.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
              admin.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
              admin.from("film_order_jobs").select("id", { count: "exact", head: true }).neq("status", "done"),
              admin.from("line_notification_channels").select("id").eq("store_id", storeId).eq("channel_type", "admin_group").eq("is_active", true),
            ]);
            await sendMessages([{
              type: "text",
              text: buildSystemStatusText({
                channelConfigured: Boolean(LINE_TOKEN),
                adminRoomActive: (rooms ?? []).length > 0,
                pendingNotifications: pending ?? 0,
                failedNotifications: failed ?? 0,
                openJobs: openJobs ?? 0,
                controlRoomUrl: `${appOrigin}/admin/control-room`,
              }),
            }]);
            await logEvent({ ...baseLog, handler_result: "admin room system status" });
            continue;
          }
          if (q.kind === "find") {
            const found = await lookupJob(admin, q.code);
            await sendMessages([{
              type: "text",
              text: found
                ? `🔎 ${q.code}\n${JSON.stringify(found).slice(0, 400)}\n${appOrigin}/admin/control-room`
                : `ไม่พบงาน ${q.code} ค่ะ`,
            }]);
            await logEvent({ ...baseLog, handler_result: `admin room find ${q.code}` });
            continue;
          }
          const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
          let query = admin.from("film_order_jobs")
            .select("job_no,title,status,priority,planned_finish_at")
            .neq("status", "done").order("priority", { ascending: true }).limit(15);
          if (q.kind === "today") {
            query = query.gte("planned_finish_at", startOfDay.toISOString()).lt("planned_finish_at", endOfDay.toISOString());
          } else {
            query = query.lte("priority", 50);
          }
          const { data: jobs } = await query;
          const lines = (jobs ?? []).map((j: any) => `• ${j.job_no ?? "-"} · ${j.title ?? ""} · ${j.status}`);
          await sendMessages([{
            type: "text",
            text: (q.kind === "today" ? "🗓️ คิววันนี้\n" : "🔥 งานด่วน\n") +
              (lines.length ? lines.join("\n") : "ไม่มีงานในหมวดนี้ค่ะ") +
              `\n\n${appOrigin}/admin/control-room`,
          }]);
          await logEvent({ ...baseLog, handler_result: `admin room ${q.kind}` });
          continue;
        }
      }

      /* -------- 1d-2) น้องนัตต้า: ผู้ช่วยบัญชี Film Shop (DM แอดมินเท่านั้น) ------- */
      // ทำงานเฉพาะแชทส่วนตัว และเฉพาะเมื่อข้อความเป็นคำสั่งบัญชีที่ชัดเจน
      // แชทลูกค้า/ห้องกลุ่ม/ร้านอื่นไม่ได้รับผลกระทบ
      if (
        channel?.id === "natta" &&
        ev.type === "message" && ev.message?.type === "text" &&
        lineUserId && (ev?.source?.type ?? "user") === "user"
      ) {
        const nattaText = String(ev.message.text || "");
        const nattaCmd = parseNattaCommand(nattaText);
        if (nattaCmd) {
          // ต้องเป็นแอดมิน/ผู้จัดการ Film Shop เท่านั้น — ลูกค้าทั่วไปที่พิมพ์
          // ข้อความคล้ายคำสั่งบัญชี (เช่น "ค่าส่ง 80") ต้องไหลต่อไปหาบทสนทนารับงาน
          // ไม่ใช่โดนตอบว่า "ไม่มีสิทธิ์"
          const adminProfileId = await resolveAdminProfileId(lineUserId);
          if (adminProfileId) {
            const res = await handleNattaAccountant({
              admin,
              lineUserId,
              messageId: (ev?.message?.id as string) || null,
              eventId: webhookEventId,
              isAuthorized: true,
              lineToken: LINE_TOKEN,
            }, nattaText);
            if (res.handled) {
              if (res.flex) await sendMessages([res.flex]);
              else if (res.reply) await sendMessages([{ type: "text", text: res.reply }]);
              await logEvent({ ...baseLog, handler_result: res.info || "natta accountant" });
              continue;
            }
          }
        }
      }


      // 1e) บทสนทนารับงาน (ทั้งลูกค้าและแอดมิน)
      // (ห้องบอทเอกสาร: ไม่รับงานเข้าคิวเด็ดขาด)
      if (!docOnlyRoom && ev.type === "message" && ev.message?.type === "text" && lineUserId) {
        const text = String(ev.message.text || "");
        const cmd = parseIntakeCommand(text);
        const openSession = await loadOpenSession(admin, lineUserId);
        if (cmd || openSession) {
          if (await hitRateLimit(admin, lineUserId)) {
            await sendMessages([{ type: "text", text: "ส่งข้อความถี่เกินไปค่ะ กรุณารอสักครู่แล้วลองใหม่" }]);
            await logEvent({ ...baseLog, handler_result: "film_intake rate limited" });
            continue;
          }
          if (cmd?.kind === "check") {
            const found = await lookupJob(admin, cmd.jobNo);
            await sendMessages([{
              type: "text",
              text: found ? `สถานะ ${cmd.jobNo}: ${(found as any).status ?? (found as any).stage ?? "-"}` : `ไม่พบงาน ${cmd.jobNo} ค่ะ`,
            }]);
            await logEvent({ ...baseLog, handler_result: `film_intake check ${cmd.jobNo}` });
            continue;
          }
          // “สั่งงาน” ในกลุ่ม → การ์ดใบเดียว “รับงานใหม่” + ปุ่มเปิดฟอร์มสั่งงาน (ไม่ถามทีละข้อ)
          if (cmd?.kind === "start" && groupId) {
            try {
              const made = await createIntakeFormToken(admin, {
                channelKey: storeId,
                groupId,
                lineUserId,
                storeLabel: channel?.label ?? null,
                source: "command",
              });
              await sendMessages([withQueueQuickReply(buildIntakeSingleCardFlex({
                sessionId: made.cardKey,
                fromFile: false,
                reviewCount: 0,
                formUrl: intakeFormUrl(appOrigin, made.token),
                lines: [
                  { no: 1, label: "ลูกค้า", value: "ยังไม่ได้ระบุ", found: false },
                  { no: 2, label: "โทร", value: "ยังไม่ได้ระบุ", found: false },
                  { no: 3, label: "รายการงาน", value: "ยังไม่ได้ระบุ", found: false },
                  { no: 4, label: "กำหนดรับ", value: "ยังไม่ได้ระบุ", found: false },
                ],
              }))]);
              await logEvent({ ...baseLog, handler_result: "film_intake single card" });
              continue;
            } catch (e) {
              console.error("intake form link failed", e);
            }
          }
          if (cmd || openSession) {
            const result = applyIntakeMessage(openSession, text);
            const saved = await persistSession(
              admin,
              { ...result.session, id: openSession?.id },
              { lineUserId, storeId, sourceType, roomId: groupId, eventId: webhookEventId },
            );
            if (result.confirm) {
              try {
                const res = await finishIntake(saved);
                await logEvent({ ...baseLog, handler_result: `film_intake confirmed ${res.orderNo}` });
              } catch (e) {
                await sendMessages([{ type: "text", text: "เปิดงานไม่สำเร็จ กรุณาลองใหม่อีกครั้งค่ะ" }]);
                await logEvent({ ...baseLog, handler_result: "film_intake confirm failed", handler_error: String((e as Error)?.message || e) });
              }
              continue;
            }
            const out: unknown[] = [];
            if (result.reply) out.push({ type: "text", text: result.reply });
            if (result.showReview) out.push(buildReviewFlex(saved, saved.id));
            if (out.length) await sendMessages(out);
            if (out.length || result.cancelled) {
              await logEvent({ ...baseLog, handler_result: `film_intake ${saved.state}` });
              continue;
            }
          }
        }
      }

      // 2) Thai text commands
      if (ev.type === "message" && ev.message?.type === "text") {
        const rawText = String(ev.message.text || "");

        // 2a) ช่วยเหลือ — รายการคำสั่งแบบสั้น
        if (isHelpCommand(rawText)) {
          await replyFlex([buildTextMessage(buildHelpText())]);
          await logEvent({ ...baseLog, message_text: "ช่วยเหลือ", handler_result: "help" });
          continue;
        }

        // 2b) ผูกห้องนี้กับร้าน / ดูร้านของห้องนี้ / รายชื่อร้าน
        const setStoreQuery = parseSetStoreCommand(rawText);
        const storeInfo = parseStoreInfoCommand(rawText);
        if (isConfirmStoreCommand(rawText)) {
          await replyFlex([buildTextMessage(
            "กรุณากดปุ่ม “ยืนยันเปลี่ยนร้าน” ในการ์ดที่ระบบส่งให้\nหรือพิมพ์ ผูกร้าน <ชื่อร้าน> ใหม่อีกครั้ง",
          )]);
          await logEvent({ ...baseLog, handler_result: "store map confirm via text" });
          continue;
        }
        if (setStoreQuery || storeInfo) {
          if (!groupId) {
            await replyFlex([buildTextMessage("คำสั่งนี้ใช้ได้เฉพาะในกลุ่มแชทของร้านเท่านั้น")]);
            await logEvent({ ...baseLog, handler_result: "store map: not a group" });
            continue;
          }
          const { data: storeRows } = await admin
            .from("line_credentials")
            .select("id, display_name")
            .eq("is_active", true);
          const stores = ((storeRows ?? []) as any[]).map((s) => ({
            id: String(s.id),
            display_name: s.display_name as string | null,
          }));

          if (storeInfo === "list") {
            await replyFlex([buildTextMessage(buildStoreListText(stores))]);
            await logEvent({ ...baseLog, handler_result: "store list" });
            continue;
          }

          const { data: roomRows } = await admin
            .from("line_notification_channels")
            .select("id, store_id, channel_type, is_active, updated_at, last_verified_at, linked_at")
            .eq("line_destination_id", groupId);
          const rooms = ((roomRows ?? []) as any[]).filter((r) => r.is_active !== false);
          if (!rooms.length) {
            await replyFlex([buildTextMessage("ห้องนี้ยังไม่ได้เชื่อมกับระบบ พิมพ์ ช่วยเหลือ เพื่อดูคำสั่งเชื่อมห้อง")]);
            await logEvent({ ...baseLog, handler_result: "store map: room not linked" });
            continue;
          }

          if (storeInfo === "current") {
            const bindings = rooms.map((r) => {
              const s = stores.find((x) => x.id === r.store_id);
              return {
                channel_type: String(r.channel_type),
                storeLabel: s ? storeLabelOf(s) : String(r.store_id ?? "-"),
                isActive: r.is_active !== false,
                updatedAt: (r.updated_at || r.last_verified_at || r.linked_at) as string | null,
              };
            });
            await replyFlex([buildTextMessage(buildRoomBindingText(bindings))]);
            await logEvent({ ...baseLog, handler_result: "store current" });
            continue;
          }

          const match = matchStore(String(setStoreQuery), stores);
          if (!match.ok) {
            await replyFlex([buildTextMessage(
              (match.reason === "ambiguous"
                ? "ชื่อร้านนี้ตรงหลายร้าน กรุณาระบุให้ชัดเจนขึ้น\n\n"
                : "ไม่พบร้านที่ตรงกับชื่อนี้\n\n") + buildStoreListText(stores),
            )]);
            await logEvent({ ...baseLog, handler_result: `store map failed (${match.reason})` });
            continue;
          }

          // กันผูกซ้ำ / กันทับของเดิมโดยไม่ยืนยัน
          const alreadySame = rooms.every((r) => String(r.store_id ?? "") === match.store.id);
          if (alreadySame) {
            await replyFlex([buildTextMessage(
              `ห้องนี้ผูกกับร้าน “${storeLabelOf(match.store)}” อยู่แล้ว ไม่มีการเปลี่ยนแปลง`,
            )]);
            await logEvent({ ...baseLog, handler_result: "store map: already bound" });
            continue;
          }
          const conflicting = rooms.find(
            (r) => r.store_id && String(r.store_id) !== match.store.id,
          );
          if (conflicting) {
            const prev = stores.find((x) => x.id === String(conflicting.store_id));
            await replyFlex([buildStoreOverwriteConfirmFlex({
              fromLabel: prev ? storeLabelOf(prev) : String(conflicting.store_id),
              toLabel: storeLabelOf(match.store),
              storeId: match.store.id,
            })]);
            await logEvent({ ...baseLog, handler_result: "store map: confirm required" });
            continue;
          }
          await admin
            .from("line_notification_channels")
            .update({ store_id: match.store.id, last_verified_at: new Date().toISOString() })
            .in("id", rooms.map((r) => r.id));
          await replyFlex([buildTextMessage(
            `ผูกห้องนี้กับร้าน “${storeLabelOf(match.store)}” แล้ว\nเอกสารและแจ้งเตือนจากห้องนี้จะใช้ข้อมูลของร้านนี้`,
          )]);
          await logEvent({
            ...baseLog,
            handler_result: `store map → ${match.store.id} (${maskDestination(groupId)})`,
          });
          continue;
        }

        const target = parseAdminGroupTarget(ev.message.text);
        const cmd = target?.command ?? null;
        if (target && cmd) {
          const channelType = target.channelType;
          const roomLabel =
            channelType === "queue_group"
              ? "กลุ่มรันคิว NATTA.Q"
              : channelType === "doc_group"
                ? "ห้องแจ้งเตือนออกเอกสาร"
                : channelType === "order_group"
                  ? "กลุ่มแจ้งเตือนคำสั่งซื้อ"
                  : "ห้องแจ้งเตือนออเดอร์";
          const adminProfileId = await resolveAdminProfileId(lineUserId);
          const state = groupId
            ? await loadGroupState(groupId, channelType)
            : { existing: null, otherActive: null };
          const decision = decideAdminGroupAction({
            command: cmd,
            sourceType,
            isAdmin: Boolean(adminProfileId),
            state,
          });
          const nowIso = new Date().toISOString();
          switch (decision.action) {
            case "reject_not_group":
              await replyFlex([buildTextMessage("คำสั่งนี้ใช้ได้เฉพาะในกลุ่มแชทของร้านเท่านั้น")]);
              break;
            case "reject_not_admin":
              // เงียบไว้ ไม่ตอบข้อความชวนผูกบัญชีแอดมินอัตโนมัติ
              break;
            case "already_linked":
              await replyFlex([buildAlreadyLinkedFlex(settingsUrl)]);
              break;
            case "connect":
            case "reactivate": {
              if (decision.replaces) await deactivate(decision.replaces);
              let groupName: string | null = null;
              try {
                if (LINE_TOKEN && groupId) {
                  const gr = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
                    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
                  });
                  if (gr.ok) groupName = (await gr.json())?.groupName ?? null;
                }
              } catch { /* name is cosmetic */ }
              if (decision.action === "reactivate") {
                await admin.from("line_notification_channels").update({
                  is_active: true,
                  display_name: groupName,
                  linked_by: adminProfileId ?? null,
                  linked_at: nowIso,
                  last_verified_at: nowIso,
                }).eq("id", decision.channelId);
              } else {
                // ห้องแรกของประเภทนี้จะถูกตั้งเป็นห้องสำรอง (hub) ให้อัตโนมัติ
                const { data: hubRow } = await admin
                  .from("line_notification_channels")
                  .select("id")
                  .eq("channel_type", channelType)
                  .eq("is_hub", true)
                  .eq("is_active", true)
                  .maybeSingle();
                await admin.from("line_notification_channels").insert({
                  store_id: storeId,
                  channel_type: channelType,
                  // ห้องแจ้งเตือนคำสั่งซื้อ = ปลายทางอย่างเดียว ห้ามรับคำสั่งคิว/เอกสาร
                  ...(channelType === "order_group"
                    ? { queue_commands_enabled: false, doc_commands_enabled: false }
                    : {}),
                  line_destination_id: groupId,
                  display_name: groupName,
                  is_active: true,
                  is_hub: !hubRow,
                  linked_by: adminProfileId ?? null,
                  linked_at: nowIso,
                  last_verified_at: nowIso,
                });
              }
              await replyFlex([
                buildTextMessage(`ตั้งห้องนี้เป็น “${roomLabel}” แล้ว`),
                buildConnectedFlex(settingsUrl),
              ]);
              break;
            }
            case "test": {
              const r = await replyLineMessages(LINE_TOKEN, replyToken ?? "", [buildTestFlex()]);
              await logDelivery(decision.channelId, "test", r.ok, r.error ? `http_${r.status ?? 0}` : undefined);
              await admin.from("line_notification_channels").update({
                last_test_status: r.ok ? "success" : "failed",
                last_test_at: nowIso,
                last_verified_at: nowIso,
              }).eq("id", decision.channelId);
              break;
            }
            case "status": {
              let linkedAt: string | null = null;
              if (decision.channelId) {
                const { data: row } = await admin.from("line_notification_channels")
                  .select("linked_at").eq("id", decision.channelId).maybeSingle();
                linkedAt = row?.linked_at ? new Date(row.linked_at as string).toLocaleString("th-TH") : null;
              }
              await replyFlex([buildStatusFlex({ linked: Boolean(decision.channelId), isActive: decision.isActive, linkedAt })]);
              break;
            }
            case "cancel_confirm":
              await replyFlex([buildCancelConfirmFlex(decision.channelId)]);
              break;
            case "not_linked":
              // เงียบไว้ ไม่แจ้งเตือนให้เชื่อมห้องแอดมินอัตโนมัติ
              break;
            default:
              break;
          }
          await logEvent({
            ...baseLog,
            message_text: cmd,
            handler_result: `${channelType} ${cmd} → ${decision.action} (${maskDestination(groupId)})`,
          });
          continue;
        }
      }

      // Group/room events other than the admin commands above are ignored.
      if (sourceType && sourceType !== "user") {
        await logEvent({ ...baseLog, handler_result: `ignored non-user source (${sourceType})` });
        continue;
      }

      // Always refresh the store-scoped customer profile (name + picture).
      if (lineUserId) await syncStoreCustomer(admin, lineUserId);

      if (ev.type === "follow" && lineUserId) {
        // Push a realtime signal so a customer waiting on the add-friend
        // screen is taken to the shop instantly (no polling needed).
        await broadcastLineLinked(lineUserId, "followed");
        // ทางลัดในแชท: การ์ดต้อนรับ + ปุ่ม "สั่งสินค้า" / "งานของฉัน"
        // (เสริมเท่านั้น — ไม่แตะ logic ผูกบัญชี/auto-redirect ฝั่งเว็บ)
        let welcome = "no reply token";
        if (replyToken) {
          const r = await replyLineMessages(LINE_TOKEN, replyToken, buildFollowWelcomeMessages(origin));
          welcome = r.ok ? "welcome sent" : `welcome failed (${r.status ?? 0})`;
        }
        await logEvent({ ...baseLog, handler_result: `follow — ${welcome}; userId=${lineUserId}` });
        continue;
      }


      // LINE voice note -> Thai transcript -> same command parser (draft only).
      if (ev.type === "message" && ev.message?.type === "audio" && lineUserId) {
        const messageId: string | undefined = ev.message?.id;
        const apiKey = Deno.env.get("LOVABLE_API_KEY");
        if (!messageId || !channel?.token || !apiKey) {
          await logEvent({
            ...baseLog,
            handler_result: "audio command skipped",
            handler_error: !apiKey ? "missing LOVABLE_API_KEY" : "missing channel token / message id",
          });
          continue;
        }
        try {
          const audio = await fetchLineAudio(messageId, channel.token);
          const transcript = await transcribeLineAudio(audio, apiKey);
          if (!transcript) {
            await logEvent({ ...baseLog, handler_result: "audio command empty transcript" });
            continue;
          }
          const profA = await getProfile(lineUserId);
          const res = await ingestDocCommand(admin, {
            messageId,
            lineUserId,
            displayName: profA?.displayName ?? null,
            text: transcript,
            transcript,
            source: "line_audio",
          });
          await logEvent({
            ...baseLog,
            message_text: transcript.slice(0, 1000),
            handler_result: `audio command ${res.duplicate ? "duplicate" : "draft"} ${res.docType}${res.missing.length ? ` (ขาด: ${res.missing.join(",")})` : ""}`,
          });
        } catch (e) {
          await logEvent({
            ...baseLog,
            handler_result: "audio command failed",
            handler_error: String((e as Error)?.message || e),
          });
        }
        continue;
      }

      if (ev.type === "message" && ev.message?.type === "text" && lineUserId) {
        const text: string = String(ev.message.text || "").trim();

        // 0) บอทลูกค้า: FAQ + เช็กสถานะ (ตอบเฉพาะคำสั่งที่ตรงรูปแบบเท่านั้น
        //    เพื่อไม่ไปทับบทสนทนาจริงระหว่างลูกค้ากับแอดมิน)
        const custCmd = parseCustomerCommand(text);
        if (custCmd) {
          if (custCmd === "status") {
            const { data: myOrders } = await admin
              .from("orders")
              .select("order_no, status, total, created_at, doc_intent")
              .eq("line_user_id", lineUserId)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(5);
            await reply(replyToken ?? "", buildStatusReply((myOrders ?? []) as any[], `${origin}/my-orders`));
            await logEvent({ ...baseLog, handler_result: `customer bot status (${(myOrders ?? []).length} orders)` });
            continue;
          }
          let shopInfo: Record<string, unknown> = {};
          try {
            const { data: st } = await admin
              .from("rds_stores").select("name, address, phone").eq("slug", "printing").maybeSingle();
            shopInfo = (st as Record<string, unknown>) ?? {};
          } catch { /* ข้อมูลร้านเป็นส่วนเสริม ไม่มีก็ตอบข้อความมาตรฐาน */ }
          await reply(replyToken ?? "", buildFaqReply(custCmd, shopInfo));
          await logEvent({ ...baseLog, handler_result: `customer bot faq ${custCmd}` });
          continue;
        }

        // Self-enroll as an admin notification recipient: `แจ้งเตือน 123456` / `notify 123456`
        const me = text.match(/^(?:notify|แจ้งเตือน|รับแจ้งเตือน)\s*[:#]?\s*(\d{6})\b/i);
        if (me) {
          const code = me[1];
          const { data: codeRow } = await admin
            .from("admin_line_enroll_codes")
            .select("id, label, expires_at, consumed_at")
            .eq("code", code)
            .maybeSingle();
          if (!codeRow || codeRow.consumed_at || new Date(codeRow.expires_at as string).getTime() < Date.now()) {
            await reply(replyToken ?? "", "❌ รหัสไม่ถูกต้องหรือหมดอายุ ให้แอดมินกดสร้างรหัสใหม่ในหน้า ตั้งค่า LINE");
            await logEvent({ ...baseLog, handler_result: `enroll code ${code} invalid/expired` });
            continue;
          }
          const prof = await getProfile(lineUserId);
          const label = (codeRow.label as string | null) || prof?.displayName || "เครื่องใหม่";
          const { error: rErr } = await admin
            .from("admin_line_recipients")
            .upsert(
              { line_user_id: lineUserId, label, enabled: true, notify_orders: true },
              { onConflict: "line_user_id" },
            );
          if (rErr) {
            await reply(replyToken ?? "", "❌ เพิ่มเครื่องรับแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง");
            await logEvent({ ...baseLog, handler_result: "enroll failed", handler_error: rErr.message });
            continue;
          }
          await admin
            .from("admin_line_enroll_codes")
            .update({ consumed_at: new Date().toISOString(), consumed_line_user_id: lineUserId })
            .eq("id", codeRow.id as string);
          await reply(replyToken ?? "", `✅ เปิดรับแจ้งเตือนเรียบร้อย (${label})\nคุณจะได้รับแจ้งเตือนออเดอร์ใหม่ที่ห้องแชทนี้`);
          await logEvent({ ...baseLog, handler_result: `enrolled recipient ${lineUserId}` });
          continue;
        }

        // Match `link t:<token>` (order-scoped LINE binding for guest orders)
        const mt = text.match(/^link\s*t\s*[:#]?\s*([A-Za-z0-9_-]{16,})/i);
        if (mt) {
          const token = mt[1];
          const prof = await getProfile(lineUserId);
          const { data: bound, error: bErr } = await admin.rpc("bind_line_user_by_token", {
            p_token: token, p_line_user_id: lineUserId,
          });
          if (bErr) {
            await reply(replyToken ?? "", "❌ โค้ดผูกไม่ถูกต้องหรือหมดอายุ กรุณาคัดลอกจากหน้าออเดอร์ล่าสุดในเว็บอีกครั้ง");
            await logEvent({ ...baseLog, handler_result: `link t: ${token} failed`, handler_error: bErr.message });
            continue;
          }
          const row = Array.isArray(bound) ? bound[0] : bound;
          const order_no = row?.order_no || "-";
          const order_id = row?.order_id;
          // Fetch tracking link + status for confirmation message
          let trackUrl = "";
          let statusText = "";
          try {
            if (order_id) {
              const { data: ord } = await admin
                .from("orders")
                .select("id, status, total, line_link_token")
                .eq("id", order_id)
                .maybeSingle();
              const origin = Deno.env.get("PUBLIC_APP_ORIGIN") || "https://filmyynatta.com";
              trackUrl = `${origin}/my-orders/${order_id}?t=${encodeURIComponent(ord?.line_link_token || "")}`;
              const map: Record<string, string> = {
                pending: "รอเสนอราคา",
                quoted: "เสนอราคาแล้ว",
                confirmed: "ยืนยันแล้ว",
                processing: "กำลังจัดเตรียม",
                completed: "เสร็จสิ้น",
                cancelled: "ยกเลิก",
              };
              statusText = map[ord?.status || ""] || (ord?.status || "");
            }
          } catch (e) { console.warn("fetch order for link msg failed", e); }
          const linesArr = [
            `✅ ผูก LINE กับออเดอร์ ${order_no} สำเร็จ${prof?.displayName ? ` (${prof.displayName})` : ""}`,
            statusText ? `สถานะปัจจุบัน: ${statusText}` : "",
            "",
            "📦 ต่อจากนี้เราจะแจ้งเตือนทุกครั้งที่ร้านอัปเดตสถานะออเดอร์ผ่าน LINE นี้",
            trackUrl ? `\nติดตามสถานะออเดอร์: ${trackUrl}` : "",
          ].filter(Boolean);
          await reply(replyToken ?? "", linesArr.join("\n"));
          // Idempotent log so we don't spam if webhook is retried
          try {
            const idem = `link_success:${order_id || token}`;
            await admin.from("line_notifications").insert({
              order_id: order_id ?? null,
              type: "link_success",
              kind: "link_success",
              direction: "to_customer",
              recipient: lineUserId,
              message: `ผูก LINE กับออเดอร์ ${order_no} สำเร็จ`,
              sent_status: "sent",
              sent_at: new Date().toISOString(),
              idempotency_key: idem,
            });
          } catch (e) { console.warn("link_success log insert", e); }
          await logEvent({ ...baseLog, handler_result: `link t: bound to ${order_no}` });
          continue;
        }

        // Match `#<phone>` — bind all recent guest orders of this phone
        const mp = text.match(/^#\s*(0\d{8,9})\b/);
        if (mp) {
          const phone = mp[1];
          const prof2 = await getProfile(lineUserId);
          // SECURITY: `#<phone>` is unverified — anyone who friends the OA can
          // send it. To prevent order-notification hijacking, only accept the
          // phone binding when this LINE user has *already* proven ownership
          // of at least one order for that phone via the per-order
          // `link t:<token>` flow (which requires the token that was issued
          // to the customer's session/email). If no such proof exists, we
          // refuse and direct the user to the per-order link message.
          const { data: proven, error: pErr } = await admin
            .from("orders")
            .select("id")
            .eq("guest_phone", phone)
            .eq("line_user_id", lineUserId)
            .limit(1);
          if (pErr) {
            await reply(replyToken ?? "", "❌ ผูกด้วยเบอร์ไม่สำเร็จ กรุณาลองใหม่");
            await logEvent({ ...baseLog, handler_result: `#${phone} failed`, handler_error: pErr.message });
            continue;
          }
          if (!proven || proven.length === 0) {
            await reply(
              replyToken ?? "",
              "❌ ยังไม่สามารถผูกด้วยเบอร์ได้\n\nเพื่อความปลอดภัย กรุณาผูกอย่างน้อย 1 ออเดอร์ก่อนด้วยข้อความ:\nlink t:<รหัสในหน้าออเดอร์ของคุณ>\n\nระบบจะจดจำเบอร์นี้และผูกออเดอร์อื่น ๆ ให้อัตโนมัติหลังจากนั้น",
            );
            await logEvent({
              ...baseLog,
              handler_result: `#${phone} refused — no prior proven link for this line_user_id`,
            });
            continue;
          }
          // Ownership proven — safe to remember phone↔LINE mapping and bind
          // remaining unbound orders of the same phone.
          try {
            await admin.from("line_phone_bindings").upsert({
              phone,
              line_user_id: lineUserId,
              display_name: prof2?.displayName ?? null,
              updated_at: new Date().toISOString(),
            }, { onConflict: "phone" });
          } catch (e) { console.warn("line_phone_bindings upsert", e); }
          const { data: upd, error: uErr } = await admin.from("orders")
            .update({ line_user_id: lineUserId })
            .eq("guest_phone", phone)
            .is("line_user_id", null)
            .gte("created_at", new Date(Date.now() - 90 * 86400_000).toISOString())
            .select("order_no");
          if (uErr) {
            await reply(replyToken ?? "", "❌ ผูกด้วยเบอร์ไม่สำเร็จ กรุณาลองใหม่");
            await logEvent({ ...baseLog, handler_result: `#${phone} failed`, handler_error: uErr.message });
            continue;
          }
          const n = (upd ?? []).length;
          await reply(replyToken ?? "",
            n > 0
              ? `✅ ผูก LINE สำเร็จแล้วค่ะ\nผูกกับ ${n} ออเดอร์ล่าสุดของเบอร์ ${phone}\n\nคุณสามารถส่งรายการออเดอร์ ติดตามสถานะออเดอร์ หรือสอบถามแอดมินผ่าน LINE นี้ได้เลยค่ะ`
              : `✅ ผูก LINE สำเร็จแล้วค่ะ\nระบบจะจดจำเบอร์ ${phone} ไว้ ออเดอร์ที่คุณสั่งครั้งต่อไปจะเชื่อมกับ LINE นี้อัตโนมัติ\n\nคุณสามารถส่งรายการออเดอร์ ติดตามสถานะออเดอร์ หรือสอบถามแอดมินผ่าน LINE นี้ได้เลยค่ะ`,
          );
          try {
            await admin.from("line_notifications").insert({
              type: "link_success",
              kind: "link_success",
              direction: "to_customer",
              recipient: lineUserId,
              message: `ผูก LINE ด้วยเบอร์ ${phone} สำเร็จ (${n} ออเดอร์)`,
              sent_status: "sent",
              sent_at: new Date().toISOString(),
              idempotency_key: `phone_link:${lineUserId}:${phone}`,
            });
          } catch (e) { console.warn("phone_link log insert", e); }
          await logEvent({ ...baseLog, handler_result: `#${phone} bound ${n} orders` });
          continue;
        }

        // รายการสั่งของแบบเลขข้อในแชท → เปิดคำสั่งซื้อราคา 0 ให้ร้านเสนอราคาต่อ
        // (กันซ้ำด้วย message id, ไม่ผ่านเกณฑ์ = ไม่สร้างงาน ปล่อยให้แอดมินคุยเอง)
        if (ev.message?.id) {
          try {
            const profC = await getProfile(lineUserId);
            const { data: convChat } = await admin
              .from("film_conversations")
              .select("id")
              .eq("external_user_id", lineUserId)
              .maybeSingle();
            const chatOrder = await ingestChatOrder(admin, {
              lineUserId,
              displayName: profC?.displayName ?? null,
              messageId: String(ev.message.id),
              conversationId: (convChat?.id as string) ?? null,
              text,
            });
            if (chatOrder.created && chatOrder.orderNo) {
              await reply(
                replyToken ?? "",
                buildOrderCreatedReply(chatOrder.orderNo, chatOrder.items, `${origin}/my-orders`),
              );
              await logEvent({ ...baseLog, handler_result: `chat order created ${chatOrder.orderNo}` });
              continue;
            }
            if (chatOrder.duplicate) {
              await logEvent({ ...baseLog, handler_result: `chat order duplicate ${chatOrder.orderNo ?? ""}` });
              continue;
            }
          } catch (e) {
            await logEvent({
              ...baseLog,
              handler_result: "chat order intake failed",
              handler_error: String((e as Error)?.message || e),
            });
          }
        }

        // Legacy: 6-digit account link code (kept for staff)
        const m = text.match(/^link\s*[#:]?\s*(\d{6})\b/i);
        if (!m) {
          // Document command from LINE (e.g. "ขอใบเสนอราคา…") — draft only,
          // a staff member still has to confirm before any number is issued.
          if (detectDocIntent(text)) {
            try {
              const profD = await getProfile(lineUserId);
              const res = await ingestDocCommand(admin, {
                messageId: ev.message?.id ?? null,
                lineUserId,
                displayName: profD?.displayName ?? null,
                text,
              });
              await logEvent({
                ...baseLog,
                handler_result: `doc command ${res.duplicate ? "duplicate" : "draft"} ${res.docType}${res.missing.length ? ` (ขาด: ${res.missing.join(",")})` : ""}`,
              });
            } catch (e) {
              await logEvent({
                ...baseLog,
                handler_result: "doc command failed",
                handler_error: String((e as Error)?.message || e),
              });
            }
            continue;
          }
          // Film Shop job intake — record the message, parse it and (only
          // when nothing is missing) create the linked order. Never replies.
          try {
            const prof0 = await getProfile(lineUserId);
            // เก็บชื่อ + รูปโปรไฟล์ LINE ไว้ให้หน้า LINE OA แสดงว่าใครทักเข้ามา
            if (prof0?.displayName || prof0?.pictureUrl) {
              try {
                await admin.from("line_account_links").upsert(
                  {
                    line_user_id: lineUserId,
                    display_name: prof0.displayName ?? null,
                    picture_url: prof0.pictureUrl ?? null,
                    last_seen_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "line_user_id" },
                );
              } catch (e) { console.warn("remember line profile failed", e); }
            }
            const res = await ingestFilmJobMessage(admin, {
              eventId: ev.webhookEventId ?? null,
              messageId: ev.message?.id ?? null,
              lineUserId,
              displayName: prof0?.displayName ?? null,
              channelId: channel?.id ?? null,
              text,
            });
            await logEvent({
              ...baseLog,
              handler_result: `film intake [${channel?.id ?? "?"}]: ${res.duplicate ? "duplicate" : res.intakeStatus}${res.orderNo ? ` → ${res.orderNo}` : ""}`,
            });
          } catch (e) {
            await logEvent({
              ...baseLog,
              handler_result: "film intake failed",
              handler_error: String((e as Error)?.message || e),
            });
          }
          continue;
        }
        const code = m[1];
        const prof = await getProfile(lineUserId);
        const { data, error } = await admin.rpc("consume_line_link_code", {
          p_code: code,
          p_line_user_id: lineUserId,
          p_display_name: prof?.displayName ?? null,
        });
        if (error) {
          console.warn("consume failed", error.message);
          await reply(
            replyToken ?? "",
            "❌ รหัสไม่ถูกต้องหรือหมดอายุแล้ว\nไปที่หน้า /account แล้วกด \"สร้างรหัสใหม่\" แล้วส่งกลับมาภายใน 15 นาที",
          );
          await logEvent({ ...baseLog, handler_result: `link ${code} rejected`, handler_error: error.message });
          continue;
        }
        await reply(
          replyToken ?? "",
          `✅ เชื่อมบัญชีสำเร็จ${prof?.displayName ? ` (${prof.displayName})` : ""}\nต่อจากนี้คุณจะได้รับแจ้งเตือนสถานะออเดอร์/ใบเสนอราคาผ่าน LINE นี้`,
        );
        await logEvent({ ...baseLog, handler_result: `link ${code} success — profile=${data || "?"}` });

        // best-effort: post confirm log via line-notify too (skip if no admin)
        try {
          await admin.from("line_notifications").insert({
            customer_id: data,
            type: "link_confirm",
            kind: "link_confirm",
            direction: "to_customer",
            recipient: lineUserId,
            message: "เชื่อมบัญชี LINE สำเร็จผ่าน webhook",
            sent_status: "sent",
            sent_at: new Date().toISOString(),
            idempotency_key: `webhook_link:${code}`,
          });
        } catch (e) { console.warn("log insert", e); }
        continue;
      }

      await logEvent({ ...baseLog, handler_result: `event ignored (type=${ev.type})` });
    } catch (e) {
      console.error("event handler error", e);
      await logEvent({ ...baseLog, handler_error: String((e as Error)?.message || e) });
      await logCallbackFailure({
        reason: "handler_error",
        source: "line-webhook",
        error: String((e as Error)?.message || e),
        req,
        detail: { event_type: String(ev?.type || "unknown") },
      });
    }
  }
  })();

  const waitUntil = (globalThis as any)?.EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") {
    // ปล่อยงานทำต่อเบื้องหลังหลังส่ง response แล้ว
    waitUntil(work.catch((e: unknown) => console.error("webhook background error", e)));
  } else {
    // สภาพแวดล้อมที่ไม่มี waitUntil (เช่น local/test) — รอให้จบเพื่อความถูกต้อง
    await work.catch((e: unknown) => console.error("webhook error", e));
  }

  return new Response(JSON.stringify({ ok: true, accepted: events.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});