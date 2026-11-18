/**
 * รับงานใหม่ (Q รันงาน) — bottom sheet มือถือเป็นหลัก
 * กรอกครั้งเดียว → ยืนยัน → สร้างงานในคิว + ใบเสร็จเมื่อจ่ายครบ
 * ไม่ตัดสต๊อก และไม่ส่งเอกสารให้ลูกค้าอัตโนมัติ
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ArrowLeft, Loader2, CheckCircle2, Save, Circle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { supabase } from '@/film-shop/lib/supabase';
import NumField from '@/film-shop/components/queue/NumField';
import {
  QUEUE_METHOD_LABEL, QUEUE_PAY_LABEL, QUEUE_UNITS,
  clearQueueDraft, confirmQueueIntake, emptyQueueDraft, emptyQueueItem,
  loadQueueDraft, queueBaht, queueDraftErrors, queueDraftHasContent, queueItemTotal,
  queueItemArea, queueItemUnitPrice, queueItemSizeLabel, queueItemAutoTotal,
  queueSectionDone, queueSectionErrors, queueTotals, saveQueueDraft,
  type QueueIntakeDraft, type QueueIntakeResult, type QueuePayMethod, type QueuePayMode,
} from '@/film-shop/lib/queueIntake';
import { downloadQueueIntakeCsv } from '@/film-shop/lib/queueIntakeExport';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees?: { id: string; name: string }[];
  onCreated?: (result: QueueIntakeResult) => void;
}

const newRequestId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function QueueIntakeSheet({ open, onOpenChange, employees = [], onCreated }: Props) {
  const [draft, setDraft] = useState<QueueIntakeDraft>(emptyQueueDraft);
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(newRequestId());

  /** อัปโหลดไฟล์งานเข้าที่เก็บไฟล์ แล้วเก็บลิงก์ไว้ในร่าง (ลบทีละไฟล์ได้) */
  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: QueueIntakeDraft['attachments'] = [];
      for (const file of Array.from(files)) {
        const path = `queue-intake/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
        const { error } = await supabase.storage.from('job-attachments').upload(path, file, { upsert: false });
        if (error) { toast.error(`อัปโหลด ${file.name} ไม่สำเร็จ`); continue; }
        const { data } = await supabase.storage.from('job-attachments').createSignedUrl(path, 60 * 60 * 24 * 365);
        added.push({ name: file.name, url: data?.signedUrl ?? path, path });
      }
      if (added.length) {
        setDraft((d) => ({ ...d, attachments: [...(d.attachments ?? []), ...added] }));
        toast.success(`แนบไฟล์แล้ว ${added.length} ไฟล์`);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAttachment = (url: string) =>
    setDraft((d) => ({ ...d, attachments: (d.attachments ?? []).filter((a) => a.url !== url) }));

  useEffect(() => {
    if (open) {
      const saved = loadQueueDraft();
      if (saved && queueDraftHasContent(saved)) {
        setDraft(saved);
        toast.info('โหลดร่างที่บันทึกไว้แล้ว');
      } else {
        setDraft(emptyQueueDraft());
      }
      setStep('form');
      requestId.current = newRequestId();
    }
  }, [open]);

  const totals = useMemo(() => queueTotals(draft), [draft]);
  const sectionErrors = useMemo(() => queueSectionErrors(draft), [draft]);
  const sectionDone = useMemo(() => queueSectionDone(draft), [draft]);
  const doneCount = useMemo(() => Object.values(sectionDone).filter(Boolean).length, [sectionDone]);
  const errors = useMemo(() => queueDraftErrors(draft), [draft]);
  const set = (patch: Partial<QueueIntakeDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setItem = (key: string, patch: Partial<QueueIntakeDraft['items'][number]>) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));

  const saveDraft = () => {
    if (saveQueueDraft(draft)) toast.success('บันทึกร่างแล้ว — เปิดใหม่จะกรอกต่อได้');
    else toast.error('บันทึกร่างไม่สำเร็จ');
  };

  const submit = async () => {
    if (saving) return;
    if (errors.length) { toast.error(errors[0]); setStep('form'); return; }
    setSaving(true);
    try {
      const res = await confirmQueueIntake(draft, requestId.current);
      clearQueueDraft();
      const meta = { orderNo: res.order_no, receiptNo: res.receipt_no };
      toast.success(
        res.duplicate
          ? `งานนี้ถูกสร้างไว้แล้ว (${res.order_no})`
          : `รับงานสำเร็จ ${res.order_no}${res.receipt_no ? ` · ใบเสร็จ ${res.receipt_no}` : ''}`,
        {
          action: {
            label: 'ดาวน์โหลดใบรับงาน',
            onClick: () => downloadQueueIntakeCsv(draft, meta),
          },
        },
      );
      onCreated?.(res);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'สร้างงานไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-testid="queue-intake-sheet"
        className="flex h-[90vh] flex-col rounded-t-2xl p-0"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
          <SheetTitle className="text-base">
            {step === 'form' ? 'รับงานใหม่' : 'ตรวจทานก่อนยืนยัน'}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
             ยืนยันครั้งเดียว = งานเข้า Q {draft.payMode === 'paid' ? '+ ใบเสร็จ' : ''}
           </p>
          <div className="pt-1" data-testid="qi-progress">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>ความคืบหน้า</span>
              <span data-testid="qi-progress-count">{doneCount}/4 ส่วน</span>
            </div>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  className={cn(
                    'h-1.5 flex-1 rounded-full',
                    sectionDone[n as 1 | 2 | 3 | 4] ? 'bg-primary' : 'bg-muted',
                  )}
                />
              ))}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {step === 'form' ? (
            <>
              <Section n={1} title="ลูกค้า" errors={sectionErrors[1]} done={sectionDone[1]}>
                <Field label="ชื่อลูกค้า *">
                  <Input
                    data-testid="qi-customer-name"
                    value={draft.customerName}
                    onChange={(e) => set({ customerName: e.target.value })}
                    placeholder="เช่น ครูเมย์ / โรงเรียนบ้านบ่อหยวก"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="เบอร์โทร">
                    <Input
                      inputMode="tel"
                      value={draft.customerPhone}
                      onChange={(e) => set({ customerPhone: e.target.value })}
                      placeholder="08x-xxx-xxxx"
                    />
                  </Field>
                  <Field label="หน่วยงาน">
                    <Input
                      value={draft.customerOrg}
                      onChange={(e) => set({ customerOrg: e.target.value })}
                      placeholder="ไม่บังคับ"
                    />
                  </Field>
                </div>
              </Section>

              <Section n={2} title="รายการงาน" errors={sectionErrors[2]} done={sectionDone[2]}>
                {draft.items.map((item, idx) => (
                  <div key={item.key} className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">รายการที่ {idx + 1}</span>
                      {draft.items.length > 1 && (
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-7 px-2 text-destructive"
                          onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.key !== item.key) }))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Input
                        data-testid={`qi-item-title-${idx}`}
                        value={item.title}
                        onChange={(e) => setItem(item.key, { title: e.target.value })}
                        placeholder="ชื่องาน *"
                      />
                      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
                        <NumField
                          kind="money" label="กว้าง" placeholder="กว้าง"
                          testId={`qi-width-${idx}`}
                          value={item.width ?? 0}
                          onValue={(n) => setItem(item.key, { width: n })}
                        />
                        <span className="px-0.5 text-sm text-muted-foreground">×</span>
                        <NumField
                          kind="money" label="ยาว" placeholder="ยาว"
                          testId={`qi-height-${idx}`}
                          value={item.height ?? 0}
                          onValue={(n) => setItem(item.key, { height: n })}
                        />
                        <select
                          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                          aria-label="หน่วยขนาด"
                          data-testid={`qi-size-unit-${idx}`}
                          value={item.sizeUnit ?? 'm'}
                          onChange={(e) => setItem(item.key, { sizeUnit: e.target.value as 'm' | 'cm' })}
                        >
                          <option value="m">ม.</option>
                          <option value="cm">ซม.</option>
                        </select>
                      </div>
                      <NumField
                        kind="money" label="ราคาต่อ ตร.ม." placeholder="ราคา / ตร.ม."
                        testId={`qi-price-sqm-${idx}`}
                        value={item.pricePerSqm ?? 0}
                        onValue={(n) => setItem(item.key, { pricePerSqm: n })}
                      />
                      {queueItemArea(item) > 0 && (
                        <p data-testid={`qi-area-${idx}`} className="text-[11px] text-muted-foreground">
                          พื้นที่ {queueItemArea(item)} ตร.ม./ชิ้น
                          {(item.pricePerSqm ?? 0) > 0 && ` · ราคาต่อหน่วย ${queueBaht(queueItemUnitPrice(item))} บาท`}
                          {` · ${queueItemSizeLabel(item)}`}
                        </p>
                      )}
                      <Input
                        value={item.size}
                        onChange={(e) => setItem(item.key, { size: e.target.value })}
                        placeholder="รายละเอียดเพิ่มเติม"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <NumField
                          kind="qty" label="จำนวน" placeholder="จำนวน"
                          testId={`qi-qty-${idx}`}
                          value={item.quantity}
                          onValue={(n) => setItem(item.key, { quantity: n })}
                        />
                        <select
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          aria-label="หน่วย"
                          value={item.unit}
                          onChange={(e) => setItem(item.key, { unit: e.target.value })}
                        >
                          {QUEUE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <NumField
                          kind="money" label="ราคาต่อหน่วย" placeholder="ราคา/หน่วย"
                          testId={`qi-item-price-${idx}`}
                          value={(item.pricePerSqm ?? 0) > 0 && queueItemArea(item) > 0 ? queueItemUnitPrice(item) : item.unitPrice}
                          onValue={(n) => setItem(item.key, { unitPrice: n })}
                        />
                        <NumField
                          kind="money" label="ส่วนลด" placeholder="ส่วนลด"
                          testId={`qi-item-discount-${idx}`}
                          value={item.discount}
                          onValue={(n) => setItem(item.key, { discount: n })}
                        />
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor={`qi-total-${item.key}`} className="text-xs text-muted-foreground">
                            รวมเงิน (บาท)
                            {item.manualTotal === null || item.manualTotal === undefined ? ' · คำนวณอัตโนมัติ' : ' · แก้เอง'}
                          </Label>
                          {item.manualTotal !== null && item.manualTotal !== undefined && (
                            <Button
                              type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                              onClick={() => setItem(item.key, { manualTotal: null })}
                            >
                              กลับเป็นอัตโนมัติ
                            </Button>
                          )}
                        </div>
                        <NumField
                          id={`qi-total-${item.key}`}
                          testId={`qi-line-total-${idx}`}
                          kind="money"
                          label="รวมเงิน"
                          className="mt-1 text-right font-semibold"
                          value={item.manualTotal ?? queueItemAutoTotal(item)}
                          onValue={(n) => setItem(item.key, { manualTotal: n })}
                        />
                      </div>
                      <p className="text-right text-sm font-semibold">รวม {queueBaht(queueItemTotal(item))} ฿</p>
                    </div>

                  </div>
                ))}
                <Button
                  type="button" variant="outline" className="h-10 w-full rounded-xl"
                  data-testid="qi-add-item"
                  onClick={() => setDraft((d) => ({ ...d, items: [...d.items, emptyQueueItem()] }))}
                >
                  <Plus className="mr-1 h-4 w-4" /> เพิ่มรายการ
                </Button>
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm" data-testid="qi-live-summary">
                  <Line label="รวมก่อนส่วนลด" value={`${queueBaht(totals.subtotal)} ฿`} />
                  <div className="flex items-center justify-between py-0.5 text-destructive">
                    <span>ส่วนลดรวม</span>
                    <span data-testid="qi-discount-total">-{queueBaht(totals.discount)} ฿</span>
                  </div>
                  <Line label="ยอดสุทธิ" value={`${queueBaht(totals.total)} ฿`} strong />
                </div>
              </Section>

              <Section n={3} title="นัดรับ / ผู้รับผิดชอบ" errors={sectionErrors[3]} done={sectionDone[3]}>
                <Field label="กำหนดรับงาน">
                  <Input
                    type="datetime-local"
                    data-testid="qi-due"
                    value={draft.dueAt}
                    onChange={(e) => set({ dueAt: e.target.value })}
                  />
                </Field>
                <Field label="ผู้รับผิดชอบ">
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={draft.assigneeEmployeeId}
                    onChange={(e) => {
                      const emp = employees.find((x) => x.id === e.target.value);
                      set({ assigneeEmployeeId: e.target.value, assigneeName: emp?.name ?? '' });
                    }}
                  >
                    <option value="">ยังไม่ระบุ</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </Field>
                <Field label="รายละเอียด/โน้ตงาน">
                  <Textarea
                    rows={2}
                    value={draft.jobDetail}
                    onChange={(e) => set({ jobDetail: e.target.value })}
                    placeholder="เช่น ใช้ผ้าหนา ตอกตาไก่ 4 มุม"
                  />
                </Field>
                <Field label="ไฟล์งาน (รูป/ไฟล์อาร์ตเวิร์ก)">
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        ref={fileRef}
                        type="file"
                        multiple
                        className="h-10"
                        data-testid="qi-file-input"
                        onChange={(e) => uploadFiles(e.target.files)}
                      />
                      {uploading && <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                    <Input
                      value={draft.attachmentUrl}
                      onChange={(e) => set({ attachmentUrl: e.target.value })}
                      placeholder="หรือวางลิงก์ Google Drive (ไม่บังคับ)"
                    />
                    {(draft.attachments ?? []).length > 0 && (
                      <ul className="divide-y rounded-xl border" data-testid="qi-attachments">
                        {(draft.attachments ?? []).map((a) => (
                          <li key={a.url} className="flex items-center gap-2 px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-xs">{a.name}</span>
                            <Button
                              type="button" size="icon" variant="ghost"
                              className="h-9 w-9 text-destructive"
                              aria-label={`ลบไฟล์ ${a.name}`}
                              onClick={() => removeAttachment(a.url)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Field>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <span className="text-sm font-medium">งานด่วน</span>
                  <Switch checked={draft.isUrgent} onCheckedChange={(v) => set({ isUrgent: v })} />
                </label>
              </Section>

              <Section n={4} title="การชำระเงิน" errors={sectionErrors[4]} done={sectionDone[4]}>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(QUEUE_PAY_LABEL) as QueuePayMode[]).map((m) => (
                    <Button
                      key={m} type="button"
                      data-testid={`qi-pay-${m}`}
                      variant={draft.payMode === m ? 'default' : 'outline'}
                      className="h-11 rounded-xl text-xs font-semibold"
                      onClick={() => set({ payMode: m })}
                    >
                      {QUEUE_PAY_LABEL[m]}
                    </Button>
                  ))}
                </div>
                {draft.payMode === 'deposit' && (
                  <Field label="เงินมัดจำ (บาท)">
                    <Input
                      inputMode="decimal" type="number" min={0}
                      data-testid="qi-deposit"
                      value={draft.deposit}
                      onChange={(e) => set({ deposit: Number(e.target.value) })}
                    />
                  </Field>
                )}
                {draft.payMode === 'paid' && (
                  <Field label="รับเงินมา (บาท)">
                    <Input
                      inputMode="decimal" type="number" min={0}
                      data-testid="qi-received"
                      value={draft.received}
                      onChange={(e) => set({ received: Number(e.target.value) })}
                    />
                  </Field>
                )}
                {draft.payMode !== 'unpaid' && (
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(QUEUE_METHOD_LABEL) as QueuePayMethod[]).map((m) => (
                      <Button
                        key={m} type="button"
                        variant={draft.method === m ? 'secondary' : 'outline'}
                        className="h-10 rounded-xl text-xs"
                        onClick={() => set({ method: m })}
                      >
                        {QUEUE_METHOD_LABEL[m]}
                      </Button>
                    ))}
                  </div>
                )}
              </Section>
            </>
          ) : (
            <div className="space-y-3" data-testid="qi-review">
              <ReviewRow label="ลูกค้า" value={[draft.customerName, draft.customerOrg].filter(Boolean).join(' · ')} />
              {draft.customerPhone && <ReviewRow label="เบอร์โทร" value={draft.customerPhone} />}
              <div className="rounded-xl border border-border">
                {draft.items.filter((i) => i.title.trim()).map((i) => (
                  <div key={i.key} className="flex items-start justify-between gap-2 border-b border-border px-3 py-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[i.size, `${i.quantity} ${i.unit}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">{queueBaht(queueItemTotal(i))} ฿</span>
                  </div>
                ))}
              </div>
              <ReviewRow label="กำหนดรับ" value={draft.dueAt ? new Date(draft.dueAt).toLocaleString('th-TH') : 'ยังไม่ระบุ'} />
              <ReviewRow label="ผู้รับผิดชอบ" value={draft.assigneeName || 'ยังไม่ระบุ'} />
              <ReviewRow label="การชำระเงิน" value={QUEUE_PAY_LABEL[draft.payMode]} />
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <Line label="รวมก่อนส่วนลด" value={`${queueBaht(totals.subtotal)} ฿`} />
                <Line label="ส่วนลดรวม" value={`-${queueBaht(totals.discount)} ฿`} />
                <Line label="ยอดรวม" value={`${queueBaht(totals.total)} ฿`} strong />
                {draft.payMode === 'deposit' && <Line label="มัดจำ" value={`${queueBaht(totals.deposit)} ฿`} />}
                {draft.payMode === 'paid' && <Line label="เงินทอน" value={`${queueBaht(totals.change)} ฿`} />}
                <Line label="คงเหลือ" value={`${queueBaht(totals.balance)} ฿`} />
              </div>
              <Button
                type="button" variant="outline" className="h-11 w-full rounded-xl"
                data-testid="qi-download-csv"
                onClick={() => {
                  downloadQueueIntakeCsv(draft);
                  toast.success('ดาวน์โหลดใบรับงาน (CSV) แล้ว — เปิดใน Excel/Google Sheets ได้');
                }}
              >
                <Download className="mr-2 h-4 w-4" /> ดาวน์โหลดใบรับงาน (CSV)
              </Button>
              <ul className="space-y-1 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                <li>• สร้างงานเข้า Q รันงาน</li>
                <li>• ออกใบสั่งจ้าง 1 ใบ</li>
                {draft.payMode === 'paid' && <li>• ออกใบเสร็จรับเงิน 1 ใบ</li>}
                <li>• ไม่ตัดสต๊อก และไม่ส่งเอกสารให้ลูกค้าอัตโนมัติ</li>
              </ul>
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">ยอดรวม</span>
            <span data-testid="qi-total" className="text-lg font-bold">{queueBaht(totals.total)} ฿</span>
          </div>
          {step === 'form' ? (
            <div className="flex gap-2">
              <Button
                type="button" variant="outline"
                className="h-12 rounded-xl px-4 text-sm font-semibold"
                data-testid="qi-save-draft"
                onClick={saveDraft}
              >
                <Save className="mr-1 h-4 w-4" /> บันทึกร่าง
              </Button>
              <Button
                type="button" className="h-12 flex-1 rounded-xl text-base font-semibold"
                data-testid="qi-next"
                disabled={errors.length > 0}
                onClick={() => setStep('review')}
              >
                ตรวจทานข้อมูล
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={() => setStep('form')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button" className="h-12 flex-1 rounded-xl text-base font-semibold"
                data-testid="qi-confirm"
                disabled={saving}
                onClick={() => void submit()}
              >
                {saving
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังสร้าง…</>
                  : <><CheckCircle2 className="mr-2 h-4 w-4" /> ยืนยันรับงาน</>}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ n, title, errors, done, children }: { n: number; title: string; errors: string[]; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
        {title}
        <span className="ml-auto flex items-center gap-1 text-[11px] font-medium" data-testid={`qi-section-${n}-state`}>
          {done
            ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> <span className="text-emerald-600">ครบแล้ว</span></>
            : <><Circle className="h-3.5 w-3.5 text-muted-foreground" /> <span className="text-muted-foreground">ยังไม่ครบ</span></>}
        </span>
      </h3>
      <div className="space-y-2">{children}</div>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-destructive">
          {errors.map((e) => <li key={e}>• {e}</li>)}
        </ul>
      )}
    </section>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);

const ReviewRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-3 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{value}</span>
  </div>
);

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={cn('flex items-center justify-between py-0.5', strong && 'font-bold')}>
    <span>{label}</span><span>{value}</span>
  </div>
);