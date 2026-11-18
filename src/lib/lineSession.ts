// LINE / LIFF session helpers stored in sessionStorage.
import { supabase } from "@/integrations/supabase/client";

export type LineBinding = {
  phone?: string;
  customer_id?: string;
  customer_source?: string;
  customer_name?: string | null;
  line_user_id?: string;
  linked_at?: string;
  guest?: boolean;
  status?: "linked" | "skipped";
};

export type LineLinkError = {
  message: string;
  code?: string | number;
  at: string;
};

type LineIssueAction =
  | "liff_init_fail"
  | "liff_login_loop"
  | "link_verify_fail"
  | "liff_redirect"
  | "liff_config_fallback"
  | "liff_auto_bind_ok"
  | "liff_auto_bind_fail";

function scrubUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw);
    ["code", "state", "id_token", "access_token", "error_description"].forEach((key) => {
      if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
    });
    return url.toString().slice(0, 500);
  } catch {
    return raw.slice(0, 300);
  }
}

function cleanDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (value === undefined) continue;
    if (key === "href" || key.endsWith("_url") || key === "endpoint") {
      cleaned[key] = scrubUrl(value);
    } else if (typeof value === "string") {
      cleaned[key] = value.slice(0, 500);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export function readBinding(): LineBinding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("line_binding");
    return raw ? (JSON.parse(raw) as LineBinding) : null;
  } catch {
    return null;
  }
}

export function writeBinding(b: LineBinding) {
  try {
    sessionStorage.setItem("line_binding", JSON.stringify(b));
  } catch {
    /* ignore */
  }
  clearLinkError();
}

export function readLinkError(): LineLinkError | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("line_link_error");
    return raw ? (JSON.parse(raw) as LineLinkError) : null;
  } catch {
    return null;
  }
}

export function writeLinkError(err: Omit<LineLinkError, "at"> & { at?: string }) {
  try {
    sessionStorage.setItem(
      "line_link_error",
      JSON.stringify({ ...err, at: err.at || new Date().toISOString() }),
    );
  } catch {
    /* ignore */
  }
}

export function clearLinkError() {
  try { sessionStorage.removeItem("line_link_error"); } catch { /* ignore */ }
}

/**
 * Persist LIFF/binding failures. When a session exists we log to
 * `activity_logs` via the `log_line_link_event` RPC (has extra events
 * `liff_init_fail`, `liff_login_loop`, `link_verify_fail`). Without a
 * session we still insert into `line_login_diagnostics` so pre-login LIFF
 * failures can be investigated later.
 */
export async function logLineIssue(
  action: LineIssueAction,
  detail: Record<string, unknown>,
): Promise<void> {
  const payload = cleanDetail({ ...detail, at: new Date().toISOString(), ua: typeof navigator !== "undefined" ? navigator.userAgent : null });
  writeLinkError({ message: String(detail.message ?? action), code: (detail.code as string | number | undefined) });
  console.warn(`[line-issue:${action}]`, payload);

  try {
    // Diagnostics are written server-side only (service role) — the client
    // posts through the rate-limited, whitelisting edge function.
    await supabase.functions.invoke("line-endpoint-report", {
      body: { event: action, detail: payload, message: String(detail.message ?? action), code: detail.code ?? null },
    });
  } catch (e) {
    console.warn("line diagnostics insert failed", e);
  }

  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session || action === "liff_redirect" || action === "liff_config_fallback") return;
    await supabase.rpc("log_line_link_event", { p_event: action, p_detail: payload as any });
  } catch (e) {
    console.warn("logLineIssue rpc failed", e);
  }
}

/**
 * Only allow internal navigation paths. Rejects anything that isn't a
 * relative path anchored at the site root — full URLs, protocol-relative
 * URLs (`//evil.com`), backslashes, and empty strings all return null so
 * callers can safely fall back to a default.
 */
export function sanitizeNext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Must start with a single forward slash (not `//` or `/\`).
  if (trimmed[0] !== "/") return null;
  if (trimmed[1] === "/" || trimmed[1] === "\\") return null;
  // Reject control chars that could sneak past router parsers.
  if (/[\x00-\x1f]/.test(trimmed)) return null;
  // Parse against the current origin — if the resulting URL leaves the
  // origin we started on, it isn't safe to navigate to.
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(trimmed, origin);
    if (url.origin !== origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Wipe every LINE-related sessionStorage key so the user can start fresh. */
export function clearLineSession() {
  try {
    sessionStorage.removeItem("line_binding");
    sessionStorage.removeItem("liff_profile");
    sessionStorage.removeItem("line_link_next");
    sessionStorage.removeItem("line_link_error");
    sessionStorage.removeItem("line_friendship_hint");
    sessionStorage.removeItem("line_id_token");
  } catch {
    /* ignore */
  }
}

/**
 * Full customer sign-out: clears LINE session AND local customer snapshot
 * so the next visitor to a protected route sees the onboarding gate cleanly.
 * Also attempts `liff.logout()` when the SDK is present.
 */
export function clearCustomerSession() {
  clearLineSession();
  try {
    localStorage.removeItem("guest_session_v1");
    localStorage.removeItem("guest_customer_snapshot");
  } catch { /* ignore */ }
  try {
    const w = window as any;
    if (w?.liff?.isLoggedIn?.() && typeof w.liff.logout === "function") {
      w.liff.logout();
    }
  } catch { /* ignore */ }
}

/**
 * LIFF id_token — verified server-side. Stored in sessionStorage under a
 * dedicated key so the gate can attach it to every `line-link-lookup`
 * request. This value is a bearer proof of the LIFF login and MUST NOT be
 * logged or persisted to durable storage. It is cleared on logout.
 */
const ID_TOKEN_KEY = "line_id_token";

export function readIdToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ID_TOKEN_KEY);
    return raw && typeof raw === "string" ? raw : null;
  } catch { return null; }
}

export function writeIdToken(token: string | null | undefined) {
  if (!token || typeof token !== "string") return;
  try { sessionStorage.setItem(ID_TOKEN_KEY, token); } catch { /* ignore */ }
}

export function clearIdToken() {
  try { sessionStorage.removeItem(ID_TOKEN_KEY); } catch { /* ignore */ }
}

/**
 * มีตัวตนพอที่จะเรียก edge function ที่ต้องยืนยันตัวตนหรือยัง
 * (id_token ของ LINE หรือเซสชันผู้ใช้ที่ล็อกอิน) — ผู้ใช้แบบ guest จะได้ false
 * จึงข้ามการเรียกแทนที่จะโดน 401 unauthorized
 */
export async function hasVerifiableIdentity(): Promise<boolean> {
  if (readIdToken()) return true;
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data?.session?.access_token);
  } catch { return false; }
}


/**
 * Friendship "hint" for UI only — stashed from `liff.getFriendship()` when
 * available. NEVER used as an authorization decision. The gate treats the
 * server's `friend_confirmed` field (from `line-link-lookup`) as the sole
 * source of truth.
 */
export type LineFriendshipHint = { is_friend: boolean; checked_at: string };

export function readFriendshipHint(): LineFriendshipHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("line_friendship_hint");
    return raw ? (JSON.parse(raw) as LineFriendshipHint) : null;
  } catch { return null; }
}

export function writeFriendshipHint(v: LineFriendshipHint) {
  try { sessionStorage.setItem("line_friendship_hint", JSON.stringify(v)); } catch { /* ignore */ }
}

/** Human-readable Thai relative time (e.g. "5 นาทีที่แล้ว"). */
export function relativeTimeTH(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "เมื่อสักครู่";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} วันที่แล้ว`;
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}