/**
 * รับงานใหม่ — ฟอร์มมือถือ 3 ขั้น (ลูกค้า → รายการงาน → ตรวจสอบ)
 * ใช้ได้ 2 โหมด: เปิดจากกลุ่ม LINE ด้วย token, หรือแอดมินที่ล็อกอินแล้ว
 * ระบบ Film Shop ใช้คิวงานและใบเสร็จเท่านั้น
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, ChevronLeft, ChevronRight, CheckCircle2, Paperclip, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/film-shop/lib/supabase';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import {
  QueueIntakeDraft, emptyQueueDraft, emptyQueueItem, queueSectionErrors,
  buildQueueIntakePayload, confirmQueueIntake, queueBaht, queueTotals, QUEUE_UNITS,
  queueItemAutoTotal, queueItemTotal, parseMoneyInput, parseQtyInput,
  queueItemArea, queueItemUnitPrice, queueItemSizeLabel,
} from '@/film-shop/lib/queueIntake';
import { downloadQueueIntakeCsv } from '@/film-shop/lib/queueIntakeExport';
import { confirmIntakeByToken, uploadIntakeFile, IntakeConfirmResult } from '@/film-shop/lib/intakeFormApi';
import ExtractedDataSheet, { type ExtractStatus } from '@/film-shop/components/queue/ExtractedDataSheet';
import { extractIntakeFromFile, isFileIntakeEnabled } from '@/film-shop/lib/fileIntakeAdapter';
import {
  applyExtractToDraft, validateIntakeFile, type ExtractedIntake,
} from '@/film-shop/lib/fileIntakeExtract';

/** ไฟล์แนบงานรับได้ทุกชนิดเดิม (รวม .ai/.psd) — OCR ใช้เฉพาะไฟล์ที่อ่านได้เท่านั้น */
const ATTACH_ACCEPT = 'image/*,.pdf,.ai,.psd';
const ATTACH_MAX_MB = 20;

const DRAFT_KEY = 'film-shop:intake-wizard:v1';
const STEPS = ['ลูกค้า', 'รายการงาน', 'ตรวจสอบ'] as const;

/**
 * ช่องกรอกตัวเลขที่ตรวจรูปแบบทันที — เก็บข้อความที่พิมพ์ไว้เพื่อให้พิมพ์ทศนิยมได้
 * และแจ้งเตือนใต้ช่องเมื่อรูปแบบผิด (ไม่ดันค่าเพี้ยนเข้าฟอร์ม)
 */
function NumField({
  id, testId, label, placeholder, value, kind, className, onValue,
}: {
  id?: string;
  testId?: string;
  label?: string;
  placeholder?: string;
  value: number;
  kind: 'money' | 'qty';
  className?: string;
  onValue: (n: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = text ?? String(value ?? 0);
  return (
    <div className="w-full">
      <Input
        id={id}
        data-testid={testId}
        aria-label={label}
        aria-invalid={!!error}
        inputMode="decimal"
        placeholder={placeholder}
        className={className}
        value={shown}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const r = kind === 'money' ? parseMoneyInput(raw) : parseQtyInput(raw);
          setError(r.error);
          if (r.value !== null) onValue(r.value);
        }}
        onBlur={() => { setText(null); setError(null); }}
      />
      {error && (
        <p role="alert" data-testid={testId ? `${testId}-error` : undefined} className="mt-1 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export interface QueueIntakeWizardProps {
  /** โหมด token = เปิดจากกลุ่ม LINE, โหมด admin = ในเว็บ */
  token?: string | null;
  storeLabel?: string | null;
  /** ข้อมูลที่บอทอ่านจากไฟล์ในกลุ่ม LINE — เติมให้อัตโนมัติครั้งเดียวตอนเปิดฟอร์ม */
  prefill?: ExtractedIntake | null;
  onDone?: (r: IntakeConfirmResult) => void;
}

export default function QueueIntakeWizard({ token, storeLabel, prefill, onDone }: QueueIntakeWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<QueueIntakeDraft>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) return { ...emptyQueueDraft(), ...JSON.parse(raw) } as QueueIntakeDraft;
    } catch { /* ignore */ }
    return emptyQueueDraft();
  });
  const [uploading, setUploading] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<ExtractStatus>('reading');
  const [ocrResult, setOcrResult] = useState<ExtractedIntake | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const lastReadFile = useRef<File | null>(null);
  const [result, setResult] = useState<IntakeConfirmResult | null>(null);
  const requestId = useRef(`wz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const { busy, run } = useSubmitGuard();
  const fileRef = useRef<HTMLInputElement>(null);
  const prefillDone = useRef(false);

  useEffect(() => {
    if (!prefill || prefillDone.current) return;
    prefillDone.current = true;
    setDraft((d) => applyExtractToDraft(d, prefill));
  }, [prefill]);

  useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(id);
  }, [draft]);

  const errs = useMemo(() => queueSectionErrors(draft), [draft]);
  const totals = useMemo(() => queueTotals(draft), [draft]);
  const canNext = step === 0 ? errs[1].length === 0 : step === 1 ? errs[2].length === 0 : true;
  const set = (patch: Partial<QueueIntakeDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setItem = (key: string, patch: Partial<QueueIntakeDraft['items'][number]>) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));

  async function pickFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: QueueIntakeDraft['attachments'] = [];
      for (const f of Array.from(files)) {
        if (f.size > ATTACH_MAX_MB * 1024 * 1024) { toast.error(`ไฟล์ "${f.name}" ใหญ่เกิน ${ATTACH_MAX_MB} MB`); continue; }
        if (token) {
          const up = await uploadIntakeFile(token, f);
          added.push({ name: up.name, url: up.url, path: up.path });
        } else {
          const path = `queue-intake/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`;
          const { error } = await supabase.storage.from('job-attachments').upload(path, f, { upsert: false });
          if (error) throw new Error(error.message);
          const { data } = await supabase.storage.from('job-attachments').createSignedUrl(path, 60 * 60 * 24 * 365);
          added.push({ name: f.name, url: data?.signedUrl ?? '', path });
        }
      }
      if (added.length) setDraft((d) => ({ ...d, attachments: [...(d.attachments ?? []), ...added] }));
      if (isFileIntakeEnabled()) {
        const readable = Array.from(files).find((f) => validateIntakeFile(f).ok);
        if (readable) void readFile(readable);
      }
    } catch (e) {
      toast.error((e as Error).message || 'อัปโหลดไฟล์ไม่สำเร็จ');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /** อ่านข้อมูลจากไฟล์เพื่อ "เสนอ" ให้ยืนยัน — ไม่เติมฟอร์มเองจนกว่าผู้ใช้จะกดใช้ */
  async function readFile(file: File) {
    if (!isFileIntakeEnabled()) return;
    lastReadFile.current = file;
    setOcrResult(null); setOcrError(null); setOcrStatus('reading'); setOcrOpen(true);
    try {
      const r = await extractIntakeFromFile(file, { token });
      setOcrResult(r); setOcrStatus('done');
    } catch (e) {
      setOcrError((e as Error).message || 'อ่านไฟล์ไม่ได้'); setOcrStatus('error');
    }
  }

  async function confirm() {
    const all = [...errs[1], ...errs[2]];
    if (all.length) { toast.error(all[0]); return; }
    await run(async () => {
      try {
        const res = token
          ? await confirmIntakeByToken(token, buildQueueIntakePayload(draft, requestId.current))
          : (await confirmQueueIntake(draft, requestId.current)) as IntakeConfirmResult;
        setResult(res);
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        onDone?.(res);
      } catch (e) {
        toast.error((e as Error).message || 'ยืนยันไม่สำเร็จ');
      }
    });
  }

  if (result) {
    return (
      <div className="space-y-4 p-4 text-center" data-testid="intake-wizard-success">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <p className="text-sm text-muted-foreground">รับงานเข้าคิวแล้ว</p>
        <p className="text-2xl font-bold">{result.order_no}</p>
        {result.receipt_no && <p className="text-sm">ใบเสร็จ: {result.receipt_no}</p>}
        <div className="grid gap-2">
          <Button
            variant="secondary" data-testid="intake-wizard-download-csv"
            onClick={() => downloadQueueIntakeCsv(draft, {
              orderNo: result.order_no,
              receiptNo: result.receipt_no,
            })}
          >
            <Download className="mr-1 h-4 w-4" /> ดาวน์โหลดใบรับงาน (CSV)
          </Button>
          <Button onClick={() => window.open(`/film-shop/app?p=group-queue`, '_blank')}>ดูคิวงาน</Button>
          <Button variant="outline" onClick={() => window.open(`/film-shop/app?p=invoices`, '_blank')}>
            ดูใบเสร็จ
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setResult(null); setStep(0); setDraft(emptyQueueDraft());
              requestId.current = `wz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            }}
          >
            รับงานใหม่อีกครั้ง
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="intake-wizard">
      <ExtractedDataSheet
        open={ocrOpen}
        status={ocrStatus}
        result={ocrResult}
        error={ocrError}
        onOpenChange={setOcrOpen}
        onRetry={() => { if (lastReadFile.current) void readFile(lastReadFile.current); }}
        onEdit={() => { setOcrOpen(false); setStep(0); }}
        onUse={(r) => {
          setDraft((d) => applyExtractToDraft(d, r));
          setOcrOpen(false); setStep(0);
          toast.success('เติมข้อมูลจากไฟล์แล้ว ตรวจสอบและแก้ไขได้ค่ะ');
        }}
      />
      <div className="border-b p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{storeLabel || 'รับงานใหม่'}</span>
          <span>ขั้นที่ {step + 1}/3 · {STEPS[step]}</span>
        </div>
        <div className="mt-2 flex gap-1" aria-label="ความคืบหน้า">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {step === 0 && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="wz-name">ชื่อลูกค้า *</Label>
              <Input id="wz-name" value={draft.customerName} onChange={(e) => set({ customerName: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="wz-phone">เบอร์โทร</Label>
              <Input id="wz-phone" inputMode="tel" value={draft.customerPhone} onChange={(e) => set({ customerPhone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="wz-org">โรงเรียน / หน่วยงาน</Label>
              <Input id="wz-org" value={draft.customerOrg} onChange={(e) => set({ customerOrg: e.target.value })} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {draft.items.map((it, idx) => (
              <div key={it.key} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">รายการที่ {idx + 1}</span>
                  {draft.items.length > 1 && (
                    <Button size="icon" variant="ghost" aria-label="ลบรายการ"
                      onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((x) => x.key !== it.key) }))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Input placeholder="ชื่องาน *" value={it.title} onChange={(e) => setItem(it.key, { title: e.target.value })} />
                <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
                  <NumField
                    kind="money"
                    label="กว้าง"
                    placeholder="กว้าง"
                    testId={`wz-width-${idx}`}
                    value={it.width ?? 0}
                    onValue={(n) => setItem(it.key, { width: n })}
                  />
                  <span className="px-0.5 text-sm text-muted-foreground">×</span>
                  <NumField
                    kind="money"
                    label="ยาว"
                    placeholder="ยาว"
                    testId={`wz-height-${idx}`}
                    value={it.height ?? 0}
                    onValue={(n) => setItem(it.key, { height: n })}
                  />
                  <select
                    className="h-10 rounded-md border bg-background px-2 text-sm"
                    aria-label="หน่วยขนาด"
                    data-testid={`wz-size-unit-${idx}`}
                    value={it.sizeUnit ?? 'm'}
                    onChange={(e) => setItem(it.key, { sizeUnit: e.target.value as 'm' | 'cm' })}
                  >
                    <option value="m">ม.</option>
                    <option value="cm">ซม.</option>
                  </select>
                </div>
                <NumField
                  kind="money"
                  label="ราคาต่อ ตร.ม."
                  placeholder="ราคา / ตร.ม."
                  testId={`wz-price-sqm-${idx}`}
                  value={it.pricePerSqm ?? 0}
                  onValue={(n) => setItem(it.key, { pricePerSqm: n })}
                />
                {queueItemArea(it) > 0 && (
                  <p data-testid={`wz-area-${idx}`} className="text-[11px] text-muted-foreground">
                    พื้นที่ {queueItemArea(it)} ตร.ม./ชิ้น
                    {(it.pricePerSqm ?? 0) > 0 && ` · ราคาต่อหน่วย ${queueBaht(queueItemUnitPrice(it))} บาท`}
                    {` · ${queueItemSizeLabel(it)}`}
                  </p>
                )}
                <Input placeholder="รายละเอียดเพิ่มเติม" value={it.size} onChange={(e) => setItem(it.key, { size: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <NumField
                    kind="qty"
                    label="จำนวน"
                    placeholder="จำนวน"
                    testId={`wz-qty-${idx}`}
                    value={it.quantity}
                    onValue={(n) => setItem(it.key, { quantity: n })}
                  />
                  <select className="h-10 rounded-md border bg-background px-2 text-sm" aria-label="หน่วย"
                    value={it.unit} onChange={(e) => setItem(it.key, { unit: e.target.value })}>
                    {QUEUE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <NumField
                  kind="money"
                  label="ราคาต่อหน่วย"
                  placeholder="ราคาต่อหน่วย (ถ้าไม่คิดเป็น ตร.ม.)"
                  testId={`wz-unit-price-${idx}`}
                  value={(it.pricePerSqm ?? 0) > 0 && queueItemArea(it) > 0 ? queueItemUnitPrice(it) : it.unitPrice}
                  onValue={(n) => setItem(it.key, { unitPrice: n })}
                />
                <div className="rounded-md bg-muted/50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`wz-total-${it.key}`} className="text-xs text-muted-foreground">
                      รวมเงิน (บาท)
                      {it.manualTotal === null || it.manualTotal === undefined ? ' · คำนวณอัตโนมัติ' : ' · แก้เอง'}
                    </Label>
                    {it.manualTotal !== null && it.manualTotal !== undefined && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                        onClick={() => setItem(it.key, { manualTotal: null })}>
                        กลับเป็นอัตโนมัติ
                      </Button>
                    )}
                  </div>
                  <NumField
                    id={`wz-total-${it.key}`}
                    testId={`wz-line-total-${idx}`}
                    kind="money"
                    label="รวมเงิน"
                    className="mt-1 text-right font-semibold"
                    value={it.manualTotal ?? queueItemAutoTotal(it)}
                    onValue={(n) => setItem(it.key, { manualTotal: n })}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border bg-background p-3 text-sm font-semibold">
              <span>รวมทั้งหมด</span>
              <span data-testid="wz-grand-total">{queueBaht(totals.total)} บาท</span>
            </div>
            <Button variant="outline" className="w-full"
              onClick={() => setDraft((d) => ({ ...d, items: [...d.items, emptyQueueItem()] }))}>
              <Plus className="mr-1 h-4 w-4" /> เพิ่มรายการงาน
            </Button>

            <div className="space-y-2 rounded-lg border p-3">
              <Label htmlFor="wz-due">กำหนดรับ</Label>
              <Input id="wz-due" type="datetime-local" value={draft.dueAt} onChange={(e) => set({ dueAt: e.target.value })} />
              <div className="flex items-center justify-between pt-1">
                <Label htmlFor="wz-urgent">งานด่วน</Label>
                <Switch id="wz-urgent" checked={draft.isUrgent} onCheckedChange={(v) => set({ isUrgent: v })} />
              </div>
              <Textarea placeholder="หมายเหตุ" value={draft.jobDetail} onChange={(e) => set({ jobDetail: e.target.value })} />
              <input ref={fileRef} type="file" multiple className="hidden"
                accept={ATTACH_ACCEPT} onChange={(e) => pickFiles(e.target.files)} />
              <Button variant="outline" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />}
                แนบไฟล์งาน (รูป/PDF/AI/PSD)
              </Button>
              {(draft.attachments ?? []).map((a, i) => (
                <div key={`${a.path}-${i}`} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                  <span className="truncate">{a.name}</span>
                  <Button size="icon" variant="ghost" aria-label={`ลบไฟล์ ${a.name}`}
                    onClick={() => setDraft((d) => ({ ...d, attachments: (d.attachments ?? []).filter((_, j) => j !== i) }))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{draft.customerName || '-'}</p>
              <p className="text-muted-foreground">{[draft.customerPhone, draft.customerOrg].filter(Boolean).join(' · ') || '-'}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              {draft.items.filter((i) => i.title.trim()).map((i) => (
                <div key={i.key} className="flex justify-between gap-2 py-1">
                  <span className="truncate">{i.title} {i.size && <span className="text-muted-foreground">({i.size})</span>}</span>
                  <span className="whitespace-nowrap">{i.quantity} {i.unit} · {queueBaht(queueItemTotal(i))}</span>
                </div>
              ))}
              <div className="mt-2 space-y-0.5 border-t pt-2">
                <div className="flex justify-between text-muted-foreground">
                  <span>รวมก่อนส่วนลด</span><span>{queueBaht(totals.subtotal)} บาท</span>
                </div>
                <div className="flex justify-between text-destructive" data-testid="wz-discount-total">
                  <span>ส่วนลดรวม</span><span>-{queueBaht(totals.discount)} บาท</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>รวม</span><span>{queueBaht(totals.total)} บาท</span>
                </div>
              </div>
            </div>
            <Button
              variant="outline" className="w-full" data-testid="wz-download-csv"
              onClick={() => {
                downloadQueueIntakeCsv(draft);
                toast.success('ดาวน์โหลดใบรับงาน (CSV) แล้ว — เปิดใน Excel/Google Sheets ได้');
              }}
            >
              <Download className="mr-1 h-4 w-4" /> ดาวน์โหลดใบรับงาน (CSV)
            </Button>
            <div className="space-y-2 rounded-lg border p-3">
              <Label>เอกสาร</Label>
              <p className="text-sm text-muted-foreground">
                ระบบจะสร้างใบเสร็จเมื่อรับเงินครบในขั้นตอนนี้ โดยไม่สร้างใบสั่งจ้าง
              </p>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setStep(0)}>แก้ไขข้อมูลย้อนหลัง</Button>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t p-3 pb-[env(safe-area-inset-bottom)]">
        <Button variant="outline" className="flex-1" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ChevronLeft className="mr-1 h-4 w-4" /> ย้อนกลับ
        </Button>
        {step < 2 ? (
          <Button className="flex-1" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            ถัดไป <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button className="flex-1" data-testid="intake-wizard-confirm"
            disabled={busy || errs[1].length > 0 || errs[2].length > 0} onClick={confirm}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} ยืนยันสร้างคิว
          </Button>
        )}
      </div>
    </div>
  );
}
