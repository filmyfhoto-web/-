import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';

/** หมวดของรายการด่วน — ใช้เป็นตัวกรองในหน้า “ออกเอกสารด่วน” */
export const QUICK_CATEGORIES = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'print', label: 'งานพิมพ์' },
  { id: 'photo', label: 'ถ่ายรูป' },
  { id: 'binding', label: 'เข้าเล่ม' },
  { id: 'sign', label: 'งานป้าย' },
] as const;

export type QuickCategory = 'print' | 'photo' | 'binding' | 'sign' | 'other';

export interface QuickItem {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: QuickCategory;
  pinned: boolean;
  active: boolean;
  sort_order: number;
}

const db = supabase as any;
const TABLE = 'film_quick_items';

/** เรียง: ปักหมุดขึ้นก่อน แล้วตาม sort_order แล้วตามชื่อ */
export function sortQuickItems(rows: QuickItem[]): QuickItem[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name, 'th'),
  );
}

/** รายการด่วนของ Film Shop — เก็บถาวรในฐานข้อมูลของโปรเจกต์ */
export function useQuickItems() {
  const [items, setItems] = useState<QuickItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await db
      .from(TABLE)
      .select('id,name,price,unit,category,pinned,active,sort_order')
      .order('sort_order', { ascending: true });
    if (err) setError('โหลดรายการด่วนไม่สำเร็จ');
    else {
      setError(null);
      setItems(
        sortQuickItems(
          ((data ?? []) as any[]).map((r) => ({ ...r, price: Number(r.price) || 0 })) as QuickItem[],
        ),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = useCallback(async (payload: Partial<QuickItem>) => {
    const { error: err } = await db.from(TABLE).insert({
      name: payload.name?.trim() || 'รายการใหม่',
      price: Number(payload.price) || 0,
      unit: payload.unit || 'ชิ้น',
      category: payload.category || 'other',
      pinned: payload.pinned ?? false,
      active: payload.active ?? true,
      sort_order: payload.sort_order ?? 999,
    });
    if (err) throw new Error('บันทึกรายการด่วนไม่สำเร็จ');
    await load();
  }, [load]);

  const update = useCallback(async (id: string, patch: Partial<QuickItem>) => {
    const { error: err } = await db.from(TABLE).update(patch).eq('id', id);
    if (err) throw new Error('แก้ไขรายการด่วนไม่สำเร็จ');
    await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    const { error: err } = await db.from(TABLE).delete().eq('id', id);
    if (err) throw new Error('ลบรายการด่วนไม่สำเร็จ');
    await load();
  }, [load]);

  /** เลื่อนตำแหน่งขึ้น/ลง — สลับ sort_order กับรายการข้างเคียง */
  const move = useCallback(async (id: string, dir: -1 | 1) => {
    const list = sortQuickItems(items);
    const idx = list.findIndex((i) => i.id === id);
    const swap = list[idx + dir];
    if (idx < 0 || !swap) return;
    const me = list[idx];
    await db.from(TABLE).update({ sort_order: swap.sort_order }).eq('id', me.id);
    await db.from(TABLE).update({ sort_order: me.sort_order }).eq('id', swap.id);
    await load();
  }, [items, load]);

  return { items, loading, error, reload: load, create, update, remove, move };
}
