// LINE Login callback URLs that must be registered in the LINE Developers
// console (channel 2010762305) for the staff login page to work.
export const LINE_LOGIN_CHANNEL_ID = "2010762305";

export const LINE_CONSOLE_URL = "https://developers.line.biz/console/";

/** Hosts that can serve the staff login page. */
export const STAFF_CALLBACK_HOSTS = [
  "www.filmyynatta.com",
  "filmyynatta.com",
  "staff.filmyynatta.com",
  "yynatta-admin.com",
  "www.yynatta-admin.com",
  "www-filmyynatta-com.lovable.app",
  "id-preview--fc0147af-4678-4fa7-b23f-43d82e8ddfe9.lovable.app",
] as const;

/** Full callback URLs to paste into the LINE console (exact match, no trailing slash). */
export const STAFF_CALLBACK_URLS: string[] = STAFF_CALLBACK_HOSTS.map(
  (h) => `https://${h}/staff`,
);

/** The redirect_uri used by the current browser origin. */
export function staffRedirectUri(origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/+$/, "")}/staff`;
}

/** Turn a raw LINE OAuth error into readable Thai guidance. */
export function describeLineAuthError(code: string, description?: string | null): string {
  const raw = `${code} ${description ?? ""}`.toLowerCase();
  if (raw.includes("redirect_uri") || code === "invalid_request") {
    return (
      "LINE ปฏิเสธคำขอเพราะยังไม่ได้ลงทะเบียนที่อยู่กลับ (Callback URL) ของโดเมนนี้ — " +
      `ให้เจ้าของกิจการเพิ่ม ${staffRedirectUri()} ใน LINE Developers Console → LINE Login → Callback URL`
    );
  }
  if (code === "access_denied") return "คุณยกเลิกการเข้าสู่ระบบด้วย LINE";
  return description || code;
}

/* ------------------------------------------------------------------ *
 * Callback URL probe — lets staff verify from the app whether this
 * domain's callback URL is registered in the LINE console.
 * ------------------------------------------------------------------ */

export const PROBE_STATE_PREFIX = "probe:";
export const PROBE_RESULT_KEY = "staff_line_callback_probe";
export const PROBE_CHANNEL = "staff-line-callback-probe";

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newProbeState(): string {
  return `${PROBE_STATE_PREFIX}${randomHex()}`;
}

export function isProbeState(state?: string | null): boolean {
  return !!state && state.startsWith(PROBE_STATE_PREFIX);
}

/** Build the LINE authorize URL used both by real login and by the probe. */
export function buildLineAuthorizeUrl(opts: {
  redirectUri: string;
  state: string;
  nonce?: string;
}): string {
  const u = new URL("https://access.line.me/oauth2/v2.1/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", LINE_LOGIN_CHANNEL_ID);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("scope", "profile openid");
  u.searchParams.set("nonce", opts.nonce ?? randomHex());
  return u.toString();
}