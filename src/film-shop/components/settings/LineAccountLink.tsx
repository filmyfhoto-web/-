import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/film-shop/lib/supabase';
import { useAuth } from '@/film-shop/hooks/useAuth';
import { useUserRole } from '@/film-shop/hooks/useUserRole';
import { Link2, Link2Off, RefreshCw, Copy, CheckCircle2, AlertCircle, Send, Circle } from 'lucide-react';
import { toast } from 'sonner';

interface LinkRow {
  id: string;
  user_id: string;
  line_user_id: string | null;
  display_name: string | null;
  link_token: string | null;
  linked_at: string | null;
}

const maskUserId = (id: string) => id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;

/**
 * "Did the test message actually go out?" is a SERVER fact, not a browser
 * fact. It is read from `notification_outbox` (rows this component enqueues
 * with ref_type = 'admin_line_test'), so a reload, another browser or another
 * device all report the same thing. No localStorage flag is involved.
 */
const TEST_REF_TYPE = 'admin_line_test';

type TestStatus = {
  status: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string | null;
};

export function LineAccountLink() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [row, setRow] = useState<LinkRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus | null>(null);
  const testSent = testStatus?.status === 'sent';

  /** Latest server-recorded test delivery for this admin. */
  const fetchTestStatus = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from('notification_outbox')
      .select('status, sent_at, last_error, created_at')
      .eq('ref_type', TEST_REF_TYPE)
      .eq('ref_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setTestStatus((data as TestStatus) ?? null);
  };

  const fetchRow = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_line_links')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) console.error(error);
    setRow((data as LinkRow) || null);
    setLoading(false);
  };

  useEffect(() => {
    if (user) { fetchRow(); void fetchTestStatus(); }
  }, [user]);

  if (roleLoading) return null;
  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ผูกบัญชี LINE</CardTitle>
          <CardDescription>เฉพาะผู้ดูแล (Admin) เท่านั้นที่สามารถผูกบัญชี LINE</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const generateCode = async () => {
    if (!user) return;
    setBusy(true);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      if (row) {
        const { error } = await supabase
          .from('admin_line_links')
          .update({ link_token: code, line_user_id: null, linked_at: null, display_name: null })
          .eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_line_links')
          .insert({ user_id: user.id, link_token: code });
        if (error) throw error;
      }
      toast.success('สร้างรหัสผูกใหม่แล้ว');
      await fetchRow();
      await fetchTestStatus();
    } catch (e: any) {
      toast.error('ไม่สามารถสร้างรหัสได้: ' + (e.message || ''));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!row) return;
    setBusy(true);
    const { error } = await supabase
      .from('admin_line_links')
      .update({ line_user_id: null, linked_at: null, display_name: null, link_token: null })
      .eq('id', row.id);
    if (error) toast.error('ยกเลิกการผูกล้มเหลว');
    else {
      toast.success('ยกเลิกการผูกแล้ว');
      await fetchRow();
      await fetchTestStatus();
    }
    setBusy(false);
  };

  const sendTest = async () => {
    if (!user || !row?.line_user_id) return;
    setTesting(true);
    try {
      // Goes through the same server-side outbox as every real notification,
      // so the recorded status is the real delivery status.
      const clientRequestId = `admin_line_test:${user.id}:${Date.now()}`;
      const { data, error } = await supabase.functions.invoke('notify-dispatch', {
        body: {
          action: 'enqueue',
          ref_type: TEST_REF_TYPE,
          ref_id: user.id,
          recipient: row.line_user_id,
          text: '🔔 ข้อความทดสอบจากระบบ — การแจ้งเตือน LINE ใช้งานได้ปกติ',
          client_request_id: clientRequestId,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      // Kick the worker so the admin doesn't wait for the 1-minute cron tick.
      await supabase.functions.invoke('notify-dispatch', { body: { action: 'drain', limit: 5 } });
      await fetchTestStatus();
      toast.success('ส่งข้อความทดสอบเข้าคิวแล้ว — ตรวจสอบ LINE ของคุณ');
    } catch (e: any) {
      toast.error('ส่งข้อความทดสอบล้มเหลว: ' + (e.message || ''));
    } finally {
      setTesting(false);
    }
  };

  const isLinked = !!row?.linked_at && !!row?.line_user_id;
  const hasPendingCode = !isLinked && !!row?.link_token;
  const hasCode = !!row?.link_token || isLinked;

  const ChecklistItem = ({ done, label }: { done: boolean; label: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {done
        ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
        : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          ผูกบัญชี LINE สำหรับแจ้งเตือนและคำสั่งงาน
        </CardTitle>
        <CardDescription>
          ผูก LINE ของคุณกับระบบเพื่อรับแจ้งเตือนเอกสาร/งาน และใช้คำสั่ง LINE สั่งงาน
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="rounded-lg border p-4 bg-muted/30">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium">สถานะ</span>
            {isLinked ? (
              <Badge className="bg-success text-success-foreground">
                <CheckCircle2 className="h-3 w-3 mr-1" /> ผูกเรียบร้อย
              </Badge>
            ) : hasPendingCode ? (
              <Badge variant="outline" className="border-warning text-warning">
                <AlertCircle className="h-3 w-3 mr-1" /> รอยืนยันใน LINE
              </Badge>
            ) : (
              <Badge variant="outline">ยังไม่ผูก</Badge>
            )}
          </div>
          {isLinked && (
            <div className="mt-3 text-sm text-muted-foreground space-y-1">
              <p>ชื่อ LINE: <span className="font-medium text-foreground">{row?.display_name || '-'}</span></p>
              <p>LINE User ID: <span className="font-mono text-xs">{maskUserId(row?.line_user_id || '')}</span></p>
              <p>ผูกเมื่อ: {row?.linked_at ? new Date(row.linked_at).toLocaleString('th-TH') : '-'}</p>
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm font-medium mb-2">ขั้นตอนการเชื่อมต่อ</p>
          <ChecklistItem done={hasCode} label="1. สร้างรหัสผูก" />
          <ChecklistItem done={isLinked} label="2. ยืนยันรหัสในแชท LINE" />
          <ChecklistItem done={isLinked && testSent} label="3. ทดสอบส่งข้อความสำเร็จ" />
          {isLinked && testSent && (
            <p className="text-xs text-success pt-1">พร้อมรับแจ้งเตือน 18:00 แล้ว ✓</p>
          )}
          {isLinked && !testSent && testStatus && (
            <p className="text-xs text-muted-foreground pt-1">
              สถานะล่าสุดจากเซิร์ฟเวอร์: {testStatus.status}
              {testStatus.last_error ? ` — ${testStatus.last_error}` : ''}
            </p>
          )}
        </div>

        {/* Pending code */}
        {hasPendingCode && (
          <div className="rounded-lg border-2 border-dashed border-primary/40 p-4 bg-primary/5 space-y-3">
            <div className="text-sm">
              <p className="font-medium mb-1">รหัสผูกของคุณ:</p>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-mono font-bold tracking-widest text-primary">
                  {row?.link_token}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(row?.link_token || '');
                    toast.success('คัดลอกแล้ว');
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
              <li>เพิ่มเพื่อนกับบอท LINE ของร้าน</li>
              <li>พิมพ์ <code className="px-1.5 py-0.5 rounded bg-muted">ผูก {row?.link_token}</code> ในแชท</li>
              <li>กดปุ่ม "ตรวจสอบสถานะ" ด้านล่าง</li>
            </ol>
          </div>
        )}

        {/* Preview message */}
        <div className="rounded-lg border p-4 bg-muted/20">
          <p className="text-sm font-medium mb-2">ตัวอย่างข้อความแจ้งเตือน</p>
          <div className="rounded-md bg-background border p-3 text-sm whitespace-pre-line font-mono">
            {`🔔 แจ้งเตือนจากระบบ
มีเอกสาร/งานใหม่ที่ต้องดำเนินการ
กรุณาตรวจสอบในระบบ`}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ระบบจะส่งแจ้งเตือนเมื่อมีเอกสารใหม่ ออกใบเสร็จ หรือสถานะงานเปลี่ยนแปลง
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!isLinked && (
            <Button onClick={generateCode} disabled={busy}>
              <RefreshCw className="h-4 w-4 mr-1" />
              {hasPendingCode ? 'สร้างรหัสใหม่' : 'สร้างรหัสผูก'}
            </Button>
          )}
          <Button variant="outline" onClick={() => { void fetchRow(); void fetchTestStatus(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            ตรวจสอบสถานะ
          </Button>
          {isLinked && (
            <Button variant="secondary" onClick={sendTest} disabled={testing}>
              <Send className={`h-4 w-4 mr-1 ${testing ? 'animate-pulse' : ''}`} />
              ส่งข้อความทดสอบ
            </Button>
          )}
          {isLinked && (
            <Button variant="destructive" onClick={unlink} disabled={busy}>
              <Link2Off className="h-4 w-4 mr-1" />
              ยกเลิกการผูก
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground border-t pt-3">
          ระบบจะส่งแจ้งเตือนไปยัง LINE User ID ที่ผูกเรียบร้อยเท่านั้น ตามการตั้งค่าการแจ้งเตือนของระบบ
        </div>
      </CardContent>
    </Card>
  );
}
