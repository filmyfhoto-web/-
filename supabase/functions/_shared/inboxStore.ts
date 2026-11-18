/**
 * Film Shop Inbox — normalized conversation/message persistence.
 *
 * Channel-agnostic on purpose: `channel` is a plain string ('line' today,
 * 'facebook'/'instagram' later) and the LINE-specific bits stay in the caller.
 * No token or secret is ever stored on a conversation/message row.
 */

export type Direction = "inbound" | "outbound" | "system";

export interface ConversationKey {
  channel: string;
  storeId: string;
  externalThreadId: string;
  externalUserId?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/** Short, sanitized one-line preview for the conversation list. */
export function messagePreview(text: string | null | undefined, attachments = 0): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t) return t.slice(0, 140);
  if (attachments > 0) return `[ไฟล์แนบ ${attachments} รายการ]`;
  return "";
}

/** Find-or-create the conversation row for an external thread. */
export async function upsertConversation(admin: any, key: ConversationKey): Promise<string | null> {
  if (!key.externalThreadId) return null;
  const patch: Record<string, unknown> = {
    channel: key.channel,
    store_id: key.storeId,
    external_thread_id: key.externalThreadId,
    external_user_id: key.externalUserId ?? null,
  };
  if (key.displayName) patch.display_name = key.displayName;
  if (key.avatarUrl) patch.avatar_url = key.avatarUrl;
  try {
    const { data, error } = await admin
      .from("film_conversations")
      .upsert(patch, { onConflict: "channel,store_id,external_thread_id" })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return (data?.id as string) ?? null;
  } catch (e) {
    console.warn("upsertConversation failed", String((e as Error)?.message || e));
    return null;
  }
}

export interface RecordMessageInput {
  conversationId: string;
  direction: Direction;
  channel: string;
  externalMessageId?: string | null;
  text?: string | null;
  attachments?: unknown[];
  deliveryStatus?: "pending" | "sent" | "failed";
  senderUserId?: string | null;
  idempotencyKey?: string | null;
  sentAt?: string | null;
}

export interface RecordMessageResult {
  id: string | null;
  duplicate: boolean;
}

/**
 * Insert one normalized message. A replayed webhook (same external message id)
 * or a double-clicked send (same idempotency key) hits the unique indexes and
 * is reported as `duplicate` instead of creating a second row.
 */
export async function recordMessage(admin: any, input: RecordMessageInput): Promise<RecordMessageResult> {
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const row = {
    conversation_id: input.conversationId,
    direction: input.direction,
    channel: input.channel,
    external_message_id: input.externalMessageId ?? null,
    text: input.text ?? null,
    attachments,
    delivery_status: input.deliveryStatus ?? "sent",
    sender_user_id: input.senderUserId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    sent_at: input.sentAt ?? new Date().toISOString(),
  };
  const { data, error } = await admin.from("film_messages").insert(row).select("id").maybeSingle();
  if (error) {
    if (String((error as any).code) === "23505") {
      const existing = await findExisting(admin, input);
      return { id: existing, duplicate: true };
    }
    throw new Error(`film_messages insert failed: ${error.message}`);
  }
  return { id: (data?.id as string) ?? null, duplicate: false };
}

async function findExisting(admin: any, input: RecordMessageInput): Promise<string | null> {
  try {
    if (input.idempotencyKey) {
      const { data } = await admin.from("film_messages").select("id")
        .eq("idempotency_key", input.idempotencyKey).maybeSingle();
      if (data?.id) return data.id as string;
    }
    if (input.externalMessageId) {
      const { data } = await admin.from("film_messages").select("id")
        .eq("channel", input.channel).eq("external_message_id", input.externalMessageId).maybeSingle();
      if (data?.id) return data.id as string;
    }
  } catch { /* best effort */ }
  return null;
}

/** Refresh list-level fields after a message lands. */
export async function touchConversation(
  admin: any,
  conversationId: string,
  opts: { preview: string; incrementUnread?: boolean; at?: string },
) {
  const at = opts.at ?? new Date().toISOString();
  try {
    if (opts.incrementUnread) {
      const { data } = await admin.from("film_conversations").select("unread_count").eq("id", conversationId).maybeSingle();
      const next = Number(data?.unread_count ?? 0) + 1;
      await admin.from("film_conversations").update({
        unread_count: next, last_message_at: at, last_message_preview: opts.preview,
      }).eq("id", conversationId);
      return;
    }
    // Outbound/system messages must NOT clear unread — only an explicit
    // "staff opened the thread" action marks a conversation as read.
    await admin.from("film_conversations").update({
      last_message_at: at, last_message_preview: opts.preview,
    }).eq("id", conversationId);
  } catch (e) {
    console.warn("touchConversation failed", String((e as Error)?.message || e));
  }
}

/**
 * Full inbound path: upsert thread, store the message, bump unread.
 * Never throws — the inbox must never break the webhook's other handlers.
 */
export async function ingestInboundMessage(
  admin: any,
  key: ConversationKey,
  msg: Omit<RecordMessageInput, "conversationId" | "direction">,
): Promise<{ conversationId: string | null; messageId: string | null; duplicate: boolean }> {
  try {
    const conversationId = await upsertConversation(admin, key);
    if (!conversationId) return { conversationId: null, messageId: null, duplicate: false };
    const res = await recordMessage(admin, { ...msg, conversationId, direction: "inbound" });
    if (!res.duplicate) {
      await touchConversation(admin, conversationId, {
        preview: messagePreview(msg.text, (msg.attachments ?? []).length),
        incrementUnread: true,
        at: msg.sentAt ?? undefined,
      });
    }
    return { conversationId, messageId: res.id, duplicate: res.duplicate };
  } catch (e) {
    console.warn("ingestInboundMessage failed", String((e as Error)?.message || e));
    return { conversationId: null, messageId: null, duplicate: false };
  }
}
