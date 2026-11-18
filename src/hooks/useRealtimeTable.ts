import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Opts = {
  table: string;
  schema?: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  filter?: string;
  onChange?: (payload: any) => void;
};

/**
 * Subscribe to Supabase Realtime postgres_changes for a table.
 * Returns `live` = true when the channel is SUBSCRIBED.
 */
export function useRealtimeTable({ table, schema = "public", event = "*", filter, onChange }: Opts) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const channel = supabase
      .channel(`rt:${schema}:${table}:${filter ?? "all"}:${Math.random().toString(36).slice(2, 7)}`)
      .on(
        // @ts-ignore - postgres_changes types
        "postgres_changes",
        { event, schema, table, ...(filter ? { filter } : {}) },
        (payload: any) => { onChange?.(payload); }
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, schema, event, filter]);
  return { live };
}

/** Subscribe to multiple tables; fires the same callback for any change. */
export function useRealtimeTables(tables: string[], onChange: () => void) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const ch = supabase.channel(`rt-multi-${tables.join("-")}-${Math.random().toString(36).slice(2,7)}`);
    tables.forEach((t) => {
      // @ts-ignore
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (payload: any) => {
        onChange();
        try {
          window.dispatchEvent(new CustomEvent("lovable:realtime", { detail: { table: t, payload } }));
        } catch {}
      });
    });
    ch.subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(",")]);
  return { live };
}

/**
 * Listen for realtime changes on the given tables and call `refetch`.
 * Pair with the layout-level useRealtimeTables subscription.
 */
export function useRealtimeRefresh(tables: string[], refetch: () => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.table) return;
      if (tables.includes(detail.table)) refetch();
    };
    window.addEventListener("lovable:realtime", handler as any);
    return () => window.removeEventListener("lovable:realtime", handler as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(",")]);
}