import { useCallback, useEffect, useRef, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";

/** Tables that change what the POS grid must show. */
export const POS_LIVE_TABLES = [
  "products",
  "product_variants",
  "product_unit_links",
  "stock_movements",
] as const;

export type PosLiveState = {
  /** realtime channel is connected */
  live: boolean;
  /** last successful catalog refetch */
  syncedAt: Date | null;
  /** manual refresh (same path as realtime) */
  refresh: () => void;
};

/**
 * Keeps the POS catalog hot in real time.
 *
 * - subscribes to every table that affects price/stock/variants
 * - debounces bursts (a checkout writes many stock rows at once)
 * - also refetches on focus / visibility / reconnect, so a device that was
 *   asleep or offline never shows a stale grid even if the socket dropped
 */
export function usePosLiveCatalog(reload: () => Promise<unknown>, enabled = true): PosLiveState {
  const [live, setLive] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const timer = useRef<number | null>(null);
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await reloadRef.current();
      setSyncedAt(new Date());
    } catch {
      /* keep the last good catalog on screen */
    } finally {
      busy.current = false;
    }
  }, []);

  const schedule = useCallback((delay = 400) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void run(); }, delay);
  }, [run]);

  useEffect(() => {
    if (!enabled) return;
    // Some hosts/tests provide a stubbed client without Realtime — degrade to
    // focus/interval refresh instead of crashing the register.
    const canRealtime = typeof (supabase as { channel?: unknown }).channel === "function";
    const channel = canRealtime ? liveChannel(`pos-catalog-${Math.random().toString(36).slice(2, 8)}`) : null;
    if (channel) for (const table of POS_LIVE_TABLES) {
      (channel as unknown as { on: (...args: unknown[]) => void }).on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => schedule(),
      );
    }
    channel?.subscribe((status) => setLive(status === "SUBSCRIBED"));

    const onFocus = () => schedule(0);
    const onVisible = () => { if (document.visibilityState === "visible") schedule(0); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    // safety net if the socket silently dies
    const poll = window.setInterval(() => schedule(0), 60_000);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, schedule]);

  return { live, syncedAt, refresh: () => schedule(0) };
}
