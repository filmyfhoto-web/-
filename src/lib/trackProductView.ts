// Silent product-view tracker. NO user-visible UI. Never throws.
// Uses a per-session id in sessionStorage so refresh-happy users don't inflate view counts,
// plus an in-memory de-dupe so repeated hover/click within a session doesn't spam the network.
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "pvt_sid_v1";
const FIRED_KEY = "pvt_fired_v1";

function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid =
        (crypto as any)?.randomUUID?.() ??
        `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `s_${Date.now()}`;
  }
}

function firedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FIRED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function markFired(key: string, set: Set<string>) {
  set.add(key);
  try {
    sessionStorage.setItem(FIRED_KEY, JSON.stringify(Array.from(set).slice(-500)));
  } catch { /* ignore */ }
}

export interface TrackOptions {
  productId: string;
  source?: string;      // e.g. "shop_card_click" | "shop_add_to_cart"
  guestPhone?: string;  // only if the user has already typed it into the site
}

export function trackProductView(opts: TrackOptions): void {
  try {
    if (!opts?.productId) return;
    const sid = getSessionId();
    const dedupKey = `${sid}:${opts.productId}`;
    const fired = firedSet();
    // For a single session+product we only fire once per 60s to keep the network quiet.
    // The server itself dedupes further via unique(session_id, product_id).
    if (fired.has(dedupKey)) return;
    markFired(dedupKey, fired);

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-product-view`;
    const body = JSON.stringify({
      product_id: opts.productId,
      session_id: sid,
      source: opts.source || "shop",
      referrer: typeof document !== "undefined" ? document.referrer || "" : "",
      path: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
      guest_phone: opts.guestPhone || undefined,
    });

    // Best-effort: attach auth token if signed in so the server can identify the user.
    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch(url, { method: "POST", headers, body, keepalive: true }).catch(() => {});
    }).catch(() => {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body, keepalive: true,
      }).catch(() => {});
    });
  } catch {
    // Silent: tracking must never disturb the shopper.
  }
}