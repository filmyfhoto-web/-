import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageSquare, CheckCircle2, AlertTriangle, ExternalLink, Loader2, Pencil, PlugZap,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { LineJobInbox } from '@/film-shop/components/inbox/LineJobInbox';
import { LineOaCustomerList } from '@/film-shop/components/line/LineOaCustomerList';
import { formatBkk } from '@/film-shop/lib/queueScheduler';
import { useLineStores, storeLabel, type LineStore } from '@/hooks/useLineStores';
import { safeLineOaChatUrl, LINE_OA_NOT_CONFIGURED_TH } from '@/lib/lineOa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserRole } from '@/film-shop/hooks/useUserRole';
import { cn } from '@/lib/utils';

const db = supabase as any;

interface ShopStat { count7d: number; lastAt: string | null }

/** LINE OA — สถานะการเชื่อมต่อของทุกร้าน + ลูกค้าที่ทักเข้ามา (ข้อมูลจริงทั้งหมด) */
export function LineOAPage({ onOpenOrder }: { onOpenOrder?: (orderId: string) => void }) {
  const { stores, loading, error, reload } = useLineStores();
  const { isAdmin } = useUserRole();
  const [stats, setStats] = useState<Record<string, ShopStat>>({});
  const [shop, setShop] = useState<string>('all');
  const [testing, setTesting] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ store: LineStore; name: string; basicId: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data } = await db
        .from('film_job_requests')
        .select('parsed,received_at,created_at')
        .eq('source', 'line')
        .gte('received_at', since)
        .order('received_at', { ascending: false })
        .limit(500);
      if (!alive) return;
      const next: Record<string, ShopStat> = {};
      for (const r of (data ?? []) as any[]) {
        const id = String(r?.parsed?.channel_id ?? 'default');
        const cur = next[id] ?? { count7d: 0, lastAt: null };
        cur.count7d += 1;
        const at = r.received_at ?? r.created_at;
        if (!cur.lastAt || (at && at > cur.lastAt)) cur.lastAt = at;
        next[id] = cur;
      }
      setStats(next);
    })();
    return () => { alive = false; };
  }, []);

  const testConnection = useCallback(async (storeId: string) => {
    setTesting(storeId);
    try {
      const { data, error } = await db.functions.invoke('line-store-test', { body: { store_id: storeId } });
      if (error) { toast.error('ทดสอบไม่สำเร็จ — ' + error.message); return; }
      if (data?.ok) toast.success(`${data.message_th} (${data.latency_ms} ms)`);
      else toast.error(data?.message_th || 'เชื่อมต่อ LINE OA ไม่สำเร็จ');
    } finally {
      setTesting(null);
    }
  }, []);

  const saveStore = useCallback(async () => {
    if (!edit) return;
    setSaving(true);
    const { error } = await db.rpc('admin_set_line_store_profile', {
      p_id: edit.store.id,
      p_display_name: edit.name.trim() || null,
      p_basic_id: edit.basicId.trim() || null,
      p_is_active: edit.store.is_active,
    });
    setSaving(false);
    if (error) { toast.error('บันทึกไม่สำเร็จ — ' + error.message); return; }
    toast.success('บันทึกข้อมูลร้านแล้ว');
    setEdit(null);
    reload();
  }, [edit, reload]);

  const filters = useMemo(
    () => [{ id: 'all', display_name: 'ทุกร้าน' } as Pick<LineStore, 'id' | 'display_name'>, ...stores],
    [stores],
  );

  return (
    <div className="animate-fade-in space-y-4" data-testid="line-oa-page">
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดข้อมูลร้าน…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> โหลดข้อมูลร้านไม่สำเร็จ — {error}
        </div>
      ) : stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          ยังไม่มีร้าน LINE OA — กรุณาตั้งค่าที่หน้า ตั้งค่า LINE
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="line-oa-status">
          {stores.map((s) => {
            const stat = stats[s.id] ?? { count7d: 0, lastAt: null };
            const connected = s.is_active && s.has_secret && s.has_token;
            const chatUrl = safeLineOaChatUrl(s.line_basic_id);
            return (
              <div key={s.id} className="rounded-2xl border border-border bg-card p-3" data-testid={`line-store-${s.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <MessageSquare className="h-4 w-4 text-primary" /> {s.display_name}
                  </p>
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`แก้ไขข้อมูลร้าน ${s.display_name}`}
                      onClick={() => setEdit({ store: s, name: s.display_name, basicId: s.line_basic_id ?? '' })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className={cn('mt-1 flex items-center gap-1.5 text-xs', connected ? 'text-success' : 'text-muted-foreground')}>
                  {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {connected ? 'เชื่อมต่อแล้ว — รับข้อความปกติ' : 'ยังตั้งค่าไม่ครบ (ต้องมี Channel Secret และ Access Token)'}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  ข้อความล่าสุด {stat.lastAt ? formatBkk(stat.lastAt) : '—'} · 7 วัน {stat.count7d} ข้อความ
                  {s.line_basic_id ? ` · ${s.line_basic_id}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chatUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={chatUrl} target="_blank" rel="noreferrer" data-testid={`open-chat-${s.id}`}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" /> เปิดแชต
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled title={LINE_OA_NOT_CONFIGURED_TH} data-testid={`open-chat-${s.id}`}>
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> เปิดแชต
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => testConnection(s.id)} disabled={testing === s.id}>
                    {testing === s.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PlugZap className="mr-1 h-3.5 w-3.5" />}
                    ทดสอบการเชื่อมต่อ
                  </Button>
                </div>
                {!chatUrl && (
                  <p className="mt-1 text-[11px] text-destructive">{LINE_OA_NOT_CONFIGURED_TH}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="เลือกร้าน">
        {filters.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={shop === s.id}
            onClick={() => setShop(s.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              shop === s.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {s.display_name}
          </button>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">ลูกค้าที่ทักเข้ามา</h2>
        <LineOaCustomerList stores={stores} storeFilter={shop} />
      </section>

      <LineJobInbox
        onOpenOrder={onOpenOrder}
        shopFilter={shop}
        storeNames={Object.fromEntries(stores.map((s) => [s.id, s.display_name]))}
      />

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>ข้อมูลร้าน LINE OA</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="store-name">ชื่อร้าน</Label>
                <Input id="store-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-basic">LINE Basic ID</Label>
                <Input
                  id="store-basic"
                  placeholder="@example"
                  value={edit.basicId}
                  onChange={(e) => setEdit({ ...edit, basicId: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">ต้องขึ้นต้นด้วย @ เช่น @756bvbvq</p>
              </div>
              <Badge variant="outline">รหัสร้าน: {storeLabel(stores, edit.store.id)}</Badge>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>ยกเลิก</Button>
            <Button onClick={saveStore} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LineOAPage;
