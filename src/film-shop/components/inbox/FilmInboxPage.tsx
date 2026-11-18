import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, UserRound, MessagesSquare, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/film-shop/hooks/use-mobile';
import {
  markConversationRead, useConversations, useFilteredConversations, useInboxEmployees, useMessages,
  useInboxLiveAlerts, type InboxFilter,
} from '@/film-shop/hooks/useFilmInbox';
import { toast } from 'sonner';
import { requestDesktopNotifyPermission, showDesktopNotification } from '@/film-shop/lib/desktopNotify';
import { playNotificationSound, primeNotificationSound } from '@/film-shop/lib/notifySound';
import { useFilmStoreScope } from '@/film-shop/hooks/useFilmStoreScope';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { Customer360 } from './Customer360';
import { supabase } from '@/film-shop/lib/supabase';
import type { InboxTarget } from '@/film-shop/lib/filmNav';

interface Props {
  onPageChange?: (page: string) => void;
  /** เปิดแชตของลูกค้ารายนี้ทันทีพร้อมบริบทออเดอร์ (มาจากปุ่ม “คุยกับลูกค้า”) */
  inboxTarget?: InboxTarget;
}

/**
 * Film Shop Inbox — ศูนย์รวมแชตจากช่องทางต่าง ๆ (Phase 1: LINE OA)
 * อ่าน/ตอบจากในแอปได้จริง โดย token อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
 */
export function FilmInboxPage({ onPageChange, inboxTarget }: Props) {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { storeId: storeFilter, setStoreId, stores: scopeStores } = useFilmStoreScope();
  const [customerOpen, setCustomerOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [draft, setDraft] = useState<{ text: string; key: number } | null>(null);

  const { conversations, loading, error, reload } = useConversations();
  const employees = useInboxEmployees();
  const scoped = useMemo(
    () => (storeFilter === 'all' ? conversations : conversations.filter((c) => c.store_id === storeFilter)),
    [conversations, storeFilter],
  );
  const filtered = useFilteredConversations(scoped, filter, search);
  const { messages, loading: msgLoading, error: msgError, reload: reloadMessages } = useMessages(selectedId);
  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const counts = useMemo(() => {
    const open = scoped.filter((c) => c.status !== 'closed');
    return {
      all: open.length,
      unread: open.filter((c) => c.unread_count > 0).length,
      quoting: open.filter((c) => c.status === 'quoting').length,
      waiting_customer: open.filter((c) => c.status === 'waiting_customer').length,
      in_progress: open.filter((c) => c.status === 'in_progress').length,
      has_job: open.filter((c) => c.last_order_id).length,
      closed: scoped.filter((c) => c.status === 'closed').length,
    } as Partial<Record<InboxFilter, number>>;
  }, [scoped]);

  const unreadTotal = useMemo(
    () => scoped.reduce((s, c) => s + (c.unread_count > 0 ? 1 : 0), 0),
    [scoped],
  );

  // เดสก์ท็อปสลับร้านจาก Sidebar — ในมือถือยังต้องมีตัวสลับในรายการแชต
  const storeOptions = useMemo(
    () => scopeStores,
    [scopeStores],
  );

  useEffect(() => { setSelectedId(null); }, [storeFilter]);

  const select = async (id: string) => {
    setSelectedId(id);
    await markConversationRead(id);
    reload();
  };

  // เปิดห้องแชตตามบริบทออเดอร์ที่ส่งเข้ามา — ค้นหาจากห้องแชต, ลูกค้า, LINE user หรือเลขออเดอร์
  useEffect(() => {
    const t = inboxTarget;
    if (!t) return;
    let cancelled = false;
    void (async () => {
      const db = supabase as any;
      let convId = t.conversationId ?? null;
      if (!convId) {
        const local = conversations.find((c) =>
          (t.orderId && c.last_order_id === t.orderId) ||
          (t.customerId && c.customer_id === t.customerId) ||
          (t.lineUserId && c.external_user_id === t.lineUserId));
        convId = local?.id ?? null;
      }
      if (!convId) {
        let q = db.from('film_conversations').select('id,store_id').order('last_message_at', { ascending: false }).limit(1);
        if (t.orderId) q = q.eq('last_order_id', t.orderId);
        else if (t.customerId) q = q.eq('customer_id', t.customerId);
        else if (t.lineUserId) q = q.eq('external_user_id', t.lineUserId);
        else return;
        const { data } = await q;
        convId = (data?.[0]?.id as string | undefined) ?? null;
      }
      if (cancelled) return;
      if (!convId) {
        toast.error('ยังไม่มีห้องแชต LINE ของลูกค้ารายนี้');
        return;
      }
      const conv = conversations.find((c) => c.id === convId);
      if (conv && storeFilter !== 'all' && conv.store_id !== storeFilter) setStoreId('all');
      if (t.draft) setDraft({ text: t.draft, key: t.nonce ?? Date.now() });
      await select(convId);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxTarget?.nonce, inboxTarget?.conversationId, inboxTarget?.orderId, conversations.length]);

  // ขอสิทธิ์แจ้งเตือน + ปลดล็อกเสียงครั้งแรกที่ผู้ใช้แตะหน้าจอ
  useEffect(() => {
    const ask = () => { requestDesktopNotifyPermission(); primeNotificationSound(); };
    window.addEventListener('pointerdown', ask, { once: true });
    return () => window.removeEventListener('pointerdown', ask);
  }, []);

  // เด้งข้อความใหม่ทันทีที่ webhook เข้ามา (ไม่ต้องรีเฟรช)
  useInboxLiveAlerts(selectedId, (msg) => {
    const conv = conversations.find((c) => c.id === msg.conversation_id);
    if (storeFilter !== 'all' && conv && conv.store_id !== storeFilter) return;
    const who = conv?.display_name || 'ลูกค้า LINE';
    const preview = msg.text?.slice(0, 120) || 'ส่งไฟล์แนบมาให้';
    playNotificationSound();
    toast.message(`ข้อความใหม่จาก ${who}`, {
      description: preview,
      action: { label: 'เปิดแชต', onClick: () => { void select(msg.conversation_id); } },
    });
    showDesktopNotification(`ข้อความใหม่จาก ${who}`, preview, () => { void select(msg.conversation_id); }, conv?.avatar_url ?? null);
    reload();
  });

  const list = (
    <ConversationList
      conversations={filtered} loading={loading} error={error}
      selectedId={selectedId} onSelect={select} counts={counts}
      filter={filter} onFilter={setFilter} search={search} onSearch={setSearch}
      employees={employees}
      stores={isMobile ? storeOptions : undefined}
      storeId={storeFilter}
      onStore={undefined}
      unreadTotal={unreadTotal}
      onRefreshed={reload}
      compact={isMobile}
    />
  );

  const thread = (
    <MessageThread
      conversation={selected}
      messages={messages}
      loading={msgLoading}
      error={msgError}
      lineReady={true}
      employees={employees}
      draft={draft}
      onSent={() => { reloadMessages(); reload(); }}
      onUpdated={reload}
      onCreateJob={selected ? () => (isMobile ? setCustomerOpen(true) : setIntakeOpen(true)) : undefined}
    />
  );

  const customer = (
    <Customer360
      conversation={selected}
      employees={employees}
      intakeOpen={isMobile ? undefined : intakeOpen}
      onIntakeOpenChange={isMobile ? undefined : setIntakeOpen}
      onOpenOrders={() => onPageChange?.('orders')}
      onOpenQueue={() => onPageChange?.('job-board')}
      onLinked={reload}
    />
  );

  if (isMobile) {
    return (
      <div className="flex h-[calc(100vh-9rem)] flex-col gap-2" data-testid="film-inbox">
        <div className="flex items-center gap-2">
          {storeOptions.length > 0 && (
            <Select value={storeFilter ?? 'all'} onValueChange={setStoreId}>
              <SelectTrigger
                className="h-9 w-auto shrink-0 gap-1.5 rounded-xl text-sm font-semibold"
                aria-label="เลือกร้าน"
                data-testid="inbox-store-switch"
              >
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">ทุกร้าน</SelectItem>
                {storeOptions.map((s) => <SelectItem key={s.id} value={s.id} className="text-sm">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        {!selectedId ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center gap-2.5 border-b bg-primary px-3 py-3 text-primary-foreground">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary-foreground/15">
                <MessagesSquare className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-tight tracking-tight">กล่องข้อความ</p>
                <p className="truncate text-[11px] text-primary-foreground/70">FILM SHOP · ซิงก์เรียลไทม์</p>
              </div>
              <Badge
                variant={unreadTotal > 0 ? 'destructive' : 'secondary'}
                className="ml-auto h-6 gap-1 rounded-full px-2.5 text-[11px] tabular-nums"
              >
                {unreadTotal > 0 && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
                {unreadTotal}
              </Badge>
            </div>
            <div className="min-h-0 flex-1">{list}</div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center gap-1 border-b p-2">
              <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setSelectedId(null)}>
                <ArrowLeft className="h-4 w-4" /> รายการแชต
              </Button>
              <Button type="button" variant="ghost" size="sm" className="ml-auto gap-1" onClick={() => setCustomerOpen(true)}>
                <UserRound className="h-4 w-4" /> ข้อมูลลูกค้า
              </Button>
            </div>
            <div className="min-h-0 flex-1">{thread}</div>
            <Sheet open={customerOpen} onOpenChange={setCustomerOpen}>
              <SheetContent side="right" className="w-full p-0 sm:max-w-sm">
                <SheetHeader className="p-3 pb-0"><SheetTitle>ข้อมูลลูกค้า</SheetTitle></SheetHeader>
                <div className="h-[calc(100%-3rem)]">{customer}</div>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-3" data-testid="film-inbox">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-secondary-foreground">
          <MessagesSquare className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="text-base font-semibold leading-tight tracking-tight">Inbox แชตลูกค้า</h2>
          <p className="text-xs text-muted-foreground">อ่านและตอบ LINE OA ได้จากในแอป · ซิงก์เรียลไทม์</p>
        </div>
        <Badge variant={unreadTotal > 0 ? 'destructive' : 'secondary'} className={cn('ml-auto text-[11px]')}>
          ยังไม่อ่าน {unreadTotal}
        </Badge>
      </div>


      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_320px] overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="min-h-0 border-r">{list}</div>
        <div className="min-h-0">{thread}</div>
        <div className="min-h-0 border-l">{customer}</div>
      </div>
    </div>
  );
}

export default FilmInboxPage;
