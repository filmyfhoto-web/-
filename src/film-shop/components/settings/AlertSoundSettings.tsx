import { useEffect, useState } from 'react';
import { Bell, Bot, ShoppingCart, Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  DEFAULT_ALERT_SOUND_SETTINGS,
  TONE_PRESETS,
  loadAlertSoundSettings,
  saveAlertSoundSettings,
  type AlertSoundSettings as Settings,
  type GroupSoundConfig,
} from '@/film-shop/lib/alertSoundSettings';
import { playTone, primeNotificationSound } from '@/film-shop/lib/notifySound';
import { logFsActivity } from '@/film-shop/lib/fsActivityLog';
import { FsActivityLogCard } from './FsActivityLogCard';

function GroupCard({
  title,
  desc,
  icon,
  value,
  onChange,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  value: GroupSoundConfig;
  onChange: (next: GroupSoundConfig) => void;
}) {
  const preview = () => {
    primeNotificationSound();
    playTone(value.frequency, value.durationMs, value.volume * 0.3);
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-primary">{icon}</span>
          <div>
            <p className="font-semibold text-sm">{title}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>
        <Switch checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">โทนเสียง</Label>
        <Select
          value={String(value.frequency)}
          onValueChange={(v) => onChange({ ...value, frequency: Number(v) })}
          disabled={!value.enabled}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TONE_PRESETS.map((t) => (
              <SelectItem key={t.frequency} value={String(t.frequency)}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">ระดับเสียง</Label>
          <span className="text-xs tabular-nums text-muted-foreground">{Math.round(value.volume * 100)}%</span>
        </div>
        <Slider
          value={[Math.round(value.volume * 100)]}
          min={0}
          max={100}
          step={5}
          disabled={!value.enabled}
          onValueChange={([v]) => onChange({ ...value, volume: v / 100 })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">ความยาวเสียง</Label>
          <span className="text-xs tabular-nums text-muted-foreground">{value.durationMs} ms</span>
        </div>
        <Slider
          value={[value.durationMs]}
          min={80}
          max={800}
          step={20}
          disabled={!value.enabled}
          onValueChange={([v]) => onChange({ ...value, durationMs: v })}
        />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={preview} disabled={!value.enabled}>
        <Volume2 className="mr-1 h-4 w-4" /> ทดลองฟัง
      </Button>
    </div>
  );
}

/** ตั้งค่าโทนเสียงและระดับเสียงแจ้งเตือน กลุ่ม 1 (เว็บแอป) และกลุ่ม 2 (NATTA.Q AI) */
export function AlertSoundSettingsCard() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_ALERT_SOUND_SETTINGS);

  useEffect(() => {
    setSettings(loadAlertSoundSettings());
  }, []);

  const update = (next: Settings) => {
    setSettings(next);
    saveAlertSoundSettings(next);
    logFsActivity('sound_settings', 'บันทึกการตั้งค่าเสียงแจ้งเตือน', {
      'กลุ่ม1': `${next.g1.enabled ? 'เปิด' : 'ปิด'} ${next.g1.frequency}Hz ${Math.round(next.g1.volume * 100)}% ${next.g1.durationMs}ms`,
      'กลุ่ม2': `${next.g2.enabled ? 'เปิด' : 'ปิด'} ${next.g2.frequency}Hz ${Math.round(next.g2.volume * 100)}% ${next.g2.durationMs}ms`,
    });
  };

  return (
    <div className="space-y-4">
    <Card data-testid="alert-sound-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" /> เสียงแจ้งเตือน 2 กลุ่ม
        </CardTitle>
        <CardDescription>
          ตั้งโทนเสียงและระดับเสียงแยกกลุ่ม ใช้กับศูนย์แจ้งเตือน ศูนย์ทดสอบระบบ และการแจ้งเตือนแบบเรียลไทม์ (บันทึกอัตโนมัติในเครื่องนี้)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <GroupCard
            title="กลุ่ม 1 · ออเดอร์เว็บแอป"
            desc="ออเดอร์ที่ลูกค้าสั่งผ่านเว็บแอป"
            icon={<ShoppingCart className="h-4 w-4" />}
            value={settings.g1}
            onChange={(g1) => update({ ...settings, g1 })}
          />
          <GroupCard
            title="กลุ่ม 2 · NATTA.Q AI"
            desc="งานที่ AI ตรวจจับจากแชท LINE"
            icon={<Bot className="h-4 w-4" />}
            value={settings.g2}
            onChange={(g2) => update({ ...settings, g2 })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            update(DEFAULT_ALERT_SOUND_SETTINGS);
            toast.success('คืนค่าเสียงแจ้งเตือนเป็นค่าเริ่มต้นแล้ว');
          }}
        >
          คืนค่าเริ่มต้น
        </Button>
      </CardContent>
    </Card>
      <FsActivityLogCard />
    </div>
  );
}
