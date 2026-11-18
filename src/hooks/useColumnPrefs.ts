import { useCallback, useEffect, useMemo, useState } from "react";

export interface ColumnDef {
  id: string;
  label: string;
  /** Column can never be hidden (usually the identifying first column). */
  locked?: boolean;
  /** Hidden by default on first visit. */
  defaultHidden?: boolean;
}

interface Stored {
  hidden: string[];
  order: string[];
}

const read = (key: string): Stored | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
};

/**
 * Per-table column visibility + ordering, remembered in localStorage so the
 * user's mobile view stays the same on the next visit.
 */
export function useColumnPrefs(tableKey: string, columns: ColumnDef[]) {
  const storageKey = `table-cols:${tableKey}`;
  const [hidden, setHidden] = useState<string[]>(() => {
    const s = read(storageKey);
    return s?.hidden ?? columns.filter((c) => c.defaultHidden && !c.locked).map((c) => c.id);
  });
  const [order, setOrder] = useState<string[]>(() => {
    const s = read(storageKey);
    const known = columns.map((c) => c.id);
    const saved = (s?.order ?? []).filter((id) => known.includes(id));
    return [...saved, ...known.filter((id) => !saved.includes(id))];
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ hidden, order }));
    } catch {
      /* storage disabled — prefs stay in-memory */
    }
  }, [storageKey, hidden, order]);

  const toggle = useCallback(
    (id: string) => {
      const col = columns.find((c) => c.id === id);
      if (col?.locked) return;
      setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    [columns],
  );

  const move = useCallback((id: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setHidden(columns.filter((c) => c.defaultHidden && !c.locked).map((c) => c.id));
    setOrder(columns.map((c) => c.id));
  }, [columns]);

  const ordered = useMemo(
    () => order.map((id) => columns.find((c) => c.id === id)).filter(Boolean) as ColumnDef[],
    [order, columns],
  );
  const visible = useMemo(() => ordered.filter((c) => !hidden.includes(c.id)), [ordered, hidden]);

  return {
    columns: ordered,
    visibleColumns: visible,
    isVisible: (id: string) => !hidden.includes(id),
    hiddenCount: hidden.length,
    toggle,
    move,
    reset,
  };
}

export default useColumnPrefs;