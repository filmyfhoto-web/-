import { useCallback, useMemo, useState } from "react";

export function useBulkSelect<T extends { id: string }>(items: T[]) {
  const [selectMode, setSelectMode] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setIds(prev => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map(i => i.id));
    });
  }, [items]);

  const clear = useCallback(() => setIds(new Set()), []);

  const exit = useCallback(() => { setSelectMode(false); setIds(new Set()); }, []);

  const allSelected = useMemo(
    () => items.length > 0 && ids.size === items.length,
    [items, ids],
  );

  return {
    selectMode, setSelectMode,
    ids, setIds,
    toggle, toggleAll, clear, exit,
    count: ids.size,
    allSelected,
    selectedArray: useMemo(() => Array.from(ids), [ids]),
  };
}