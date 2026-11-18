import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';

const db = supabase as any;

export interface LineReviewRow {
  id: string;
  customer_name: string | null;
  title: string | null;
  missing_fields: string[] | null;
  received_at: string | null;
  line_display_name: string | null;
  line_user_id: string | null;
}

/**
 * งาน LINE ที่ข้อมูลยังไม่ครบ (intake_status = needs_review) สำหรับแสดงบนหน้าแรก Film Shop
 * เพื่อให้พนักงานเห็นทันทีว่าขาดอะไร โดยไม่ต้องเปิดหลายหน้า
 */
export function useLineJobReview(limit = 5) {
  const [rows, setRows] = useState<LineReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, count } = await db
      .from('film_job_requests')
      .select('id,customer_name,title,missing_fields,received_at,line_display_name,line_user_id', { count: 'exact' })
      .eq('source', 'line')
      .eq('intake_status', 'needs_review')
      .order('received_at', { ascending: false })
      .limit(limit);
    setRows((data ?? []) as LineReviewRow[]);
    setTotal(count ?? (data?.length ?? 0));
    setLoading(false);
  }, [limit]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = db
      .channel(`film-line-review-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_job_requests' }, () => load())
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [load]);

  return { rows, total, loading, reload: load };
}
