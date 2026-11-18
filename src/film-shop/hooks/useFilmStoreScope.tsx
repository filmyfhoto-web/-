import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLineStores } from '@/hooks/useLineStores';

const KEY = 'film-shop:active-store';

export interface FilmStoreOption { id: string; label: string }

interface Scope {
  storeId: string;              // 'all' หรือ id ร้าน
  setStoreId: (id: string) => void;
  stores: FilmStoreOption[];
  loading: boolean;
}

const Ctx = createContext<Scope | null>(null);

/** ขอบเขต "ร้านที่กำลังทำงานอยู่" ใช้ร่วมกันทั้งแอป Film Shop (จำค่าไว้ในเครื่อง) */
export function FilmStoreScopeProvider({ children }: { children: ReactNode }) {
  const { stores: raw, loading } = useLineStores();
  const [storeId, setStoreId] = useState<string>(() => {
    try { return localStorage.getItem(KEY) || 'all'; } catch { return 'all'; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, storeId); } catch { /* ignore */ }
  }, [storeId]);

  const stores = useMemo<FilmStoreOption[]>(
    () => raw.map((s) => ({ id: s.id, label: s.display_name || s.id })),
    [raw],
  );

  // ถ้าร้านที่จำไว้หายไป ให้กลับไป "ทุกร้าน" อัตโนมัติ
  useEffect(() => {
    if (loading || storeId === 'all') return;
    if (!stores.some((s) => s.id === storeId)) setStoreId('all');
  }, [loading, stores, storeId]);

  const value = useMemo(() => ({ storeId, setStoreId, stores, loading }), [storeId, stores, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilmStoreScope(): Scope {
  return useContext(Ctx) ?? { storeId: 'all', setStoreId: () => {}, stores: [], loading: false };
}
