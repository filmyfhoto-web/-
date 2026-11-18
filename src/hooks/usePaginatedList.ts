import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withRetry } from "@/lib/supabaseRetry";

export interface PaginatedListOptions {
  /** Supabase table name */
  table: string;
  /** Comma-separated select string (defaults to "*") */
  select?: string;
  /** Page size — defaults to 50 */
  pageSize?: number;
  /** Column to order by (defaults to created_at) */
  orderBy?: string;
  /** Descending order (defaults to true) */
  ascending?: boolean;
  /**
   * Stable filter spec. Pass a memoized object — the hook resets and
   * reloads from page 0 whenever the JSON shape changes.
   *
   * Each entry: `{ op: 'eq'|'in'|'ilike'|'gte'|'lte'|'is'|'neq', value: any }`.
   */
  filters?: Record<string, { op: string; value: unknown } | undefined>;
  /**
   * Optional PostgREST `or(...)` expression applied server-side, e.g.
   * `full_name.ilike.*ann*,phone.ilike.*08*`. Use for search boxes so the
   * query covers the whole table instead of only the loaded page.
   */
  orFilter?: string;
  /** Disable auto-fetch (e.g. while waiting on a dependency) */
  enabled?: boolean;
}


export interface PaginatedListResult<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  total: number | null;
  refresh: () => void;
  loadMore: () => void;
}

/**
 * Server-side paginated list hook with retry + loading state.
 * Always limits each page (default 50). Avoid loading entire tables to the
 * client — pass filters server-side and use loadMore for the next page.
 */
export function usePaginatedList<T = any>(opts: PaginatedListOptions): PaginatedListResult<T> {
  const {
    table,
    select = "*",
    pageSize = 50,
    orderBy = "created_at",
    ascending = false,
    filters,
    orFilter,
    enabled = true,
  } = opts;

  // Stable signature of filters so we don't loop on object identity changes.
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const reqId = useRef(0);

  const buildQuery = useCallback(
    (from: number, to: number) => {
      let q: any = supabase
        .from(table as any)
        .select(select, { count: "exact" })
        .order(orderBy, { ascending })
        .range(from, to);
      if (filters) {
        for (const [col, spec] of Object.entries(filters)) {
          if (!spec) continue;
          const { op, value } = spec;
          // `is` is the only op where null/"" is a meaningful value.
          if (op !== "is" && (value === undefined || value === null || value === "")) continue;
          switch (op) {
            case "eq": q = q.eq(col, value); break;
            case "neq": q = q.neq(col, value); break;
            case "in": q = q.in(col, value as any[]); break;
            case "ilike": q = q.ilike(col, `%${value}%`); break;
            case "gte": q = q.gte(col, value); break;
            case "lte": q = q.lte(col, value); break;
            case "is": q = q.is(col, (value ?? null) as any); break;
            default: q = q.eq(col, value);
          }
        }
      }
      if (orFilter) q = q.or(orFilter);
      return q;
    },
    [table, select, orderBy, ascending, filterKey, orFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );


  const fetchPage = useCallback(
    async (page: number, replace: boolean) => {
      const myReq = ++reqId.current;
      if (replace) setLoading(true); else setLoadingMore(true);
      setError(null);
      try {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data, error: err, count } = await withRetry(
          () => buildQuery(from, to) as Promise<any>
        );
        if (myReq !== reqId.current) return;
        if (err) throw err;
        const rows = (data ?? []) as T[];
        setItems((prev) => (replace ? rows : [...prev, ...rows]));
        setTotal(typeof count === "number" ? count : null);
        setHasMore(rows.length === pageSize);
      } catch (e: any) {
        if (myReq !== reqId.current) return;
        console.error("[usePaginatedList]", table, e);
        setError(e?.message ?? "load failed");
        if (replace) setItems([]);
        setHasMore(false);
      } finally {
        if (myReq === reqId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildQuery, pageSize, table]
  );

  const pageRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    pageRef.current = 0;
    void fetchPage(0, true);
  }, [enabled, fetchPage]);

  const refresh = useCallback(() => {
    pageRef.current = 0;
    void fetchPage(0, true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    pageRef.current += 1;
    void fetchPage(pageRef.current, false);
  }, [loading, loadingMore, hasMore, fetchPage]);

  return { items, loading, loadingMore, error, hasMore, total, refresh, loadMore };
}