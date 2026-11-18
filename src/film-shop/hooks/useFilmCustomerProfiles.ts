import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useLineProfiles, type LineProfile } from '@/film-shop/hooks/useLineProfiles';

const db = supabase as any;

/**
 * แปลง customerId ของออเดอร์ → โปรไฟล์ LINE (รูป + ชื่อ) ของลูกค้าที่สั่งงาน
 * ใช้ในหน้า Film Shop เพื่อให้พนักงานเห็นหน้าลูกค้าทันทีโดยไม่ต้องเปิดรายละเอียด
 */
export function useFilmCustomerProfiles(customerIds: (string | null | undefined)[]) {
  const ids = useMemo(
    () => Array.from(new Set(customerIds.filter((v): v is string => !!v))).sort(),
    [customerIds],
  );
  const key = ids.join(',');
  const [lineByCustomer, setLineByCustomer] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await db.from('film_customers').select('id,line_user_id').in('id', ids);
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const r of (data ?? []) as any[]) if (r.line_user_id) next[r.id] = r.line_user_id;
      setLineByCustomer(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const profiles = useLineProfiles(Object.values(lineByCustomer));

  return useMemo(() => {
    const out: Record<string, LineProfile> = {};
    for (const [customerId, lineUserId] of Object.entries(lineByCustomer)) {
      const p = profiles[lineUserId];
      if (p) out[customerId] = p;
    }
    return out;
  }, [lineByCustomer, profiles]);
}

export default useFilmCustomerProfiles;
