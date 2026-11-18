import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Search, MessageCircle, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFilmStoreScope } from '@/film-shop/hooks/useFilmStoreScope';

const db = supabase as any;

interface CrmRow {
  id: string;
  name: string;
  phone: string | null;
  channel: 'line' | 'walk_in';
  total_spent: number;
  jobs: number;
}

const baht = (n: number) => n.toLocaleString('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });

/**
 * สรุปลูกค้าแบบ CRM — ช่องทางที่ติดต่อ + ยอดซื้อสะสม + จำนวนงาน
 * ใช้ข้อมูลจริงจาก film_customers / film_orders / film_conversations
 */
export function CrmOverview() {
  const { storeId } = useFilmStoreScope();
  const [rows, setRows] = useState<CrmRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const convQuery = db.from('film_conversations').select('customer_id,channel,store_id');
      const [custRes, orderRes, convRes] = await Promise.all([
        db.from('film_customers').select('id,name,phone,line_user_id').order('name').limit(500),
        db.from('film_orders').select('customer_id,total'),
        storeId === 'all' ? convQuery : convQuery.eq('store_id', storeId),
      ]);
      if (cancelled) return;

      const totals = new Map<string, { sum: number; jobs: number }>();
      for (const o of (orderRes.data ?? []) as any[]) {
        if (!o.customer_id) continue;
        const cur = totals.get(o.customer_id) ?? { sum: 0, jobs: 0 };
        cur.sum += Number(o.total ?? 0);
        cur.jobs += 1;
        totals.set(o.customer_id, cur);
      }
      const chatted = new Set(
        ((convRes.data ?? []) as any[]).map((c) => c.customer_id).filter(Boolean),
      );
      const scoped = storeId !== 'all';

      const list = ((custRes.data ?? []) as any[])
        .filter((c) => !scoped || chatted.has(c.id))
        .map<CrmRow>((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone ?? null,
          channel: c.line_user_id || chatted.has(c.id) ? 'line' : 'walk_in',
          total_spent: totals.get(c.id)?.sum ?? 0,
          jobs: totals.get(c.id)?.jobs ?? 0,
        }))
        .sort((a, b) => b.total_spent - a.total_spent);

      setRows(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.name, r.phone].some((v) => (v ?? '').toLowerCase().includes(s)));
  }, [rows, q]);

  const lineCount = rows.filter((r) => r.channel === 'line').length;
  const revenue = rows.reduce((s, r) => s + r.total_spent, 0);

  return (
    <Card data-testid="crm-overview" className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> ลูกค้า (CRM)
        </CardTitle>
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="rounded-xl bg-muted/60 p-2 text-center">
            <p className="text-[11px] text-muted-foreground">ลูกค้าทั้งหมด</p>
            <p className="text-lg font-semibold tabular-nums">{rows.length}</p>
          </div>
          <div className="rounded-xl bg-muted/60 p-2 text-center">
            <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <MessageCircle className="h-3 w-3" /> ผ่าน LINE
            </p>
            <p className="text-lg font-semibold tabular-nums">{lineCount}</p>
          </div>
          <div className="rounded-xl bg-muted/60 p-2 text-center">
            <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <Wallet className="h-3 w-3" /> ยอดซื้อรวม
            </p>
            <p className="text-lg font-semibold tabular-nums">{baht(revenue)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ/เบอร์โทร"
            aria-label="ค้นหาลูกค้า CRM"
            className="h-9 rounded-xl pl-8 text-sm"
          />
        </div>
        <ScrollArea className="h-64 rounded-xl border">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">กำลังโหลด…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">ยังไม่มีลูกค้าในขอบเขตร้านนี้</p>
          ) : (
            <ul className="divide-y">
              {filtered.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{r.phone || 'ไม่มีเบอร์โทร'}</p>
                  </div>
                  <Badge variant={r.channel === 'line' ? 'default' : 'secondary'} className="text-[10px]">
                    {r.channel === 'line' ? 'LINE' : 'หน้าร้าน'}
                  </Badge>
                  <div className="w-24 text-right">
                    <p className="text-sm font-semibold tabular-nums">{baht(r.total_spent)}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{r.jobs} งาน</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default CrmOverview;
