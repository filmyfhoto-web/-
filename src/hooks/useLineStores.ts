import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LineStore {
  id: string;
  display_name: string;
  line_basic_id: string | null;
  line_channel_id: string | null;
  is_active: boolean;
  has_secret: boolean;
  has_token: boolean;
  updated_at: string | null;
}

const db = supabase as any;

/** ร้าน LINE OA ทั้งหมด (ชื่อจริงจากฐานข้อมูล — ไม่มีข้อมูลจำลอง). */
export function useLineStores() {
  const [stores, setStores] = useState<LineStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await db.rpc('list_line_stores');
    if (error) { setError(error.message); setLoading(false); return; }
    setError(null);
    setStores((data ?? []) as LineStore[]);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const ch = db
      .channel(`line-stores-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'line_credentials' }, () => reload())
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [reload]);

  return { stores, loading, error, reload };
}

/** ชื่อร้านตาม id — fallback เป็น id เมื่อยังไม่ได้ตั้งชื่อ */
export function storeLabel(stores: LineStore[], id: string | null | undefined): string {
  const key = String(id ?? 'default');
  return stores.find((s) => s.id === key)?.display_name || key;
}
