import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { sortFeed, unreadCount, type FeedItem, type Severity } from '@/film-shop/workcenter/lib/controlRoom';

const db = supabase as any;

export interface OpsNotification extends FeedItem {
  title: string; body: string | null; orderId: string | null; jobId: string | null;
  dept: string | null; acknowledgedAt: string | null; escalatedAt: string | null;
}

export interface NotificationPrefs {
  kinds: Record<string, boolean>;
  channels: { in_app: boolean; line: boolean };
  quietStart: string | null;
  quietEnd: string | null;
  soundEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  kinds: {}, channels: { in_app: true, line: false }, quietStart: null, quietEnd: null, soundEnabled: true,
};

function mapRow(r: any): OpsNotification {
  return {
    id: r.id, kind: r.kind, severity: (r.severity ?? 'info') as Severity, status: r.status ?? 'new',
    title: r.title, body: r.body ?? null, orderId: r.order_id ?? null, jobId: r.job_id ?? null,
    dept: r.dept ?? null, readAt: r.read_at ?? null, snoozeUntil: r.snooze_until ?? null,
    acknowledgedAt: r.acknowledged_at ?? null, escalatedAt: r.escalated_at ?? null, createdAt: r.created_at,
  };
}

/** ฟีดแจ้งเตือนห้องควบคุมแบบเรียลไทม์ + การตั้งค่าแจ้งเตือนรายบุคคล */
export function useOpsNotifications() {
  const [items, setItems] = useState<OpsNotification[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data }, { data: user }] = await Promise.all([
      db.from('film_ops_notifications').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.auth.getUser(),
    ]);
    setItems((data ?? []).map(mapRow));
    const uid = user?.user?.id;
    if (uid) {
      const { data: p } = await db.from('film_notification_prefs').select('*').eq('user_id', uid).maybeSingle();
      if (p) {
        setPrefs({
          kinds: p.kinds ?? {}, channels: p.channels ?? DEFAULT_PREFS.channels,
          quietStart: p.quiet_start ?? null, quietEnd: p.quiet_end ?? null, soundEnabled: p.sound_enabled !== false,
        });
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = db
      .channel(`ops-notif-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'film_ops_notifications' }, () => void load())
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [load]);

  const patch = useCallback(async (id: string, values: Record<string, unknown>, optimistic: Partial<OpsNotification>) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, ...optimistic } : n)));
    const { error } = await db.from('film_ops_notifications').update(values).eq('id', id);
    if (error) { toast.error('อัปเดตแจ้งเตือนไม่สำเร็จ'); void load(); return false; }
    return true;
  }, [load]);

  const markRead = useCallback((id: string) =>
    patch(id, { read_at: new Date().toISOString() }, { readAt: new Date().toISOString() }), [patch]);

  const acknowledge = useCallback(async (id: string) => {
    const { data: u } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    return patch(id, { status: 'ack', acknowledged_at: now, acknowledged_by: u?.user?.id ?? null, read_at: now },
      { status: 'ack', acknowledgedAt: now, readAt: now });
  }, [patch]);

  const snooze = useCallback((id: string, minutes: number) => {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    return patch(id, { status: 'snoozed', snooze_until: until }, { status: 'snoozed', snoozeUntil: until });
  }, [patch]);

  const resolve = useCallback((id: string) =>
    patch(id, { status: 'resolved', read_at: new Date().toISOString() }, { status: 'resolved', readAt: new Date().toISOString() }), [patch]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    const { error } = await db.from('film_ops_notifications').update({ read_at: now }).is('read_at', null);
    if (error) { toast.error('อ่านทั้งหมดไม่สำเร็จ'); void load(); return false; }
    toast.success('ทำเครื่องหมายอ่านทั้งหมดแล้ว');
    return true;
  }, [load]);

  const savePrefs = useCallback(async (next: NotificationPrefs) => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return false;
    setPrefs(next);
    const { error } = await db.from('film_notification_prefs').upsert({
      user_id: uid, kinds: next.kinds, channels: next.channels,
      quiet_start: next.quietStart || null, quiet_end: next.quietEnd || null, sound_enabled: next.soundEnabled,
    });
    if (error) { toast.error('บันทึกการตั้งค่าแจ้งเตือนไม่สำเร็จ'); return false; }
    toast.success('บันทึกการตั้งค่าแจ้งเตือนแล้ว');
    return true;
  }, []);

  const visible = useMemo(() => sortFeed(items).filter((n) => prefs.kinds[n.kind] !== false), [items, prefs.kinds]);
  const unread = useMemo(() => unreadCount(visible), [visible]);

  return { items: visible as OpsNotification[], unread, prefs, loading, reload: load, markRead, acknowledge, snooze, resolve, markAllRead, savePrefs };
}
