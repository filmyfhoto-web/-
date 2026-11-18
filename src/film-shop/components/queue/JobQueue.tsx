import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ListChecks, AlertTriangle, Clock, Lock, Unlock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFilmOrders } from '@/film-shop/hooks/useFilmOrders';
import { useJobSchedule } from '@/film-shop/hooks/useJobSchedule';
import { formatBkk } from '@/film-shop/lib/queueScheduler';
import { OrderStatusBadge } from '@/film-shop/components/orders/OrderStatusBadge';
import { OrderDetailDialog } from '@/film-shop/components/orders/OrderDetailDialog';
import { EmptyState, ListSkeleton } from '@/film-shop/components/common/Pieces';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';
import { useFilmCustomerProfiles } from '@/film-shop/hooks/useFilmCustomerProfiles';
import {
  OPEN_ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  isOverdue,
  nextOrderStatus,
  type FilmOrder,
} from '@/film-shop/types/order';

const dt = (d?: Date) => (d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : 'ไม่ระบุ');

interface Props {
  onOpenDocument?: (invoiceId: string) => void;
}

/**
 * คิวงาน — Kanban ตามขั้นตอนผลิตบนจอใหญ่ และเป็นลิสต์เดียวบนมือถือ
 * งานด่วน/เลยกำหนดถูกดันขึ้นบนสุดของทุกคอลัมน์เสมอ
 */
export function JobQueue({ onOpenDocument }: Props) {
  const { orders, loading, setOrderStatus, deleteOrder, cancelOrder, checkOrderDeletable, fetchEvents } = useFilmOrders();
  const { byOrder, recalculate, setLocked, saving, loading: scheduleLoading, settings } = useJobSchedule();
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [selected, setSelected] = useState<FilmOrder | null>(null);
  const custProfiles = useFilmCustomerProfiles(orders.map((o) => o.customerId));

  // Re-plan whenever jobs / urgency / status / durations change. `recalculate`
  // is a no-op once every unlocked job already matches the plan.
  useEffect(() => {
    if (scheduleLoading) return;
    const t = setTimeout(() => { void recalculate(); }, 400);
    return () => clearTimeout(t);
  }, [recalculate, scheduleLoading]);

  const sortedOpen = useMemo(() => {
    return orders
      .filter((o) => !o.isDraft && o.status !== 'delivered')
      .filter((o) => (urgentOnly ? o.isUrgent || isOverdue(o) : true))
      .sort((a, b) => {
        const score = (o: FilmOrder) => (o.isUrgent ? 0 : 1) + (isOverdue(o) ? -1 : 0);
        if (score(a) !== score(b)) return score(a) - score(b);
        const at = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bt = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return at - bt;
      });
  }, [orders, urgentOnly]);

  const groups = useMemo(
    () => OPEN_ORDER_STATUSES.map((status) => ({ status, orders: sortedOpen.filter((o) => o.status === status) })),
    [sortedOpen],
  );

  const totalOpen = sortedOpen.length;

  // Capacity: today's planned minutes against the shop's working minutes × capacity.
  const capacity = useMemo(() => {
    const [oh, om] = (settings?.openTime ?? '08:30').split(':').map(Number);
    const [ch, cm] = (settings?.closeTime ?? '18:00').split(':').map(Number);
    const dayMinutes = Math.max(60, (ch * 60 + cm) - (oh * 60 + om)) * Math.max(1, settings?.capacity ?? 1);
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    const planned = Object.values(byOrder)
      .flat()
      .filter((j) => j.plannedStartAt && new Date(j.plannedStartAt) <= endOfToday)
      .reduce((s, j) => s + (j.estimatedMinutes || 0), 0);
    return { planned, dayMinutes, pct: Math.min(100, Math.round((planned / dayMinutes) * 100)) };
  }, [byOrder, settings]);

  const selectedLive = selected ? orders.find((o) => o.id === selected.id) ?? selected : null;

  const card = (o: FilmOrder) => {
    const next = nextOrderStatus(o.status);
    const first = (byOrder[o.id] ?? [])[0];
    return (
      <div key={o.id} className="space-y-2 rounded-xl border border-border bg-card p-2.5">
        <button type="button" className="w-full text-left" onClick={() => setSelected(o)}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{o.orderNo}</span>
            {o.isUrgent && <Badge className="bg-warning text-[10px] text-warning-foreground hover:bg-warning">ด่วน</Badge>}
            {isOverdue(o) && (
              <Badge variant="outline" className="border-destructive text-[10px] text-destructive">
                <AlertTriangle className="mr-0.5 h-3 w-3" /> เลยกำหนด
              </Badge>
            )}
          </div>
          <span className="mt-1 flex items-center gap-2">
            <CustomerAvatar
              name={o.customerName}
              pictureUrl={o.customerId ? custProfiles[o.customerId]?.pictureUrl : null}
              className="h-7 w-7"
            />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{o.customerName} · {o.title || '—'}</span>
          </span>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" /> นัดรับ {dt(o.dueAt)}
          </p>
          {first && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              เริ่ม {formatBkk(first.plannedStartAt)} · เสร็จ {formatBkk(first.plannedFinishAt)}
              {first.estimatedMinutes ? ` (~${first.estimatedMinutes} น.)` : ''}
            </p>
          )}
        </button>
        <div className="flex gap-1.5">
          {first && (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 flex-1 rounded-lg text-[11px]"
              onClick={() => setLocked(first, !first.scheduleLocked)}
            >
              {first.scheduleLocked
                ? (<><Lock className="mr-1 h-3 w-3" /> ปลดล็อก</>)
                : (<><Unlock className="mr-1 h-3 w-3" /> ล็อกคิว</>)}
            </Button>
          )}
          {next && (
            <Button size="sm" className="min-h-11 flex-1 rounded-lg text-xs" onClick={() => setOrderStatus(o, next)}>
              → {ORDER_STATUS_LABELS[next]}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ListChecks className="h-4 w-4 text-primary" /> คิวงาน {totalOpen} รายการ
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="queue-urgent" checked={urgentOnly} onCheckedChange={setUrgentOnly} />
              <Label htmlFor="queue-urgent" className="cursor-pointer text-xs">เฉพาะด่วน/เลยกำหนด</Label>
            </div>
            <Button size="sm" variant="outline" className="min-h-11 rounded-xl" onClick={() => recalculate()} disabled={saving}>
              <RefreshCw className={cn('mr-1 h-3.5 w-3.5', saving && 'animate-spin')} /> คำนวณเวลาใหม่
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>กำลังการผลิตวันนี้</span>
            <span className="tabular-nums">{capacity.planned} / {capacity.dayMinutes} นาที</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={capacity.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="กำลังการผลิตวันนี้"
          >
            <div
              className={cn('h-full rounded-full transition-all duration-200', capacity.pct >= 90 ? 'bg-warning' : 'bg-primary')}
              style={{ width: `${capacity.pct}%` }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : totalOpen === 0 ? (
        <EmptyState icon={ListChecks} title="ไม่มีงานค้างในคิว" />
      ) : (
        <>
          {/* Mobile: one ordered list */}
          <div className="space-y-2 lg:hidden">
            {groups.filter((g) => g.orders.length > 0).map((g) => (
              <section key={g.status} className="space-y-2">
                <div className="flex items-center justify-between">
                  <OrderStatusBadge status={g.status} />
                  <span className="text-xs text-muted-foreground">{g.orders.length} งาน</span>
                </div>
                {g.orders.map(card)}
              </section>
            ))}
          </div>

          {/* Desktop: kanban board */}
          <div className="hidden gap-3 overflow-x-auto pb-2 lg:flex">
            {groups.map((g) => (
              <div key={g.status} className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl bg-muted/50 p-2">
                <div className="flex items-center justify-between px-1">
                  <OrderStatusBadge status={g.status} />
                  <span className="text-xs tabular-nums text-muted-foreground">{g.orders.length}</span>
                </div>
                {g.orders.length === 0
                  ? <p className="px-1 py-6 text-center text-xs text-muted-foreground">ว่าง</p>
                  : g.orders.map(card)}
              </div>
            ))}
          </div>
        </>
      )}

      <OrderDetailDialog
        order={selectedLive}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        onStatusChange={setOrderStatus}
        onDelete={deleteOrder}
        onCancel={cancelOrder}
        checkDeletable={checkOrderDeletable}
        fetchEvents={fetchEvents}
        onOpenDocument={onOpenDocument}
      />
    </div>
  );
}

export default JobQueue;
