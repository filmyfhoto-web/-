/**
 * Shared teacher/customer directory for POS.
 *
 * The list must always reflect the database, so it is refetched whenever the
 * POS screen mounts, whenever the tab/app regains focus, and whenever the
 * cashier taps refresh. A module-level cache keeps the dialog instant while a
 * background refresh runs, and in-flight requests are de-duplicated so a
 * focus + mount burst never fires twice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DirectoryRow = {
  source_id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  line_display_name: string | null;
  line_user_id: string | null;
};

let cache: DirectoryRow[] = [];
let inflight: Promise<DirectoryRow[]> | null = null;
const listeners = new Set<(rows: DirectoryRow[]) => void>();

export function getCachedDirectory(): DirectoryRow[] {
  return cache;
}

export async function fetchCustomerDirectory(force = false): Promise<DirectoryRow[]> {
  if (inflight && !force) return inflight;
  const run = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("v_unified_customers")
      .select("source_id,name,phone,address,line_display_name,line_user_id")
      .order("name", { ascending: true })
      .limit(1000);
    if (error) throw error;
    const rows = ((data as DirectoryRow[]) ?? []).filter((r) => (r.name || "").trim());
    cache = rows;
    listeners.forEach((fn) => fn(rows));
    return rows;
  })();
  inflight = run;
  try {
    return await run;
  } finally {
    inflight = null;
  }
}

/**
 * @param enabled when false the hook stays idle (e.g. a closed dialog) but
 *                still serves the cached rows.
 */
export function useCustomerDirectory(enabled = true) {
  const [rows, setRows] = useState<DirectoryRow[]>(cache);
  const [loading, setLoading] = useState(cache.length === 0);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const onRows = (r: DirectoryRow[]) => { if (aliveRef.current) setRows(r); };
    listeners.add(onRows);
    return () => { aliveRef.current = false; listeners.delete(onRows); };
  }, []);

  const refresh = useCallback(async (force = true) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchCustomerDirectory(force);
      if (aliveRef.current) setRows(r);
    } catch (e) {
      if (aliveRef.current) setError((e as { message?: string })?.message || "โหลดรายชื่อไม่สำเร็จ");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  // mount / re-open + focus + tab visible → always fresh
  useEffect(() => {
    if (!enabled) return;
    void refresh(false);
    const onFocus = () => void refresh(true);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  return { rows, loading, error, refresh };
}
