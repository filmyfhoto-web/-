import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FilePlus2, ExternalLink, Columns3, Link2, Search, Loader2, RefreshCw, CheckCircle2, MessageSquareText } from 'lucide-react';
import { openOrderChat } from '@/film-shop/lib/filmNav';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';
import { useLineProfiles } from '@/film-shop/hooks/useLineProfiles';
import { refreshLineAvatars } from '@/film-shop/lib/refreshLineAvatars';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { WorkcenterProvider } from '@/film-shop/workcenter/components/WorkcenterProvider';
import { WorkIntakePage } from '@/film-shop/workcenter/components/WorkIntakePage';
import { linkConversationCustomer, type InboxConversation, type InboxEmployee } from '@/film-shop/hooks/useFilmInbox';

const db = supabase as any;

interface CustomerInfo { id: string; name: string; phone: string | null }
interface OrderRow { id: string; order_no: string; title: string; status: string; total: number; created_at: string }
interface Lifetime { orders: number; spend: number; capped: boolean; active: number }

interface Props {
  conversation: InboxConversation | null;
  employees?: InboxEmployee[];
  onOpenOrders: () => void;
  onOpenQueue: () => void;
  onLinked: () => void;
  /** เปิด/ปิด Sheet “สร้างงานจากแชต” จากภายนอก (ปุ่มบนหัวห้องแชต) */
  intakeOpen?: boolean;
  onIntakeOpenChange?: (open: boolean) => void;
}

const LIFETIME_CAP = 1000;
const ACTIVE_DONE = ['done', 'completed', 'delivered', 'cancelled', 'canceled'];

/** ขวา: Customer 360 — ข้อมูลจริงเท่าที่มี ไม่เดาการผูกลูกค้า */
export function Customer360({
  conversation, employees, onOpenOrders, onOpenQueue, onLinked, intakeOpen: intakeOpenProp, onIntakeOpenChange,
}: Props) {
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lifetime, setLifetime] = useState<Lifetime | null>(null);
  const [lastOrder, setLastOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [intakeOpenLocal, setIntakeOpenLocal] = useState(false);
  const intakeOpen = intakeOpenProp ?? intakeOpenLocal;
  const setIntakeOpen = (v: boolean) => { setIntakeOpenLocal(v); onIntakeOpenChange?.(v); };
  const [linkOpen, setLinkOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [syncingAvatar, setSyncingAvatar] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [closingId, setClosingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCustomer(null); setOrders([]); setLifetime(null); setLastOrder(null);
    if (!conversation) return;
    setLoading(true);
    void (async () => {
      let cid = conversation.customer_id;
      // ผูกลูกค้าอัตโนมัติได้เฉพาะเมื่อ LINE user id ตรงกันแบบตรงตัวเท่านั้น
      if (!cid && conversation.external_user_id) {
        const { data } = await db.from('film_customers')
          .select('id,name,phone').eq('line_user_id', conversation.external_user_id).maybeSingle();
        if (data?.id) {
          cid = data.id;
          await db.from('film_conversations').update({ customer_id: cid }).eq('id', conversation.id);
          if (!cancelled) onLinked();
        }
      }
      if (cid) {
        const { data: c } = await db.from('film_customers').select('id,name,phone').eq('id', cid).maybeSingle();
        const { data: o } = await db.from('film_orders')
          .select('id,order_no,title,status,total,created_at')
          .eq('customer_id', cid).order('created_at', { ascending: false }).limit(5);
        // ยอดสะสมจริงคำนวณจากทุกออเดอร์ของลูกค้ารายนี้ (ไม่ใช่แค่ 5 รายการล่าสุด)
        const { data: all, count } = await db.from('film_orders')
          .select('total', { count: 'exact' }).eq('customer_id', cid).limit(LIFETIME_CAP);
        const { count: activeCount } = await db.from('film_orders')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', cid)
          .not('status', 'in', `(${ACTIVE_DONE.join(',')})`);
        if (!cancelled) {
          setCustomer(c ?? null);
          setOrders((o ?? []) as OrderRow[]);
          const rows = (all ?? []) as { total: number | null }[];
          setLifetime({
            orders: Number(count ?? rows.length),
            spend: rows.reduce((s, r) => s + Number(r.total || 0), 0),
            capped: Number(count ?? 0) > rows.length,
            active: Number(activeCount ?? 0),
          });
        }
      }
      if (conversation.last_order_id) {
        const { data: lo } = await db.from('film_orders')
          .select('id,order_no,title,status,total,created_at')
          .eq('id', conversation.last_order_id).maybeSingle();
        if (!cancelled) setLastOrder((lo ?? null) as OrderRow | null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [conversation?.id, conversation?.customer_id, conversation?.external_user_id, conversation?.last_order_id, reloadKey]);

  /** ปิดยอดจากอินบ็อกซ์: ปิดออเดอร์เป็นเสร็จสิ้น + บันทึกชำระเงินส่วนที่ค้างให้ครบ */
  const closeOrder = async (o: OrderRow) => {
    const due = Number(o.total || 0);
    if (!window.confirm(`ปิดยอดออเดอร์ ${o.order_no}?\nระบบจะบันทึกชำระเงินให้ครบ (${due.toLocaleString('th-TH')} บาท) และปิดงานเป็นเสร็จสิ้น`)) return;
    setClosingId(o.id);
    const { error } = await db.rpc('film_close_order_from_inbox', {
      p_order_id: o.id, p_method: 'cash', p_note: 'ปิดยอดจากกล่องข้อความ',
    });
    setClosingId(null);
    if (error) { toast.error('ปิดยอดไม่สำเร็จ: ' + error.message); return; }
    toast.success(`ปิดยอด ${o.order_no} เรียบร้อย`);
    setReloadKey((k) => k + 1);
    onLinked();
  };

  const isOpenOrder = (status: string) => !ACTIVE_DONE.includes(String(status));

  /** เปิดแชตห้องนี้พร้อมใส่บริบทออเดอร์ในช่องพิมพ์ */
  const chatAbout = (o: OrderRow) => {
    openOrderChat({
      conversationId: conversation?.id ?? null,
      customerId: customer?.id ?? null,
      lineUserId: conversation?.external_user_id ?? null,
      orderId: o.id,
      orderNo: o.order_no,
      orderTitle: o.title,
    });
  };

  const assigneeName = useMemo(
    () => employees?.find((e) => e.id === conversation?.assignee)?.name ?? null,
    [employees, conversation?.assignee],
  );

  // รูป/ชื่อ LINE สำรอง เมื่อห้องแชตยังไม่มี avatar_url
  const lineProfiles = useLineProfiles([conversation?.external_user_id]);
  const lineProfile = conversation?.external_user_id ? lineProfiles[conversation.external_user_id] : undefined;

  const searchCustomers = async () => {
    const q = query.trim();
    if (q.length < 2) { toast.error('พิมพ์อย่างน้อย 2 ตัวอักษร'); return; }
    setSearching(true);
    const { data } = await db.from('film_customers')
      .select('id,name,phone').or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(15);
    setResults((data ?? []) as CustomerInfo[]);
    setSearching(false);
  };

  const linkTo = async (c: CustomerInfo) => {
    if (!conversation) return;
    await linkConversationCustomer(conversation.id, c.id);
    setLinkOpen(false); setQuery(''); setResults([]);
    toast.success(`ผูกกับลูกค้า ${c.name} แล้ว`);
    onLinked();
  };

  if (!conversation) {
    return <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">ข้อมูลลูกค้าจะแสดงเมื่อเลือกบทสนทนา</div>;
  }

  return (
    <ScrollArea className="h-full bg-card">
      <div className="space-y-3 p-3" data-testid="inbox-customer-360">
        <Card className="overflow-hidden">
          <div className="bg-secondary/60 p-4 text-center">
            <span className="mx-auto flex justify-center">
              <CustomerAvatar
                name={customer?.name || conversation.display_name || lineProfile?.displayName}
                pictureUrl={conversation.avatar_url || lineProfile?.pictureUrl || null}
                className="h-20 w-20 border-2 border-card"
                online={!!conversation.external_user_id}
              />
            </span>
            <p className="mt-2 truncate text-sm font-semibold">{customer?.name || conversation.display_name || lineProfile?.displayName || 'ลูกค้า LINE'}</p>
            <p className="truncate text-xs text-muted-foreground">{customer?.phone || 'ไม่มีเบอร์โทรในระบบ'}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <Badge variant="outline" className="bg-card text-[11px]">LINE identity: {conversation.external_user_id ? 'ผูกช่องทางแล้ว' : 'ไม่ทราบ'}</Badge>
              {!customer && <Badge variant="secondary" className="bg-card text-[11px]">ยังไม่ผูกลูกค้า</Badge>}
              {assigneeName && <Badge variant="outline" className="bg-card text-[11px]">ผู้ดูแล: {assigneeName}</Badge>}
            </div>
            {conversation.external_user_id && (
              <Button
                type="button" size="sm" variant="outline"
                className="mt-2 h-7 gap-1 bg-card text-[11px]"
                data-testid="inbox-refresh-avatar-one"
                disabled={syncingAvatar}
                onClick={async () => {
                  setSyncingAvatar(true);
                  const res = await refreshLineAvatars({ conversationId: conversation.id });
                  setSyncingAvatar(false);
                  if (res.ok) onLinked();
                }}
              >
                <RefreshCw className={syncingAvatar ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
                ดึงรูปโปรไฟล์จาก LINE ใหม่
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x border-t text-center">
            <div className="p-2.5">
              <p className="text-base font-semibold tabular-nums" data-testid="lifetime-orders">{lifetime?.orders ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">งานทั้งหมด</p>
            </div>
            <div className="p-2.5">
              <p className="text-base font-semibold tabular-nums" data-testid="lifetime-spend">
                {(lifetime?.spend ?? 0).toLocaleString('th-TH')}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {lifetime?.capped ? `ยอดสะสม ${LIFETIME_CAP} งานล่าสุด (฿)` : 'ยอดซื้อรวม (฿)'}
              </p>
            </div>
            <div className="p-2.5">
              <p className="text-base font-semibold tabular-nums" data-testid="lifetime-active">{lifetime?.active ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">งานกำลังทำ</p>
            </div>
          </div>
        </Card>

        {!customer && (
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground">ยังไม่ผูกกับลูกค้าในระบบ</p>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                data-testid="inbox-link-customer" onClick={() => setLinkOpen((v) => !v)}>
                <Link2 className="h-3 w-3" /> ผูกกับลูกค้า
              </Button>
            </div>
            {linkOpen && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1.5">
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ/เบอร์โทร"
                    className="h-8 text-xs" onKeyDown={(e) => { if (e.key === 'Enter') void searchCustomers(); }} />
                  <Button type="button" size="sm" className="h-8 px-2" onClick={() => void searchCustomers()} disabled={searching}>
                    {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </Button>
                </div>
                <ul className="space-y-1">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => void linkTo(c)}
                        className="w-full rounded-lg border bg-background px-2 py-1.5 text-left text-xs hover:bg-accent/50">
                        <span className="font-medium">{c.name}</span>
                        <span className="ml-1 text-muted-foreground">{c.phone ?? 'ไม่มีเบอร์'}</span>
                      </button>
                    </li>
                  ))}
                  {!searching && query && results.length === 0 && (
                    <li className="text-[11px] text-muted-foreground">ไม่พบลูกค้าที่ตรงกับคำค้น</li>
                  )}
                </ul>
              </div>
            )}
          </Card>
        )}

        {lastOrder && (
          <Card className="p-3" data-testid="inbox-last-order">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">งานล่าสุดจากแชตนี้</p>
            <div className="flex items-center justify-between gap-2 rounded-xl border bg-background p-2 text-xs">
              <span className="font-medium tabular-nums">{lastOrder.order_no}</span>
              <Badge variant="outline" className="text-[10px]">{lastOrder.status}</Badge>
            </div>
            {isOpenOrder(lastOrder.status) && (
              <Button
                type="button" size="sm" className="mt-1.5 h-8 w-full gap-1 text-xs"
                data-testid="inbox-close-last-order"
                disabled={closingId === lastOrder.id}
                onClick={() => void closeOrder(lastOrder)}
              >
                {closingId === lastOrder.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                ปิดยอด (ชำระครบ + เสร็จสิ้น)
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" className="mt-1.5 h-7 w-full gap-1 text-xs" onClick={onOpenQueue}>
              <Columns3 className="h-3 w-3" /> เปิดในคิวงาน NATTA.Q
            </Button>
            <Button
              type="button" variant="outline" size="sm" className="mt-1.5 h-7 w-full gap-1 text-xs"
              data-testid="inbox-chat-last-order"
              onClick={() => chatAbout(lastOrder)}
            >
              <MessageSquareText className="h-3 w-3" /> คุยกับลูกค้าเรื่องงานนี้
            </Button>
          </Card>
        )}

        <Card className="p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">ออเดอร์ล่าสุด</p>
          {loading && <p className="text-xs text-muted-foreground">กำลังโหลด…</p>}
          {!loading && orders.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีออเดอร์ที่เชื่อมกับลูกค้ารายนี้</p>}
          <ul className="space-y-1.5">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border bg-background p-2 text-xs transition-colors hover:bg-accent/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">{o.order_no}</span>
                  <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                </div>
                <p className="mt-0.5 truncate text-muted-foreground">{o.title}</p>
                <p className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{new Date(o.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                  <span className="tabular-nums">{Number(o.total || 0).toLocaleString('th-TH')} บาท</span>
                </p>
                <Button
                  type="button" size="sm" variant="ghost"
                  className="mt-1.5 h-7 w-full gap-1 text-[11px]"
                  data-testid="inbox-chat-order"
                  onClick={() => chatAbout(o)}
                >
                  <MessageSquareText className="h-3 w-3" /> คุยเรื่องงานนี้
                </Button>
                {isOpenOrder(o.status) && (
                  <Button
                    type="button" size="sm" variant="outline"
                    className="mt-1.5 h-7 w-full gap-1 text-[11px]"
                    data-testid="inbox-close-order"
                    disabled={closingId === o.id}
                    onClick={() => void closeOrder(o)}
                  >
                    {closingId === o.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <CheckCircle2 className="h-3 w-3" />}
                    ปิดยอด
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid gap-2">
          <Button type="button" className="gap-1" onClick={() => setIntakeOpen(true)}>
            <FilePlus2 className="h-4 w-4" /> สร้างงานจากแชต
          </Button>
          <Button type="button" variant="outline" className="gap-1" onClick={onOpenOrders}>
            <ExternalLink className="h-4 w-4" /> เปิดออเดอร์
          </Button>
          <Button type="button" variant="outline" className="gap-1" onClick={onOpenQueue}>
            <Columns3 className="h-4 w-4" /> เปิดคิวงาน
          </Button>
        </div>
      </div>

      <Sheet open={intakeOpen} onOpenChange={setIntakeOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader><SheetTitle>สร้างงานจากแชต</SheetTitle></SheetHeader>
          <div className="mt-4">
            <WorkcenterProvider>
              <WorkIntakePage
                prefill={{
                  customerId: customer?.id ?? null,
                  customerName: customer?.name || conversation.display_name || '',
                  customerPhone: customer?.phone ?? '',
                  notes: `จากแชต ${conversation.channel.toUpperCase()}: ${conversation.last_message_preview ?? ''}`.trim(),
                }}
                onDone={async (order) => {
                  setIntakeOpen(false);
                  if (order?.id) {
                    await db.from('film_conversations')
                      .update({ last_order_id: order.id }).eq('id', conversation.id);
                  }
                  onLinked();
                }}
              />
            </WorkcenterProvider>
          </div>
        </SheetContent>
      </Sheet>
    </ScrollArea>
  );
}
