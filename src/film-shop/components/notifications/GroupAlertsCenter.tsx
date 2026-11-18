import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bot, Check, CheckCheck, Filter, ShoppingCart, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { playGroupAlert, primeNotificationSound } from '@/film-shop/lib/notifySound';
import { useGroupNotifications, type AlertGroup, type GroupAlert } from '@/film-shop/hooks/useGroupNotifications';
import { alertTarget, filmNavigate } from '@/film-shop/lib/filmNav';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

function Panel({
  group, icon: Icon, title, empty, items, unread, onMarkRead, onToggleRead, onOpen, loading, accent, highlightId,
}: {
  group: AlertGroup;
  icon: typeof ShoppingCart;
  title: string;
  empty: string;
  items: GroupAlert[];
  unread: number;
  onMarkRead: () => void;
  onToggleRead: (n: GroupAlert) => void;
  onOpen: (n: GroupAlert) => void;
  loading: boolean;
  accent: string;
  highlightId?: string | null;
}) {
  return (
    <section
      data-testid={`alerts-panel-${group}`}
      className={`flex min-h-[18rem] flex-col rounded-xl border border-t-4 bg-card shadow-sm ${accent}`}
    >
      <header className="flex items-center justify-between gap-2 border-b p-3">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold">
          <Icon className="h-4 w-4 shrink-0 text-primary" /> <span className="truncate">{title}</span>
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <span
            data-testid={`alerts-count-${group}`}
            className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground"
          >
            {unread > 0 ? `${unread} ใหม่` : `${items.length} รายการ`}
          </span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={onMarkRead}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> อ่านทั้งหมด
            </Button>
          )}
        </div>
      </header>
      <ScrollArea className="h-[420px]">
        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="space-y-2 p-3">
            {items.map((n) => (
              <div
                key={n.id}
                data-testid={`alerts-item-${group}`}
                className={`w-full rounded-lg border p-3 text-left text-xs transition hover:border-primary/50 ${
                  n.readAt ? 'bg-background' : 'bg-primary/5'
                } ${highlightId === n.id ? 'border-primary ring-2 ring-primary/40' : ''}`}
              >
                <button type="button" className="block w-full text-left" onClick={() => onOpen(n)}>
                  <p className="flex items-start gap-1 font-bold">
                    {!n.readAt && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className="min-w-0 break-words">{n.title}</span>
                  </p>
                  {n.body && <p className="mt-0.5 whitespace-pre-line break-words text-muted-foreground">{n.body}</p>}
                </button>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
                  <span className="text-[10px] text-muted-foreground">{time(n.createdAt)}</span>
                  <Button
                    size="sm" variant="secondary" className="ml-auto h-7 gap-1 px-2 text-[11px]"
                    onClick={() => onOpen(n)}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" /> เปิดรายการ
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"
                    data-testid="alerts-item-toggle-read"
                    onClick={() => onToggleRead(n)}
                  >
                    {n.readAt
                      ? <><Undo2 className="h-3.5 w-3.5" /> ยังไม่อ่าน</>
                      : <><Check className="h-3.5 w-3.5" /> อ่านแล้ว</>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </section>
  );
}

/**
 * ศูนย์แจ้งเตือน 2 กลุ่มแบบเต็มหน้า (กรองตามร้านที่เลือกอยู่)
 * กลุ่ม 1 = ออเดอร์จากเว็บแอป (โทนต่ำ 600Hz), กลุ่ม 2 = NATTA.Q AI (โทนสูง 900Hz)
 */
export function GroupAlertsCenter() {
  const { group1, group2, unread1, unread2, loading, markGroupRead, markRead } = useGroupNotifications(60);
  const seen = useRef<{ g1: string | null; g2: string | null; ready: boolean }>({ g1: null, g2: null, ready: false });
  const [onlyUnread, setOnlyUnread] = useState(false);
  // เปิดจากลิงก์ในแจ้งเตือน LINE / Web Push: /film-shop/app?p=alerts&n=<id>
  const highlightId = useMemo(
    () => new URLSearchParams(window.location.search).get('n'),
    [],
  );

  useEffect(() => {
    if (highlightId) void markRead(highlightId);
  }, [highlightId, markRead]);

  // ปุ่ม "อ่านแล้ว/รับเรื่อง" บนแจ้งเตือนถาวรจะส่งสัญญาณกลับมาให้รีเฟรชทันที
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'fs-push-action' && e.data.ok) {
        toast.success(e.data.action === 'ack' ? 'รับเรื่องแล้ว' : 'ทำเครื่องหมายอ่านแล้ว');
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => { primeNotificationSound(); }, []);

  useEffect(() => {
    if (loading) return;
    const top1 = group1[0]?.id ?? null;
    const top2 = group2[0]?.id ?? null;
    if (!seen.current.ready) {
      seen.current = { g1: top1, g2: top2, ready: true };
      return;
    }
    if (top1 && top1 !== seen.current.g1) playGroupAlert(1);
    if (top2 && top2 !== seen.current.g2) playGroupAlert(2);
    seen.current.g1 = top1;
    seen.current.g2 = top2;
  }, [group1, group2, loading]);

  const open = (n: GroupAlert) => {
    void markRead(n.id);
    const t = alertTarget(n);
    filmNavigate(t.page, t.filter);
  };
  const view = (list: GroupAlert[]) => (onlyUnread ? list.filter((n) => !n.readAt) : list);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">แจ้งเตือนแบบเรียลไทม์ แยก 2 กลุ่ม ตามร้านที่เลือกอยู่</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm" variant={onlyUnread ? 'default' : 'outline'} className="h-8 gap-1 rounded-full text-xs"
            onClick={() => setOnlyUnread((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5" /> {onlyUnread ? 'เฉพาะยังไม่อ่าน' : 'ทั้งหมด'}
          </Button>
          <Button
            size="sm" variant="outline" className="h-8 gap-1 rounded-full text-xs"
            disabled={unread1 + unread2 === 0}
            onClick={() => { void markGroupRead(1); void markGroupRead(2); }}
          >
            <CheckCheck className="h-3.5 w-3.5" /> อ่านทั้งหมด ({unread1 + unread2})
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel
          group={1}
          icon={ShoppingCart}
          title="🛒 กลุ่ม 1: ออเดอร์จากเว็บแอป"
          empty="ยังไม่มีออเดอร์จากเว็บแอป"
          items={view(group1)}
          unread={unread1}
          loading={loading}
          accent="border-t-blue-600"
          highlightId={highlightId}
          onOpen={open}
          onToggleRead={(n) => void markRead(n.id, !n.readAt)}
          onMarkRead={() => void markGroupRead(1)}
        />
        <Panel
          group={2}
          icon={Bot}
          title="🤖 กลุ่ม 2: NATTA.Q (AI ตรวจจับแชท)"
          empty="AI ยังไม่พบคำสั่งซื้อใหม่ในแชท"
          items={view(group2)}
          unread={unread2}
          loading={loading}
          accent="border-t-purple-600"
          highlightId={highlightId}
          onOpen={open}
          onToggleRead={(n) => void markRead(n.id, !n.readAt)}
          onMarkRead={() => void markGroupRead(2)}
        />
      </div>
    </div>
  );
}

export default GroupAlertsCenter;