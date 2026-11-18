import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Phone, MapPin, Building2, Pencil } from 'lucide-react';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';
import { useFilmCustomerProfiles } from '@/film-shop/hooks/useFilmCustomerProfiles';
import { supabase } from '@/film-shop/lib/supabase';

const db = supabase as any;

export interface ProfileTarget {
  id: string | null;
  name: string;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  taxBranch?: string | null;
  badge?: string;
  readOnly?: boolean;
  pictureUrl?: string | null;
}

interface OrderRow { id: string; order_no: string | null; title: string | null; status: string | null; total: number | null; created_at: string }

const money = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
const ACTIVE_DONE = ['done', 'completed', 'delivered', 'cancelled', 'canceled'];

interface Props {
  target: ProfileTarget | null;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}

/** โปรไฟล์ลูกค้า — รูป LINE จริง ข้อมูลติดต่อ ยอดสะสม และออเดอร์ล่าสุด */
export function CustomerProfileSheet({ target, onOpenChange, onEdit }: Props) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stats, setStats] = useState<{ orders: number; spend: number; active: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const profiles = useFilmCustomerProfiles([target?.id ?? null]);
  const profile = target?.id ? profiles[target.id] : undefined;

  useEffect(() => {
    let cancelled = false;
    setOrders([]); setStats(null);
    const cid = target?.id;
    if (!cid) return;
    setLoading(true);
    void (async () => {
      const [{ data: recent }, all, active] = await Promise.all([
        db.from('film_orders').select('id,order_no,title,status,total,created_at')
          .eq('customer_id', cid).order('created_at', { ascending: false }).limit(8),
        db.from('film_orders').select('total', { count: 'exact' }).eq('customer_id', cid).limit(1000),
        db.from('film_orders').select('id', { count: 'exact', head: true })
          .eq('customer_id', cid).not('status', 'in', `(${ACTIVE_DONE.join(',')})`),
      ]);
      if (cancelled) return;
      const rows = (all.data ?? []) as { total: number | null }[];
      setOrders((recent ?? []) as OrderRow[]);
      setStats({
        orders: Number(all.count ?? rows.length),
        spend: rows.reduce((s, r) => s + Number(r.total || 0), 0),
        active: Number(active.count ?? 0),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [target?.id]);

  return (
    <Sheet open={!!target} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md" data-testid="customer-profile-sheet">
        <SheetHeader className="border-b p-4 pb-3">
          <SheetTitle className="text-base">โปรไฟล์ลูกค้า</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100%-3.75rem)]">
          <div className="space-y-4 p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <CustomerAvatar
                name={target?.name}
                pictureUrl={profile?.pictureUrl ?? target?.pictureUrl ?? null}
                className="h-20 w-20"
                online={!!profile}
              />
              <div>
                <p className="text-base font-semibold">{target?.name || 'ลูกค้า'}</p>
                {profile?.displayName && profile.displayName !== target?.name && (
                  <p className="text-xs text-muted-foreground">LINE: {profile.displayName}</p>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-1">
                {target?.badge && <Badge variant="outline" className="text-[10px]">{target.badge}</Badge>}
                {profile && <Badge variant="secondary" className="text-[10px]">เชื่อม LINE แล้ว</Badge>}
                {target?.readOnly && <Badge variant="outline" className="text-[10px]">อ่านอย่างเดียว</Badge>}
              </div>
              {onEdit && !target?.readOnly && (
                <Button size="sm" variant="outline" className="mt-1 gap-1" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" /> แก้ไขข้อมูล
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'ออเดอร์', value: stats ? String(stats.orders) : '—' },
                { label: 'ยอดสะสม', value: stats ? `฿${money(stats.spend)}` : '—' },
                { label: 'กำลังทำ', value: stats ? String(stats.active) : '—' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border bg-muted/40 p-2.5">
                  <p className="text-sm font-semibold tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 rounded-xl border p-3 text-sm">
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{target?.phone || 'ไม่มีเบอร์โทร'}</p>
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{target?.address || 'ไม่มีที่อยู่'}</p>
              {target?.taxId && (
                <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />
                  {target.taxId}{target.taxBranch ? ` (${target.taxBranch})` : ''}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">ออเดอร์ล่าสุด</p>
              {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด...</p>}
              {!loading && orders.length === 0 && (
                <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">ยังไม่มีออเดอร์</p>
              )}
              <ul className="space-y-1.5">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{o.order_no || o.id.slice(0, 8)}</span>
                      {o.status && <Badge variant="outline" className="h-4 px-1 text-[10px]">{o.status}</Badge>}
                      <span className="ml-auto tabular-nums">฿{money(Number(o.total || 0))}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{o.title || '—'}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default CustomerProfileSheet;
