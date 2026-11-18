import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, BellOff, CheckCheck, Clock, PlayCircle, RefreshCw, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUILD_INFO, buildLabel } from '@/lib/buildInfo';
import { supabase } from '@/integrations/supabase/client';
import { WorkcenterProvider, useWorkcenterCtx } from '@/film-shop/workcenter/components/WorkcenterProvider';
import { useOpsNotifications } from '@/film-shop/workcenter/hooks/useOpsNotifications';
import {
  BUCKET_LABELS, CONTROL_BUCKETS, NOTIFICATION_KIND_LABELS, SEVERITY_LABELS, SEVERITY_TONE,
  bucketsForJob, countBuckets, dailySummary, inQuietHours, type ControlBucket,
} from '@/film-shop/workcenter/lib/controlRoom';
import { WORK_STATUS_LABELS, formatThaiDate } from '@/film-shop/workcenter/lib/workcenter';

const db = supabase as any;

interface RunRow { id: string; kind: string; status: string; error: string | null; createdAt: string; result: Record<string, unknown> }

function ControlRoomInner() {
  const { jobs, employees, loading, reload, assignJob } = useWorkcenterCtx();
  const notif = useOpsNotifications();
  const [bucket, setBucket] = useState<ControlBucket>('act_now');
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [running, setRunning] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const bucketJobs = useMemo(
    () => jobs.map((j) => ({ job: j, buckets: bucketsForJob({ ...j, qcStatus: null, pausedAt: null }) })),
    [jobs],
  );
  const counts = useMemo(() => countBuckets(jobs.map((j) => ({ ...j, qcStatus: null, pausedAt: null }))), [jobs]);
  const summary = useMemo(() => dailySummary(jobs.map((j) => ({ ...j, estimatedMinutes: 0 })), 480), [jobs]);

  const loadRuns = useCallback(async () => {
    const { data } = await db.from('film_automation_runs').select('*').order('created_at', { ascending: false }).limit(20);
    setRuns((data ?? []).map((r: any) => ({
      id: r.id, kind: r.kind, status: r.status, error: r.error ?? null, createdAt: r.created_at, result: r.result ?? {},
    })));
  }, []);
  useEffect(() => { void loadRuns(); }, [loadRuns]);

  const runAutomation = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke('film-queue-automation', { body: {} });
      if (error) { toast.error(`รันระบบอัตโนมัติไม่สำเร็จ: ${error.message}`); return; }
      toast.success('รันตรวจกฎแจ้งเตือนแล้ว');
      await Promise.all([notif.reload(), loadRuns(), reload()]);
    } finally { setRunning(false); }
  };

  const quiet = inQuietHours(notif.prefs.quietStart, notif.prefs.quietEnd);
  const rows = bucketJobs.filter((b) => b.buckets.includes(bucket));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5" data-testid="control-room">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">ห้องควบคุมงาน</h1>
        <span className="relative inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs" data-testid="control-bell">
          {quiet ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          ค้าง {notif.unread}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { void reload(); void notif.reload(); void loadRuns(); }}>
            <RefreshCw className="mr-1 h-4 w-4" /> รีเฟรช
          </Button>
          <Button size="sm" onClick={runAutomation} disabled={running} data-testid="run-automation">
            <PlayCircle className="mr-1 h-4 w-4" /> รันระบบอัตโนมัติ
          </Button>
        </div>
      </header>

      <Card className="grid grid-cols-2 gap-2 p-3 text-sm sm:grid-cols-5">
        {([['งานวันนี้', summary.today], ['เลยกำหนด', summary.overdue], ['พรุ่งนี้', summary.tomorrow],
          ['ร้านใหญ่', summary.outsource], ['กำลังผลิตวันนี้ (นาที)', summary.capacityUsedMinutes]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border p-2">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="text-lg font-bold">{v}</p>
          </div>
        ))}
      </Card>

      <Tabs value={bucket} onValueChange={(v) => setBucket(v as ControlBucket)}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {CONTROL_BUCKETS.map((b) => (
            <TabsTrigger key={b} value={b} data-testid={`bucket-${b}`} className="rounded-full border border-border px-3 py-1.5 text-xs">
              {BUCKET_LABELS[b]} ({counts[b]})
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={bucket} className="mt-3 space-y-2">
          {loading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
          {!loading && rows.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">ไม่มีงานในช่องนี้</p>
          )}
          {rows.map(({ job }) => (
            <Card key={job.id} className="flex flex-wrap items-center gap-2 p-3 text-sm" data-testid="control-job-row">
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-bold">{job.queueCode || job.jobNo || job.orderNo}</span>
              <span className="min-w-0 flex-1 truncate">{job.title} · {job.customerName || '-'}</span>
              <Badge variant="outline" className="text-[10px]">{WORK_STATUS_LABELS[job.status]}</Badge>
              <span className="text-xs text-muted-foreground"><Clock className="mr-1 inline h-3 w-3" />{formatThaiDate(job.dueAt)}</span>
              <Select value={job.assignedEmployeeId ?? '__none__'} onValueChange={(v) => void assignJob(job, v === '__none__' ? null : v)}>
                <SelectTrigger className="h-8 w-40 text-xs" aria-label={`มอบหมาย ${job.title}`}><SelectValue placeholder="มอบหมาย" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">ยังไม่มอบหมาย</SelectItem>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                <Link to="/admin/work-docs">เปิดงาน</Link>
              </Button>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Card className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">ฟีดแจ้งเตือน (เรียลไทม์)</h2>
          <Badge variant="outline" className="text-[10px]">ยังไม่อ่าน {notif.unread}</Badge>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void notif.markAllRead()} data-testid="mark-all-read">
              <CheckCheck className="mr-1 h-4 w-4" /> อ่านทั้งหมด
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPrefsOpen((v) => !v)}>ตั้งค่าแจ้งเตือน</Button>
          </div>
        </div>

        {prefsOpen && (
          <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2" data-testid="notif-prefs">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="quiet-start">ช่วงเงียบ เริ่ม</Label>
              <Input id="quiet-start" type="time" value={notif.prefs.quietStart ?? ''}
                onChange={(e) => void notif.savePrefs({ ...notif.prefs, quietStart: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="quiet-end">ถึง</Label>
              <Input id="quiet-end" type="time" value={notif.prefs.quietEnd ?? ''}
                onChange={(e) => void notif.savePrefs({ ...notif.prefs, quietEnd: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <span className="text-xs">เสียงแจ้งเตือน</span>
              <Switch checked={notif.prefs.soundEnabled} aria-label="เสียงแจ้งเตือน"
                onCheckedChange={(v) => void notif.savePrefs({ ...notif.prefs, soundEnabled: v })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <p className="text-xs text-muted-foreground">ประเภทที่ต้องการรับ</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(NOTIFICATION_KIND_LABELS).map(([k, label]) => {
                  const on = notif.prefs.kinds[k] !== false;
                  return (
                    <Button key={k} size="sm" variant={on ? 'default' : 'outline'} className="h-7 text-xs"
                      aria-pressed={on}
                      onClick={() => void notif.savePrefs({ ...notif.prefs, kinds: { ...notif.prefs.kinds, [k]: !on } })}>
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {notif.items.length === 0
          ? <p className="text-xs text-muted-foreground">ยังไม่มีแจ้งเตือน</p>
          : notif.items.slice(0, 30).map((n) => (
            <div key={n.id} data-testid="notif-card"
              className={cn('rounded-xl border p-2.5 text-sm', SEVERITY_TONE[n.severity], !n.readAt && 'ring-1 ring-primary/30')}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">{SEVERITY_LABELS[n.severity]}</Badge>
                <span className="font-medium">{NOTIFICATION_KIND_LABELS[n.kind] ?? n.kind}</span>
                <span className="text-xs text-muted-foreground">{formatThaiDate(n.createdAt)}</span>
                {n.status !== 'new' && <Badge variant="outline" className="text-[10px]">{n.status === 'ack' ? 'รับทราบแล้ว' : n.status === 'snoozed' ? 'เลื่อนเตือน' : 'ปิดแล้ว'}</Badge>}
              </div>
              <p className="mt-0.5 text-sm">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void notif.acknowledge(n.id)}>รับทราบ</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void notif.snooze(n.id, 30)}>เลื่อน 30 นาที</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void notif.markRead(n.id)}>อ่านแล้ว</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void notif.resolve(n.id)}>ปิดเรื่อง</Button>
                <Button asChild size="sm" variant="secondary" className="h-7 text-xs"><Link to="/admin/work-docs">เปิดงานที่เกี่ยวข้อง</Link></Button>
              </div>
            </div>
          ))}
      </Card>

      <Card className="space-y-2 p-3" data-testid="automation-diagnostics">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Diagnostics — การทำงานอัตโนมัติล่าสุด</h2>
          <span className="ml-auto text-xs text-muted-foreground">{buildLabel(BUILD_INFO)}</span>
        </div>
        {runs.length === 0
          ? <p className="text-xs text-muted-foreground">ยังไม่มีบันทึกการทำงาน</p>
          : (
            <ul className="space-y-1 text-xs">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                  <Badge variant="outline" className={cn('text-[10px]', r.status !== 'ok' && 'border-destructive/50 text-destructive')}>{r.status}</Badge>
                  <span>{r.kind}</span>
                  <span className="text-muted-foreground">{formatThaiDate(r.createdAt)}</span>
                  <span className="text-muted-foreground">{JSON.stringify(r.result)}</span>
                  {r.error && <span className="text-destructive">{r.error}</span>}
                  {r.status !== 'ok' && (
                    <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={runAutomation}>ลองใหม่</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}

/** ห้องควบคุมงาน — สำหรับเจ้าของร้าน/แอดมินเท่านั้น */
export default function ControlRoom() {
  return (
    <WorkcenterProvider>
      <ControlRoomInner />
    </WorkcenterProvider>
  );
}
