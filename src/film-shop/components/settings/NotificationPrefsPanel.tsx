import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, RotateCcw, Save, Search, MoonStar } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { PushEnableButton } from '@/film-shop/components/notifications/PushEnableButton';
import { NotifyEnableButton } from '@/film-shop/components/notifications/NotifyEnableButton';
import {
  CHANNEL_LABELS,
  NOTIFY_GROUP_LABELS,
  NOTIFY_KINDS,
  kindChannels,
  kindEnabled,
  type NotifyChannel,
  type PerKindChannels,
} from '@/film-shop/lib/notificationKinds';

const db = supabase as any;
const CHANNELS: NotifyChannel[] = ['in_app', 'sound', 'push', 'line'];

type Prefs = {
  kinds: Record<string, boolean>;
  master: Record<NotifyChannel, boolean>;
  perKind: PerKindChannels;
  quietStart: string;
  quietEnd: string;
  soundEnabled: boolean;
};

const DEFAULTS: Prefs = {
  kinds: {},
  master: { in_app: true, sound: true, push: true, line: false },
  perKind: {},
  quietStart: '',
  quietEnd: '',
  soundEnabled: true,
};

/** หน้าตั้งค่าแจ้งเตือนรายบุคคล — เลือกประเภทและช่องทางได้ละเอียดต่อประเภท */
export function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) { setLoading(false); return; }
      const { data } = await db.from('film_notification_prefs').select('*').eq('user_id', uid).maybeSingle();
      if (data) {
        const ch = (data.channels ?? {}) as Record<string, unknown>;
        setPrefs({
          kinds: (data.kinds ?? {}) as Record<string, boolean>,
          master: {
            in_app: ch.in_app !== false,
            sound: ch.sound !== false,
            push: ch.push !== false,
            line: ch.line === true,
          },
          perKind: (ch.per_kind ?? {}) as PerKindChannels,
          quietStart: (data.quiet_start ?? '').slice(0, 5),
          quietEnd: (data.quiet_end ?? '').slice(0, 5),
          soundEnabled: data.sound_enabled !== false,
        });
      }
      setLoading(false);
    })();
  }, []);

  const update = useCallback((fn: (p: Prefs) => Prefs) => {
    setPrefs((prev) => fn(prev));
    setDirty(true);
  }, []);

  const save = async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) { toast.error('ต้องเข้าสู่ระบบก่อนบันทึกการตั้งค่า'); return; }
    setSaving(true);
    const { error } = await db.from('film_notification_prefs').upsert({
      user_id: uid,
      kinds: prefs.kinds,
      channels: { ...prefs.master, per_kind: prefs.perKind },
      quiet_start: prefs.quietStart || null,
      quiet_end: prefs.quietEnd || null,
      sound_enabled: prefs.soundEnabled,
    });
    setSaving(false);
    if (error) { toast.error('บันทึกไม่สำเร็จ'); return; }
    setDirty(false);
    toast.success('บันทึกการตั้งค่าแจ้งเตือนแล้ว');
  };

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? NOTIFY_KINDS.filter((k) => `${k.label} ${k.desc}`.toLowerCase().includes(needle))
      : NOTIFY_KINDS;
    return (Object.keys(NOTIFY_GROUP_LABELS) as (keyof typeof NOTIFY_GROUP_LABELS)[])
      .map((g) => ({ group: g, items: list.filter((k) => k.group === g) }))
      .filter((g) => g.items.length > 0);
  }, [q]);

  const onCount = NOTIFY_KINDS.filter((k) => kindEnabled(prefs.kinds, k.id)).length;

  const setAll = (on: boolean) =>
    update((p) => ({ ...p, kinds: Object.fromEntries(NOTIFY_KINDS.map((k) => [k.id, on])) }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดการตั้งค่า…
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="notify-prefs-panel">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="h-4 w-4 text-primary" /> ตั้งค่าการแจ้งเตือน
              </CardTitle>
              <CardDescription>
                เลือกได้ว่าจะรับแจ้งเตือนประเภทใด และรับผ่านช่องทางไหนบ้าง
              </CardDescription>
            </div>
            <Badge variant="secondary" className="shrink-0">เปิดอยู่ {onCount}/{NOTIFY_KINDS.length} ประเภท</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <NotifyEnableButton className="h-9 rounded-xl text-xs font-semibold" />
            <PushEnableButton className="h-9 rounded-xl text-xs font-semibold" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CHANNELS.map((c) => (
              <label
                key={c}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium">{CHANNEL_LABELS[c]}</span>
                <Switch
                  checked={prefs.master[c]}
                  onCheckedChange={(v) => update((p) => ({
                    ...p,
                    master: { ...p.master, [c]: v },
                    soundEnabled: c === 'sound' ? v : p.soundEnabled,
                  }))}
                  aria-label={`เปิด/ปิดช่องทาง ${CHANNEL_LABELS[c]}`}
                />
              </label>
            ))}
          </div>

          <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
            <p className="flex items-center gap-2 text-sm font-medium">
              <MoonStar className="h-4 w-4 text-primary" /> ห้ามรบกวน
            </p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">เริ่ม</Label>
              <Input
                type="time"
                value={prefs.quietStart}
                onChange={(e) => update((p) => ({ ...p, quietStart: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">สิ้นสุด</Label>
              <Input
                type="time"
                value={prefs.quietEnd}
                onChange={(e) => update((p) => ({ ...p, quietEnd: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">ประเภทการแจ้งเตือน</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAll(true)}>เปิดทั้งหมด</Button>
              <Button size="sm" variant="outline" onClick={() => setAll(false)}>ปิดทั้งหมด</Button>
              <Button size="sm" variant="ghost" onClick={() => { setPrefs(DEFAULTS); setDirty(true); }}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> ค่าเริ่มต้น
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="ค้นหาประเภทแจ้งเตือน…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {groups.map(({ group, items }) => (
            <section key={group} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {NOTIFY_GROUP_LABELS[group]}
              </p>
              <ul className="space-y-2">
                {items.map((k) => {
                  const on = kindEnabled(prefs.kinds, k.id);
                  const chans = kindChannels(prefs.perKind, k.id);
                  return (
                    <li key={k.id} className="rounded-xl border bg-card p-3" data-testid={`notify-kind-${k.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{k.label}</p>
                          <p className="text-xs text-muted-foreground">{k.desc}</p>
                        </div>
                        <Switch
                          checked={on}
                          onCheckedChange={(v) => update((p) => ({ ...p, kinds: { ...p.kinds, [k.id]: v } }))}
                          aria-label={`เปิด/ปิด ${k.label}`}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {CHANNELS.map((c) => {
                          const active = on && prefs.master[c] && chans[c];
                          const blocked = !on || !prefs.master[c];
                          return (
                            <button
                              key={c}
                              type="button"
                              disabled={blocked}
                              onClick={() => update((p) => ({
                                ...p,
                                perKind: { ...p.perKind, [k.id]: { ...kindChannels(p.perKind, k.id), [c]: !chans[c] } },
                              }))}
                              className={[
                                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                                active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
                                blocked ? 'opacity-50' : 'hover:border-primary/60',
                              ].join(' ')}
                            >
                              {CHANNEL_LABELS[c]}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </CardContent>
      </Card>

      <div className="sticky bottom-3 z-10 flex justify-end">
        <Button onClick={() => void save()} disabled={saving || !dirty} data-testid="notify-prefs-save" className="shadow-lg">
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          {dirty ? 'บันทึกการตั้งค่า' : 'บันทึกแล้ว'}
        </Button>
      </div>
    </div>
  );
}

export default NotificationPrefsPanel;
