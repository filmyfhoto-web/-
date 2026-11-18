import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import {
  DEFAULT_QUEUE_SETTINGS,
  type JobTypeDuration,
  type QueueSettings,
} from '@/film-shop/lib/queueScheduler';

const db = supabase as any;

function mapSettings(row: any): QueueSettings {
  if (!row) return DEFAULT_QUEUE_SETTINGS;
  return {
    timezone: row.timezone ?? 'Asia/Bangkok',
    openTime: row.open_time ?? DEFAULT_QUEUE_SETTINGS.openTime,
    closeTime: row.close_time ?? DEFAULT_QUEUE_SETTINGS.closeTime,
    workingDays: Array.isArray(row.working_days) ? row.working_days.map(Number) : DEFAULT_QUEUE_SETTINGS.workingDays,
    capacity: Number(row.capacity) || 1,
    bufferMinutes: Number(row.buffer_minutes) || 0,
  };
}

/** ตั้งค่าคิวงาน — business hours, capacity and standard job durations. */
export function useQueueSettings() {
  const [settings, setSettings] = useState<QueueSettings>(DEFAULT_QUEUE_SETTINGS);
  const [durations, setDurations] = useState<JobTypeDuration[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: s }, { data: d }] = await Promise.all([
      db.from('film_queue_settings').select('*').eq('id', 'default').maybeSingle(),
      db.from('film_job_type_durations').select('*').eq('active', true).order('job_type'),
    ]);
    setSettings(mapSettings(s));
    setDurations((d ?? []).map((r: any) => ({
      jobType: r.job_type,
      label: r.label ?? r.job_type,
      setupMinutes: Number(r.setup_minutes) || 0,
      minutesPerUnit: Number(r.minutes_per_unit) || 0,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveSettings = useCallback(async (patch: Partial<QueueSettings>) => {
    const next = { ...settings, ...patch };
    const { error } = await db.from('film_queue_settings').upsert({
      id: 'default',
      timezone: next.timezone,
      open_time: next.openTime,
      close_time: next.closeTime,
      working_days: next.workingDays,
      capacity: next.capacity,
      buffer_minutes: next.bufferMinutes,
    }, { onConflict: 'id' });
    if (error) { toast.error('บันทึกตั้งค่าคิวงานไม่สำเร็จ'); return false; }
    setSettings(next);
    toast.success('บันทึกตั้งค่าคิวงานแล้ว');
    return true;
  }, [settings]);

  const saveDuration = useCallback(async (jobType: string, patch: Partial<JobTypeDuration>) => {
    const { error } = await db.from('film_job_type_durations').upsert({
      job_type: jobType,
      label: patch.label ?? jobType,
      setup_minutes: Math.max(0, Math.round(patch.setupMinutes ?? 15)),
      minutes_per_unit: Math.max(0, Number(patch.minutesPerUnit ?? 10)),
      active: true,
    }, { onConflict: 'job_type' });
    if (error) { toast.error('บันทึกเวลามาตรฐานไม่สำเร็จ'); return false; }
    await load();
    toast.success('บันทึกเวลามาตรฐานแล้ว');
    return true;
  }, [load]);

  return { settings, durations, loading, reload: load, saveSettings, saveDuration };
}
