import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { reportChannelStatus, unregisterChannel, onGlobalRefresh, getRealtimeState, markSynced } from '@/film-shop/lib/realtimeStatus';
import {
  autoAssignJobs,
  pickReassignee,
  workloadByEmployee,
  isJobStage,
  type AssignableEmployee,
  type AssignableJob,
  type JobStage,
} from '@/film-shop/lib/jobAssignment';

const db = supabase as any;

export interface BoardJob extends AssignableJob {
  queueNo: number | null;
  orderId: string;
  orderNo: string;
  customerName: string;
  customerId: string | null;
  title: string;
  quantity: number;
  isUrgent: boolean;
  dueAt: string | null;
  assignedName: string | null;
  plannedStartAt: string | null;
}

/** โหลดงานทั้งหมดของบอร์ดคิว + พนักงาน และจัดการย้ายขั้น/มอบหมายงาน */
export function useJobBoard() {
  const [jobs, setJobs] = useState<BoardJob[]>([]);
  const [employees, setEmployees] = useState<AssignableEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: rows }, { data: emp }] = await Promise.all([
      db
        .from('film_order_jobs')
        .select('*, film_orders!inner(id,order_no,customer_name,customer_id,is_urgent,due_at,is_draft), film_employees(id,name)')
        .order('queue_no', { ascending: true }),
      db.from('film_employees').select('id,name,is_active,is_available,job_types').order('name'),
    ]);
    setEmployees(
      (emp ?? []).map((e: any): AssignableEmployee => ({
        id: e.id,
        name: e.name ?? '',
        isActive: e.is_active !== false,
        isAvailable: e.is_available !== false,
        jobTypes: Array.isArray(e.job_types) ? e.job_types : [],
      })),
    );
    setJobs(
      (rows ?? [])
        .filter((r: any) => r.film_orders && !r.film_orders.is_draft && r.status !== 'cancelled')
        .map((r: any): BoardJob => ({
          id: r.id,
          queueNo: r.queue_no ?? null,
          orderId: r.order_id,
          orderNo: r.film_orders?.order_no ?? '',
          customerName: r.film_orders?.customer_name ?? '',
          customerId: r.film_orders?.customer_id ?? null,
          title: r.title ?? '',
          jobType: r.job_type ?? null,
          quantity: Number(r.quantity) || 1,
          estimatedMinutes: Number(r.estimated_minutes) || 0,
          stage: isJobStage(r.stage) ? (r.stage as JobStage) : 'intake',
          assignedEmployeeId: r.assigned_employee_id ?? null,
          assignedName: r.film_employees?.name ?? null,
          isUrgent: !!r.film_orders?.is_urgent,
          dueAt: r.film_orders?.due_at ?? null,
          plannedStartAt: r.planned_start_at ?? null,
        })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channelName = `film-job-board-${Math.random().toString(36).slice(2, 8)}`;
    const ch = db
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_order_jobs' }, () => load())
      .subscribe((status: string) => reportChannelStatus(channelName, status));
    const offGlobal = onGlobalRefresh(() => { void load(); });
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    const poll = window.setInterval(() => {
      if (getRealtimeState() !== 'connected') void load();
    }, 30000);
    return () => {
      offGlobal();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.clearInterval(poll);
      unregisterChannel(channelName);
      db.removeChannel(ch);
    };
  }, [load]);

  const byStage = useMemo(() => {
    const m: Record<JobStage, BoardJob[]> = { intake: [], doing: [], review: [], ready: [] };
    const sorted = [...jobs].sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      return (a.queueNo ?? 0) - (b.queueNo ?? 0);
    });
    for (const j of sorted) m[j.stage].push(j);
    return m;
  }, [jobs]);

  const workload = useMemo(() => workloadByEmployee(jobs), [jobs]);

  const moveStage = useCallback(async (job: BoardJob, stage: JobStage) => {
    if (job.stage === stage) return;
    const { error } = await db.from('film_order_jobs').update({ stage }).eq('id', job.id);
    if (error) { toast.error('ย้ายขั้นตอนไม่สำเร็จ'); return; }
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, stage } : j)));
    void load();
  }, [load]);

  const assign = useCallback(async (jobId: string, employeeId: string | null, reason?: string) => {
    const { error } = await db.from('film_order_jobs').update({
      assigned_employee_id: employeeId,
      assigned_at: employeeId ? new Date().toISOString() : null,
      assign_reason: reason ?? null,
    }).eq('id', jobId);
    if (error) { toast.error('มอบหมายงานไม่สำเร็จ'); return false; }
    await load();
    return true;
  }, [load]);

  /** มอบหมายงานที่ยังไม่มีเจ้าของทั้งหมดอัตโนมัติ */
  const autoAssignAll = useCallback(async () => {
    setBusy(true);
    try {
      const plan = autoAssignJobs(jobs, employees);
      if (plan.length === 0) { toast.info('ไม่มีงานที่รอมอบหมาย หรือไม่มีพนักงานที่ว่าง'); return; }
      for (const p of plan) {
        await db.from('film_order_jobs').update({
          assigned_employee_id: p.employeeId,
          assigned_at: new Date().toISOString(),
          assign_reason: 'มอบหมายอัตโนมัติ (ภาระงานต่ำสุด)',
        }).eq('id', p.jobId);
      }
      toast.success(`มอบหมายงานอัตโนมัติ ${plan.length} งาน`);
      await load();
    } finally { setBusy(false); }
  }, [jobs, employees, load]);

  /** ย้ายงานให้พนักงานคนอื่นเมื่อคนเดิมไม่พร้อม */
  const reassign = useCallback(async (job: BoardJob, reason = 'พนักงานไม่พร้อม') => {
    const pick = pickReassignee(job, employees, jobs);
    if (!pick) { toast.error('ไม่มีพนักงานคนอื่นที่ว่างรับงานนี้'); return false; }
    const ok = await assign(job.id, pick.id, reason);
    if (ok) toast.success(`ย้ายงานให้ ${pick.name} แล้ว`);
    return ok;
  }, [employees, jobs, assign]);

  const setEmployeeAvailable = useCallback(async (employeeId: string, available: boolean) => {
    const { error } = await db.from('film_employees').update({ is_available: available }).eq('id', employeeId);
    if (error) { toast.error('อัปเดตสถานะพนักงานไม่สำเร็จ'); return; }
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, isAvailable: available } : e)));
    if (!available) {
      const mine = jobs.filter((j) => j.assignedEmployeeId === employeeId && j.stage !== 'ready');
      for (const j of mine) await reassign(j, 'พนักงานแจ้งไม่พร้อม');
    }
    await load();
  }, [jobs, reassign, load]);

  /** ยกเลิกงาน (เก็บประวัติไว้ในฐานข้อมูล) */
  const cancelJob = useCallback(async (job: BoardJob, reason = 'ยกเลิกโดยพนักงาน') => {
    const { error } = await db.from('film_order_jobs')
      .update({ status: 'cancelled', pause_reason: reason })
      .eq('id', job.id);
    if (error) { toast.error('ยกเลิกงานไม่สำเร็จ'); return false; }
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
    toast.success(`ยกเลิกงาน ${job.orderNo} แล้ว`);
    void load();
    return true;
  }, [load]);

  /** ลบงานออกจากระบบถาวร */
  const deleteJob = useCallback(async (job: BoardJob) => {
    const { error } = await db.from('film_order_jobs').delete().eq('id', job.id);
    if (error) { toast.error('ลบงานไม่สำเร็จ'); return false; }
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
    toast.success(`ลบงาน ${job.orderNo} แล้ว`);
    void load();
    return true;
  }, [load]);

  return { jobs, byStage, employees, workload, loading, busy, reload: load, moveStage, assign, autoAssignAll, reassign, setEmployeeAvailable, cancelJob, deleteJob };
}
