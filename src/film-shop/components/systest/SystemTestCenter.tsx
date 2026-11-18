import { useState } from 'react';
import { Bot, ExternalLink, Layers, Link2, Loader2, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { useFilmStoreScope } from '@/film-shop/hooks/useFilmStoreScope';
import { playGroupAlert, primeNotificationSound } from '@/film-shop/lib/notifySound';
import { logFsActivity } from '@/film-shop/lib/fsActivityLog';
import { FsActivityLogCard } from '@/film-shop/components/settings/FsActivityLogCard';

type Result = { ok: boolean; [k: string]: unknown } | null;

async function callSystest(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('film-systest', { body: payload });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; reason?: string; [k: string]: unknown };
}

function ResultBox({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <pre
      data-testid="systest-result"
      className={`mt-3 overflow-x-auto rounded-lg border p-3 text-xs ${result.ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'}`}
    >
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

/**
 * ศูนย์ทดสอบระบบ FS FILM SHOP & NATTA.Q — ทดสอบทุกระบบในหน้าเดียว
 * ใช้เส้นทางจริงของระบบ (ออเดอร์จริง + แจ้งเตือนจริง) และทำเครื่องหมายเป็นข้อมูลทดสอบเสมอ
 */
export function SystemTestCenter() {
  const { storeId, stores } = useFilmStoreScope();
  const activeStore = stores.find((s) => s.id === storeId);
  const [busy, setBusy] = useState<string | null>(null);
  const [webResult, setWebResult] = useState<Result>(null);
  const [aiResult, setAiResult] = useState<Result>(null);

  const [customerName, setCustomerName] = useState('คุณทดสอบ');
  const [description, setDescription] = useState('สติกเกอร์ PVC 10x10 ซม.');
  const [quantity, setQuantity] = useState('20');
  const [unitPrice, setUnitPrice] = useState('25');

  const [chatText, setChatText] = useState(
    'คอนเฟิร์มนะคะ ทำสติกเกอร์ PVC ขนาด 10x10 ซม. จำนวน 50 ดวง มีไฟล์ออกแบบแล้ว รับพรุ่งนี้บ่ายค่ะ',
  );
  const [bulkCount, setBulkCount] = useState('5');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<Result>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://filmyynatta.com';
  const links = [
    { label: 'หน้าแอดมิน Film Shop', url: `${origin}/film-shop` },
    { label: 'Inbox แชตลูกค้า', url: `${origin}/film-shop/app?p=inbox` },
    { label: 'ศูนย์แจ้งเตือน 2 กลุ่ม', url: `${origin}/film-shop/app?p=alerts` },
    { label: 'เว็บแอปสั่งซื้อสำหรับลูกค้า', url: `${origin}/shop` },
    { label: 'LINE Webhook (NATTA.Q)', url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/line-webhook` },
  ];

  const runWebOrder = async () => {
    setBusy('web');
    try {
      primeNotificationSound();
      const res = await callSystest({
        action: 'web_order',
        storeId,
        customerName,
        description,
        quantity: Number(quantity) || 1,
        unitPrice: Number(unitPrice) || 0,
      });
      setWebResult(res);
      if (res.ok) {
        playGroupAlert(1);
        logFsActivity('order_simulation', 'จำลองออเดอร์เว็บแอป 1 รายการ', {
          'เลขที่': String(res.orderNo ?? '-'),
          'ลูกค้า': customerName,
          'รายการ': description,
          'จำนวน': quantity,
        });
        toast.success(`สร้างออเดอร์เว็บแอปแล้ว: ${res.orderNo}`, { description: 'แจ้งเตือนกลุ่ม 1 ถูกส่งเข้าระบบ' });
      } else {
        logFsActivity('order_simulation', 'จำลองออเดอร์เว็บแอปไม่สำเร็จ', { 'สาเหตุ': String(res.reason ?? '-') });
        toast.error(`ทดสอบไม่สำเร็จ: ${res.reason ?? 'ไม่ทราบสาเหตุ'}`);
      }
    } catch (e) {
      setWebResult({ ok: false, reason: String((e as Error).message) });
      toast.error('เรียกระบบทดสอบไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const runNattaq = async () => {
    setBusy('ai');
    try {
      primeNotificationSound();
      const res = await callSystest({ action: 'nattaq', storeId, text: chatText, displayName: customerName });
      setAiResult(res);
      if (res.ok) {
        playGroupAlert(2);
        logFsActivity('order_simulation', 'จำลองข้อความเข้า NATTA.Q', {
          'เลขที่': String(res.orderNo ?? '-'),
          'ข้อความ': chatText.slice(0, 120),
        });
        toast.success(
          res.orderNo ? `NATTA.Q สร้างใบงานอัตโนมัติ: ${res.orderNo}` : 'NATTA.Q รับข้อความแล้ว (ข้อมูลยังไม่ครบ)',
          { description: 'แจ้งเตือนกลุ่ม 2 ถูกส่งเข้าระบบ' },
        );
      } else toast.error(`ทดสอบไม่สำเร็จ: ${res.reason ?? 'ไม่ทราบสาเหตุ'}`);
    } catch (e) {
      setAiResult({ ok: false, reason: String((e as Error).message) });
      toast.error('เรียกระบบทดสอบไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const runPurge = async () => {
    setBulkResult(null);
    setBusy('purge');
    try {
      const res = await callSystest({ action: 'purge' });
      if (res.ok) {
        setWebResult(null);
        setAiResult(null);
        toast.success('ล้างข้อมูลทดสอบทั้งหมดแล้ว');
      } else toast.error(`ล้างข้อมูลไม่สำเร็จ: ${res.reason ?? ''}`);
    } catch {
      toast.error('ล้างข้อมูลไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  /** จำลองออเดอร์หลายรายการพร้อมกัน เพื่อดูว่าคิวและแจ้งเตือนเรียลไทม์รับไหวและไม่ทับกัน */
  const runBulk = async () => {
    const total = Math.min(20, Math.max(2, Number(bulkCount) || 5));
    setBusy('bulk');
    setBulkResult(null);
    setBulkProgress({ done: 0, total });
    primeNotificationSound();
    const created: string[] = [];
    const failed: string[] = [];
    try {
      for (let i = 1; i <= total; i++) {
        try {
          const res = await callSystest({
            action: 'web_order',
            storeId,
            customerName: `${customerName} #${i}`,
            description: `${description} (ชุดทดสอบ ${i}/${total})`,
            quantity: Number(quantity) || 1,
            unitPrice: Number(unitPrice) || 0,
          });
          if (res.ok) {
            created.push(String(res.orderNo ?? ''));
            playGroupAlert(1);
          } else failed.push(res.reason ?? 'ไม่ทราบสาเหตุ');
        } catch (e) {
          failed.push(String((e as Error).message));
        }
        setBulkProgress({ done: i, total });
        await new Promise((r) => setTimeout(r, 350));
      }
      setBulkResult({ ok: failed.length === 0, created: created.length, orderNos: created, failed });
      logFsActivity('order_simulation', 'จำลองออเดอร์หลายรายการ', {
        'สำเร็จ': created.length,
        'ไม่สำเร็จ': failed.length,
        'ทั้งหมด': total,
        'เลขที่': created.join(', '),
      });
      if (failed.length === 0) {
        toast.success(`สร้างออเดอร์ทดสอบสำเร็จ ${created.length} รายการ`, {
          description: 'ตรวจการเด้งแจ้งเตือนกลุ่ม 1 และคิวงานแบบเรียลไทม์',
        });
      } else {
        toast.error(`สำเร็จ ${created.length} รายการ / ไม่สำเร็จ ${failed.length} รายการ`);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="systest-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          ทดสอบทุกระบบในหน้าเดียว — ร้านที่ใช้ทดสอบ:{' '}
          <span className="font-semibold text-foreground">{activeStore?.label ?? 'ทุกร้าน'}</span>
        </p>
        <Button variant="outline" size="sm" onClick={runPurge} disabled={busy !== null}>
          {busy === 'purge' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
          ล้างข้อมูลทดสอบ
        </Button>
      </div>

      <Tabs defaultValue="web">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="web" className="text-xs sm:text-sm">🛒 เว็บแอปสั่งซื้อ</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs sm:text-sm">🤖 NATTA.Q</TabsTrigger>
          <TabsTrigger value="links" className="text-xs sm:text-sm">🔗 ลิงก์ระบบ</TabsTrigger>
        </TabsList>

        <TabsContent value="web" className="mt-4">
          <section className="rounded-xl border border-t-4 border-t-blue-600 bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <ShoppingCart className="h-4 w-4 text-primary" /> กลุ่ม 1: ทดสอบออเดอร์จากเว็บแอป
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              สร้างออเดอร์จริงช่องทางเว็บแอป → เข้าคิว “รอตรวจสอบออเดอร์” และเด้งแจ้งเตือนกลุ่ม 1 (เสียง 600Hz)
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="st-name" className="text-xs">ชื่อลูกค้า</Label>
                <Input id="st-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-desc" className="text-xs">รายการสินค้า</Label>
                <Input id="st-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-qty" className="text-xs">จำนวน</Label>
                <Input id="st-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-price" className="text-xs">ราคา/หน่วย (บาท)</Label>
                <Input id="st-price" inputMode="numeric" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              </div>
            </div>
            <Button className="mt-4 w-full sm:w-auto" onClick={runWebOrder} disabled={busy !== null} data-testid="systest-web-run">
              {busy === 'web' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1 h-4 w-4" />}
              ส่งคำสั่งซื้อทดสอบ
            </Button>
            <ResultBox result={webResult} />

            <div className="mt-5 rounded-lg border border-dashed p-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <Layers className="h-4 w-4 text-primary" /> จำลองออเดอร์หลายรายการพร้อมกัน
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                ยิงออเดอร์ต่อเนื่องหลายรายการ เพื่อทดสอบคิวงานและการเด้งแจ้งเตือนกลุ่ม 1 แบบเรียลไทม์ว่าไม่ตกและไม่ทับกัน
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="st-bulk" className="text-xs">จำนวนออเดอร์ (2–20)</Label>
                  <Input
                    id="st-bulk"
                    className="w-28"
                    inputMode="numeric"
                    value={bulkCount}
                    onChange={(e) => setBulkCount(e.target.value)}
                  />
                </div>
                <Button variant="secondary" onClick={runBulk} disabled={busy !== null} data-testid="systest-bulk-run">
                  {busy === 'bulk' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Layers className="mr-1 h-4 w-4" />}
                  {busy === 'bulk' && bulkProgress
                    ? `กำลังสร้าง ${bulkProgress.done}/${bulkProgress.total}`
                    : 'จำลองหลายออเดอร์'}
                </Button>
              </div>
              <ResultBox result={bulkResult} />
            </div>
          </section>
          <div className="mt-4">
            <FsActivityLogCard />
          </div>
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <section className="rounded-xl border border-t-4 border-t-violet-600 bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Bot className="h-4 w-4 text-primary" /> กลุ่ม 2: ทดสอบ NATTA.Q (AI แชทออเดอร์)
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              พิมพ์ข้อความแบบที่ลูกค้าส่งมาในแชท ถ้ามีคำยืนยัน (คอนเฟิร์ม/สั่งทำ/เอาตามนี้) และข้อมูลครบ
              AI จะออกเลขใบงานและรันคิวให้ทันที พร้อมแจ้งเตือนกลุ่ม 2 (เสียง 900Hz)
            </p>
            <Textarea
              className="mt-3 min-h-28"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="เช่น คอนเฟิร์มนะคะ ทำสติกเกอร์ 10x10 ซม. 50 ดวง รับพรุ่งนี้"
            />
            <Button className="mt-3 w-full sm:w-auto" onClick={runNattaq} disabled={busy !== null} data-testid="systest-ai-run">
              {busy === 'ai' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Bot className="mr-1 h-4 w-4" />}
              ส่งข้อความเข้า NATTA.Q
            </Button>
            <ResultBox result={aiResult} />
          </section>
        </TabsContent>

        <TabsContent value="links" className="mt-4">
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Link2 className="h-4 w-4 text-primary" /> ลิงก์ระบบและปลายทางเชื่อมต่อ
            </h3>
            <ul className="mt-3 space-y-2">
              {links.map((l) => (
                <li key={l.label} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{l.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.url}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(l.url); toast.success('คัดลอกลิงก์แล้ว'); }}>
                      คัดลอก
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={l.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}