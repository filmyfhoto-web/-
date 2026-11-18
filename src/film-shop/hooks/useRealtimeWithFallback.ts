import { useEffect, useRef } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { reportChannelStatus, unregisterChannel, markSynced, onGlobalRefresh } from '@/film-shop/lib/realtimeStatus';

const DEAD_STATUSES = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'];

/** Exponential backoff with jitter, capped at 30s. */
export function retryDelay(attempt: number) {
  const base = Math.min(30000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/**
 * Realtime subscription with graceful fallback:
 *  - Subscribes to postgres_changes on the given table(s) and invokes `onChange`.
 *  - Also refetches when the tab regains focus / becomes visible.
 *  - Polls every `pollMs` (default 30s) if realtime is not healthy, so counts
 *    and badges still refresh after page reloads or dropped websockets.
 */
export function useRealtimeWithFallback(
  tables: string | string[],
  onChange: () => void,
  opts: { enabled?: boolean; pollMs?: number } = {},
) {
  const { enabled = true, pollMs = 30000 } = opts;
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    const list = Array.isArray(tables) ? tables : [tables];
    const channelKey = `rtfb-${list.join('-')}-${Math.random().toString(36).slice(2, 8)}`;
    let healthy = false;
    let disposed = false;
    let attempt = 0;
    let retryTimer: number | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refresh = () => { cbRef.current?.(); markSynced(); };

    const teardown = () => {
      if (channel) {
        const c = channel;
        channel = null;
        try { supabase.removeChannel(c); } catch { /* noop */ }
      }
    };

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;
      attempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        if (disposed) return;
        teardown();
        connect();
      }, retryDelay(attempt));
    };

    const connect = () => {
      if (disposed) return;
      let ch = supabase.channel(`${channelKey}-a${attempt}`);
      list.forEach((t) => {
        ch = ch.on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: t },
          () => cbRef.current?.(),
        );
      });
      channel = ch;
      ch.subscribe((status: string) => {
        if (disposed) return;
        const wasHealthy = healthy;
        healthy = status === 'SUBSCRIBED';
        reportChannelStatus(channelKey, status);
        if (healthy) {
          attempt = 0;
          // Re-sync after any (re)connect so numbers can't drift while offline.
          if (!wasHealthy) refresh();
        } else if (DEAD_STATUSES.includes(status)) {
          scheduleRetry();
        }
      });
    };

    connect();

    const reconnectNow = () => {
      if (disposed || healthy) return;
      if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = undefined; }
      attempt = 0;
      teardown();
      connect();
    };
    const onFocus = () => { refresh(); reconnectNow(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { refresh(); reconnectNow(); }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onFocus);
    const offGlobal = onGlobalRefresh(() => cbRef.current?.());

    // Poll fallback: fires unconditionally, but at a slow cadence so it's a
    // safety net when realtime is degraded.
    const timer = window.setInterval(() => {
      if (!healthy) { refresh(); reconnectNow(); }
    }, pollMs);

    // Fresh count on mount — don't trust stale state.
    refresh();

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onFocus);
      offGlobal();
      window.clearInterval(timer);
      unregisterChannel(channelKey);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(tables) ? tables.join('|') : tables, enabled, pollMs]);
}