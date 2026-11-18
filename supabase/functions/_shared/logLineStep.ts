// Step-by-step activity logging for the customer LINE Login flow.
//
// Writes to `activity_logs` (action = 'line.login_step') with the service-role
// client. Never throws, never sends staff alerts (that stays the job of
// logCallbackFailure) and never records secrets.

import { createClient } from "npm:@supabase/supabase-js@2";

export type LineStep =
  | "start_requested"
  | "start_rejected"
  | "state_created"
  | "state_persist_failed"
  | "authorize_url_issued"
  | "callback_received"
  | "state_consumed"
  | "state_invalid"
  | "token_exchanged"
  | "token_exchange_failed"
  | "id_token_verified"
  | "id_token_rejected"
  | "user_resolved"
  | "line_linked"
  | "link_rejected"
  | "magiclink_generated"
  | "magiclink_failed"
  | "handoff_persisted"
  | "redirected_to_app"
  | "handoff_consumed"
  | "handoff_invalid"
  | "session_created"
  | "session_failed";

/** Keys whose values must never reach the log. */
const SECRET_KEYS = [
  "code",
  "id_token",
  "access_token",
  "refresh_token",
  "token_hash",
  "code_verifier",
  "client_secret",
  "channel_secret",
  "secret",
  "password",
  "authorization",
  "handoff",
  "state",
];

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEYS.some((s) => k === s || k.endsWith(`_${s}`) || k.startsWith(`${s}_`));
}

function clip(v: unknown, max = 300): unknown {
  if (typeof v !== "string") return v;
  return v.length > max ? `${v.slice(0, max)}…(${v.length})` : v;
}

/** Drop secret-ish keys, keep only a presence/length hint instead. */
export function sanitizeDetail(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (isSecretKey(k)) {
      out[`${k}_present`] = v == null || v === "" ? false : true;
      if (typeof v === "string" && v) out[`${k}_len`] = v.length;
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitizeDetail(v as Record<string, unknown>);
      continue;
    }
    out[k] = clip(v);
  }
  return out;
}

/** U1234abcd… → U1234…cd91 (never the full LINE user id). */
export function maskLineUserId(id: unknown): string | null {
  if (typeof id !== "string" || !id) return null;
  if (id.length <= 10) return `${id.slice(0, 3)}…`;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

export function newTraceId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export type LineStepInput = {
  step: LineStep | string;
  ok: boolean;
  traceId?: string | null;
  flow?: "login" | "link" | null;
  source: string;
  stageMs?: number | null;
  error?: string | null;
  req?: Request;
  detail?: Record<string, unknown>;
};

export async function logLineStep(input: LineStepInput): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const admin = createClient(url, key);

    const req = input.req;
    const ua = req?.headers.get("user-agent") || null;
    const ip =
      req?.headers.get("x-forwarded-for") ||
      req?.headers.get("cf-connecting-ip") ||
      req?.headers.get("x-real-ip") ||
      null;

    const detail = {
      step: input.step,
      ok: input.ok,
      trace_id: input.traceId || null,
      flow: input.flow || null,
      source: input.source,
      stage_ms: typeof input.stageMs === "number" ? Math.round(input.stageMs) : null,
      error: input.error ? clip(input.error, 400) : null,
      ua: ua ? clip(ua, 200) : null,
      ip: ip ? clip(ip, 80) : null,
      ...sanitizeDetail(input.detail),
    };

    await admin.from("activity_logs").insert({ action: "line.login_step", detail });

    // Light-weight retention: prune this log type older than 30 days, ~2% of writes.
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await admin
        .from("activity_logs")
        .delete()
        .eq("action", "line.login_step")
        .lt("created_at", cutoff);
    }
  } catch (e) {
    console.warn("logLineStep failed", e);
  }
}

/** Small stopwatch used to fill stage_ms. */
export function stopwatch() {
  let last = Date.now();
  return () => {
    const now = Date.now();
    const d = now - last;
    last = now;
    return d;
  };
}
