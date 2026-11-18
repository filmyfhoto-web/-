/**
 * หน้าทดลอง (Preview เท่านั้น) — อ่านข้อมูลจากไฟล์แนบ
 * ไม่ส่งข้อความเข้า LINE จริง ไม่สร้างคิว/เอกสาร ไม่แตะข้อมูล production
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, FileImage, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import ExtractedDataSheet, { type ExtractStatus } from '@/film-shop/components/queue/ExtractedDataSheet';
import { DEMO_NAMECARD_RESULT, extractIntakeFromFile, getFileIntakeMode } from '@/film-shop/lib/fileIntakeAdapter';
import {
  applyExtractToDraft, buildSingleCardSummary, NOT_FOUND_TEXT, type ExtractedIntake,
} from '@/film-shop/lib/fileIntakeExtract';
import { emptyQueueDraft } from '@/film-shop/lib/queueIntake';
import demoCard from '@/assets/guru-namecard-demo.jpg.asset.json';

export default function FileIntakePreview() {
  const [status, setStatus] = useState<ExtractStatus>('done');
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ExtractedIntake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<ReturnType<typeof emptyQueueDraft> | null>(null);
  const [formDemoOpen, setFormDemoOpen] = useState(false);
  const [showSuccessCard, setShowSuccessCard] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { document.title = 'ทดลองอ่านข้อมูลจากไฟล์ | FILM SHOP'; }, []);

  const summary = useMemo(() => buildSingleCardSummary(DEMO_NAMECARD_RESULT), []);

  async function runDemo(fail = false) {
    setOpen(true); setStatus('reading'); setResult(null); setError(null);
    try {
      const fake = { name: fail ? 'demo-fail.jpg' : 'guru-namecard-demo.jpg', type: 'image/jpeg', size: 954840 } as File;
      const r = await extractIntakeFromFile(fake, { mode: 'preview' });
      setResult(r); setStatus('done');
    } catch (e) {
      setError((e as Error).message); setStatus('error');
    }
  }

  /** อ่านไฟล์จริงจากเครื่องแบบไม่ใช้ AI (ไม่เสียเครดิต) */
  async function runLocal(file: File) {
    setOpen(true); setStatus('reading'); setResult(null); setError(null);
    try {
      const r = await extractIntakeFromFile(file, { mode: 'local' });
      setResult(r); setStatus('done');
    } catch (e) {
      setError((e as Error).message); setStatus('error');
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pb-24">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">ทดลองอ่านข้อมูลจากไฟล์</h1>
        <p className="text-sm text-muted-foreground">
          โหมดระบบจริงตอนนี้: <Badge variant="outline">{getFileIntakeMode()}</Badge>{' '}
          (ค่าเริ่มต้น off — ฟอร์มรับงานจริงจะไม่อ่านไฟล์) หน้านี้เป็นการจำลองด้วยไฟล์ตัวอย่างเท่านั้น
          ไม่ส่งข้อความเข้า LINE และไม่สร้างคิว/เอกสารใด ๆ
        </p>
        <p className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ปุ่ม “อ่านไฟล์ตัวอย่างนี้” เป็นข้อมูลจำลอง ส่วนปุ่ม “อ่านไฟล์จริงจากเครื่อง (ไม่ใช้ AI)” อ่านไฟล์ของคุณจริงในเครื่อง
          ไม่ส่งไฟล์ขึ้นเซิร์ฟเวอร์ ไม่เรียก AI และไม่เสียเครดิต
        </p>
      </header>

      <section className="space-y-3 rounded-xl border p-3" aria-labelledby="demo-form">
        <h2 id="demo-form" className="text-sm font-semibold">A) ในฟอร์มรับงาน</h2>
        <img src={demoCard.url} alt="นามบัตรตัวอย่างที่ใช้ทดสอบการอ่านข้อมูล" loading="lazy"
          className="w-full rounded-lg border" />
        <div className="grid gap-2">
          <Button onClick={() => runDemo(false)} data-testid="preview-run">
            <FileImage className="mr-1 h-4 w-4" /> อ่านไฟล์ตัวอย่างนี้
          </Button>
          <Button variant="outline" onClick={() => runDemo(true)} data-testid="preview-fail">
            <RotateCcw className="mr-1 h-4 w-4" /> จำลองกรณีอ่านไม่ได้
          </Button>
          <Button variant="secondary" data-testid="preview-local"
            onClick={() => fileRef.current?.click()}>
            <FileImage className="mr-1 h-4 w-4" /> อ่านไฟล์จริงจากเครื่อง (ไม่ใช้ AI)
          </Button>
          <input ref={fileRef} type="file" className="sr-only" accept=".pdf,.txt,.csv"
            data-testid="preview-local-input"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void runLocal(f); }} />
          <p className="text-xs text-muted-foreground">
            โหมดไม่ใช้ AI อ่านได้เฉพาะ PDF ที่มีชั้นข้อความและไฟล์ข้อความ (รูปภาพ/PDF สแกน ต้องใช้โหมด live ซึ่งใช้เครดิต)
          </p>
        </div>
        {applied && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="preview-applied">
            <p className="font-medium">ค่าที่เติมลงฟอร์ม (ตัวอย่าง)</p>
            <p>ชื่อลูกค้า: {applied.customerName || NOT_FOUND_TEXT}</p>
            <p>เบอร์โทร: {applied.customerPhone || NOT_FOUND_TEXT}</p>
            <p>หน่วยงาน: {applied.customerOrg || NOT_FOUND_TEXT}</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{applied.jobDetail}</p>
            <p>รายการงาน: {applied.items.filter((i) => i.title.trim()).length || NOT_FOUND_TEXT}</p>
            <p>กำหนดรับ: {applied.dueAt || NOT_FOUND_TEXT}</p>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border p-3" aria-labelledby="demo-line">
        <h2 id="demo-line" className="text-sm font-semibold">B) การ์ดในกลุ่ม LINE (จำลอง) — การ์ดเดียวจบ</h2>

        <div className="rounded-xl border bg-card p-3 shadow-sm" data-testid="flex-preview">
          <p className="font-semibold text-primary">รับงานใหม่</p>
          <p className="text-xs text-primary">อ่านข้อมูลจากไฟล์แล้ว</p>
          <ul className="mt-2 space-y-1 text-sm">
            {summary.lines.map((l) => (
              <li key={l.no} className={l.found ? '' : 'text-muted-foreground'}>
                {l.no}. {l.label}: {l.value}
              </li>
            ))}
          </ul>
          {summary.reviewCount > 0 && (
            <p className="mt-2 text-xs text-amber-600" data-testid="flex-review">
              มีข้อมูลให้ตรวจ {summary.reviewCount} จุด
            </p>
          )}
          <div className="mt-3 grid gap-2">
            <Button size="sm" data-testid="flex-open-form" onClick={() => setFormDemoOpen(true)}>
              เปิดฟอร์มสั่งงาน
            </Button>
            <Button size="sm" variant="ghost" data-testid="flex-cancel"
              onClick={() => setShowSuccessCard(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" data-testid="toggle-success"
            onClick={() => setShowSuccessCard((v) => !v)}>
            {showSuccessCard ? 'ซ่อนการ์ดรับงานสำเร็จ' : 'ดูการ์ด “รับงานสำเร็จ”'}
          </Button>
        </div>

        {showSuccessCard && (
          <div className="rounded-xl border bg-card p-3 shadow-sm" data-testid="flex-success">
            <p className="flex items-center gap-1 font-semibold text-green-700">
              <CheckCircle2 className="h-4 w-4" /> รับงานสำเร็จ
            </p>
            <p className="text-sm">คิว: Q-2026-0001</p>
            <p className="text-sm">ใบสั่งจ้าง: JO-2026-0001</p>
            <p className="text-sm">ลูกค้า: บริษัท กูรู แพลตฟอร์ม จำกัด</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          ในแชทจริงจะมีเพียง 2 การ์ด: “รับงานใหม่” 1 ใบ และ “รับงานสำเร็จ” 1 ใบหลังยืนยันในฟอร์ม
          ไม่มีข้อความถามระหว่างทาง ปุ่มยกเลิกใช้ postback ไม่แสดง URL ดิบ และยังไม่เปิดใช้กับห้อง LINE จริง
        </p>

        <Dialog open={formDemoOpen} onOpenChange={setFormDemoOpen}>
          <DialogContent className="max-w-md" data-testid="form-demo">
            <DialogHeader>
              <DialogTitle>ตัวอย่างฟอร์มสั่งงาน (ไม่บันทึกข้อมูล)</DialogTitle>
              <DialogDescription>
                ฟอร์มจริงคือฟอร์มรับงานเดิม เปิดด้วย token ปลอดภัย — ตัวอย่างนี้ไม่สร้างคิว ไม่ออกเอกสาร และไม่ส่ง LINE
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-1 text-sm">
              <li>1. ลูกค้า (ชื่อ / เบอร์โทร / หน่วยงาน)</li>
              <li>2. รายการงาน (ชื่องาน / จำนวน / หน่วย / ราคา)</li>
              <li>3. กำหนดรับ</li>
              <li>4. แนบไฟล์</li>
              <li>5. ตัวเลือก “สร้างคิว + ใบสั่งจ้าง”</li>
            </ul>
            <Button variant="secondary" data-testid="form-demo-close" onClick={() => setFormDemoOpen(false)}>
              ปิดตัวอย่าง
            </Button>
          </DialogContent>
        </Dialog>
      </section>

      {status === 'reading' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> กำลังอ่านไฟล์…</p>
      )}

      <ExtractedDataSheet
        open={open} status={status} result={result} error={error}
        onOpenChange={setOpen}
        onRetry={() => void runDemo(false)}
        onEdit={() => setOpen(false)}
        onUse={(r) => { setApplied(applyExtractToDraft(emptyQueueDraft(), r)); setOpen(false); }}
      />
    </main>
  );
}