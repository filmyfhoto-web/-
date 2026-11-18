import { useEffect } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeyMatchesTables } from "@/lib/realtimeTargets";
import { getRealtimeState, setRealtimeState } from "@/lib/realtimeStatus";

/**
 * One app-wide realtime listener for every table in the `public` schema.
 *
 * - Coalesces events in a short window and invalidates ONLY the react-query
 *   keys related to the tables that actually changed (no full-cache refetch,
 *   which used to cause refresh storms and UI flicker).
 * - Re-broadcasts a `lovable:realtime` window event (with the table name) so
 *   pages using manual `useState` fetching can refresh via `useRealtimeRefresh`.
 * - Reconnects with backoff and resyncs when the tab regains focus or the
 *   device comes back online.
 *
 * RLS still applies: a client only receives rows it is allowed to read.
 */
const FLUSH_MS = 250;
const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000];

export default function GlobalRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let flushTimer: number | undefined;
    let retryTimer: number | undefined;
    let attempt = 0;
    const pending = new Set<string>();

    const flush = () => {
      flushTimer = undefined;
      const tables = [...pending];
      pending.clear();
      if (tables.length === 0) return;
      setRealtimeState("syncing");
      qc.invalidateQueries({
        predicate: (query) => queryKeyMatchesTables(query.queryKey as unknown[], tables),
      });
      for (const table of tables) {
        try {
          window.dispatchEvent(new CustomEvent("lovable:realtime", { detail: { table } }));
        } catch { /* ignore */ }
      }
      window.setTimeout(() => {
        if (!disposed && navigator.onLine !== false) setRealtimeState("online");
      }, 400);
    };

    const enqueue = (table: string) => {
      pending.add(table || "unknown");
      if (flushTimer === undefined) flushTimer = window.setTimeout(flush, FLUSH_MS);
    };

    const connect = () => {
      if (disposed) return;
      setRealtimeState(navigator.onLine === false ? "offline" : "connecting");
      channel = liveChannel(`rt-global-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          // @ts-ignore - postgres_changes typing
          "postgres_changes",
          { event: "*", schema: "public" },
          (payload: any) => enqueue(payload?.table ?? ""),
        )
        .subscribe((status: string) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            setRealtimeState(navigator.onLine === false ? "offline" : "online");
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtimeState(navigator.onLine === false ? "offline" : "connecting");
            scheduleReconnect();
          }
        });
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer !== undefined) return;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        if (disposed) return;
        if (channel) supabase.removeChannel(channel);
        channel = null;
        connect();
      }, delay);
    };

    connect();

    // Safety net: if the websocket is not healthy, refetch what is on screen
    // every 45s so no device is ever left showing stale data.
    const pollId = window.setInterval(() => {
      if (disposed) return;
      if (document.visibilityState !== "visible" || navigator.onLine === false) return;
      if (getRealtimeState() === "online") return;
      qc.invalidateQueries({ type: "active" });
    }, 45_000);

    // Resync (targeted refetch of what is currently mounted) on wake-up.
    const resync = () => {
      if (document.visibilityState !== "visible") return;
      setRealtimeState(navigator.onLine === false ? "offline" : "syncing");
      qc.invalidateQueries({ type: "active" });
      window.setTimeout(() => {
        if (!disposed) setRealtimeState(navigator.onLine === false ? "offline" : "online");
      }, 400);
    };
    const goOffline = () => setRealtimeState("offline");
    const goOnline = () => { attempt = 0; resync(); scheduleReconnect(); };

    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      disposed = true;
      window.clearInterval(pollId);
      if (flushTimer !== undefined) window.clearTimeout(flushTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [qc]);

  return null;
}
