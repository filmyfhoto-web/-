// Client helpers for the customer LINE Login (normal OAuth web flow).
// No LIFF, no id_token handling in the browser.
import { supabase } from "@/integrations/supabase/client";
import { sanitizeNext } from "@/lib/lineSession";
import { publicOrigin } from "@/lib/hostMode";

/** Safe in-app return path (never an external URL). */
export function safeNext(raw: unknown, fallback = "/account"): string {
  return sanitizeNext(raw) || fallback;
}

/** Map any technical LINE/OAuth error code to a short friendly Thai message. */
export function lineErrorMessage(code?: string | null): string {
  const raw = (code || "").toLowerCase();
  if (!raw) return "";
  if (raw.includes("access_denied")) return "คุณยกเลิกการเข้าสู่ระบบด้วย LINE";
  if (raw.includes("line_already_linked")) {
    return "บัญชี LINE นี้ถูกผูกกับผู้ใช้รายอื่นแล้ว กรุณายกเลิกการเชื่อมจากบัญชีนั้นก่อน";
  }
  if (raw.includes("profile_already_linked")) {
    return "บัญชีของคุณผูกกับ LINE อื่นอยู่แล้ว กรุณายกเลิกการเชื่อมเดิมก่อน";
  }
  if (raw.includes("not_authenticated")) {
    return "กรุณาเข้าสู่ระบบก่อนเชื่อมบัญชี LINE";
  }
  if (raw.includes("link_failed") || raw.includes("profile_missing")) {
    return "เชื่อมบัญชี LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  }
  if (raw.includes("redirect_uri")) {
    return "ระบบเข้าสู่ระบบ LINE ยังตั้งค่า Callback URL ไม่ครบ กรุณาแจ้งผู้ดูแลระบบ (LINE Login → Callback URL)";
  }
  if (raw.includes("state")) return "ลิงก์เข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว กรุณาลองใหม่อีกครั้ง";
  if (raw.includes("verify")) return "ยืนยันตัวตนกับ LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  if (raw.includes("session")) return "สร้างการเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  if (raw.includes("origin")) return "ลิงก์นี้ใช้เข้าสู่ระบบไม่ได้ กรุณาเปิดจากหน้าเว็บของร้าน";
  if (raw.includes("network") || raw.includes("timeout") || raw.includes("failed to fetch")) {
    return "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
  }
  if (raw.includes("server") || raw.includes("misconfig")) return "ระบบเข้าสู่ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง";
  return "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

/** Ask the server for a LINE authorize URL (state + nonce + PKCE live server-side). */
export async function startLineLogin(next: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("line-oauth-start", {
    body: {
      next: safeNext(next),
      // Always the shop's own domain: a login started on the Lovable mirror
      // must still return the customer to filmyynatta.com.
      origin: typeof window !== "undefined" ? publicOrigin() : undefined,
    },
  });
  if (error) throw new Error(error.message || "network_error");
  const res = data as { ok?: boolean; authorize_url?: string; error?: string };
  if (!res?.ok || !res.authorize_url) throw new Error(res?.error || "start_failed");
  return res.authorize_url;
}

/**
 * Ask the server for a LINE authorize URL in *link* mode: the resulting LINE
 * identity is attached to the profile of the currently signed-in user instead
 * of creating a new account. The user id is taken from the Supabase JWT
 * server-side — the browser never supplies it.
 */
export async function startLineLink(next = "/account/line"): Promise<string> {
  const { data, error } = await supabase.functions.invoke("line-oauth-start", {
    body: {
      mode: "link",
      next: safeNext(next, "/account/line"),
      origin: typeof window !== "undefined" ? publicOrigin() : undefined,
    },
  });
  if (error) throw new Error(error.message || "network_error");
  const res = data as { ok?: boolean; authorize_url?: string; error?: string };
  if (!res?.ok || !res.authorize_url) throw new Error(res?.error || "start_failed");
  return res.authorize_url;
}

/** Exchange the one-time handoff code for a Supabase session. */
export async function completeLineLogin(handoff: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("line-oauth-callback", {
    body: { handoff },
  });
  if (error) throw new Error(error.message || "network_error");
  const res = data as {
    ok?: boolean; email?: string; token_hash?: string; next?: string; error?: string; trace_id?: string;
  };
  if (!res?.ok || !res.token_hash) throw new Error(res?.error || "handoff_invalid");
  // Token-hash verification is a distinct auth payload. Sending `email` with
  // it is rejected by current GoTrue versions with validation_failed.
  const { data: otpData, error: otpErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: res.token_hash,
  });
  if (otpErr) {
    await reportLineStep({
      step: "session_failed",
      ok: false,
      trace_id: res.trace_id,
      error: otpErr.message || "verify_otp_failed",
    });
    throw new Error(otpErr.message || "session_failed");
  }
  if (!otpData.session || !otpData.user) {
    await reportLineStep({
      step: "session_failed",
      ok: false,
      trace_id: res.trace_id,
      error: "session_missing_after_verify",
    });
    throw new Error("session_failed");
  }
  const next = safeNext(res.next);
  await reportLineStep({ step: "session_created", ok: true, trace_id: res.trace_id, next });
  return next;
}

/** Best-effort client-side step report so the admin log covers the last hop. */
export async function reportLineStep(payload: {
  step: string;
  ok: boolean;
  trace_id?: string | null;
  next?: string;
  error?: string;
  retry_count?: number;
}): Promise<void> {
  try {
    await supabase.functions.invoke("line-oauth-callback", {
      body: { action: "log", ...payload },
    });
  } catch {
    /* logging must never break the login */
  }
}

/* ------------------------------------------------------------------ */
/* Automatic retry after a failed LINE Login                           */
/* ------------------------------------------------------------------ */

const RETRY_KEY = "line_login_retry_count";
export const MAX_LINE_RETRIES = 2;

/** Errors where restarting OAuth cannot possibly help. */
const NO_RETRY = [
  "access_denied",
  "line_already_linked",
  "profile_already_linked",
  "redirect_uri",
  "not_authenticated",
];

export function isRetryableLineError(code?: string | null): boolean {
  const raw = (code || "").toLowerCase();
  if (!raw) return true;
  return !NO_RETRY.some((c) => raw.includes(c));
}

export function getLineRetryCount(): number {
  try {
    return Number(sessionStorage.getItem(RETRY_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

export function resetLineRetryCount(): void {
  try {
    sessionStorage.removeItem(RETRY_KEY);
  } catch {
    /* ignore */
  }
}

function bumpLineRetryCount(): number {
  const n = getLineRetryCount() + 1;
  try {
    sessionStorage.setItem(RETRY_KEY, String(n));
  } catch {
    /* ignore */
  }
  return n;
}

/** Should we restart OAuth by ourselves for this error? */
export function shouldAutoRetryLine(code?: string | null): boolean {
  return isRetryableLineError(code) && getLineRetryCount() < MAX_LINE_RETRIES;
}

/**
 * Log the attempt and start a fresh LINE OAuth round-trip.
 * Returns false when the retry budget is exhausted or the start call failed
 * (the caller then keeps showing the manual retry button).
 */
export async function retryLineLogin(
  next: string,
  reason?: string | null,
): Promise<boolean> {
  if (getLineRetryCount() >= MAX_LINE_RETRIES) return false;
  const attempt = bumpLineRetryCount();
  await reportLineStep({
    step: "client_retry",
    ok: true,
    next: safeNext(next),
    error: reason || undefined,
    retry_count: attempt,
  });
  try {
    const url = await startLineLogin(next);
    window.location.assign(url);
    return true;
  } catch (e) {
    await reportLineStep({
      step: "client_start_failed",
      ok: false,
      next: safeNext(next),
      error: String((e as Error)?.message || e),
      retry_count: attempt,
    });
    return false;
  }
}