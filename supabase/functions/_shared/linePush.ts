// THE single LINE Messaging API provider adapter.
//
// This file is the ONLY place in the repository that is allowed to contain a
// `https://api.line.me/v2/bot/message/...` URL. Every other function imports
// from here, and every *notification* (order events, admin alerts, tests) must
// go through `notification_outbox` + `notify-dispatch` rather than calling this
// adapter directly. Direct callers are limited to synchronous auth/diagnostic
// flows (OTP delivery, connectivity checks, webhook replies).

const LINE_API = "https://api.line.me/v2/bot/message";

import { createHash } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * LINE only accepts a UUID for `X-Line-Retry-Key` — any other shape is a hard
 * 400 and the message never leaves the shop. Our idempotency keys are richer
 * (e.g. `<conversation_id>:<uuid>`), so derive a STABLE uuid from the key:
 * the same logical message always yields the same retry key, which is exactly
 * what LINE's de-duplication needs.
 */
export function toLineRetryKey(key?: string | null): string | null {
  const raw = String(key ?? "").trim();
  if (!raw) return null;
  if (UUID_RE.test(raw)) return raw.toLowerCase();
  const h = createHash("sha256").update(raw).digest("hex");
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return v;
}

export const PUSH_TIMEOUT_MS = 10_000;

export type PushResult = {
  ok: boolean;
  permanent?: boolean;
  deduplicated?: boolean;
  providerMessageId?: string | null;
  status?: number;
  error?: string;
};

/**
 * Push one text message.
 *
 * @param retryKey stable id for the logical message — MUST be identical across
 *                 every attempt of the same outbox row, otherwise a retry after
 *                 a timeout duplicates the message on the recipient's phone.
 *                 LINE answers 409 for a replayed key and does NOT re-deliver.
 */
export async function pushLineText(
  token: string | undefined | null,
  to: string,
  text: string,
  retryKey?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  if (!token || !to) return { ok: false, permanent: true, error: "no_token_or_recipient" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PUSH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    const rk = toLineRetryKey(retryKey);
    if (rk) headers["X-Line-Retry-Key"] = rk;
    const res = await fetchImpl(`${LINE_API}/push`, {
      method: "POST",
      headers,
      body: JSON.stringify({ to, messages: [{ type: "text", text: String(text).slice(0, 4900) }] }),
      signal: ctrl.signal,
    });
    if (res.status === 409) {
      return { ok: true, deduplicated: true, status: 409, providerMessageId: res.headers.get("x-line-request-id") };
    }
    if (!res.ok) {
      const body = await res.text();
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
      return { ok: false, permanent, status: res.status, error: `line_http_${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true, status: res.status, providerMessageId: res.headers.get("x-line-request-id") };
  } catch (e) {
    // Timeout / network error: retryable, and we do NOT know whether LINE got
    // it — which is exactly why the retry key is reused on the next attempt.
    return { ok: false, permanent: false, error: String((e as Error)?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Webhook reply (not a notification: it answers an inbound event in-band). */
export async function replyLineText(
  token: string | undefined | null,
  replyToken: string,
  text: string,
): Promise<PushResult> {
  if (!token || !replyToken) return { ok: false, permanent: true, error: "no_token_or_reply_token" };
  try {
    const res = await fetch(`${LINE_API}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text: String(text).slice(0, 1800) }] }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

/** Webhook reply with arbitrary LINE message objects (Flex, text, ...). */
export async function replyLineMessages(
  token: string | undefined | null,
  replyToken: string,
  messages: unknown[],
): Promise<PushResult> {
  if (!token || !replyToken) return { ok: false, permanent: true, error: "no_token_or_reply_token" };
  try {
    const res = await fetch(`${LINE_API}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

/** Push arbitrary LINE message objects (Flex, text, ...) to a destination. */
export async function pushLineMessages(
  token: string | undefined | null,
  to: string,
  messages: unknown[],
  retryKey?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  if (!token || !to) return { ok: false, permanent: true, error: "no_token_or_recipient" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PUSH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    const rk = toLineRetryKey(retryKey);
    if (rk) headers["X-Line-Retry-Key"] = rk;
    const res = await fetchImpl(`${LINE_API}/push`, {
      method: "POST",
      headers,
      body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
      signal: ctrl.signal,
    });
    if (res.status === 409) {
      return { ok: true, deduplicated: true, status: 409, providerMessageId: res.headers.get("x-line-request-id") };
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
      console.error("pushLineMessages failed", res.status, detail.slice(0, 300));
      return { ok: false, permanent, status: res.status, error: `line_http_${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true, status: res.status, providerMessageId: res.headers.get("x-line-request-id") };
  } catch (e) {
    return { ok: false, permanent: false, error: String((e as Error)?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}
