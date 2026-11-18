import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, RefreshCw, ReceiptText, Clock, ChevronRight, Loader2,
  ClipboardList, ClipboardCheck, PackageCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GROUPS } from '@/film-shop/lib/groups';
import { GroupShell } from '@/film-shop/components/hub/GroupShell';
import { WorkcenterProvider, useWorkcenterCtx } from '@/film-shop/workcenter/components/WorkcenterProvider';
import { WORK_STATUS_LABELS, type WorkStatus } from '@/film-shop/workcenter/lib/workcenter';
import type { WorkJob } from '@/film-shop/workcenter/hooks/useWorkcenter';
import { QueueIntakeSheet } from '@/film-shop/components/queue/QueueIntakeSheet';
import { QueueReceiptSheet } from '@/film-shop/components/queue/QueueReceiptSheet';
import { loadQueueOrderDocs, queueBaht, type QueueOrderDocs } from '@/film-shop/lib/queueIntake';
import { notifyDeliveryEvent } from '@/film-shop/lib/queueDeliveryNotify';

type Tab = 'waiting' | 'doing' | 'ready' | 'done';

const TABS: { key: Tab; label: string; statuses: WorkStatus[] }[] = [
  { key: 'waiting', label: 'รอทำ', statuses: ['new', 'order_review', 'waiting_approval', 'design_queue', 'waiting_info'] as WorkStatus[] },
  { key: 'doing', label: 'กำลังทำ', statuses: ['producing', 'reviewing', 'waiting_outsource'] as WorkStatus[] },
  { key: 'ready', label: 'พร้อมรับ', statuses: ['ready'] as WorkStatus[] },
  { key: 'done', label: 'เสร็จแล้ว', statuses: ['done'] as WorkStatus[] },
];

/** สถานะถัดไปของงาน (ปุ่มเดินงานในการ์ด) */
const NEXT_STATUS: Partial<Record<WorkStatus, WorkStatus>> = {
  new: 'producing',
  order_review: 'producing',
  waiting_approval: 'producing',
  design_queue: 'producing',
  waiting_info: 'producing',
  waiting_outsource: 'reviewing',
  producing: 'reviewing',
  reviewing: 'ready',
  ready: 'done',
};

/**
 * กลุ่ม “Q รันงาน” — หน้ารับงานและเดินคิวเท่านั้น
 */
export function QueueGroupPage({ onHome, onReceipts }: { onHome: () => void; onReceipts: (invoiceId?: string) => void }) {
  return (
    <WorkcenterProvider>
      <QueueInner onHome={onHome} onReceipts={onReceipts} />
    </WorkcenterProvider>
  );
}

function QueueInner({ onHome, onReceipts }: { onHome: () => void; onReceipts: (invoiceId?: string) => void }) {
  const { jobs, employees, drafts, loading, reload, setJobStatus, assignJob, closeOrder } = useWorkcenterCtx();
  const [tab, setTab] = useState<Tab>('waiting');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  /** ลิงก์บอท ?q=intake เปิด “รับงานใหม่” ทันที */
  const [intakeOpen, setIntakeOpen] = useState(() => searchParams.get('q') === 'intake');
  const [docs, setDocs] = useState<Record<string, QueueOrderDocs>>({});
  const [payTarget, setPayTarget] = useState<
    { id: string; orderNo: string; customerName: string; total: number; paidPreviously: number } | null
  >(null);
  const g = GROUPS.queue;

  const openReceipt = (invoiceId?: string) => onReceipts(invoiceId);

  useEffect(() => {
    if (searchParams.get('q') === 'intake') setIntakeOpen(true);
  }, [searchParams]);

  const changeIntakeOpen = (v: boolean) => {
    setIntakeOpen(v);
    if (!v && searchParams.get('q')) {
      const next = new URLSearchParams(window.location.search);
      next.delete('q');
      setSearchParams(next, { replace: true });
    }
  };

  const orderIds = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.orderId).filter(Boolean))) as string[],
    [jobs],
  );
  const refreshDocs = useCallback(async () => {
    setDocs(await loadQueueOrderDocs(orderIds));
  }, [orderIds]);
  useEffect(() => { void refreshDocs(); }, [refreshDocs]);

  /** รวมงานย่อยเป็นการ์ดต่อออเดอร์ */
  const cards = useMemo(() => {
    const map = new Map<string, { orderId: string; orderNo: string; customerName: string; paymentStatus: string | null; total: number; paidPreviously: number; dueAt: string | null; isUrgent: boolean; jobs: WorkJob[] }>();
    for (const j of jobs) {
      if (j.status === 'cancelled') continue;
      const key = j.orderId ?? j.id;
      const cur = map.get(key) ?? {
        orderId: key, orderNo: j.orderNo, customerName: j.customerName,
        paymentStatus: j.paymentStatus, total: 0,
        // เงินที่รับไว้แล้ว (มัดจำ/ชำระบางส่วน) ใช้คำนวณยอดคงเหลือตอนรับเงินภายหลัง
        paidPreviously: Math.max(0, Number(j.orderPaidAmount) || 0, Number(j.orderDeposit) || 0),
        dueAt: j.dueAt, isUrgent: j.isUrgent, jobs: [],
      };
      cur.jobs.push(j);
      cur.paidPreviously = Math.max(
        cur.paidPreviously, Number(j.orderPaidAmount) || 0, Number(j.orderDeposit) || 0,
      );
      if (j.dueAt && (!cur.dueAt || j.dueAt < cur.dueAt)) cur.dueAt = j.dueAt;
      cur.isUrgent = cur.isUrgent || j.isUrgent;
      map.set(key, cur);
    }
    // ยอดเงินยึดตามใบเสร็จที่ผูกกับออเดอร์ ไม่คำนวณซ้ำในคิว
    return [...map.values()].map((c) => ({ ...c, total: docs[c.orderId]?.total ?? 0 }));
  }, [jobs, docs]);

  const visible = useMemo(() => {
    const allowed = new Set(TABS.find((t) => t.key === tab)!.statuses as string[]);
    return cards.filter((c) => c.jobs.some((j) => allowed.has(j.status)));
  }, [cards, tab]);

  const counts = useMemo(() => {
    const out = {} as Record<Tab, number>;
    for (const t of TABS) {
      const allowed = new Set(t.statuses as string[]);
      out[t.key] = cards.filter((c) => c.jobs.some((j) => allowed.has(j.status))).length;
    }
    return out;
  }, [cards]);

  const refresh = async () => {
    await reload();
    await refreshDocs();
    toast.success('รีเฟรชข้อมูลคิวงานแล้ว');
  };

  /** งานทุกชิ้นผ่านการตรวจแล้ว = ออเดอร์อยู่สถานะ “รอส่งมอบ” (เอกสารไม่เปลี่ยนสถานะนี้เอง) */
  const isAwaitingDelivery = (js: WorkJob[]) =>
    js.length > 0 && js.every((j) => j.status === 'ready' || j.status === 'done')
    && js.some((j) => j.status === 'ready');

  /** ปิดงาน = พนักงานกดยืนยันส่งมอบเท่านั้น แล้วแจ้ง LINE ผ่าน outbox (idempotent) */
  const confirmDelivery = async (c: { orderId: string; orderNo: string; customerName: string }) => {
    const ok = await closeOrder(c.orderId);
    if (!ok) return;
    const res = await notifyDeliveryEvent('delivered', {
      orderId: c.orderId, orderNo: c.orderNo, customerName: c.customerName,
    });
    if (res.customerLine === 'skipped_no_line') toast.info('ปิดงานแล้ว (ลูกค้ายังไม่ผูก LINE จึงไม่ได้ส่งแจ้งเตือน)');
    else if (res.customerLine === 'failed') toast.warning('ปิดงานแล้ว แต่ส่งแจ้งเตือน LINE ไม่สำเร็จ');
    await refreshDocs();
  };

  /** เดินสถานะงาน — เมื่อถึง “พร้อมส่งมอบ” ให้ enqueue แจ้งลูกค้าทาง LINE */
  const advance = async (c: { orderId: string; orderNo: string; customerName: string; jobs: WorkJob[] }, next: WorkStatus) => {
    for (const j of c.jobs) await setJobStatus(j, next);
    if (next === 'ready') {
      const res = await notifyDeliveryEvent('ready', {
        orderId: c.orderId, orderNo: c.orderNo, customerName: c.customerName,
      });
      if (res.customerLine === 'skipped_no_line') toast.info('อัปเดตเป็นรอส่งมอบแล้ว (ลูกค้ายังไม่ผูก LINE)');
      else if (res.customerLine === 'failed') toast.warning('อัปเดตแล้ว แต่ส่งแจ้งเตือน LINE ไม่สำเร็จ');
    }
    await refreshDocs();
  };

  /** มอบหมายผู้รับผิดชอบให้ทุกงานย่อยในการ์ด (จำเป็นก่อนเดินสถานะเป็น “กำลังผลิต”) */
  const assignAll = async (js: WorkJob[], employeeId: string) => {
    for (const j of js) await assignJob(j, employeeId);
    toast.success('มอบหมายผู้รับผิดชอบแล้ว');
  };

  const actions = (
    <div className="flex items-center gap-2">
      <Button
        type="button" variant="ghost" size="sm" className="h-9 rounded-xl"
        data-testid="q-btn-refresh" onClick={() => void refresh()}
      >
        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
      </Button>
      <Button
        type="button" variant="secondary" size="sm" className="h-9 rounded-xl"
        data-testid="q-add-job" onClick={() => changeIntakeOpen(true)}
      >
        <Plus className="mr-1 h-4 w-4" /> รับงานใหม่
      </Button>
    </div>
  );

  return (
    <GroupShell group="queue" onHome={onHome} actions={actions}>
      {/* การ์ดควบคุมกลุ่ม Q รันงาน — ชุดปุ่มเดียวกับการ์ด NATTA.Q ใน LINE (mobile 3×2 · desktop แถวเดียว) */}
      <div
        className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card p-2 sm:grid-cols-6"
        data-testid="q-control-card"
      >
        <Button
          type="button" variant="outline" className="h-11 rounded-xl text-xs font-semibold sm:text-sm"
          data-testid="q-ctl-check"
          onClick={async () => { setSummaryOpen(false); setTab('waiting'); await refresh(); }}
        >
          <ClipboardList className="mr-1 h-4 w-4 shrink-0" /> เช็คคิว
        </Button>
        <Button
          type="button" variant="outline" className="h-11 rounded-xl text-xs font-semibold sm:text-sm"
          data-testid="q-ctl-intake"
          onClick={() => changeIntakeOpen(true)}
        >
          <Plus className="mr-1 h-4 w-4 shrink-0" /> รับงาน
        </Button>
        <Button
          type="button" variant={summaryOpen ? 'default' : 'outline'}
          className="h-11 rounded-xl text-xs font-semibold sm:text-sm"
          data-testid="q-ctl-summary"
          onClick={() => setSummaryOpen((v) => !v)}
        >
          <ClipboardCheck className="mr-1 h-4 w-4 shrink-0" /> สรุปงาน
        </Button>
        <Button
          type="button" variant="outline" className="h-11 rounded-xl text-xs font-semibold sm:text-sm"
          data-testid="q-ctl-reload"
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn('mr-1 h-4 w-4 shrink-0', loading && 'animate-spin')} /> รีเฟรช
        </Button>
        <Button
          type="button" variant="outline" className="h-11 rounded-xl text-xs font-semibold sm:text-sm"
          data-testid="q-ctl-receipt"
          onClick={() => openReceipt()}
        >
          <ReceiptText className="mr-1 h-4 w-4 shrink-0" /> ใบเสร็จ
        </Button>
      </div>

      {summaryOpen && (
        <div className="rounded-2xl border border-border bg-muted/30 p-3 text-sm" data-testid="q-summary">
          <p className="font-semibold">สรุปงานปัจจุบัน</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground sm:grid-cols-4">
            {TABS.map((t) => (
              <li key={t.key} data-testid={`q-summary-${t.key}`}>{t.label}: <b>{counts[t.key] ?? 0}</b></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="q-summary-drafts">
            ฉบับร่างที่ยังไม่เข้าคิว: <b>{drafts.length}</b>
          </p>
        </div>
      )}

      <div className="flex items-center gap-2" data-testid="q-toolbar">
        <div className="flex flex-1 gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              data-testid={`q-tab-${t.key}`}
               onClick={() => setTab(t.key)}
               className={cn(
                 'min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors',
                 tab === t.key ? g.solid : 'text-muted-foreground hover:text-foreground',
               )}
            >
              {t.label} <span className="text-xs opacity-80">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl min-w-0" data-testid="q-split">
          <section className="min-w-0 space-y-3" data-testid="q-jobs-pane">
            {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> กำลังโหลดคิวงาน…
        </p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground" data-testid="q-empty">
          ยังไม่มีงานในแท็บนี้ — กด “รับงานใหม่” เพื่อเริ่ม
        </p>
      ) : (
        <div className="space-y-3" data-testid="q-cards">
          {visible.map((c) => {
            const d = docs[c.orderId];
            const lead = c.jobs[0];
            return (
              <article
                key={c.orderId}
                data-testid="q-card"
                className="rounded-2xl border border-border bg-card p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{c.customerName || 'ลูกค้าไม่ระบุชื่อ'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.orderNo}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {c.isUrgent && (
                      <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground">ด่วน</span>
                    )}
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', g.soft, g.text)}>
                      {WORK_STATUS_LABELS[lead.status as keyof typeof WORK_STATUS_LABELS] ?? lead.status}
                    </span>
                    {isAwaitingDelivery(c.jobs) && (
                      <span
                        data-testid="q-card-awaiting-delivery"
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                      >
                        รอส่งมอบ
                      </span>
                    )}
                    <span
                      data-testid="q-card-payment"
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        c.paymentStatus === 'paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : c.paymentStatus === 'partial'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {c.paymentStatus === 'paid' ? 'จ่ายครบ' : c.paymentStatus === 'partial' ? 'มัดจำ' : 'ยังไม่รับเงิน'}
                    </span>
                  </div>
                </div>

                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {c.jobs.map((j) => (
                    <li key={j.id} className="truncate">
                      • {j.title} {j.size ? `(${j.size})` : ''} × {j.quantity} {j.unit ?? ''}
                    </li>
                  ))}
                </ul>

                {c.dueAt && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> รับงาน {new Date(c.dueAt).toLocaleString('th-TH')}
                  </p>
                )}

                <p className="mt-1 text-right text-sm font-bold" data-testid="q-card-total">
                  {queueBaht(c.total)} ฿
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {c.jobs.some((j) => !j.assignedEmployeeId) && (
                    <Select
                      value={c.jobs.find((j) => j.assignedEmployeeId)?.assignedEmployeeId ?? undefined}
                      onValueChange={(v) => void assignAll(c.jobs, v)}
                    >
                      <SelectTrigger
                        data-testid="q-card-assignee"
                        className="h-9 w-full rounded-xl text-xs sm:w-44"
                      >
                        <SelectValue placeholder="เลือกผู้รับผิดชอบ" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id} className="text-xs">{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {d?.receiptId ? (
                    <Button
                      type="button" size="sm" variant="outline" className="h-9 rounded-xl text-xs"
                      data-testid="q-card-receipt"
                      onClick={() => openReceipt(d.receiptId ?? undefined)}
                    >
                      <ReceiptText className="mr-1 h-3.5 w-3.5" /> ใบเสร็จ {d.receiptNo}
                    </Button>
                  ) : (
                    <Button
                      type="button" size="sm" variant="secondary" className="h-9 rounded-xl text-xs"
                      data-testid="q-card-pay"
                      onClick={() => setPayTarget({
                        id: c.orderId, orderNo: c.orderNo, customerName: c.customerName,
                        total: c.total, paidPreviously: c.paidPreviously,
                      })}
                    >
                      <ReceiptText className="mr-1 h-3.5 w-3.5" /> รับเงิน
                    </Button>
                  )}
                  {isAwaitingDelivery(c.jobs) && (
                    <Button
                      type="button" size="sm" className="h-9 rounded-xl text-xs"
                      data-testid="q-card-deliver"
                      onClick={() => void confirmDelivery(c)}
                    >
                      <PackageCheck className="mr-1 h-3.5 w-3.5" /> ยืนยันส่งมอบ
                    </Button>
                  )}
                  {NEXT_STATUS[lead.status] && (
                    <Button
                      type="button" size="sm" className="h-9 rounded-xl text-xs"
                      data-testid="q-card-next"
                      onClick={() => void advance(c, NEXT_STATUS[lead.status]!)}
                    >
                      {WORK_STATUS_LABELS[NEXT_STATUS[lead.status] as keyof typeof WORK_STATUS_LABELS]}
                      <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
              </div>
            )}
          </section>
        </div>


      <QueueIntakeSheet
        open={intakeOpen}
        onOpenChange={changeIntakeOpen}
        employees={employees.map((e) => ({ id: e.id, name: e.name }))}
        onCreated={async (res) => {
          await reload();
          await refreshDocs();
          setTab('waiting');
        }}
      />

      <QueueReceiptSheet
        open={!!payTarget}
        onOpenChange={(v) => { if (!v) setPayTarget(null); }}
        order={payTarget}
        onIssued={async (receiptId) => {
          await reload();
          await refreshDocs();
          onReceipts(receiptId);
        }}
      />
    </GroupShell>
  );
}
