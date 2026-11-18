import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowRight, BellRing, CheckCircle2, ExternalLink, Pencil, Printer, Save, Store, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/film-shop/hooks/useUserRole';
import { useWorkcenterCtx } from '@/film-shop/workcenter/components/WorkcenterProvider';
import type { JobHistoryRow, WorkJob } from '@/film-shop/workcenter/hooks/useWorkcenter';
import {
  WORK_DEPTS, SIMPLE_WORK_STATUSES, WORK_STATUS_LABELS, WORK_STATUS_TONE,
  canDeliverOrder, categoryLabel, deliverBlockReason, deptLabel, formatThaiDate, formatThb,
  missingFieldsForStatus, nextWorkStatus, type WorkStatus,
} from '@/film-shop/workcenter/lib/workcenter';
import { buildDeptDoc, buildInspectionDoc, buildIntakeDoc, printInternalDoc } from '@/film-shop/workcenter/lib/docs';

const NONE = '__none__';

function toLocalInput(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** แผงรายละเอียดงาน — drawer เดสก์ท็อป / full-screen sheet บนมือถือ */
export function JobDetailPanel({ job, onClose }: { job: WorkJob | null; onClose: () => void }) {
  const {
    jobs, employees, setJobStatus, assignJob, updateJob, loadJobHistory,
    notifyReady, closeOrder, sendToOutsource,
  } = useWorkcenterCtx();
  const { isAdmin } = useUserRole();
  const [history, setHistory] = useState<JobHistoryRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', size: '', quantity: '1', unit: 'ชิ้น', notes: '', dueAt: '', dept: '' });

  const live = useMemo(() => (job ? jobs.find((j) => j.id === job.id) ?? job : null), [jobs, job]);
  const siblings = useMemo(() => (live ? jobs.filter((j) => j.orderId === live.orderId) : []), [jobs, live]);
  const next = live ? nextWorkStatus(live.status, live.isOutsourced, live.category) : null;
  const blockReason = deliverBlockReason(siblings);

  useEffect(() => {
    if (!job) { setHistory([]); return; }
    setEditing(false);
    void loadJobHistory(job.id).then(setHistory);
  }, [job, loadJobHistory]);

  useEffect(() => {
    if (!live) return;
    setForm({
      title: live.title ?? '',
      size: live.size ?? '',
      quantity: String(live.quantity ?? 1),
      unit: live.unit ?? 'ชิ้น',
      notes: live.notes ?? '',
      dueAt: toLocalInput(live.dueAt),
      dept: live.dept ?? '',
    });
  }, [live]);

  const header = live
    ? { docNo: live.internalJobNo, customerName: live.customerName, customerPhone: live.customerPhone, orderNo: live.orderNo, dueAt: live.dueAt }
    : null;

  const goNext = async () => {
    if (!live || !next) return;
    const miss = missingFieldsForStatus(live, next);
    if (miss.length) { toast.error(`ยังกรอกข้อมูลไม่ครบ: ${miss.join(', ')}`); return; }
    await setJobStatus(live, next, `เปลี่ยนเป็น ${WORK_STATUS_LABELS[next]}`);
    setHistory(await loadJobHistory(live.id));
  };

  return (
    <Sheet open={!!job} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        data-testid="work-job-panel"
        className="flex h-full w-full flex-col gap-3 overflow-y-auto p-4 sm:max-w-xl"
      >
        {live && (
          <>
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-bold">
                  {live.jobNo || live.internalJobNo || live.orderNo}
                </span>
                <span className="truncate">{live.title}</span>
                <Badge variant="outline" className={cn('text-[11px]', WORK_STATUS_TONE[live.status])}>
                  {WORK_STATUS_LABELS[live.status]}
                </Badge>
                {live.isUrgent && <Badge className="bg-warning text-[10px] text-warning-foreground hover:bg-warning">ด่วน</Badge>}
                {live.isOutsourced && <Badge variant="outline" className="text-[10px]"><Store className="mr-0.5 h-3 w-3" />ร้านใหญ่</Badge>}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                ลูกค้า {live.customerName || '-'} · ออเดอร์ {live.orderNo} · งานย่อย {siblings.length} รายการ
              </p>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)} data-testid="wj-edit">
                {editing ? <X className="mr-1 h-4 w-4" /> : <Pencil className="mr-1 h-4 w-4" />}
                {editing ? 'ยกเลิกแก้ไข' : 'แก้ไข'}
              </Button>
              {next && (
                <Button size="sm" onClick={goNext} data-testid="wj-next">
                  <ArrowRight className="mr-1 h-4 w-4" /> {WORK_STATUS_LABELS[next]}
                </Button>
              )}
              {!live.isOutsourced && (
                <Button size="sm" variant="outline" onClick={() => void sendToOutsource(live)} data-testid="wj-outsource">
                  <Store className="mr-1 h-4 w-4" /> ส่งร้านใหญ่
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                data-testid="wj-print"
                onClick={() => header && printInternalDoc(buildDeptDoc(header, deptLabel(live.dept), siblings.filter((s) => s.dept === live.dept)))}
              >
                <Printer className="mr-1 h-4 w-4" /> พิมพ์ใบงาน
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="wj-notify"
                title={blockReason ?? 'แจ้งลูกค้าว่างานพร้อมรับ'}
                onClick={() => void notifyReady(live.orderId)}
              >
                <BellRing className="mr-1 h-4 w-4" /> แจ้งพร้อมรับ
              </Button>
              <Button
                size="sm"
                variant="secondary"
                data-testid="wj-close"
                disabled={!canDeliverOrder(siblings)}
                title={blockReason ?? 'ปิดงานและส่งมอบ'}
                onClick={() => void closeOrder(live.orderId).then((ok) => { if (ok) onClose(); })}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" /> ปิดงาน
              </Button>
            </div>
            {blockReason && (
              <p className="rounded-lg bg-warning/10 px-2 py-1 text-xs text-warning-foreground/90" data-testid="wj-block">
                {blockReason}
              </p>
            )}

            <Tabs defaultValue="overview" className="min-w-0">
              <TabsList className="grid w-full grid-cols-5 text-[11px]">
                <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
                <TabsTrigger value="items">รายการย่อย</TabsTrigger>
                <TabsTrigger value="files">ไฟล์งาน</TabsTrigger>
                <TabsTrigger value="history">ประวัติ</TabsTrigger>
                <TabsTrigger value="money">การเงิน</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-3 space-y-3 text-sm">
                {editing ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor="wj-title">ชื่องาน</Label>
                      <Input id="wj-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor="wj-size">ขนาด</Label>
                        <Input id="wj-size" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor="wj-qty">จำนวน</Label>
                        <Input id="wj-qty" type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor="wj-due">กำหนดส่ง</Label>
                        <Input id="wj-due" type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">ฝ่ายผลิต</Label>
                        <Select value={form.dept || NONE} onValueChange={(v) => setForm({ ...form, dept: v === NONE ? '' : v })}>
                          <SelectTrigger aria-label="ฝ่ายผลิต"><SelectValue placeholder="เลือกฝ่าย" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>ยังไม่ระบุ</SelectItem>
                            {WORK_DEPTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor="wj-notes">หมายเหตุ</Label>
                      <Textarea id="wj-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                    <Button
                      size="sm"
                      data-testid="wj-save"
                      onClick={async () => {
                        if (!form.title.trim()) { toast.error('ยังกรอกข้อมูลไม่ครบ: ชื่องาน'); return; }
                        const ok = await updateJob(live, {
                          title: form.title.trim(),
                          size: form.size || null,
                          quantity: Number(form.quantity) || 1,
                          unit: form.unit || 'ชิ้น',
                          notes: form.notes || null,
                          dept: form.dept || null,
                          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
                        });
                        if (ok) setEditing(false);
                      }}
                    >
                      <Save className="mr-1 h-4 w-4" /> บันทึก
                    </Button>
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-2">
                    <div><dt className="text-xs text-muted-foreground">หมวดงาน</dt><dd>{categoryLabel(live.category)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">ฝ่ายผลิต</dt><dd>{deptLabel(live.dept)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">ขนาด</dt><dd>{live.size || '-'}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">จำนวน</dt><dd>{live.quantity} {live.unit || ''}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">กำหนดส่ง</dt><dd>{formatThaiDate(live.dueAt)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">เบอร์ลูกค้า</dt><dd>{live.customerPhone || '-'}</dd></div>
                    <div className="col-span-2"><dt className="text-xs text-muted-foreground">หมายเหตุ</dt><dd className="whitespace-pre-wrap">{live.notes || '-'}</dd></div>
                  </dl>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">มอบหมายให้</Label>
                    <Select
                      value={live.assignedEmployeeId ?? NONE}
                      onValueChange={(v) => void assignJob(live, v === NONE ? null : v)}
                    >
                      <SelectTrigger aria-label="มอบหมายผู้รับผิดชอบ" data-testid="wj-assign"><SelectValue placeholder="ยังไม่มอบหมาย" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>ยังไม่มอบหมาย</SelectItem>
                        {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">เปลี่ยนสถานะ</Label>
                    <Select
                      value={live.status}
                      onValueChange={async (v) => {
                        await setJobStatus(live, v as WorkStatus, 'เปลี่ยนสถานะจากแผงรายละเอียด');
                        setHistory(await loadJobHistory(live.id));
                      }}
                    >
                      <SelectTrigger aria-label="เปลี่ยนสถานะงาน" data-testid="work-status-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SIMPLE_WORK_STATUSES.map((s) => <SelectItem key={s} value={s}>{WORK_STATUS_LABELS[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="items" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">งานย่อยทั้งหมดของออเดอร์นี้ ({siblings.length})</p>
                <ul className="space-y-1">
                  {siblings.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5 text-xs">
                      <span className="min-w-0 truncate">{s.title} · {categoryLabel(s.category)} · {deptLabel(s.dept)}</span>
                      <Badge variant="outline" className={cn('shrink-0 text-[10px]', WORK_STATUS_TONE[s.status])}>
                        {WORK_STATUS_LABELS[s.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => header && printInternalDoc(buildIntakeDoc(header, siblings))}
                >
                  <Printer className="mr-1 h-4 w-4" /> ใบรับงานภายใน
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-2"
                  onClick={() => header && printInternalDoc(buildInspectionDoc(header, siblings))}
                >
                  <Printer className="mr-1 h-4 w-4" /> ใบตรวจรับงาน
                </Button>
              </TabsContent>

              <TabsContent value="files" className="mt-3 space-y-2 text-sm">
                {live.attachments.length === 0
                  ? <p className="text-xs text-muted-foreground">ยังไม่มีไฟล์งานแนบมากับงานนี้</p>
                  : (
                    <ul className="space-y-1">
                      {live.attachments.map((a, i) => (
                        <li key={`${a.url}-${i}`}>
                          <a
                            className="inline-flex items-center gap-1 text-primary underline"
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> {a.name || `ไฟล์ ${i + 1}`}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
              </TabsContent>

              <TabsContent value="history" className="mt-3 space-y-1 text-xs">
                {history.length === 0
                  ? <p className="text-muted-foreground">ยังไม่มีประวัติสถานะ</p>
                  : history.map((h) => (
                    <div key={h.id} className="rounded-lg border border-border px-2 py-1.5">
                      <p className="font-medium">
                        {h.fromStatus ? `${WORK_STATUS_LABELS[h.fromStatus as WorkStatus] ?? h.fromStatus} → ` : ''}
                        {h.toStatus ? (WORK_STATUS_LABELS[h.toStatus as WorkStatus] ?? h.toStatus) : h.action}
                      </p>
                      <p className="text-muted-foreground">{formatThaiDate(h.createdAt)}{h.note ? ` · ${h.note}` : ''}</p>
                    </div>
                  ))}
              </TabsContent>

              <TabsContent value="money" className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">ยอดรวมออเดอร์</span><b>{formatThb(live.orderTotal)}</b></div>
                <div className="flex justify-between"><span className="text-muted-foreground">มัดจำ</span><b>{formatThb(live.orderDeposit)}</b></div>
                <div className="flex justify-between"><span className="text-muted-foreground">คงเหลือ</span><b>{formatThb(Math.max(0, live.orderTotal - live.orderDeposit))}</b></div>
                <div className="flex justify-between"><span className="text-muted-foreground">สถานะชำระเงิน</span><b>{live.paymentStatus || '-'}</b></div>
                {isAdmin ? (
                  <div className="flex justify-between"><span className="text-muted-foreground">ราคาทุนงานนี้</span><b>{formatThb(live.costPrice * live.quantity)}</b></div>
                ) : (
                  <p className="text-xs text-muted-foreground">คุณไม่มีสิทธิ์ดูข้อมูลราคาทุน</p>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
