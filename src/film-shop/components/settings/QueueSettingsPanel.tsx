import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Timer, Save } from 'lucide-react';
import { useQueueSettings } from '@/film-shop/hooks/useQueueSettings';

const DAY_LABELS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** ตั้งค่าคิวงาน — เวลาทำการ กำลังการผลิต และเวลามาตรฐานต่อประเภทงาน */
export function QueueSettingsPanel() {
  const { settings, durations, loading, saveSettings, saveDuration } = useQueueSettings();
  const [form, setForm] = useState(settings);
  const [rows, setRows] = useState(durations);

  useEffect(() => { setForm(settings); }, [settings]);
  useEffect(() => { setRows(durations); }, [durations]);

  const toggleDay = (d: number) => {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(d) ? f.workingDays.filter((x) => x !== d) : [...f.workingDays, d].sort(),
    }));
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 max-w-3xl" data-testid="queue-settings">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5 text-primary" /> เวลาทำการและกำลังการผลิต</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="q-open">เวลาเปิดร้าน</Label>
              <Input id="q-open" type="time" value={form.openTime} onChange={(e) => setForm({ ...form, openTime: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="q-close">เวลาปิดร้าน</Label>
              <Input id="q-close" type="time" value={form.closeTime} onChange={(e) => setForm({ ...form, closeTime: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="q-cap">ทำงานพร้อมกันได้ (งาน)</Label>
              <Input id="q-cap" type="number" min={1} value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
            <div>
              <Label htmlFor="q-buf">เวลาพักระหว่างงาน (นาที)</Label>
              <Input id="q-buf" type="number" min={0} value={form.bufferMinutes}
                onChange={(e) => setForm({ ...form, bufferMinutes: Math.max(0, Number(e.target.value) || 0) })} />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">วันทำการ</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((lbl, d) => (
                <Button key={d} type="button" size="sm"
                  variant={form.workingDays.includes(d) ? 'default' : 'outline'}
                  onClick={() => toggleDay(d)}>{lbl}</Button>
              ))}
            </div>
          </div>
          <Button onClick={() => saveSettings(form)}><Save className="h-4 w-4 mr-1" /> บันทึกตั้งค่า</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>เวลามาตรฐานต่อประเภทงาน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r, idx) => (
            <div key={r.jobType} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{r.label || r.jobType}</Badge>
                <span className="text-xs text-muted-foreground">{r.jobType}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">เวลาตั้งเครื่อง (นาที)</Label>
                  <Input type="number" min={0} value={r.setupMinutes}
                    onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, setupMinutes: Number(e.target.value) || 0 } : x))} />
                </div>
                <div>
                  <Label className="text-xs">นาที/หน่วย</Label>
                  <Input type="number" min={0} value={r.minutesPerUnit}
                    onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, minutesPerUnit: Number(e.target.value) || 0 } : x))} />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" className="w-full" onClick={() => saveDuration(r.jobType, r)}>บันทึก</Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default QueueSettingsPanel;
