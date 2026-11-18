import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useFilmStoreScope } from '@/film-shop/hooks/useFilmStoreScope';

const db = supabase as any;

export type AlertGroup = 1 | 2;

export interface GroupAlert {
  id: string;
  group: AlertGroup;
  kind: string;
  title: string;
  body: string | null;
  storeId: string | null;
  orderId: string | null;
  readAt: string | null;
  createdAt: string;
}

function mapRow(r: any): GroupAlert {
  return {
    id: r.id,
    group: (Number(r.group_no) === 2 ? 2 : 1) as AlertGroup,
    kind: r.kind,
    title: r.title,
    body: r.body ?? null,
    storeId: r.store_id ?? null,
    orderId: r.order_id ?? null,
    readAt: r.read_at ?? null,
    createdAt: r.created_at,
  };
}

/**
 * แจ้งเตือน 2 กลุ่มแยกกัน:
 *  - กลุ่ม 1 = ออเดอร์จากเว็บแอปสั่งซื้อ (web_app_order)
 *  - กลุ่ม 2 = NATTA.Q ตรวจจับข้อความแชทแล้วรันออเดอร์อัตโนมัติ (nattaq_auto_order)
 * กรองตามร้านที่เลือกอยู่ (แจ้งเตือนที่ไม่ระบุร้านจะแสดงเสมอ)
 */
export function useGroupNotifications(limit = 40) {
  const { storeId } = useFilmStoreScope();
  const [rows, setRows] = useState<GroupAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await db
      .from('film_ops_notifications')
      .select('id,kind,title,body,store_id,order_id,read_at,created_at,group_no')
      .in('group_no', [1, 2])
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    setRows((data ?? []).map(mapRow));
    setLoading(false);
  }, [limit]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = db
      .channel(`group-alerts-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_ops_notifications' }, () => void load())
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [load]);

  const scoped = useMemo(
    () => rows.filter((r) => storeId === 'all' || !r.storeId || r.storeId === storeId).slice(0, limit),
    [rows, storeId, limit],
  );

  const group1 = useMemo(() => scoped.filter((r) => r.group === 1), [scoped]);
  const group2 = useMemo(() => scoped.filter((r) => r.group === 2), [scoped]);
  const unread1 = useMemo(() => group1.filter((r) => !r.readAt).length, [group1]);
  const unread2 = useMemo(() => group2.filter((r) => !r.readAt).length, [group2]);

  /** ทำเครื่องหมายอ่านแล้ว/ยังไม่อ่าน รายการเดียว */
  const markRead = useCallback(async (id: string, read = true) => {
    const value = read ? new Date().toISOString() : null;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, readAt: value } : r)));
    await db.from('film_ops_notifications').update({ read_at: value }).eq('id', id);
  }, []);

  const markGroupRead = useCallback(async (group: AlertGroup) => {
    const now = new Date().toISOString();
    // อ่านเฉพาะรายการที่อยู่ในขอบเขตร้านที่กำลังดูอยู่ ไม่ไปล้างยอดค้างอ่านของร้านอื่น
    const ids = scoped.filter((r) => r.group === group && !r.readAt).map((r) => r.id);
    if (ids.length === 0) return;
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, readAt: now } : r)));
    await db.from('film_ops_notifications').update({ read_at: now }).in('id', ids).is('read_at', null);
  }, [scoped]);

  return { group1, group2, unread1, unread2, loading, reload: load, markGroupRead, markRead };
}
