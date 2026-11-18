import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Copy, Loader2, ShieldCheck, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/film-shop/lib/supabase';
import { useLineStores } from '@/hooks/useLineStores';
import { useUserRole } from '@/film-shop/hooks/useUserRole';

const db = supabase as any;

/**
 * ช่อง LINE ที่ถือว่าเป็นของ Film Shop เท่านั้น (เรียงตามลำดับความสำคัญ)
 * - natta    = OA เฉพาะของม่วงจดให้ (ค่าเริ่มต้น)
 * - runqueue = NATTA.Q AI (รันคิว) ช่องรับงาน/คิวของ Film Shop — ใช้เป็นตัวสำรอง
 * - default  = OA หลักของร้านนัฐภรณ์ — ใช้เป็นตัวสำรอง
 * ห้ามรวมช่องของร้านปริ้นงาน/คัลเลอร์แล็ป (shop2 ฯลฯ) เด็ดขาด
 */
export const FILM_SHOP_LINE_CHANNELS = ['natta', 'runqueue', 'default'] as const;

/** URL webhook ที่ต้องวางใน LINE Developers ของ OA ม่วงจดให้ */
export const NATTA_WEBHOOK_URL =
  'https://fdgxvgtmzcgakofswtty.supabase.co/functions/v1/line-webhook?ch=natta';

interface NattaStatus {
  secret_configured: boolean;
  token_configured: boolean;
  secret_last4: string | null;
  token_last4: string | null;
  channel_id: string | null;
  updated_at: string | null;
}

export function NattaAssistantCard() {
  const { isAdmin } = useUserRole();
  const { stores, loading } = useLineStores();
  const [storeId, setStoreId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [installed, setInstalled] = useState<{ richMenuId: string; storeId: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState<NattaStatus | null>(null);
  // ค่าที่กรอกอยู่ในฟอร์มเท่านั้น — ไม่เคยถูกเก็บลงเครื่องผู้ใช้
  const [channelId, setChannelId] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [reveal, setReveal] = useState(false);

  const eligible = useMemo(() => {
    const order = FILM_SHOP_LINE_CHANNELS as readonly string[];
    return stores
      .filter((s) => order.includes(s.id) && s.is_active)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [stores]);
  // ค่าเริ่มต้น: ใช้ช่อง natta ถ้ามี ไม่งั้นค่อยใช้ตัวสำรองเมื่อเหลือช่องเดียว
  const preferred = eligible.find((s) => s.id === 'natta')?.id;
  const selected = storeId || preferred || (eligible.length === 1 ? eligible[0].id : '');

  const refreshStatus = useCallback(async () => {
    const { data } = await db.functions.invoke('film-natta-line-credentials', {
      body: { action: 'status' },
    });
    if (data?.ok) {
      setStatus({
        secret_configured: Boolean(data.secret_configured),
        token_configured: Boolean(data.token_configured),
        secret_last4: data.secret_last4 ?? null,
        token_last4: data.token_last4 ?? null,
        channel_id: data.channel_id ?? null,
        updated_at: data.updated_at ?? null,
      });
      if (data.channel_id) setChannelId((prev) => prev || String(data.channel_id));
    }
  }, []);

  useEffect(() => { if (isAdmin) void refreshStatus(); }, [isAdmin, refreshStatus]);

  const saveCredentials = async () => {
    setSaving(true);
    setFailed(null);
    try {
      const { data, error } = await db.functions.invoke('film-natta-line-credentials', {
        body: {
          action: 'save',
          channel_id: channelId.trim(),
          channel_secret: secretInput.trim(),
          channel_access_token: tokenInput.trim(),
        },
      });
      if (error) { setFailed('บันทึกไม่สำเร็จ — ' + error.message); toast.error('บันทึกไม่สำเร็จ'); return; }
      if (!data?.ok) {
        setFailed(data?.reason || 'บันทึกไม่สำเร็จ (สิทธิ์ไม่พอหรือรูปแบบค่าไม่ถูกต้อง)');
        toast.error('บันทึกไม่สำเร็จ');
        return;
      }
      // ล้างค่าที่กรอกทันทีหลังบันทึก เพื่อไม่ให้ค้างอยู่บนหน้าจอ
      setSecretInput('');
      setTokenInput('');
      setSaved(true);
      toast.success('บันทึกการเชื่อม LINE ของม่วงจดให้แล้ว');
      await refreshStatus();
    } finally {
      setSaving(false);
    }
  };

  const install = async () => {
    if (!selected) { toast.error('เลือกช่อง LINE ของ Film Shop ก่อนนะคะ'); return; }
    setBusy(true);
    setFailed(null);
    try {
      const { data, error } = await db.functions.invoke('film-richmenu-setup', {
        body: { store_id: selected },
      });
      if (error) { setFailed('เรียกใช้ระบบไม่สำเร็จ — ' + error.message); toast.error('ติดตั้งเมนูไม่สำเร็จ'); return; }
      if (data?.ok) {
        setInstalled({ richMenuId: String(data.rich_menu_id), storeId: selected });
        toast.success('ติดตั้งเมนูม่วงจดให้เรียบร้อยแล้ว');
        return;
      }
      const reason = data?.error === 'no_token'
        ? 'ยังไม่ได้ตั้งค่า Access Token ของ LINE OA ช่องนี้ — ต้องใส่โทเคนก่อนจึงจะติดตั้งเมนูได้'
        : data?.error === 'forbidden'
          ? 'บัญชีนี้ไม่มีสิทธิ์ตั้งค่าเมนู (เฉพาะเจ้าของ/แอดมิน)'
          : `ติดตั้งไม่สำเร็จที่ขั้นตอน “${data?.step ?? 'ไม่ทราบ'}” (${data?.status ?? '-'})`;
      setFailed(reason);
      toast.error('ติดตั้งเมนูไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(NATTA_WEBHOOK_URL);
      toast.success('คัดลอก Webhook URL แล้ว');
    } catch {
      toast.error('คัดลอกไม่สำเร็จ — กดคัดลอกจากช่องข้อความแทนได้ค่ะ');
    }
  };

  if (!isAdmin) return null;

  const tokenReady = Boolean(status?.token_configured);

  return (
    <Card data-testid="natta-assistant-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-5 w-5 text-primary" />
          ม่วงจดให้ · LINE ผู้ช่วยบัญชี
        </CardTitle>
        <CardDescription>
          ใช้กับร้าน Film Shop เท่านั้น และรับคำสั่งเฉพาะแชทส่วนตัวของเจ้าของ/แอดมินที่ผูกสิทธิ์ไว้แล้ว
          ไม่ทำงานในแชทลูกค้าหรือห้องกลุ่ม
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> เฉพาะเจ้าของ/แอดมิน
          </Badge>
          <Badge variant="outline">Film Shop เท่านั้น</Badge>
          <Badge variant={status?.secret_configured ? 'default' : 'outline'}>
            {status?.secret_configured
              ? `Secret ตั้งแล้ว ····${status.secret_last4 ?? ''}`
              : 'ยังไม่ได้ตั้ง Secret'}
          </Badge>
          <Badge variant={status?.token_configured ? 'default' : 'outline'}>
            {status?.token_configured
              ? `Token ตั้งแล้ว ····${status.token_last4 ?? ''}`
              : 'ยังไม่ได้ตั้ง Token'}
          </Badge>
          {installed && (
            <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> ติดตั้งแล้ว
            </Badge>
          )}
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">ตั้งค่า OA “ม่วงจดให้” 3 ขั้นตอน</p>
          <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ก่อนบันทึก ให้กด “Issue/Reissue” Channel Secret ใหม่ใน LINE Developers ก่อน
            เพราะค่าชุดเดิมเคยถูกส่งผ่านแชทและถือว่าไม่ปลอดภัยแล้ว
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="natta-channel-id">1. Channel ID</Label>
              <Input
                id="natta-channel-id"
                inputMode="numeric"
                autoComplete="off"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="เช่น 2001234567"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="natta-secret">2. Channel Secret (ออกใหม่)</Label>
              <div className="flex gap-2">
                <Input
                  id="natta-secret"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  placeholder="hex 32 ตัว"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setReveal((v) => !v)} aria-label="แสดง/ซ่อนค่า">
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="natta-token">3. Channel Access Token (long-lived)</Label>
              <Input
                id="natta-token"
                type={reveal ? 'text' : 'password'}
                autoComplete="new-password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="วางค่าจาก Messaging API"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="natta-webhook">Webhook URL (วางใน LINE Developers)</Label>
            <div className="flex gap-2">
              <Input id="natta-webhook" readOnly value={NATTA_WEBHOOK_URL} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={copyWebhook} aria-label="คัดลอก Webhook URL">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button
            onClick={saveCredentials}
            disabled={saving || !channelId.trim() || !secretInput.trim() || !tokenInput.trim()}
            data-testid="natta-save-btn"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            บันทึกการเชื่อม LINE
          </Button>

          {saved && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              บันทึกแล้ว · กลับไป LINE Developers แล้วกด Verify / เปิด Use webhook ให้เรียบร้อย
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="natta-store">ช่อง LINE ของ Film Shop</Label>
          <Select value={selected} onValueChange={setStoreId} disabled={loading || busy}>
            <SelectTrigger id="natta-store" className="max-w-sm">
              <SelectValue placeholder={loading ? 'กำลังโหลด...' : 'เลือกช่อง LINE'} />
            </SelectTrigger>
            <SelectContent>
              {eligible.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.display_name || s.id}{s.has_token ? '' : ' (ยังไม่มีโทเคน)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!loading && eligible.length === 0 && (
            <p className="text-xs text-destructive">ยังไม่พบช่อง LINE ของ Film Shop ที่เปิดใช้งานอยู่</p>
          )}
        </div>

        <Button onClick={install} disabled={busy || !selected || !tokenReady} data-testid="natta-install-btn">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          ติดตั้ง / อัปเดต Rich Menu ม่วงจดให้
        </Button>
        {!tokenReady && (
          <p className="text-xs text-muted-foreground">ต้องบันทึก Access Token ก่อนจึงจะติดตั้ง Rich Menu ได้</p>
        )}

        {installed && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            ติดตั้งแล้ว · rich_menu_id: <span className="font-mono text-xs">{installed.richMenuId}</span>
          </p>
        )}
        {failed && (
          <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {failed}
          </p>
        )}

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <p className="font-medium">ทดสอบม่วงจดให้</p>
          <p className="text-xs text-muted-foreground">ทักแชทส่วนตัวกับ LINE OA ด้วยข้อความเหล่านี้</p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs">
            <li>ขายรูป 360</li>
            <li>ค่าส่ง 80</li>
            <li>สรุปวันนี้</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default NattaAssistantCard;
