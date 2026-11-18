import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readIdToken, clearIdToken } from "@/lib/lineSession";

/**
 * Central LINE binding state — the ONE place the app asks "is this customer
 * linked to LINE?". The answer always comes from the server
 * (`line-link-lookup`); browser storage is only ever used to attach the
 * caller's proof, never to decide `linked`.
 *
 * A module-level store is shared by every subscriber so a dialog, a banner
 * and the checkout page can't each fire their own lookup (which is what made
 * the old UI re-prompt for linking over and over).
 */

export type LineBindingStatus =
  | "loading"
  | "linked"
  | "unlinked"
  | "needs_friend"
  | "error";

export type LineBindingState = {
  status: LineBindingStatus;
  lineUserId: string | null;
  displayName: string | null;
  /** Display-only LINE avatar (https, from the server lookup). */
  pictureUrl: string | null;
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  friendStatus: string;
  checkedAt: number;
  error: string | null;
};

const EMPTY: LineBindingState = {
  status: "loading",
  lineUserId: null,
  displayName: null,
  pictureUrl: null,
  customerId: null,
  customerName: null,
  phone: null,
  friendStatus: "unknown",
  checkedAt: 0,
  error: null,
};

const FRESH_MS = 60_000;
const LOOKUP_TIMEOUT_MS = 12_000;

let current: LineBindingState = EMPTY;
let inflight: Promise<LineBindingState> | null = null;
const subscribers = new Set<(s: LineBindingState) => void>();

/**
 * Cross-tab sync. Linking usually finishes in a DIFFERENT tab (the LINE app
 * or the OAuth popup), so a tab that still believes "unlinked" would keep
 * showing the bind prompt forever. Every resolved lookup is broadcast, and
 * receivers re-validate against the server rather than trusting the payload.
 */
const CHANNEL_NAME = "line-binding";
let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (ev) => {
        if (ev?.data?.type !== "changed") return;
        // Another tab saw a change — confirm with the server in this tab too.
        void refreshLineBinding(true);
      };
    } catch { channel = null; }
  }
  return channel;
}

function emit(next: LineBindingState, broadcast = false) {
  current = next;
  for (const fn of subscribers) fn(next);
  if (broadcast) {
    try { getChannel()?.postMessage({ type: "changed" }); } catch { /* ignore */ }
  }
}

/** Test-only: wipe the shared cache between cases. */
export function __resetLineBindingStateForTests() {
  current = EMPTY;
  inflight = null;
  try { channel?.close(); } catch { /* ignore */ }
  channel = null;
}

export function getLineBindingSnapshot(): LineBindingState {
  return current;
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Mask a LINE user id for display — never show the full id in the UI. */
export function maskLineUserId(id: string | null | undefined): string {
  if (!id) return "-";
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

async function lookup(): Promise<LineBindingState> {
  const id_token = readIdToken();
  let hasSession = false;
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 4000, "auth_timeout");
    hasSession = !!data?.session;
  } catch { hasSession = false; }

  if (!id_token && !hasSession) {
    return { ...EMPTY, status: "unlinked", checkedAt: Date.now() };
  }

  // ในเบราว์เซอร์ของแอป LINE เน็ตมักสะดุดชั่วขณะ — ลองซ้ำอีกครั้งก่อนยอมแพ้
  // เพื่อไม่ให้ลูกค้าเจอหน้า "ตรวจสอบสิทธิ์ไม่สำเร็จ" แบบทางตัน
  async function invokeLookup(): Promise<any> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await withTimeout(
          supabase.functions.invoke("line-link-lookup", { body: id_token ? { id_token } : {} }),
          LOOKUP_TIMEOUT_MS,
          "lookup_timeout",
        );
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    throw lastErr;
  }

  try {
    const res: any = await invokeLookup();
    if (res?.error) {
      const status =
        res.error?.context?.response?.status ?? res.error?.status ?? null;
      if (status === 401 || status === 403) {
        if (id_token) clearIdToken();
        return { ...EMPTY, status: "unlinked", checkedAt: Date.now() };
      }
      throw res.error;
    }

    const data = res?.data ?? {};
    if (data.bound !== true) {
      return {
        ...EMPTY,
        status: "unlinked",
        checkedAt: Date.now(),
        lineUserId: typeof data.line_user_id === "string" ? data.line_user_id : null,
        displayName: typeof data.display_name === "string" ? data.display_name : null,
        pictureUrl: typeof data.picture_url === "string" ? data.picture_url : null,
      };
    }
    const friendStatus = typeof data.friend_status === "string" ? data.friend_status : "unknown";
    const linked: LineBindingState = {
      status: friendStatus === "not_friend" && data.friend_confirmed !== true ? "needs_friend" : "linked",
      lineUserId: typeof data.line_user_id === "string" ? data.line_user_id : null,
      displayName: typeof data.display_name === "string" ? data.display_name : null,
      pictureUrl: typeof data.picture_url === "string" && /^https:\/\//i.test(data.picture_url) ? data.picture_url : null,
      customerId: typeof data.customer_id === "string" ? data.customer_id : null,
      customerName: typeof data.customer_name === "string" ? data.customer_name : null,
      phone: typeof data.phone === "string" ? data.phone : null,
      friendStatus,
      checkedAt: Date.now(),
      error: null,
    };
    return linked;
  } catch (e) {
    // Transient failure must never downgrade a previously-linked customer to
    // "unlinked" — that is exactly what re-triggered the binding dialog.
    if (current.status === "linked") return { ...current, checkedAt: Date.now() };
    return { ...EMPTY, status: "error", checkedAt: Date.now(), error: String((e as Error)?.message || e) };
  }
}

/** Refresh the shared state. Concurrent callers share one request. */
export function refreshLineBinding(force = false): Promise<LineBindingState> {
  if (!force && current.checkedAt && Date.now() - current.checkedAt < FRESH_MS) {
    return Promise.resolve(current);
  }
  if (inflight) return inflight;
  inflight = lookup()
    .then((next) => {
      const changed = next.status !== current.status || next.lineUserId !== current.lineUserId;
      emit(next, changed);
      return next;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Explicit user-initiated disconnect. Only this (or a server revoke) unlinks. */
export async function disconnectLineBinding(): Promise<{ ok: boolean; error?: string }> {
  try {
    const id_token = readIdToken();
    const { error } = await supabase.functions.invoke("line-link-unbind", {
      body: id_token ? { id_token } : {},
    });
    if (error) return { ok: false, error: String((error as any)?.message || error) };
    clearIdToken();
    emit({ ...EMPTY, status: "unlinked", checkedAt: Date.now() }, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

export function useLineBindingState(options: { auto?: boolean } = {}) {
  const { auto = true } = options;
  const [state, setState] = useState<LineBindingState>(current);

  useEffect(() => {
    subscribers.add(setState);
    getChannel();
    return () => { subscribers.delete(setState); };
  }, []);

  useEffect(() => {
    if (!auto) return;
    void refreshLineBinding();
  }, [auto]);

  // Re-validate when the customer comes back to the tab (typically straight
  // after linking inside the LINE app) or regains connectivity, so a stale
  // "unlinked"/"error" never sticks and re-prompts them.
  useEffect(() => {
    if (!auto) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshLineBinding(true);
    };
    const onOnline = () => void refreshLineBinding(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [auto]);

  const refresh = useCallback(() => refreshLineBinding(true), []);
  const disconnect = useCallback(() => disconnectLineBinding(), []);

  return {
    ...state,
    isLinked: state.status === "linked",
    refresh,
    disconnect,
  };
}