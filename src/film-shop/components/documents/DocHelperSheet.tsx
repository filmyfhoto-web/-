import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import {
  FILM_UNITS, PAY_LABEL, buildFilmDocPayload, emptyFilmDraft, emptyFilmItem,
  filmBaht, filmDraftMissing, filmDraftTotals, filmItemTotal, issueFilmDocument,
  type FilmDocMode, type FilmDraftItem, type FilmDraftState, type FilmPayMethod,
} from '@/film-shop/lib/filmDocIssue';
import type { Invoice } from '@/film-shop/types';

const DRAFT_KEY = 'film-shop:doc-helper-draft';

const MODE_OPTIONS: { key: FilmDocMode; label: string; desc: string }[] = [
  { key: 'receipt', label: 'ใบเสร็จรับเงิน', desc: 'รับเงินและออกใบเสร็จทันที' },
];

function CardShell({
  no, title, done, hint, children,
}: { no: number; title: string; done: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4" data-testid={`dh-card-${no}`}>
      <header className="mb-3 flex items-start gap-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            done ? 'bg-docbot text-docbot-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {done ? <Check className="h-4 w-4" /> : no}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={cn('ml-auto shrink-0 text-xs font-semibold', done ? 'text-docbot' : 'text-muted-foreground')}>
          {done ? 'ตอบแล้ว' : 'ยังไม่ครบ'}
        </span>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * “ช่วยสร้างใบเสร็จ Film Shop” — ป๊อปอัป bottom sheet ในหน้าเดิม (ใช้ได้ใน LINE บนมือถือ)
 * ออกใบเสร็จเท่านั้น · ไม่ยุ่งกับคิวงาน สต๊อก หรือร้านอื่น
 * ไม่สร้างเอกสารจริงจนกว่าพนักงานจะกดยืนยันในหน้าตรวจทาน
 */
export function DocHelperSheet({
  open, onOpenChange, source, onIssued,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** ออกใบเสร็จต่อจากใบสั่งจ้างเดิม */
  source?: Invoice;
  onIssued?: (invoiceId?: string) => void;
}) {
  const { invoices, addInvoice, updateInvoice, generateInvoiceNumber, refetch } = useAppData() as any;
  const { busy, run } = useSubmitGuard();
  const [review, setReview] = useState(false);
  const [editing, setEditing] = useState<FilmDraftItem>(emptyFilmItem());

  const [draft, setDraft] = useState<FilmDraftState>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FilmDraftState;
        if (parsed?.mode) return { ...emptyFilmDraft(parsed.mode), ...parsed };
      }
    } catch { /* ignore */ }
    return emptyFilmDraft('receipt');
  });

  // ออกใบเสร็จจากใบสั่งจ้างเดิม — ดึงข้อมูลมาให้ ไม่ต้องกรอกใหม่
  useEffect(() => {
    if (!source || !open) return;
    setDraft({
      ...emptyFilmDraft('receipt'),
      customerId: source.customerId,
      customerName: source.customerName,
      customerPhone: source.customerPhone ?? '',
      customerAddress: source.customerAddress ?? '',
      customerTaxId: source.customerTaxId ?? '',
      deposit: source.deposit || 0,
      paymentMethod: (source.paymentMethod ?? 'cash') as FilmPayMethod,
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
    });
    setReview(false);
  }, [source, open]);

  // จำคำตอบไว้เสมอ (เลื่อน/ปิดแล้วเปิดใหม่ยังอยู่)
  useEffect(() => {
    if (source) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
  }, [draft, source]);

  const totals = useMemo(() => filmDraftTotals(draft.items, draft.deposit), [draft.items, draft.deposit]);
  const missing = filmDraftMissing(draft);
  const needsJob = false;
  const isReceipt = true;
  const set = <K extends keyof FilmDraftState>(k: K, v: FilmDraftState[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const change = Math.max(0, (draft.received || 0) - (isReceipt ? totals.total : totals.amountDue));
  const remain = Math.max(0, (isReceipt ? totals.total : totals.amountDue) - (draft.received || 0));

  const addItem = () => {
    if (!editing.name.trim()) { toast.error('กรุณากรอกชื่อรายการ'); return; }
    if (editing.quantity <= 0) { toast.error('จำนวนต้องมากกว่า 0'); return; }
    setDraft((d) => ({ ...d, items: [...d.items, editing] }));
    setEditing(emptyFilmItem());
  };

  const saveDraft = () => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); toast.success('บันทึกร่างแล้ว'); }
    catch { toast.error('บันทึกร่างไม่สำเร็จ'); }
  };

  const confirmIssue = () => run(async () => {
    try {
      const res = await issueFilmDocument(
        { invoices: invoices ?? [], addInvoice, updateInvoice, generateInvoiceNumber, refetch },
        draft,
        source,
      );
      if (!source) localStorage.removeItem(DRAFT_KEY);
      toast.success(res.message);
      setReview(false);
      onOpenChange(false);
      onIssued?.(res.invoiceId);
    } catch (e) {
      console.error(e);
      toast.error('ออกเอกสารไม่สำเร็จ กรุณาลองใหม่');
    }
  });

  // เช็คว่าตอบครบในแต่ละการ์ด (สำหรับเครื่องหมายตอบแล้ว/ยังไม่ครบ)
  const doneType = true;
  const doneCustomer = draft.customerName.trim().length > 0;
  const doneItems = draft.items.length > 0;
  const doneJob = !needsJob || Boolean(draft.dueDate || draft.jobDetail);
  const donePay = !isReceipt || Boolean(draft.paymentMethod);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[88vh] flex-col gap-0 rounded-t-3xl p-0"
        data-testid="doc-helper-sheet"
      >
        <div className="flex items-center gap-2 rounded-t-3xl bg-docbot px-4 py-3 text-docbot-foreground">
          {review && (
            <Button type="button" variant="ghost" size="icon" aria-label="กลับไปแก้ไข"
              className="h-9 w-9 text-docbot-foreground hover:bg-white/15" onClick={() => setReview(false)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0">
             <h2 className="truncate text-base font-bold">ช่วยสร้างใบเสร็จ Film Shop</h2>
             <p className="truncate text-xs opacity-90">
               {review ? 'ตรวจทานก่อนยืนยัน' : source ? `ออกใบเสร็จจากงาน ${source.invoiceNumber}` : 'ใบเสร็จรับเงินเท่านั้น'}
             </p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="ปิด"
            className="ml-auto h-10 w-10 text-docbot-foreground hover:bg-white/15"
            data-testid="doc-helper-close" onClick={() => onOpenChange(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          {review ? (
            <div className="space-y-3" data-testid="doc-helper-review">
              <section className="rounded-2xl border bg-card p-4">
                <p className="text-sm font-bold">
                  {MODE_OPTIONS.find((m) => m.key === draft.mode)?.label}
                  {source ? ` (จาก ${source.invoiceNumber})` : ''}
                </p>
                <dl className="mt-2 grid gap-1 text-sm">
                  <div><dt className="inline text-muted-foreground">ลูกค้า: </dt><dd className="inline font-semibold">{draft.customerName || '—'}</dd></div>
                  <div><dt className="inline text-muted-foreground">เบอร์โทร/หน่วยงาน: </dt><dd className="inline">{[draft.customerPhone, draft.customerOrg].filter(Boolean).join(' · ') || '—'}</dd></div>
                  {needsJob && (
                    <>
                      <div><dt className="inline text-muted-foreground">นัดรับ: </dt><dd className="inline">{draft.dueDate ? new Date(draft.dueDate).toLocaleString('th-TH') : '—'}</dd></div>
                      <div><dt className="inline text-muted-foreground">รายละเอียด/สเปก: </dt><dd className="inline">{[draft.jobDetail, draft.jobSpec].filter(Boolean).join(' · ') || '—'}</dd></div>
                      <div><dt className="inline text-muted-foreground">ผู้รับผิดชอบ: </dt><dd className="inline">{draft.owner || '—'}</dd></div>
                    </>
                  )}
                  {isReceipt && (
                    <div><dt className="inline text-muted-foreground">วิธีชำระเงิน: </dt><dd className="inline">{PAY_LABEL[draft.paymentMethod]}</dd></div>
                  )}
                </dl>
                <ul className="mt-3 divide-y rounded-xl border">
                  {draft.items.map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{it.name} · {it.quantity} {it.unit} × {filmBaht(it.pricePerPiece)}</span>
                      <span className="font-semibold">{filmBaht(filmItemTotal(it))}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 space-y-1 text-sm">
                  <p className="flex justify-between"><span>รวมเป็นเงิน</span><span>{filmBaht(totals.subtotal)}</span></p>
                  <p className="flex justify-between"><span>ส่วนลดรวม</span><span>{filmBaht(totals.discount)}</span></p>
                  {needsJob && <p className="flex justify-between"><span>มัดจำ</span><span>{filmBaht(draft.deposit)}</span></p>}
                  <p className="flex justify-between text-base font-bold"><span>ยอดสุทธิ</span><span>{filmBaht(totals.total)}</span></p>
                  {isReceipt && (
                    <>
                      <p className="flex justify-between"><span>รับเงิน</span><span>{filmBaht(draft.received || 0)}</span></p>
                      <p className="flex justify-between"><span>{change > 0 ? 'เงินทอน' : 'ยอดคงเหลือ'}</span><span>{filmBaht(change > 0 ? change : remain)}</span></p>
                    </>
                  )}
                </div>
              </section>
              <Button type="button" variant="outline" className="h-12 w-full rounded-xl" onClick={() => setReview(false)}>
                กลับไปแก้ไขข้อมูล
              </Button>
            </div>
          ) : (
            <>
               <CardShell no={1} title="เอกสาร" done={doneType}>
                 <p className="text-sm text-muted-foreground">ออกใบเสร็จรับเงินเท่านั้น</p>
               </CardShell>

              <CardShell no={2} title="ข้อมูลลูกค้า" done={doneCustomer} hint="ชื่อลูกค้าจำเป็น · เบอร์โทร/หน่วยงานใส่เมื่อจำเป็น">
                <div>
                  <Label htmlFor="dh-name">ชื่อลูกค้า *</Label>
                  <Input id="dh-name" className="h-12" data-testid="dh-customer-name"
                    value={draft.customerName} onChange={(e) => set('customerName', e.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="dh-phone">เบอร์โทร</Label>
                    <Input id="dh-phone" inputMode="tel" className="h-12"
                      value={draft.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="dh-org">หน่วยงาน / โรงเรียน</Label>
                    <Input id="dh-org" className="h-12"
                      value={draft.customerOrg} onChange={(e) => set('customerOrg', e.target.value)} />
                  </div>
                </div>
              </CardShell>

              <CardShell no={3} title="รายการงาน / สินค้า" done={doneItems} hint="เพิ่มได้หลายรายการ ระบบรวมเงินให้อัตโนมัติ">
                {draft.items.length > 0 && (
                  <ul className="divide-y rounded-xl border" data-testid="dh-item-list">
                    {draft.items.map((it, idx) => (
                      <li key={it.id} className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{it.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {it.quantity} {it.unit} × {filmBaht(it.pricePerPiece)}
                          </p>
                        </div>
                        <span className="text-sm font-bold">{filmBaht(filmItemTotal(it))}</span>
                        <Button type="button" variant="ghost" size="icon" aria-label="ลบรายการ"
                          onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="dh-item">ชื่อรายการ</Label>
                    <Input id="dh-item" className="h-12" data-testid="dh-item-name"
                      value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="dh-qty">จำนวน</Label>
                    <Input id="dh-qty" type="number" min={1} inputMode="numeric" className="h-12" data-testid="dh-item-qty"
                      value={editing.quantity}
                      onChange={(e) => setEditing({ ...editing, quantity: Math.max(0, Number(e.target.value) || 0) })} />
                  </div>
                  <div>
                    <Label htmlFor="dh-unit">หน่วย</Label>
                    <select
                      id="dh-unit"
                      className="h-12 w-full rounded-md border bg-background px-3 text-sm"
                      value={editing.unit}
                      onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                    >
                      {FILM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="dh-price">ราคาต่อหน่วย</Label>
                    <Input id="dh-price" type="number" min={0} inputMode="decimal" className="h-12" data-testid="dh-item-price"
                      value={editing.pricePerPiece}
                      onChange={(e) => setEditing({ ...editing, pricePerPiece: Math.max(0, Number(e.target.value) || 0) })} />
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:col-span-2">
                    <span className="text-sm font-semibold">รวม {filmBaht(filmItemTotal(editing))} บาท</span>
                    <Button type="button" className="h-12 rounded-xl bg-docbot text-docbot-foreground hover:bg-docbot/90"
                      data-testid="dh-item-add" onClick={addItem}>
                      <Plus className="mr-1 h-4 w-4" /> เพิ่มรายการ
                    </Button>
                  </div>
                </div>
                <p className="text-right text-sm font-bold">รวมทั้งบิล {filmBaht(totals.total)} บาท</p>
              </CardShell>

               <CardShell no={4} title="รายละเอียดใบเสร็จ" done={doneJob} hint="หมายเหตุเพิ่มเติม (ถ้ามี)">
                 <Textarea id="dh-detail" placeholder="รายละเอียด / หมายเหตุ" value={draft.jobDetail} onChange={(e) => set('jobDetail', e.target.value)} />
               </CardShell>

              {isReceipt && (
                <CardShell no={4} title="การรับเงิน" done={donePay} hint="ส่วนลด วิธีชำระเงิน และเงินทอน">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(['cash', 'transfer', 'credit'] as FilmPayMethod[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        data-testid={`dh-pay-${m}`}
                        onClick={() => set('paymentMethod', m)}
                        className={cn(
                          'min-h-12 rounded-xl border text-sm font-semibold',
                          draft.paymentMethod === m ? 'border-transparent bg-docbot text-docbot-foreground' : 'bg-background',
                        )}
                      >
                        {PAY_LABEL[m]}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="dh-received">รับเงิน</Label>
                      <Input id="dh-received" type="number" min={0} inputMode="decimal" className="h-12" data-testid="dh-received"
                        value={draft.received ?? 0}
                        onChange={(e) => set('received', Math.max(0, Number(e.target.value) || 0))} />
                    </div>
                    <div className="rounded-xl border p-3 text-sm">
                      <p className="flex justify-between"><span>ยอดสุทธิ</span><span className="font-semibold">{filmBaht(totals.total)}</span></p>
                      <p className="flex justify-between">
                        <span>{change > 0 ? 'เงินทอน' : 'ยอดคงเหลือ'}</span>
                        <span className="font-semibold">{filmBaht(change > 0 ? change : remain)}</span>
                      </p>
                    </div>
                  </div>
                </CardShell>
              )}

              {missing.length > 0 && (
                <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground" data-testid="dh-missing">
                  ยังไม่ครบ: {missing.join(' · ')}
                </p>
              )}
            </>
          )}
        </div>

        <div
          className="flex gap-2 border-t bg-background p-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {review ? (
            <Button
              type="button"
              className="h-14 flex-1 rounded-xl bg-docbot text-base font-bold text-docbot-foreground hover:bg-docbot/90"
              disabled={busy || missing.length > 0}
              data-testid="dh-confirm"
              onClick={() => void confirmIssue()}
            >
              {busy ? 'กำลังสร้างเอกสาร…' : 'ยืนยันสร้างเอกสาร'}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" className="h-14 rounded-xl" data-testid="dh-save-draft" onClick={saveDraft}>
                <Save className="mr-1 h-4 w-4" /> บันทึกร่าง
              </Button>
              <Button
                type="button"
                className="h-14 flex-1 rounded-xl bg-docbot text-base font-bold text-docbot-foreground hover:bg-docbot/90"
                disabled={missing.length > 0}
                data-testid="dh-review"
                onClick={() => setReview(true)}
              >
                ตรวจสอบข้อมูล
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** ใช้ในเทสต์/หน้าอื่น — สร้าง payload จากร่างโดยไม่บันทึก */
export const previewFilmPayload = buildFilmDocPayload;