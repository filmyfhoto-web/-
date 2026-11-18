// Best-effort logger for LINE callback / verification failures.
// Writes to `activity_logs` with action='line.callback_failure' using the
// service-role client so it bypasses RLS. Never throws — logging must not
// break the caller's error response.

import { createClient } from "npm:@supabase/supabase-js@2";
import { alertTypeFor, alertTitle } from "./alertTypes.ts";

export { alertTypeFor, alertTitle };

export type CallbackFailureReason =
  | "signature_mismatch"
  | "handler_error"
  | "id_token_verify_failed"
  | "aud_mismatch"
  | "id_token_invalid"
  | "id_token_missing_sub"
  | "id_token_login_channel_missing"
  | "unauthorized"
  | "no_line_user_bound"
  | "profile_lookup_failed"
  | "state_mismatch"
  | "phone_mismatch"
  | "invalid_phone"
  | "invalid_code"
  | "wrong_code"
  | "code_expired"
  | "otp_expired"
  | "otp_not_found"
  | "otp_too_many_attempts"
  | "invalid_action"
  | "rate_limited"
  | "line_push_failed"
  | "not_found"
  | "binding_failed"
  | "customer_create_failed"
  | "internal_error"
  | "other";

export type CallbackFailureInput = {
  reason: CallbackFailureReason | string;
  source: string; // edge function name, e.g. "line-webhook"
  status?: number;
  error?: string;
  req?: Request;
  detail?: Record<string, unknown>;
  alertBody?: string;
  alertLink?: string;
};

function short(v: unknown, max = 200): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…(${s.length})` : s;
}

function mapReasonFromError(msg: string): CallbackFailureReason {
  if (!msg) return "other";
  if (msg.includes("aud_mismatch")) return "aud_mismatch";
  if (msg.includes("missing_sub")) return "id_token_missing_sub";
  if (msg.includes("line_id_token_invalid")) return "id_token_invalid";
  if (msg.includes("server_misconfigured_login_channel_id")) return "id_token_login_channel_missing";
  if (msg.includes("unauthorized")) return "unauthorized";
  if (msg.includes("no_line_user_bound")) return "no_line_user_bound";
  if (msg.includes("profile_lookup_failed")) return "profile_lookup_failed";
  return "id_token_verify_failed";
}

export function reasonFromIdentityError(err: unknown): CallbackFailureReason {
  return mapReasonFromError(String((err as Error)?.message || err || ""));
}

export async function logCallbackFailure(input: CallbackFailureInput): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const admin = createClient(url, key);
    const req = input.req;
    const ua = req?.headers.get("user-agent") || undefined;
    const ip =
      req?.headers.get("x-forwarded-for") ||
      req?.headers.get("cf-connecting-ip") ||
      req?.headers.get("x-real-ip") ||
      undefined;
    const path = (() => {
      try { return req ? new URL(req.url).pathname : undefined; } catch { return undefined; }
    })();
    const detail: Record<string, unknown> = {
      reason: input.reason,
      source: input.source,
      status: input.status ?? null,
      error: input.error ? short(input.error, 400) : null,
      ua: ua ? short(ua, 200) : null,
      ip: ip ? short(ip, 80) : null,
      path: path ?? null,
      ...(input.detail || {}),
    };
    await admin.from("activity_logs").insert({
      action: "line.callback_failure",
      detail,
    });

    // Server-side staff alert with built-in 10-minute dedupe / rate limit.
    // The client can never insert these sensitive alert types (RLS blocks it).
    const type = alertTypeFor(input.source);
    await admin.rpc("notify_staff_alert", {
      p_type: type,
      p_title: alertTitle(type),
      p_body: input.alertBody || `${input.source}: ${String(input.reason)}`,
      p_link: input.alertLink || "/admin/line-settings",
      p_ref_id: null,
      p_dedupe_minutes: 10,
    });
  } catch (e) {
    console.warn("logCallbackFailure failed", e);
  }
}