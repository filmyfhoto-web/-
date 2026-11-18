import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Inbox, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFilmOrders } from '@/film-shop/hooks/useFilmOrders';
import { OrderFormDialog } from './OrderFormDialog';
import { OrderDetailDialog } from './OrderDetailDialog';
import { OrderStatusBadge } from './OrderStatusBadge';
import { EmptyState, ListSkeleton } from '@/film-shop/components/common/Pieces';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';
import { useFilmCustomerProfiles } from '@/film-shop/hooks/useFilmCustomerProfiles';
import {
  ORDER_CHANNEL_LABELS,
  ORDER_PAYMENT_LABELS,
  isOverdue,
  pipelineBucketOf,
  PIPELINE_BUCKETS,
  PIPELINE_BUCKET_LABELS,
  workGroupOf,
  WORK_GROUPS,
  WORK_GROUP_LABELS,
  type FilmOrder,
  type PipelineBucket,
  type WorkGroup,
} from '@/film-shop/types/order';

const money = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(n);
const dt = (d?: Date) => (d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—');

type Filter = 'active' | 'urgent' | 'draft' | 'all' | PipelineBucket | WorkGroup;

const FILTERS: { value: Filter; label: string }[] = [
  ...WORK_GROUPS.map((g) => ({ value: g as Filter, label: WORK_GROUP_LABELS[g] })),
  { value: 'urgent', label: 'ด่วน' },
  { value: 'draft', label: 'ร่าง' },
  { value: 'all', label: 'ทั้งหมด' },
];

const isBucket = (f: Filter): f is PipelineBucket => (PIPELINE_BUCKETS as readonly string[]).includes(f);
const isGroup = (f: Filter): f is WorkGroup => (WORK_GROUPS as readonly string[]).includes(f);

interface Props {
  onOpenDocument?: (invoiceId: string) => void;
  openNewOnMount?: boolean;
  onNewOrder?: () => void;
  /** เปิดหน้าออเดอร์พร้อมกรองตามช่องสถานะจากกระดานงาน */
  initialStatusBucket?: string;
  /** โฟกัสช่องค้นหาทันที (มาจากปุ่ม "ค้นหาออเดอร์") */
  autoFocusSearch?: boolean;
  /** เปิด/ไฮไลต์ออเดอร์นี้ทันที (ปุ่มในแจ้งเตือน Web Push / LINE) */
  highlightOrderId?: string;
}

export function OrderManager({ onOpenDocument, openNewOnMount, onNewOrder, initialStatusBucket, autoFocusSearch, highlightOrderId }: Props) {
  const { orders, loading, createOrder, deleteOrder, cancelOrder, checkOrderDeletable, setOrderStatus, fetchEvents } = useFilmOrders();
  const [formOpen, setFormOpen] = useState(!!openNewOnMount);
  const [selected, setSelected] = useState<FilmOrder | null>(null);
  const [filter, setFilter] = useState<Filter>(
    initialStatusBucket &&
      ([...PIPELINE_BUCKETS, ...WORK_GROUPS, 'urgent', 'draft', 'all'] as readonly string[]).includes(initialStatusBucket)
      ? (initialStatusBucket as Filter)
      : 'inbox',
  );
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocusSearch) searchRef.current?.focus(); }, [autoFocusSearch]);

  // ปุ่มในแจ้งเตือน: เปิดหน้าออเดอร์แล้วเด้งรายละเอียดของออเดอร์นั้นทันที
  const openedHighlight = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightOrderId || loading) return;
    if (openedHighlight.current === highlightOrderId) return;
    const found = orders.find((o) => o.id === highlightOrderId);
    if (!found) return;
    openedHighlight.current = highlightOrderId;
    setFilter('all');
    setSelected(found);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-order-row="${highlightOrderId}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [highlightOrderId, orders, loading]);

  const startNew = () => (onNewOrder ? onNewOrder() : setFormOpen(true));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matches = !q ||
        o.orderNo.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.customerPhone || '').includes(q) ||
        o.title.toLowerCase().includes(q);
      if (!matches) return false;
      if (filter === 'all') return true;
      if (filter === 'draft') return o.isDraft;
      if (o.isDraft) return false;
      if (filter === 'urgent') return o.isUrgent && o.status !== 'delivered';
      if (isGroup(filter)) return workGroupOf(o.status) === filter;
      if (isBucket(filter)) return pipelineBucketOf(o.status) === filter;
      return o.status !== 'delivered' && o.status !== 'cancelled';
    });
  }, [orders, filter, search]);

  const custProfiles = useFilmCustomerProfiles(visible.map((o) => o.customerId));

  const counts = useMemo(() => {
    const live = orders.filter((o) => !o.isDraft);
    const byBucket = Object.fromEntries([
      ...PIPELINE_BUCKETS.map((b) => [b, live.filter((o) => pipelineBucketOf(o.status) === b).length]),
      ...WORK_GROUPS.map((g) => [g, live.filter((o) => workGroupOf(o.status) === g).length]),
    ]) as Record<PipelineBucket | WorkGroup, number>;
    return {
      ...byBucket,
      active: live.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length,
      urgent: live.filter((o) => o.isUrgent && o.status !== 'delivered' && o.status !== 'cancelled').length,
      draft: orders.filter((o) => o.isDraft).length,
      all: orders.length,
    } as Record<Filter, number>;
  }, [orders]);

  // Keep the open detail view in sync with realtime updates.
  const selectedLive = selected ? orders.find((o) => o.id === selected.id) ?? selected : null;

  const tags = (o: FilmOrder) => (
    <>
      <OrderStatusBadge status={o.status} />
      {o.isUrgent && <Badge className="bg-warning text-warning-foreground hover:bg-warning">ด่วน</Badge>}
      {o.isDraft && <Badge variant="outline" className="border-warning text-warning">ร่าง</Badge>}
      {isOverdue(o) && (
        <Badge variant="outline" className="border-destructive text-destructive">
          <AlertTriangle className="mr-1 h-3 w-3" /> เลยกำหนด
        </Badge>
      )}
    </>
  );

  return (
    <div className="animate-fade-in space-y-3">
      {/* Sticky toolbar */}
      <div className="sticky top-14 z-20 -mx-4 space-y-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:top-16 md:-mx-6 md:px-6">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              className="h-11 rounded-xl pl-9"
              placeholder="ค้นหาเลขที่ / ลูกค้า / เบอร์"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button className="min-h-11 shrink-0 rounded-xl" onClick={startNew}>
            <Plus className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">รับงานใหม่</span>
          </Button>
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="ตัวกรองออเดอร์">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                filter === f.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label} {counts[f.value]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState icon={Inbox} title="ยังไม่มีออเดอร์ในหมวดนี้" actionLabel="รับงานใหม่" onAction={startNew} />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {visible.map((o) => (
              <button
                key={o.id}
                type="button"
                data-order-row={o.id}
                onClick={() => setSelected(o)}
                className={cn(
                  'w-full rounded-xl border border-border bg-card p-3 text-left transition-shadow duration-150 active:shadow-md',
                  highlightOrderId === o.id && 'border-primary ring-2 ring-primary/40',
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold">{o.orderNo}</span>
                  {tags(o)}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <CustomerAvatar
                    name={o.customerName}
                    pictureUrl={o.customerId ? custProfiles[o.customerId]?.pictureUrl : null}
                    className="h-8 w-8"
                  />
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{o.customerName} · {o.title || '—'}</p>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {dt(o.dueAt)}</span>
                  <span className="font-semibold tabular-nums text-foreground">{money(o.total)}฿</span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div data-table-scroll className="hidden rounded-2xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">เลขที่</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">ลูกค้า / งาน</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">สถานะ</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">นัดรับ</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">ช่องทาง</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr
                    key={o.id}
                    data-order-row={o.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => setSelected(o)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(o); } }}
                    className={cn(
                      'cursor-pointer border-t border-border transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
                      highlightOrderId === o.id && 'bg-primary/5 ring-2 ring-inset ring-primary/40',
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium">{o.orderNo}</td>
                    <td className="max-w-[280px] px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <CustomerAvatar
                          name={o.customerName}
                          pictureUrl={o.customerId ? custProfiles[o.customerId]?.pictureUrl : null}
                          className="h-8 w-8"
                        />
                        <div className="min-w-0">
                          <p className="truncate">{o.customerName}</p>
                          <p className="truncate text-xs text-muted-foreground">{o.title || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{tags(o)}</div></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{dt(o.dueAt)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{ORDER_CHANNEL_LABELS[o.channel] ?? o.channel}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <span className="font-semibold tabular-nums">{money(o.total)}฿</span>
                      <span className="block text-xs text-muted-foreground">{ORDER_PAYMENT_LABELS[o.paymentStatus]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <OrderFormDialog open={formOpen} onOpenChange={setFormOpen} onCreate={createOrder} />
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

export default OrderManager;
