import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Options {
  /** Rows added per page / per infinite-scroll step. */
  pageSize?: number;
  /** "infinite" appends on scroll (best for phones), "pages" uses page nav. */
  mode?: "infinite" | "pages";
}

/**
 * Keeps big tables fast on phones: only a slice of rows is rendered, and more
 * rows load when the sentinel element scrolls into view (or via page buttons).
 */
export function useTablePaging<T>(rows: T[], { pageSize = 50, mode = "infinite" }: Options = {}) {
  const [page, setPage] = useState(1);
  const sentinelRef = useRef<HTMLElement | null>(null);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Any change to the underlying data (filter/search/sort) restarts paging.
  useEffect(() => {
    setPage(1);
  }, [total, pageSize, mode]);

  const visible = useMemo(() => {
    if (mode === "pages") {
      const start = (page - 1) * pageSize;
      return rows.slice(start, start + pageSize);
    }
    return rows.slice(0, page * pageSize);
  }, [rows, page, pageSize, mode]);

  const hasMore = mode === "infinite" ? visible.length < total : page < pageCount;

  const loadMore = useCallback(() => {
    setPage((p) => (p * pageSize < total ? p + 1 : p));
  }, [pageSize, total]);

  const setSentinel = useCallback(
    (node: HTMLElement | null) => {
      sentinelRef.current = node;
    },
    [],
  );

  useEffect(() => {
    if (mode !== "infinite") return;
    const node = sentinelRef.current;
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "300px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [mode, hasMore, loadMore, visible.length]);

  return {
    visible,
    total,
    page,
    pageCount,
    pageSize,
    hasMore,
    loadMore,
    setPage,
    nextPage: () => setPage((p) => Math.min(pageCount, p + 1)),
    prevPage: () => setPage((p) => Math.max(1, p - 1)),
    /** Attach with `ref={setSentinel}` to the element after the table. */
    setSentinel,
  };
}

export default useTablePaging;