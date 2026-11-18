import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RefreshCw, UserCheck, Repeat2, ArrowRight, Clock, Users, Ban, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { EmptyState, ListSkeleton } from '@/film-shop/components/common/Pieces';
import { useJobBoard, type BoardJob } from '@/film-shop/hooks/useJobBoard';
import {
  JOB_STAGES, JOB_STAGE_LABELS, JOB_STAGE_TONE, nextJobStage, type JobStage,
} from '@/film-shop/lib/jobAssignment';
import { formatBkk } from '@/film-shop/lib/queueScheduler';
import { CustomerAvatar } from '@/film-shop/components/common/CustomerAvatar';
import { useFilmCustomerProfiles } from '@/film-shop/hooks/useFilmCustomerProfiles';

const UNASSIGNED = '__none__';

/**
 * บอร์ดคิวงาน Film Shop — รับงาน → กำลังทำ → รอตรวจ → พร้อมส่ง
 * เลขคิวมาจากฐานข้อมูล (เรียงลำดับและคงอยู่) และรองรับมอบหมาย/ย้ายงานอัตโนมัติ
 */
export function JobKanbanBoard() {
  const {
    byStage, employees, workload, loading, busy,
    reload, moveStage, assign, autoAssignAll, reassign, setEmployeeAvailable, cancelJob, deleteJob,
  } = useJobBoard();
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ job: BoardJob; mode: 'cancel' | 'delete' } | null>(null);
  const allJobs = JOB_STAGES.flatMap((s) => byStage[s] ?? []);
  const custProfiles = useFilmCustomerProfiles(allJobs.map((j) => j.customerId));

  const card = (job: BoardJob) => {
    const next = nextJobStage(job.stage);
    return (
      <div
        key={job.id}
        data-testid="film-job-card"
        draggable
        onDragStart={() => setDragId(job.id)}
        onDragEnd={() => setDragId(null)}
        className={cn(
          'space-y-2 rounded-xl border border-border bg-card p-3 shadow-sm',
          dragId === job.id && 'opacity-50',
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold" data-testid="film-job-queue-no">
            คิว #{job.queueNo ?? '-'}
          </span>
          <span className="text-sm font-semibold">{job.orderNo}</span>
          {job.isUrgent && <Badge className="bg-warning text-[10px] text-warning-foreground hover:bg-warning">ด่วน</Badge>}
        </div>
        <div className="text-sm">{job.title || 'งาน'}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CustomerAvatar
            name={job.customerName || 'ไม่ระบุลูกค้า'}
            pictureUrl={job.customerId ? custProfiles[job.customerId]?.pictureUrl : null}
            className="h-7 w-7"
          />
          <span className="min-w-0 flex-1 truncate">
            {job.customerName || 'ไม่ระบุลูกค้า'} · {job.quantity} ชิ้น · {job.estimatedMinutes} นาที
          </span>
        </div>
        {job.plannedStartAt && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> {formatBkk(job.plannedStartAt)}
          </div>
        )}

        <Select
          value={job.assignedEmployeeId ?? UNASSIGNED}
          onValueChange={(v) => assign(job.id, v === UNASSIGNED ? null : v, 'มอบหมายโดยพนักงาน')}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="ผู้รับผิดชอบ">
            <SelectValue placeholder="ยังไม่มอบหมาย" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>ยังไม่มอบหมาย</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id} disabled={!e.isActive}>
                {e.name}{e.isAvailable ? '' : ' (ไม่พร้อม)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap gap-1.5">
          {next && (
            <Button size="sm" variant="secondary" className="h-7 flex-1 text-xs" onClick={() => moveStage(job, next)}>
              <ArrowRight className="mr-1 h-3 w-3" /> {JOB_STAGE_LABELS[next]}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => reassign(job)}>
            <Repeat2 className="mr-1 h-3 w-3" /> ย้ายงาน
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            data-testid="film-job-cancel"
            onClick={() => setConfirm({ job, mode: 'cancel' })}
          >
            <Ban className="mr-1 h-3 w-3" /> ยกเลิก
          </Button>
          <Button
            size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
            data-testid="film-job-delete"
            aria-label={`ลบงาน ${job.orderNo}`}
            onClick={() => setConfirm({ job, mode: 'delete' })}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  const column = (stage: JobStage) => (
    <div
      key={stage}
      data-testid={`film-job-column-${stage}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        const job = Object.values(byStage).flat().find((j) => j.id === dragId);
        if (job) void moveStage(job, stage);
        setDragId(null);
      }}
      className="flex min-h-[160px] flex-col gap-2 rounded-2xl border border-border bg-muted/30 p-2.5"
    >
      <div className={cn('flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-sm font-semibold', JOB_STAGE_TONE[stage])}>
        <span>{JOB_STAGE_LABELS[stage]}</span>
        <span>{byStage[stage].length}</span>
      </div>
      {byStage[stage].length === 0
        ? <p className="px-1 py-4 text-center text-xs text-muted-foreground">ไม่มีงาน</p>
        : byStage[stage].map(card)}
    </div>
  );

  if (loading) return <ListSkeleton />;

  return (
    <div className="space-y-4" data-testid="film-job-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          ลากการ์ดเพื่อย้ายขั้นตอน หรือกดปุ่มขั้นถัดไป — เลขคิวเรียงลำดับและบันทึกไว้ในระบบ
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => reload()}>
            <RefreshCw className="mr-1 h-4 w-4" /> รีเฟรช
          </Button>
          <Button size="sm" disabled={busy} onClick={() => autoAssignAll()} data-testid="film-auto-assign">
            <UserCheck className="mr-1 h-4 w-4" /> มอบหมายอัตโนมัติ
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {JOB_STAGES.map(column)}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.mode === 'delete' ? 'ลบงานถาวร?' : 'ยกเลิกงานนี้?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.mode === 'delete'
                ? `งาน ${confirm?.job.orderNo} จะถูกลบออกจากระบบและกู้คืนไม่ได้`
                : `งาน ${confirm?.job.orderNo} จะถูกทำเครื่องหมายยกเลิกและหายออกจากบอร์ด`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ปิด</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                void (confirm.mode === 'delete' ? deleteJob(confirm.job) : cancelJob(confirm.job));
                setConfirm(null);
              }}
            >
              {confirm?.mode === 'delete' ? 'ลบถาวร' : 'ยกเลิกงาน'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-2xl border border-border bg-card p-3">
        <h3 className="mb-2 text-sm font-semibold">พนักงานและภาระงาน</h3>
        {employees.length === 0 ? (
          <EmptyState icon={Users} title="ยังไม่มีข้อมูลพนักงาน — เพิ่มพนักงานในหน้าข้อมูลพนักงานก่อน" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">ภาระงาน {workload[e.id] ?? 0} นาที</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{e.isAvailable ? 'พร้อม' : 'ไม่พร้อม'}</span>
                  <Switch
                    checked={e.isAvailable}
                    aria-label={`สถานะพร้อมรับงานของ ${e.name}`}
                    onCheckedChange={(v) => setEmployeeAvailable(e.id, v)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
