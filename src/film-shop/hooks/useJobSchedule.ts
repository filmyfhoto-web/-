import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { useQueueSettings } from '@/film-shop/hooks/useQueueSettings';
import {
  estimateMinutes,
  scheduleQueue,
  type SchedulableJob,
} from '@/film-shop/lib/queueScheduler';

const db = supabase as any;

export interface QueueJobRow {
  id: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  title: string;
  status: string;
  jobType: string | null;
  quantity: number;
  estimatedMinutes: number;
  plannedStartAt: string | null;
  plannedFinishAt: string | null;
  priority: number;
  scheduleLocked: boolean;
  isUrgent: boolean;
  dueAt: string | null;
  receivedAt: string | null;
}

/**
 * Loads every open queue job with its order context, keeps estimated
 * durations in sync with the standard times, and re-plans start/finish
 * times whenever jobs, urgency, status, quantity or settings change.
 */
export function useJobSchedule() {
  const { settings, durations, loading: settingsLoading } = useQueueSettings();
  const [rows, setRows] = useState<QueueJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await db
      .from('film_order_jobs')
      .select('*, film_orders!inner(id,order_no,customer_name,is_urgent,due_at,created_at,is_draft)')
      .neq('status', 'delivered')
      .order('sort_order', { ascending: true });
    setRows((data ?? [])
      .filter((r: any) => r.film_orders && !r.film_orders.is_draft)
      .map((r: any): QueueJobRow => ({
        id: r.id,
        orderId: r.order_id,
        orderNo: r.film_orders?.order_no ?? '',
        customerName: r.film_orders?.customer_name ?? '',
        title: r.title ?? '',
        status: r.status,
        jobType: r.job_type ?? null,
        quantity: Number(r.quantity) || 1,
        estimatedMinutes: Number(r.estimated_minutes) || 0,
        plannedStartAt: r.planned_start_at ?? null,
        plannedFinishAt: r.planned_finish_at ?? null,
        priority: Number(r.priority) || 100,
        scheduleLocked: !!r.schedule_locked,
        isUrgent: !!r.film_orders?.is_urgent,
        dueAt: r.film_orders?.due_at ?? null,
        receivedAt: r.film_orders?.created_at ?? null,
      })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = db
      .channel(`film-queue-schedule-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_order_jobs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_orders' }, () => load())
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [load]);

  /** Planned windows for the current rows (client-side preview). */
  const plan = useMemo(() => {
    const jobs: SchedulableJob[] = rows.map((r) => ({
      id: r.id,
      priority: r.priority,
      isUrgent: r.isUrgent,
      estimatedMinutes: r.estimatedMinutes || estimateMinutes(r.jobType, r.quantity, durations),
      scheduleLocked: r.scheduleLocked,
      plannedStartAt: r.plannedStartAt,
      plannedFinishAt: r.plannedFinishAt,
    }));
    return scheduleQueue(jobs, settings, new Date());
  }, [rows, durations, settings]);

  /** Persist the recalculated plan (skips locked jobs). */
  const recalculate = useCallback(async () => {
    if (settingsLoading || rows.length === 0) return;
    setSaving(true);
    try {
      for (const r of rows) {
        const slot = plan[r.id];
        if (!slot || slot.locked) continue;
        const est = r.estimatedMinutes || estimateMinutes(r.jobType, r.quantity, durations);
        const startIso = slot.start.toISOString();
        const finishIso = slot.finish.toISOString();
        if (r.plannedStartAt === startIso && r.plannedFinishAt === finishIso && r.estimatedMinutes === est) continue;
        await db.from('film_order_jobs').update({
          estimated_minutes: est,
          planned_start_at: startIso,
          planned_finish_at: finishIso,
        }).eq('id', r.id);
      }
      await load();
    } finally {
      setSaving(false);
    }
  }, [rows, plan, durations, settingsLoading, load]);

  const logHistory = useCallback(async (row: QueueJobRow, field: string, oldV: string | null, newV: string | null, reason?: string) => {
    const { data: auth } = await db.auth.getUser();
    await db.from('film_job_schedule_history').insert({
      order_job_id: row.id,
      order_id: row.orderId,
      field,
      old_value: oldV,
      new_value: newV,
      reason: reason || null,
      changed_by: auth?.user?.id ?? null,
    });
  }, []);

  /** Staff override of the planned window (implies locking the job). */
  const setJobTimes = useCallback(async (row: QueueJobRow, start: Date, finish: Date, reason?: string) => {
    const { error } = await db.from('film_order_jobs').update({
      planned_start_at: start.toISOString(),
      planned_finish_at: finish.toISOString(),
      schedule_locked: true,
    }).eq('id', row.id);
    if (error) { toast.error('บันทึกเวลาไม่สำเร็จ'); return false; }
    await logHistory(row, 'planned_window', `${row.plannedStartAt ?? '-'} → ${row.plannedFinishAt ?? '-'}`,
      `${start.toISOString()} → ${finish.toISOString()}`, reason);
    toast.success('บันทึกเวลาและล็อกคิวแล้ว');
    await load();
    return true;
  }, [load, logHistory]);

  const setLocked = useCallback(async (row: QueueJobRow, locked: boolean, reason?: string) => {
    const { error } = await db.from('film_order_jobs').update({ schedule_locked: locked }).eq('id', row.id);
    if (error) { toast.error('ล็อกคิวไม่สำเร็จ'); return false; }
    await logHistory(row, 'schedule_locked', String(row.scheduleLocked), String(locked), reason);
    await load();
    return true;
  }, [load, logHistory]);

  const fetchHistory = useCallback(async (jobId: string) => {
    const { data } = await db.from('film_job_schedule_history')
      .select('*').eq('order_job_id', jobId).order('created_at', { ascending: false }).limit(50);
    return data ?? [];
  }, []);

  const byOrder = useMemo(() => {
    const m: Record<string, QueueJobRow[]> = {};
    for (const r of rows) (m[r.orderId] ||= []).push(r);
    return m;
  }, [rows]);

  return { rows, byOrder, plan, settings, durations, loading: loading || settingsLoading, saving, reload: load, recalculate, setJobTimes, setLocked, fetchHistory };
}
