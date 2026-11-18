import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CalendarDays, Clock, Columns3, List, RefreshCw, Store, Table2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ListSkeleton } from '@/film-shop/components/common/Pieces';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';
import { useFilmCustomerProfiles } from '@/film-shop/hooks/useFilmCustomerProfiles';
import { useWorkcenterCtx } from '@/film-shop/workcenter/components/WorkcenterProvider';
import { JobDetailPanel } from '@/film-shop/workcenter/components/JobDetailPanel';
import type { WorkJob } from '@/film-shop/workcenter/hooks/useWorkcenter';
import {
  BOARD_STATUSES, WORK_CATEGORIES, WORK_DEPTS, SIMPLE_WORK_STATUSES, WORK_STATUSES, WORK_STATUS_LABELS, WORK_STATUS_TONE,
  categoryLabel, deptLabel, dueTone, formatThaiDate, formatThb, type WorkStatus,
} from '@/film-shop/workcenter/lib/workcenter';

const ALL = '__all__';
const NONE = '__none__';

export interface QueueFilter { status?: WorkStatus; urgent?: boolean; dueSoon?: boolean; outsourced?: boolean; problem?: boolean; today?: boolean }

type ViewMode = 'kanban' | 'table' | 'list' | 'calendar';

function sameDay(a: string | null, d: Date) {
  if (!a) return false;
  const x = new Date(a);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
}

/** ศูนย์รันคิวงาน — Kanban / รายการ / ปฏิทิน พร้อมตัวกรองและแผงรายละเอียดงาน */
export function WorkQueueBoard({ initialFilter, search = '' }: { initialFilter?: QueueFilter; search?: string }) {
  const {
    jobs, employees, loading, reload, setJobStatus,
    liveStatus, lastSyncAt, newJobCount, changedJobCount, newJobIds, markSeen,
  } = useWorkcenterCtx();
  const [category, setCategory] = useState(ALL);
  const [dept, setDept] = useState(ALL);
  const [assignee, setAssignee] = useState(ALL);
  const [outsourced, setOutsourced] = useState(initialFilter?.outsourced ? 'yes' : ALL);
  const [status, setStatus] = useState<string>(initialFilter?.status ?? ALL);
  const [payment, setPayment] = useState(ALL);
  const [urgentOnly, setUrgentOnly] = useState(!!initialFilter?.urgent);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState<ViewMode>('kanban');
  const [openJob, setOpenJob] = useState<WorkJob | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [activeCol, setActiveCol] = useState<WorkStatus>(initialFilter?.status ?? 'new');

  const q = search.trim().toLowerCase();
  const today = new Date();

  const filtered = useMemo(() => jobs.filter((j) => {
    if (category !== ALL && j.category !== category) return false;
    if (dept !== ALL && j.dept !== dept) return false;
    if (assignee !== ALL && (j.assignedEmployeeId ?? NONE) !== assignee) return false;
    if (outsourced === 'yes' && !j.isOutsourced) return false;
    if (outsourced === 'no' && j.isOutsourced) return false;
    if (status !== ALL && j.status !== status) return false;
    if (status === ALL && j.status === 'cancelled') return false;
    if (payment !== ALL && (j.paymentStatus ?? 'unpaid') !== payment) return false;
    if (urgentOnly && !j.isUrgent) return false;
    if (initialFilter?.dueSoon && dueTone(j.dueAt) === 'normal') return false;
    if (initialFilter?.today && !sameDay(j.dueAt, today)) return false;
    if (initialFilter?.problem && j.status !== 'waiting_info' && j.status !== 'waiting_approval') return false;
    if (from && (!j.dueAt || new Date(j.dueAt) < new Date(from))) return false;
    if (to && (!j.dueAt || new Date(j.dueAt) > new Date(`${to}T23:59:59`))) return false;
    if (q) {
      const hay = [j.jobNo, j.orderNo, j.internalJobNo, j.title, j.customerName, j.customerPhone, j.assignedName]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [jobs, category, dept, assignee, outsourced, status, payment, urgentOnly, from, to, initialFilter, q]);

  const byStatus = useMemo(() => {
    const m = Object.fromEntries(WORK_STATUSES.map((s) => [s, [] as WorkJob[]])) as Record<WorkStatus, WorkJob[]>;
    for (const j of filtered) m[j.status].push(j);
    return m;
  }, [filtered]);

  /** ลำดับงานย่อยในออเดอร์เดียวกัน เช่น 1 จาก 4 */
  const siblingInfo = useMemo(() => {
    const byOrder: Record<string, WorkJob[]> = {};
    for (const j of jobs) (byOrder[j.orderId] ??= []).push(j);
    const m: Record<string, { index: number; count: number }> = {};
    for (const list of Object.values(byOrder)) {
      const sorted = [...list].sort((a, b) => (a.jobNo ?? '').localeCompare(b.jobNo ?? ''));
      sorted.forEach((j, i) => { m[j.id] = { index: i + 1, count: sorted.length }; });
    }
    return m;
  }, [jobs]);

  const profiles = useFilmCustomerProfiles(filtered.map((j) => j.customerId));

  const clearFilters = () => {
    setCategory(ALL); setDept(ALL); setAssignee(ALL); setOutsourced(ALL);
    setStatus(ALL); setPayment(ALL); setUrgentOnly(false); setFrom(''); setTo('');
  };

  const card = (job: WorkJob) => {
    const tone = dueTone(job.dueAt);
    const sib = siblingInfo[job.id] ?? { index: 1, count: 1 };
    const hasFiles = (job.attachments?.length ?? 0) > 0;
    const balance = Math.max(0, job.orderTotal - job.orderDeposit);
    return (
      <div
        key={job.id}
        data-testid="work-job-card"
        draggable
        onDragStart={() => setDragId(job.id)}
        onDragEnd={() => setDragId(null)}
        className={cn('rounded-xl border border-border bg-card shadow-sm', dragId === job.id && 'opacity-50')}
      >
        <button
          type="button"
          onClick={() => setOpenJob(job)}
          className="w-full space-y-1.5 p-2.5 text-left"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold">{job.jobNo || job.internalJobNo || job.orderNo}</span>
            {job.queueCode && (
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary" data-testid="job-queue-code">{job.queueCode}</span>
            )}
            {job.isUrgent && <Badge className="bg-warning text-[10px] text-warning-foreground hover:bg-warning">ด่วน</Badge>}
            {job.isOutsourced && <Badge variant="outline" className="text-[10px]"><Store className="mr-0.5 h-3 w-3" />ร้านใหญ่</Badge>}
            {tone === 'overdue' && <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">เลยกำหนด</Badge>}
            {job.pausedAt && <Badge variant="outline" className="text-[10px]">พักงาน</Badge>}
          </div>
          {job.priorityReason && (
            <p className="truncate text-[11px] text-muted-foreground" title={job.priorityReason}>ลำดับ: {job.priorityReason}</p>
          )}
          <p className="truncate text-sm font-medium">{job.title}</p>
          <div className="flex items-center gap-2">
            <CustomerAvatar
              name={job.customerName || 'ไม่ระบุลูกค้า'}
              pictureUrl={job.customerId ? profiles[job.customerId]?.pictureUrl : null}
              className="h-6 w-6"
            />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{job.customerName || 'ไม่ระบุลูกค้า'}</span>
            {sib.count > 1 && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]" data-testid="job-subjob-progress">
                งานย่อย {sib.index} จาก {sib.count}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {categoryLabel(job.category)} · {deptLabel(job.dept)} · {job.assignedName || 'ยังไม่มอบหมาย'}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {job.dueAt && (
              <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                tone === 'overdue' ? 'bg-destructive/10 text-destructive'
                  : tone === 'soon' ? 'bg-warning/15 text-warning' : 'text-muted-foreground')}>
                {tone === 'overdue' ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {formatThaiDate(job.dueAt)}
              </span>
            )}
            <span className={cn('rounded px-1.5 py-0.5', hasFiles ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
              {hasFiles ? `ไฟล์ ${job.attachments.length}` : 'ยังไม่มีไฟล์'}
            </span>
            <span className="text-muted-foreground">
              รวม {formatThb(job.orderTotal)} · มัดจำ {formatThb(job.orderDeposit)} · คงเหลือ {formatThb(balance)}
            </span>
            <span className="rounded px-1.5 py-0.5 text-muted-foreground">ชำระ: {job.paymentStatus || '-'}</span>
          </div>
        </button>
      </div>
    );
  };

  const dropTo = (s: WorkStatus) => {
    const job = jobs.find((j) => j.id === dragId);
    setDragId(null);
    if (job) void setJobStatus(job, s, 'ลากการ์ดเปลี่ยนสถานะ');
  };

  if (loading) return <ListSkeleton />;

  return (
    <div className="space-y-4" data-testid="work-queue-board">
      <Card className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">หมวดงาน</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9" aria-label="กรองตามหมวดงาน"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกหมวด</SelectItem>
              {WORK_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ฝ่ายผลิต</Label>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9" aria-label="กรองตามฝ่ายผลิต"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกฝ่าย</SelectItem>
              {WORK_DEPTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ผู้รับผิดชอบ</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="h-9" aria-label="กรองตามผู้รับผิดชอบ"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกคน</SelectItem>
              <SelectItem value={NONE}>ยังไม่มอบหมาย</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ร้านใหญ่</Label>
          <Select value={outsourced} onValueChange={setOutsourced}>
            <SelectTrigger className="h-9" aria-label="กรองงานร้านใหญ่"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทั้งหมด</SelectItem>
              <SelectItem value="yes">เฉพาะส่งร้านใหญ่</SelectItem>
              <SelectItem value="no">เฉพาะทำในร้าน</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">สถานะ</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9" aria-label="กรองตามสถานะ"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกสถานะ (ไม่รวมยกเลิก)</SelectItem>
              {SIMPLE_WORK_STATUSES.map((s) => <SelectItem key={s} value={s}>{WORK_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">สถานะชำระเงิน</Label>
          <Select value={payment} onValueChange={setPayment}>
            <SelectTrigger className="h-9" aria-label="กรองตามสถานะชำระเงิน"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทั้งหมด</SelectItem>
              <SelectItem value="unpaid">ยังไม่ชำระ</SelectItem>
              <SelectItem value="partial">มัดจำบางส่วน</SelectItem>
              <SelectItem value="paid">ชำระครบ</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="wq-from">กำหนดส่งตั้งแต่</Label>
          <Input id="wq-from" className="h-9" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="wq-to">ถึง</Label>
          <Input id="wq-to" className="h-9" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <Button
            size="sm"
            variant={urgentOnly ? 'default' : 'outline'}
            className="h-9"
            aria-pressed={urgentOnly}
            onClick={() => setUrgentOnly((v) => !v)}
          >
            เฉพาะงานด่วน
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={clearFilters} data-testid="work-clear-filter">
            <X className="mr-1 h-4 w-4" /> ล้างตัวกรอง
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => void reload()}>
            <RefreshCw className="mr-1 h-4 w-4" /> รีเฟรช
          </Button>
          <span
            data-testid="work-live-status"
            data-live={liveStatus}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]',
              liveStatus === 'live' ? 'border-success/40 text-success' : 'border-border text-muted-foreground')}
            title={`ซิงก์ล่าสุด ${new Date(lastSyncAt).toLocaleTimeString('th-TH')}`}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full',
              liveStatus === 'live' ? 'animate-pulse bg-success' : 'bg-muted-foreground')} />
            {liveStatus === 'live' ? 'เรียลไทม์' : liveStatus === 'connecting' ? 'กำลังเชื่อมต่อ' : 'ออฟไลน์'}
            <span className="tabular-nums">· {new Date(lastSyncAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
          {(newJobCount > 0 || changedJobCount > 0) && (
            <Button
              size="sm"
              className="h-9"
              data-testid="work-new-badge"
              onClick={() => { void reload(); markSeen(); }}
            >
              งานใหม่ {newJobCount} · อัปเดต {changedJobCount}
            </Button>
          )}
          <span className="text-xs text-muted-foreground" data-testid="work-result-count">
            พบ {filtered.length} งาน
          </span>
          <div className="ml-auto inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="สลับมุมมอง">
            {([['kanban', 'Kanban', Columns3], ['table', 'ตาราง', Table2], ['list', 'รายการ', List], ['calendar', 'ปฏิทิน', CalendarDays]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                data-testid={`work-view-${v}`}
                onClick={() => setView(v)}
                className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs',
                  view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {view === 'kanban' && (
        <>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden" role="tablist" aria-label="ไปยังคอลัมน์สถานะ">
            {BOARD_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={activeCol === s}
                data-testid={`work-tab-${s}`}
                onClick={() => {
                  setActiveCol(s);
                  document.getElementById(`work-col-${s}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                }}
                className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs',
                  activeCol === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground')}
              >
                {WORK_STATUS_LABELS[s]} ({byStatus[s].length})
              </button>
            ))}
          </div>

          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:grid-cols-4">
            {BOARD_STATUSES.map((s) => (
              <div
                key={s}
                id={`work-col-${s}`}
                data-testid={`work-col-${s}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropTo(s)}
                className="flex min-h-[140px] w-[78vw] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-border bg-muted/30 p-2 sm:w-[60vw] md:w-auto md:shrink"
              >
                <div className={cn('sticky top-0 z-10 flex items-center justify-between rounded-lg border px-2 py-1 text-xs font-semibold', WORK_STATUS_TONE[s])}>
                  <span>{WORK_STATUS_LABELS[s]}</span>
                  <span>{byStatus[s].length}</span>
                </div>
                {byStatus[s].length === 0
                  ? <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">ไม่มีงาน</p>
                  : byStatus[s].map(card)}
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'table' && (
        <div data-testid="work-table-view" className="rounded-2xl border border-border bg-card">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">ไม่พบงานตามตัวกรอง</p>
          ) : (
            <>
              {/* มือถือ/แท็บเล็ตเล็ก: แถวแบบการ์ด อ่านง่าย ไม่ต้องเลื่อนแนวนอน */}
              <ul className="divide-y divide-border lg:hidden">
                {filtered.map((j) => {
                  const tone = dueTone(j.dueAt);
                  return (
                    <li key={j.id}>
                      <button
                        type="button"
                        data-testid="work-table-row"
                        onClick={() => setOpenJob(j)}
                        className="w-full space-y-1 p-3 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold">{j.jobNo || j.internalJobNo || j.orderNo}</span>
                          {j.isUrgent && <Badge className="bg-warning text-[10px] text-warning-foreground hover:bg-warning">ด่วน</Badge>}
                          <span className={cn('ml-auto rounded-full border px-2 py-0.5 text-[10px]', WORK_STATUS_TONE[j.status])}>
                            {WORK_STATUS_LABELS[j.status]}
                          </span>
                        </div>
                        <p className="truncate text-sm font-medium">{j.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {j.customerName || 'ไม่ระบุลูกค้า'} · {categoryLabel(j.category)} · {j.assignedName || 'ยังไม่มอบหมาย'}
                        </p>
                        <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className={cn(tone === 'overdue' && 'text-destructive', tone === 'soon' && 'text-warning')}>
                            {j.dueAt ? formatThaiDate(j.dueAt) : 'ยังไม่กำหนดส่ง'}
                          </span>
                          <span>รวม {formatThb(j.orderTotal)}</span>
                          <span>คงเหลือ {formatThb(Math.max(0, j.orderTotal - j.orderDeposit))}</span>
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* จอใหญ่: ตารางเต็มรูปแบบ หัวตารางค้างบน */}
              <div className="hidden w-full lg:block">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[9%]" />
                    <col className="w-[24%] xl:w-[22%]" />
                    <col className="w-[15%]" />
                    <col className="hidden xl:table-column xl:w-[14%]" />
                    <col className="hidden 2xl:table-column 2xl:w-[12%]" />
                    <col className="w-[13%]" />
                    <col className="w-[11%]" />
                    <col className="w-[13%]" />
                  </colgroup>
                  <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">เลขงาน</th>
                      <th className="px-2 py-2 text-left font-semibold">งาน</th>
                      <th className="px-2 py-2 text-left font-semibold">ลูกค้า</th>
                      <th className="hidden px-2 py-2 text-left font-semibold xl:table-cell">หมวด/ฝ่าย</th>
                      <th className="hidden px-2 py-2 text-left font-semibold 2xl:table-cell">ผู้รับผิดชอบ</th>
                      <th className="px-2 py-2 text-left font-semibold">กำหนดส่ง</th>
                      <th className="px-2 py-2 text-right font-semibold">คงเหลือ</th>
                      <th className="px-2 py-2 text-left font-semibold">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((j) => {
                      const tone = dueTone(j.dueAt);
                      return (
                        <tr
                          key={j.id}
                          data-testid="work-table-row"
                          onClick={() => setOpenJob(j)}
                          className="cursor-pointer hover:bg-muted/40"
                        >
                          <td className="truncate px-2 py-2 text-xs font-bold">{j.jobNo || j.internalJobNo || j.orderNo}</td>
                          <td className="truncate px-2 py-2">
                            <span className="block truncate">{j.title}</span>
                            <span className="block truncate text-[11px] text-muted-foreground xl:hidden">
                              {categoryLabel(j.category)} · {deptLabel(j.dept)}
                            </span>
                          </td>
                          <td className="truncate px-2 py-2 text-muted-foreground">
                            <span className="block truncate">{j.customerName || 'ไม่ระบุลูกค้า'}</span>
                            <span className="block truncate text-[11px] 2xl:hidden">{j.assignedName || 'ยังไม่มอบหมาย'}</span>
                          </td>
                          <td className="hidden truncate px-2 py-2 text-xs text-muted-foreground xl:table-cell">{categoryLabel(j.category)} · {deptLabel(j.dept)}</td>
                          <td className="hidden truncate px-2 py-2 text-xs text-muted-foreground 2xl:table-cell">{j.assignedName || 'ยังไม่มอบหมาย'}</td>
                          <td className={cn('truncate px-2 py-2 text-xs',
                            tone === 'overdue' ? 'text-destructive' : tone === 'soon' ? 'text-warning' : 'text-muted-foreground')}>
                            {j.dueAt ? formatThaiDate(j.dueAt) : '-'}
                          </td>
                          <td className="truncate px-2 py-2 text-right text-xs">{formatThb(Math.max(0, j.orderTotal - j.orderDeposit))}</td>
                          <td className="px-2 py-2">
                            <span className={cn('inline-block max-w-full truncate rounded-full border px-2 py-0.5 text-[11px]', WORK_STATUS_TONE[j.status])}>
                              {WORK_STATUS_LABELS[j.status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-2" data-testid="work-list-view">
          {filtered.length === 0
            ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ไม่พบงานตามตัวกรอง</p>
            : filtered.map(card)}
        </div>
      )}

      {view === 'calendar' && (
        <div className="space-y-3" data-testid="work-calendar-view">
          {(() => {
            const groups = new Map<string, WorkJob[]>();
            for (const j of filtered) {
              const key = j.dueAt ? new Date(j.dueAt).toISOString().slice(0, 10) : 'no-due';
              groups.set(key, [...(groups.get(key) ?? []), j]);
            }
            const keys = [...groups.keys()].sort();
            if (keys.length === 0) return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ไม่พบงานตามตัวกรอง</p>;
            return keys.map((k) => (
              <div key={k} className="rounded-2xl border border-border p-3">
                <p className="mb-2 text-sm font-semibold">
                  {k === 'no-due' ? 'ยังไม่กำหนดวันส่ง' : new Date(`${k}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'full' })}
                  <span className="ml-2 text-xs text-muted-foreground">{groups.get(k)!.length} งาน</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{groups.get(k)!.map(card)}</div>
              </div>
            ));
          })()}
        </div>
      )}

      <JobDetailPanel job={openJob} onClose={() => setOpenJob(null)} />
    </div>
  );
}
