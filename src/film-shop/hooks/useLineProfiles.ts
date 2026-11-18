import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';

const db = supabase as any;

export interface LineProfile {
  displayName: string | null;
  pictureUrl: string | null;
}

/**
 * ดึงรูปโปรไฟล์ + ชื่อ LINE ของลูกค้าตาม line_user_id
 * ใช้ในหน้า Film Shop เพื่อให้พนักงานเห็นว่า "ใครสั่งงาน" ทันที
 */
export function useLineProfiles(lineUserIds: (string | null | undefined)[]) {
  const ids = useMemo(
    () => Array.from(new Set(lineUserIds.filter((v): v is string => !!v))).sort(),
    [lineUserIds],
  );
  const key = ids.join(',');
  const [map, setMap] = useState<Record<string, LineProfile>>({});

  useEffect(() => {
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, LineProfile> = {};
      const [links, profiles, storeCustomers] = await Promise.all([
        db.from('line_account_links').select('line_user_id,display_name,picture_url').in('line_user_id', ids),
        db.from('profiles').select('line_user_id,line_display_name,line_picture_url').in('line_user_id', ids),
        db.from('line_store_customers').select('line_user_id,display_name,picture_url').in('line_user_id', ids),
      ]);
      for (const r of (profiles.data ?? []) as any[]) {
        if (r.line_user_id) next[r.line_user_id] = { displayName: r.line_display_name ?? null, pictureUrl: r.line_picture_url ?? null };
      }
      for (const r of [...((links.data ?? []) as any[]), ...((storeCustomers.data ?? []) as any[])]) {
        if (!r.line_user_id) continue;
        const prev = next[r.line_user_id];
        next[r.line_user_id] = {
          displayName: prev?.displayName ?? r.display_name ?? null,
          pictureUrl: prev?.pictureUrl ?? r.picture_url ?? null,
        };
      }
      if (!cancelled) setMap(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}
