import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Inbox, AlertTriangle, MessageSquare } from 'lucide-react';
import { supabase } from '@/film-shop/lib/supabase';
import { formatBkk } from '@/film-shop/lib/queueScheduler';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { storeLabel, type LineStore } from '@/hooks/useLineStores';
import { cn } from '@/lib/utils';

const db = supabase as any;

interface ThreadRow {
  store_id: string;
  line_user_id: string;
  last_message_at: string | null;
  last_message_text: string | null;
  unread_count: number;
  customer_name: string | null;
}

interface CustomerRow {
  store_id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
}

const keyOf = (storeId: string, uid: string) => `${storeId}::${uid}`;

/** รายชื่อลูกค้าที่ทักเข้ามาทาง LINE OA — แยกตามร้าน ไม่ปะปนกัน */
export function LineOaCustomerList({
  stores,
  storeFilter,
}: {
  stores: LineStore[];
  storeFilter: string;
}) {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, CustomerRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);
  const [total, setTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [t, c] = await Promise.all([
      db.from('inbox_threads')
        .select('store_id,line_user_id,last_message_at,last_message_text,unread_count,customer_name', { count: 'exact' })
        .order('last_message_at', { ascending: false })
        .range(0, limit - 1),
      db.from('line_store_customers').select('store_id,line_user_id,display_name,picture_url').limit(2000),
    ]);
    if (t.error) { setError(t.error.message); setLoading(false); return; }
    setError(null);
    setTotal(typeof t.count === 'number' ? t.count : null);
    setThreads((t.data ?? []) as ThreadRow[]);
    const map: Record<string, CustomerRow> = {};
    for (const r of (c.data ?? []) as CustomerRow[]) map[keyOf(r.store_id, r.line_user_id)] = r;
    setProfiles(map);
    setLoading(false);
  }, [limit]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = db
      .channel(`line-oa-threads-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_threads' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'line_store_customers' }, () => load())
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [load]);

  const rows = useMemo(
    () => (storeFilter === 'all' ? threads : threads.filter((t) => t.store_id === storeFilter)),
    [threads, storeFilter],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดรายชื่อลูกค้า…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4" /> โหลดรายชื่อลูกค้าไม่สำเร็จ — {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        <Inbox className="mx-auto mb-2 h-5 w-5" />
        ยังไม่มีลูกค้าทักเข้ามาในร้านนี้
      </div>
    );
  }

  return (
    <ul className="space-y-2" data-testid="line-oa-customers">
      {rows.map((t) => {
        const prof = profiles[keyOf(t.store_id, t.line_user_id)];
        const name = (prof?.display_name || t.customer_name || '').trim() || 'ลูกค้า LINE';
        const href = `/admin/inbox?u=${encodeURIComponent(t.line_user_id)}&store=${encodeURIComponent(t.store_id)}`;
        return (
          <li key={keyOf(t.store_id, t.line_user_id)}>
            <a
              href={href}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
            >
              <CustomerAvatar name={name} pictureUrl={prof?.picture_url ?? null} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {storeLabel(stores, t.store_id)}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">{t.last_message_text || '—'}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] text-muted-foreground">
                  {t.last_message_at ? formatBkk(t.last_message_at) : '—'}
                </p>
                {t.unread_count > 0 && (
                  <span className={cn('mt-1 inline-flex min-w-5 justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground')}>
                    {t.unread_count}
                  </span>
                )}
              </div>
            </a>
          </li>
        );
      })}
      <li className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground" data-testid="line-oa-count">
          แสดง {rows.length.toLocaleString('th-TH')} จาก {(total ?? rows.length).toLocaleString('th-TH')} รายชื่อ
        </span>
        {total != null && threads.length < total && (
          <button
            type="button"
            data-testid="line-oa-load-more"
            className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
            onClick={() => setLimit((n) => n + 200)}
          >
            โหลดเพิ่ม
          </button>
        )}
      </li>
    </ul>
  );

}

export default LineOaCustomerList;
