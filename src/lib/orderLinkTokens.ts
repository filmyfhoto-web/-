/**
 * Persistent cache for guest order `line_link_token` values.
 *
 * The token is minted by `guest-order-submit` and returned to the browser
 * once, right after checkout. It's what lets the guest re-open the order
 * page (and later connect their LINE account to the order) without
 * authenticating. Historically we stashed it in `sessionStorage`, which is
 * wiped when the tab closes — so a returning guest with only the bare
 * `/my-orders/:id` URL lost access. This helper stores the token in
 * `localStorage` with an explicit expiry, mirrors it to a first-party
 * cookie for cross-tab survivability, and migrates any legacy
 * `sessionStorage` entry it finds.
 */

const LS_PREFIX = "order_link_token_";
const COOKIE_PREFIX = "olt_";
const DEFAULT_TTL_DAYS = 60;

type Stored = { token: string; exp: number };

function lsKey(orderId: string) {
  return `${LS_PREFIX}${orderId}`;
}

function cookieKey(orderId: string) {
  // Cookie names are conservative — strip anything non-alphanum/underscore
  // just in case an order id ever contains an odd character.
  return `${COOKIE_PREFIX}${orderId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function writeCookie(name: string, value: string, ttlDays: number) {
  if (!isBrowser() || typeof document === "undefined") return;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const maxAge = Math.max(1, Math.floor(ttlDays * 86400));
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

function readCookie(name: string): string | null {
  if (!isBrowser() || typeof document === "undefined") return null;
  try {
    const parts = document.cookie ? document.cookie.split(";") : [];
    for (const raw of parts) {
      const eq = raw.indexOf("=");
      if (eq < 0) continue;
      const k = raw.slice(0, eq).trim();
      if (k === name) return decodeURIComponent(raw.slice(eq + 1));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function deleteCookie(name: string) {
  if (!isBrowser() || typeof document === "undefined") return;
  try {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function saveOrderLinkToken(
  orderId: string,
  token: string,
  ttlDays: number = DEFAULT_TTL_DAYS,
): void {
  if (!orderId || !token || !isBrowser()) return;
  const exp = Date.now() + Math.max(1, ttlDays) * 86400 * 1000;
  try {
    const payload: Stored = { token, exp };
    window.localStorage.setItem(lsKey(orderId), JSON.stringify(payload));
  } catch {
    /* localStorage quota / private mode — cookie still covers it */
  }
  writeCookie(cookieKey(orderId), token, ttlDays);
}

export function readOrderLinkToken(orderId: string): string {
  if (!orderId || !isBrowser()) return "";
  // 1) localStorage (with TTL)
  try {
    const raw = window.localStorage.getItem(lsKey(orderId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      if (parsed && typeof parsed.token === "string" && typeof parsed.exp === "number") {
        if (parsed.exp > Date.now()) return parsed.token;
        // expired — clean up
        try { window.localStorage.removeItem(lsKey(orderId)); } catch { /* ignore */ }
        deleteCookie(cookieKey(orderId));
      }
    }
  } catch {
    /* ignore parse/access errors */
  }
  // 2) cookie fallback
  const fromCookie = readCookie(cookieKey(orderId));
  if (fromCookie) {
    // rehydrate localStorage so subsequent reads are cheap and TTL-tracked
    try {
      const payload: Stored = { token: fromCookie, exp: Date.now() + DEFAULT_TTL_DAYS * 86400 * 1000 };
      window.localStorage.setItem(lsKey(orderId), JSON.stringify(payload));
    } catch { /* ignore */ }
    return fromCookie;
  }
  // 3) legacy sessionStorage (pre-migration tabs)
  try {
    const legacy = window.sessionStorage.getItem(lsKey(orderId));
    if (legacy) {
      saveOrderLinkToken(orderId, legacy);
      try { window.sessionStorage.removeItem(lsKey(orderId)); } catch { /* ignore */ }
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function clearOrderLinkToken(orderId: string): void {
  if (!orderId || !isBrowser()) return;
  try { window.localStorage.removeItem(lsKey(orderId)); } catch { /* ignore */ }
  try { window.sessionStorage.removeItem(lsKey(orderId)); } catch { /* ignore */ }
  deleteCookie(cookieKey(orderId));
}