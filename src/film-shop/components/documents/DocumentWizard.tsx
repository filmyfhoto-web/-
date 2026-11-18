import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, FileSignature, Paperclip, Pencil, Plus,
  Receipt, Save, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { uploadOrderAttachment } from '@/film-shop/lib/orderAttachments';
import { GROUPS } from '@/film-shop/lib/groups';
import { buildFilmDocPayload, issueFilmDocument, nextFilmDocNumber } from '@/film-shop/lib/filmDocIssue';
import type { Invoice, InvoiceAttachment, VinylItem } from '@/film-shop/types';

export type WizardMode = 'receipt';

interface DraftItem {
  id: string;
  name: string;
  detail: string;
  quantity: number;
  unit: string;
  pricePerPiece: number;
  discount: number;
}

interface DraftState {
  mode: WizardMode;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerOrg: string;
  customerAddress: string;
  customerTaxId: string;
  items: DraftItem[];
  dueDate: string;
  jobDetail: string;
  deposit: number;
  paymentMethod: 'cash' | 'transfer' | 'credit';
  staffNote: string;
  attachments: InvoiceAttachment[];
}

const DRAFT_KEY = 'film-shop:doc-wizard-draft';
const UNITS = ['ชิ้น', 'ผืน', 'ใบ', 'ชุด', 'แผ่น', 'ตร.ม.', 'รูป', 'เล่ม'];

const emptyItem = (): DraftItem => ({
  id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: '', detail: '', quantity: 1, unit: 'ชิ้น', pricePerPiece: 0, discount: 0,
});

const emptyDraft = (mode: WizardMode): DraftState => ({
  mode,
  customerName: '', customerPhone: '', customerOrg: '', customerAddress: '', customerTaxId: '',
  items: [], dueDate: '', jobDetail: '', deposit: 0, paymentMethod: 'cash', staffNote: '', attachments: [],
});

export const itemTotal = (i: Pick<DraftItem, 'quantity' | 'pricePerPiece' | 'discount'>) =>
  Math.max(0, i.quantity * i.pricePerPiece - (i.discount || 0));

export const draftTotals = (items: DraftItem[], deposit: number) => {
  const subtotal = items.reduce((s, i) => s + itemTotal(i), 0);
  const discount = items.reduce((s, i) => s + (i.discount || 0), 0);
  const total = subtotal;
  return { subtotal, discount, total, amountDue: Math.max(0, total - (deposit || 0)) };
};

const baht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STEP_LABELS = ['ชนิดเอกสาร', 'ข้อมูลลูกค้า', 'รายการ', 'รายละเอียดงาน', 'ตรวจสอบ'];

/**
 * ผู้ช่วยออกใบเสร็จทีละขั้น (Film Shop)
 * ยังไม่ออกเลขเอกสารจนกดอนุมัติ · กันกดซ้ำ · บันทึกร่างอัตโนมัติ
 */
export function DocumentWizard({
  mode: initialMode, source, onCancel, onIssued,
}: {
  mode: WizardMode;
  /** ออกใบเสร็จจากใบสั่งจ้างเดิม — ดึงข้อมูลมาให้ตรวจสอบ ไม่ต้องกรอกใหม่ */
  source?: Invoice;
  onCancel: () => void;
  onIssued: (invoiceId?: string) => void;
}) {
  const g = GROUPS.filmshop;
  const { customers, invoices, addInvoice, updateInvoice, generateInvoiceNumber, refetch } = useAppData() as any;
  const { busy, run } = useSubmitGuard();
  const [step, setStep] = useState(source ? 4 : 0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState<DraftItem>(emptyItem());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<DraftState>(() => {
    if (source) {
      return {
        ...emptyDraft('receipt'),
        customerId: source.customerId,
        customerName: source.customerName,
        customerPhone: source.customerPhone ?? '',
        customerAddress: source.customerAddress ?? '',
        customerTaxId: source.customerTaxId ?? '',
        deposit: source.deposit || 0,
        paymentMethod: source.paymentMethod ?? 'cash',
        items: (source.items ?? []).map((it, idx) => ({
          id: `src-${idx}`,
          name: it.name,
          detail: it.category ?? '',
          quantity: Number(it.quantity) || 1,
          unit: it.unit || 'ชิ้น',
          pricePerPiece: Number(it.pricePerPiece) || 0,
          discount: Number(it.discount) || 0,
        })),
        jobDetail: source.notes ?? '',
      };
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftState;
        if (parsed?.mode) return { ...emptyDraft(initialMode), ...parsed, mode: parsed.mode };
      }
    } catch { /* ignore */ }
    return emptyDraft(initialMode);
  });

  // บันทึกร่างอัตโนมัติ (ทับร่างเดิมเสมอ — ไม่สร้าง draft ซ้ำ)
  useEffect(() => {
    if (source) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
  }, [draft, source]);

  const totals = useMemo(() => draftTotals(draft.items, draft.deposit), [draft.items, draft.deposit]);
  const needsJobInfo = draft.mode !== 'receipt';
  const set = <K extends keyof DraftState>(k: K, v: DraftState[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const stepValid = (s: number): string | null => {
    if (s === 1 && !draft.customerName.trim()) return 'กรุณากรอกชื่อลูกค้า';
    if (s === 2) {
      if (draft.items.length === 0) return 'กรุณาเพิ่มอย่างน้อย 1 รายการ';
      if (draft.items.some((i) => i.quantity <= 0 || i.pricePerPiece < 0 || i.discount < 0))
        return 'จำนวนต้องมากกว่า 0 และราคา/ส่วนลดต้องไม่ติดลบ';
    }
    if (s === 3 && needsJobInfo && draft.deposit < 0) return 'เงินมัดจำต้องไม่ติดลบ';
    return null;
  };

  const goNext = () => {
    const err = stepValid(step);
    if (err) { toast.error(err); return; }
    setStep((s) => Math.min(4, s + 1 === 3 && !needsJobInfo ? 4 : s + 1));
  };
  const goBack = () => setStep((s) => Math.max(0, s - 1 === 3 && !needsJobInfo ? 2 : s - 1));

  const commitItem = () => {
    if (!editing.name.trim()) { toast.error('กรุณากรอกชื่องาน/สินค้า'); return; }
    if (editing.quantity <= 0) { toast.error('จำนวนต้องมากกว่า 0'); return; }
    if (editing.pricePerPiece < 0 || editing.discount < 0) { toast.error('ราคาและส่วนลดต้องไม่ติดลบ'); return; }
    setDraft((d) => {
      const items = [...d.items];
      if (editingIdx === null) items.push(editing);
      else items[editingIdx] = editing;
      return { ...d, items };
    });
    setEditing(emptyItem());
    setEditingIdx(null);
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const added: InvoiceAttachment[] = [];
    for (const f of Array.from(files)) {
      const up = await uploadOrderAttachment(f);
      if (up) added.push({ name: up.name, path: up.url, size: up.size });
    }
    setUploading(false);
    if (added.length) {
      setDraft((d) => ({ ...d, attachments: [...d.attachments, ...added] }));
      toast.success(`แนบไฟล์แล้ว ${added.length} รายการ`);
    } else {
      toast.error('แนบไฟล์ไม่สำเร็จ');
    }
  };

  const toVinylItems = (docNo: string): VinylItem[] => draft.items.map((it, idx) => ({
    id: `${docNo}-${idx + 1}`,
    name: it.name,
    width: 0,
    height: 0,
    pricePerSqm: 0,
    quantity: it.quantity,
    unit: it.unit,
    discount: it.discount || 0,
    pricePerPiece: it.pricePerPiece,
    total: itemTotal(it),
    category: it.detail || undefined,
  }));

  const issueDeps = () => ({
    invoices: invoices as Invoice[],
    addInvoice,
    updateInvoice,
    generateInvoiceNumber,
    refetch,
  });

  const nextNumber = (type: 'receipt' | 'job_order') => nextFilmDocNumber(issueDeps(), type);

  const basePayload = (type: 'receipt' | 'job_order', docNo: string, referenceDoc?: string) =>
    buildFilmDocPayload(draft, type, docNo, referenceDoc);

  const issue = () => run(async () => {
    try {
      const res = await issueFilmDocument(issueDeps(), draft, source);
      if (!source) localStorage.removeItem(DRAFT_KEY);
      toast.success(res.message);
      onIssued(res.invoiceId);
    } catch (e) {
      console.error(e);
      toast.error('ออกเอกสารไม่สำเร็จ กรุณาลองใหม่');
    }
  });

  const saveDraft = () => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); toast.success('บันทึกร่างแล้ว'); }
    catch { toast.error('บันทึกร่างไม่สำเร็จ'); }
  };

  const modeLabel = 'ใบเสร็จรับเงิน';

  return (
    <div className="space-y-4" data-testid="doc-wizard">
      <div className={cn('rounded-2xl px-4 py-3', g.solid)}>
        <p className="text-sm font-bold">{g.title} · {modeLabel}</p>
        <p className="text-xs opacity-85">ขั้นที่ {step + 1} จาก 5 — {STEP_LABELS[step]}</p>
      </div>

      <ol className="flex flex-wrap gap-1.5 text-[11px]" data-testid="doc-wizard-steps">
        {STEP_LABELS.map((l, i) => (
          <li
            key={l}
            className={cn(
              'rounded-full border px-2.5 py-1',
              i === step ? cn(g.solid, 'border-transparent font-semibold') : 'bg-muted text-muted-foreground',
              i === 3 && !needsJobInfo && 'opacity-40',
            )}
          >
            {i + 1}. {l}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="grid gap-2 sm:grid-cols-3" data-testid="wizard-step-type">
           {([
             { key: 'receipt' as const, label: 'ออกใบเสร็จ', icon: Receipt },
           ]).map((o) => (
            <button
              key={o.key}
              type="button"
              data-testid={`wizard-type-${o.key}`}
              onClick={() => set('mode', o.key)}
              className={cn(
                'flex min-h-20 flex-col items-start gap-1 rounded-2xl border p-4 text-left',
                draft.mode === o.key ? cn(g.solid, 'border-transparent') : 'bg-card',
              )}
            >
              <o.icon className="h-5 w-5" />
              <span className="text-sm font-semibold">{o.label}</span>
            </button>
          ))}
        </section>
      )}

      {step === 1 && (
        <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="wizard-step-customer">
          <div>
            <Label>เลือกลูกค้าเดิม</Label>
            <Select
              value={draft.customerId ?? ''}
              onValueChange={(id) => {
                const c = (customers as any[]).find((x) => x.id === id);
                if (!c) return;
                setDraft((d) => ({
                  ...d, customerId: c.id, customerName: c.name,
                  customerPhone: c.phone ?? '', customerAddress: c.address ?? '', customerTaxId: c.taxId ?? '',
                }));
              }}
            >
              <SelectTrigger className="h-11" data-testid="wizard-customer-picker">
                <SelectValue placeholder="— ค้นจากลูกค้าเดิม —" />
              </SelectTrigger>
              <SelectContent>
                {(customers as any[]).slice(0, 200).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="w-name">ชื่อลูกค้า *</Label>
              <Input id="w-name" className="h-11" data-testid="wizard-customer-name"
                value={draft.customerName} onChange={(e) => set('customerName', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="w-phone">เบอร์โทร</Label>
              <Input id="w-phone" className="h-11" inputMode="tel"
                value={draft.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="w-org">โรงเรียน / หน่วยงาน</Label>
              <Input id="w-org" className="h-11" value={draft.customerOrg} onChange={(e) => set('customerOrg', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="w-tax">เลขผู้เสียภาษี (ถ้ามี)</Label>
              <Input id="w-tax" className="h-11" value={draft.customerTaxId} onChange={(e) => set('customerTaxId', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="w-addr">ที่อยู่</Label>
              <Textarea id="w-addr" value={draft.customerAddress} onChange={(e) => set('customerAddress', e.target.value)} />
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3" data-testid="wizard-step-items">
          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <p className="text-sm font-bold">{editingIdx === null ? 'เพิ่มรายการ' : 'แก้ไขรายการ'}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="i-name">ชื่องาน / สินค้า *</Label>
                <Input id="i-name" className="h-11" data-testid="wizard-item-name"
                  value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="i-detail">รายละเอียด / ขนาด</Label>
                <Input id="i-detail" className="h-11"
                  value={editing.detail} onChange={(e) => setEditing({ ...editing, detail: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="i-qty">จำนวน</Label>
                <Input id="i-qty" type="number" min={1} className="h-11" data-testid="wizard-item-qty"
                  value={editing.quantity}
                  onChange={(e) => setEditing({ ...editing, quantity: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <Label htmlFor="i-unit">หน่วย</Label>
                <Select value={editing.unit} onValueChange={(u) => setEditing({ ...editing, unit: u })}>
                  <SelectTrigger id="i-unit" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="i-price">ราคาต่อหน่วย</Label>
                <Input id="i-price" type="number" min={0} className="h-11" data-testid="wizard-item-price"
                  value={editing.pricePerPiece}
                  onChange={(e) => setEditing({ ...editing, pricePerPiece: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <Label htmlFor="i-disc">ส่วนลด</Label>
                <Input id="i-disc" type="number" min={0} className="h-11"
                  value={editing.discount}
                  onChange={(e) => setEditing({ ...editing, discount: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">รวมรายการนี้ {baht(itemTotal(editing))} บาท</span>
              <Button type="button" className="ml-auto h-11 rounded-xl" data-testid="wizard-item-add" onClick={commitItem}>
                <Plus className="mr-1 h-4 w-4" /> {editingIdx === null ? 'เพิ่มรายการ' : 'บันทึกการแก้ไข'}
              </Button>
              {editingIdx !== null && (
                <Button type="button" variant="ghost" className="h-11" onClick={() => { setEditing(emptyItem()); setEditingIdx(null); }}>
                  ยกเลิกแก้ไข
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-2" data-testid="wizard-item-list">
            {draft.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีรายการ — เพิ่มรายการด้านบน</p>
            ) : (
              <ul className="divide-y">
                {draft.items.map((it, idx) => (
                  <li key={it.id} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{it.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {it.detail ? `${it.detail} · ` : ''}{it.quantity} {it.unit} × {baht(it.pricePerPiece)}
                        {it.discount > 0 ? ` − ส่วนลด ${baht(it.discount)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold">{baht(itemTotal(it))}</span>
                    <Button type="button" variant="ghost" size="icon" aria-label="แก้ไขรายการ"
                      onClick={() => { setEditing(it); setEditingIdx(idx); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="ลบรายการ"
                      onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" className="h-11 rounded-xl" data-testid="wizard-items-done" onClick={goNext}>
              รายการครบแล้ว <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 3 && needsJobInfo && (
        <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="wizard-step-job">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="w-due">วัน/เวลานัดรับ</Label>
              <Input id="w-due" type="datetime-local" className="h-11" data-testid="wizard-due"
                value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="w-deposit">เงินมัดจำ</Label>
              <Input id="w-deposit" type="number" min={0} className="h-11"
                value={draft.deposit}
                onChange={(e) => set('deposit', Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="w-jobdetail">รายละเอียดงาน</Label>
              <Textarea id="w-jobdetail" value={draft.jobDetail} onChange={(e) => set('jobDetail', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="w-note">หมายเหตุพนักงาน</Label>
              <Textarea id="w-note" value={draft.staffNote} onChange={(e) => set('staffNote', e.target.value)} />
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={uploading}
                onClick={() => fileRef.current?.click()} data-testid="wizard-attach">
                <Paperclip className="mr-1 h-4 w-4" /> {uploading ? 'กำลังอัปโหลด…' : 'แนบรูป/ไฟล์'}
              </Button>
              <span className="text-sm text-muted-foreground">ยอดค้างชำระ {baht(totals.amountDue)} บาท</span>
            </div>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => void pickFiles(e.target.files)} />
            {draft.attachments.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {draft.attachments.map((a) => (
                  <li key={a.path} className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5" /> <span className="truncate">{a.name}</span>
                    <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label="ลบไฟล์แนบ"
                      onClick={() => setDraft((d) => ({ ...d, attachments: d.attachments.filter((x) => x.path !== a.path) }))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3" data-testid="wizard-step-review">
          <div className={cn('rounded-2xl border p-4', g.soft)}>
            <p className="text-xs text-muted-foreground">{g.title}</p>
            <p className="text-base font-bold">{modeLabel}{source ? ` (จาก ${source.invoiceNumber})` : ''}</p>
            <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-muted-foreground">ลูกค้า: </dt><dd className="inline font-semibold">{draft.customerName || '—'}</dd></div>
              <div><dt className="inline text-muted-foreground">เบอร์โทร: </dt><dd className="inline">{draft.customerPhone || '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="inline text-muted-foreground">ที่อยู่: </dt><dd className="inline">{[draft.customerOrg, draft.customerAddress].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div><dt className="inline text-muted-foreground">วันนัดรับ: </dt><dd className="inline">{draft.dueDate ? new Date(draft.dueDate).toLocaleString('th-TH') : '—'}</dd></div>
              <div><dt className="inline text-muted-foreground">วิธีชำระ: </dt><dd className="inline">{draft.paymentMethod === 'cash' ? 'เงินสด' : draft.paymentMethod === 'transfer' ? 'โอน' : 'เครดิต'}</dd></div>
            </dl>
            <ul className="mt-3 divide-y rounded-xl border bg-card">
              {draft.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{it.name} · {it.quantity} {it.unit} × {baht(it.pricePerPiece)}</span>
                  <span className="font-semibold">{baht(itemTotal(it))}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 text-sm">
              <p className="flex justify-between"><span>รวมเป็นเงิน</span><span>{baht(totals.subtotal)}</span></p>
              <p className="flex justify-between"><span>ส่วนลดรวม</span><span>{baht(totals.discount)}</span></p>
              <p className="flex justify-between"><span>มัดจำ</span><span>{baht(draft.deposit)}</span></p>
              <p className="flex justify-between text-base font-bold"><span>ยอดสุทธิ</span><span>{baht(totals.total)}</span></p>
              <p className="flex justify-between"><span>ยอดค้างชำระ</span><span>{baht(totals.amountDue)}</span></p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setStep(1)}>แก้ข้อมูลลูกค้า</Button>
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setStep(2)}>แก้รายการ / ราคา</Button>
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={saveDraft} data-testid="wizard-save-draft">
              <Save className="mr-1 h-4 w-4" /> บันทึกร่าง
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className={cn('h-12 flex-1 rounded-xl text-base font-bold', g.solid)}
              disabled={busy}
              data-testid="wizard-issue"
              onClick={() => void issue()}
            >
              <CheckCircle2 className="mr-1.5 h-5 w-5" />
              {busy ? 'กำลังออกใบเสร็จ…' : 'อนุมัติและออกใบเสร็จ'}
            </Button>
            <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={() => setConfirmCancel(true)}>ยกเลิก</Button>
          </div>
        </section>
      )}

      {step !== 4 && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={step === 0 ? onCancel : goBack} data-testid="wizard-back">
            <ArrowLeft className="mr-1 h-4 w-4" /> {step === 0 ? 'ออก' : 'ย้อนกลับ'}
          </Button>
          <Button type="button" className={cn('ml-auto h-11 rounded-xl', g.solid)} onClick={goNext} data-testid="wizard-next">
            ถัดไป <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยกเลิกการออกเอกสาร?</AlertDialogTitle>
            <AlertDialogDescription>ร่างที่กรอกไว้จะถูกลบ และยังไม่มีการออกเลขเอกสาร</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>กรอกต่อ</AlertDialogCancel>
            <AlertDialogAction onClick={() => { localStorage.removeItem(DRAFT_KEY); onCancel(); }}>ยกเลิกเอกสาร</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
