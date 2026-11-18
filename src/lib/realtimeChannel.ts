import { supabase } from "@/integrations/supabase/client";

/**
 * Supabase caches channels by topic: calling `supabase.channel("x")` twice
 * returns the SAME channel, and adding `postgres_changes` callbacks to an
 * already-joined channel throws
 * `cannot add \`postgres_changes\` callbacks ... after \`subscribe()\``.
 * React effects that re-run (dependency change, remount, StrictMode) hit this
 * and crash the whole page into the error boundary.
 *
 * `liveChannel` always creates a fresh, uniquely named channel so a re-run can
 * never touch a joined one.
 */
let seq = 0;

export function liveChannel(topic: string, opts?: Record<string, unknown>) {
  seq += 1;
  const unique = `${topic}#${seq}-${Math.random().toString(36).slice(2, 7)}`;
  return opts ? supabase.channel(unique, opts as any) : supabase.channel(unique);
}

const DEAD = ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"];

/** Exponential backoff with jitter, capped at 30s. */
export function realtimeRetryDelay(attempt: number) {
  const base = Math.min(30000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

type Bind = (ch: ReturnType<typeof liveChannel>) => ReturnType<typeof liveChannel>;

/**
 * Subscribe with automatic retry: if the websocket drops (CHANNEL_ERROR /
 * TIMED_OUT / CLOSED) the channel is rebuilt with exponential backoff, and
 * `onResync` runs after every successful (re)connect so counts stay correct.
 * Also reconnects immediately on tab focus / network back online.
 * Returns a cleanup function.
 */
export function liveSubscribe(topic: string, bind: Bind, onResync?: () => void) {
  let disposed = false;
  let healthy = false;
  let attempt = 0;
  let timer: number | undefined;
  let ch: ReturnType<typeof liveChannel> | null = null;

  const teardown = () => {
    if (!ch) return;
    const c = ch;
    ch = null;
    try { supabase.removeChannel(c); } catch { /* noop */ }
  };

  const connect = () => {
    if (disposed) return;
    ch = bind(liveChannel(topic));
    ch.subscribe((status: string) => {
      if (disposed) return;
      const was = healthy;
      healthy = status === "SUBSCRIBED";
      if (healthy) {
        attempt = 0;
        if (!was) onResync?.();
      } else if (DEAD.includes(status) && timer === undefined) {
        attempt += 1;
        timer = window.setTimeout(() => {
          timer = undefined;
          teardown();
          connect();
        }, realtimeRetryDelay(attempt));
      }
    });
  };

  connect();

  const kick = () => {
    if (disposed || healthy) return;
    if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; }
    attempt = 0;
    teardown();
    connect();
  };
  const onVisible = () => { if (document.visibilityState === "visible") kick(); };
  window.addEventListener("focus", kick);
  window.addEventListener("online", kick);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    disposed = true;
    if (timer !== undefined) window.clearTimeout(timer);
    window.removeEventListener("focus", kick);
    window.removeEventListener("online", kick);
    document.removeEventListener("visibilitychange", onVisible);
    teardown();
  };
}