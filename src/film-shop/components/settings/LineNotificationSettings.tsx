import { useEffect, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Bell, Save } from 'lucide-react';
import { useRealtimeTable } from '@/film-shop/hooks/useRealtimeTable';

interface Settings {
  id?: string;
  notify_doc_created_quotation: boolean;
  notify_doc_created_invoice: boolean;
  notify_doc_created_receipt: boolean;
  notify_job_status_pending: boolean;
  notify_job_status_in_progress: boolean;
  notify_job_status_printing: boolean;
  notify_job_status_completed: boolean;
  notify_job_status_delivered: boolean;
  notify_payment_status_paid: boolean;
  notify_cash_advance_created: boolean;
  include_doc_link: boolean;
}

const DOC_OPTS: { key: keyof Settings; label: string }[] = [
  { key: 'notify_doc_created_quotation', label: 'ใบเสนอราคา' },
  { key: 'notify_doc_created_invoice', label: 'ใบวางบิล/ใบส่งของ' },
  { key: 'notify_doc_created_receipt', label: 'ใบเสร็จรับเงิน' },
];

const JOB_OPTS: { key: keyof Settings; label: string }[] = [
  { key: 'notify_job_status_pending', label: 'รอดำเนินการ' },
  { key: 'notify_job_status_in_progress', label: 'กำลังผลิต' },
  { key: 'notify_job_status_printing', label: 'กำลังพิมพ์' },
  { key: 'notify_job_status_completed', label: 'เสร็จสิ้น' },
  { key: 'notify_job_status_delivered', label: 'ส่งมอบแล้ว' },
];

export function LineNotificationSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    supabase.from('line_notification_settings').select('*').limit(1).maybeSingle()
      .then(({ data }) => { if (data) setSettings(data as any); });
  };
  useEffect(() => { load(); }, []);
  useRealtimeTable('line_notification_settings', () => { load(); });

  const update = (key: keyof Settings, value: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { id, ...rest } = settings;
    const { error } = id
      ? await supabase.from('line_notification_settings').update(rest).eq('id', id)
      : await supabase.from('line_notification_settings').insert(rest);
    setSaving(false);
    if (error) toast.error('บันทึกล้มเหลว: ' + error.message);
    else toast.success('บันทึกการตั้งค่าแจ้งเตือนเรียบร้อย');
  };

  if (!settings) return <div className="p-6 text-muted-foreground">กำลังโหลด...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          ตั้งค่าการแจ้งเตือน LINE
        </CardTitle>
        <CardDescription>
          เลือกได้ว่าเอกสาร/การเปลี่ยนสถานะงานแบบใดที่จะส่งแจ้งเตือนไปยังแอดมินผ่าน LINE
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="font-semibold text-sm">เมื่อสร้างเอกสารจากคำสั่งงาน</h3>
          <div className="space-y-2 rounded-lg border p-4">
            {DOC_OPTS.map(o => (
              <div key={o.key} className="flex items-center justify-between">
                <Label htmlFor={o.key}>{o.label}</Label>
                <Switch id={o.key} checked={!!settings[o.key]} onCheckedChange={(v) => update(o.key, v)} />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold text-sm">เมื่อเปลี่ยนสถานะงาน</h3>
          <div className="space-y-2 rounded-lg border p-4">
            {JOB_OPTS.map(o => (
              <div key={o.key} className="flex items-center justify-between">
                <Label htmlFor={o.key}>{o.label}</Label>
                <Switch id={o.key} checked={!!settings[o.key]} onCheckedChange={(v) => update(o.key, v)} />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold text-sm">อื่นๆ</h3>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>แนบลิงก์เอกสาร/ปุ่มเปิดดู</Label>
                <p className="text-xs text-muted-foreground">หากปิดจะส่งเป็นข้อความสั้น ไม่มีปุ่ม</p>
              </div>
              <Switch checked={settings.include_doc_link} onCheckedChange={(v) => update('include_doc_link', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>เมื่อชำระเงินครบ (paid)</Label>
              <Switch checked={settings.notify_payment_status_paid} onCheckedChange={(v) => update('notify_payment_status_paid', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>เมื่อมีการยืมเงินจากคลัง</Label>
              <Switch checked={settings.notify_cash_advance_created} onCheckedChange={(v) => update('notify_cash_advance_created', v)} />
            </div>
          </div>
        </section>

        <Button onClick={save} disabled={saving} size="lg" className="w-full">
          <Save className="h-4 w-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
        </Button>
      </CardContent>
    </Card>
  );
}
