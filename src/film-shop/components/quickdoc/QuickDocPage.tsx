import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, Banknote, BookText, ChevronDown, ClipboardPaste, Eye, Landmark, Loader2, Minus, Paperclip,
  Plus, Printer, Save, Search, Settings2, Star, Trash2, User, UserPlus,
} from 'lucide-react';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { useQuickItems, QUICK_CATEGORIES, sortQuickItems, type QuickItem } from '@/film-shop/hooks/useQuickItems';
import { QuickItemsManager } from './QuickItemsManager';
import { InvoicePreviewNew } from '@/film-shop/components/invoices/InvoicePreviewNew';
import { buildFilmDocPayload, emptyFilmDraft, filmBaht, filmSqmPrice, nextFilmDocNumber, type FilmDraftItem, type FilmPayMethod } from '@/film-shop/lib/filmDocIssue';
import { uploadOrderAttachment } from '@/film-shop/lib/orderAttachments';
import { quickDocPaymentFields } from '@/film-shop/lib/quickDocPayment';
import { SmartImportDialog, type SmartImportRow } from '@/components/import/SmartImportDialog';
import type { Invoice, InvoiceAttachment, VinylItem } from '@/film-shop/types';

const LazyInvoiceManager = lazy(() =>
  import('@/film-shop/components/invoices/InvoiceManager').then((m) => ({ default: m.InvoiceManager })),
);

const PLUM = '#7A1746';
const NAVY = '#0B1E32';

type QuickDocPageProps = {
  title?: string;
  onClose?: () => void;
  editInvoice?: Invoice | null;
  onSaved?: (invoice: Invoice | null) => void;
  /** เปิดแท็บ "จัดการใบเสร็จ" พร้อมพรีวิวใบเสร็จนี้ทันที */
  initialPreviewInvoiceId?: string;
};

const newLine = (name: string, unit: string, price: number): FilmDraftItem => ({
  id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name, detail: '', quantity: 1, unit, pricePerPiece: price, discount: 0,
});

const toDraftLines = (items: VinylItem[] = []): FilmDraftItem[] =>
  items.map((it, idx) => ({
    id: it.id || `edit-${idx}`, name: it.name, detail: it.category ?? '', quantity: it.quantity || 1,
    unit: it.unit || 'ชิ้น', pricePerPiece: it.pricePerPiece || 0, discount: it.discount || 0,
    width: it.width || 0, height: it.height || 0, pricePerSqm: it.pricePerSqm || 0,
  }));

/** หน้าออกใบเสร็จด่วนของ Film Shop */
export function QuickDocPage({ title, onClose, editInvoice = null, onSaved, initialPreviewInvoiceId }: QuickDocPageProps = {}) {
  const { customers, invoices, settings, addInvoice, updateInvoice, generateInvoiceNumber, refetch } = useAppData() as any;
  const quick = useQuickItems();
  const isEdit = !!editInvoice;
  const docKind = 'receipt' as const;
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [managerOpen, setManagerOpen] = useState(false);
  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const [customerImportOpen, setCustomerImportOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState<string | undefined>(editInvoice?.customerId);
  const [customerName, setCustomerName] = useState(editInvoice?.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(editInvoice?.customerPhone ?? '');
  const [customerOrg, setCustomerOrg] = useState(editInvoice?.customerAddress?.split(' · ')[0] ?? '');
  const [customerAddress, setCustomerAddress] = useState(editInvoice?.customerAddress?.split(' · ').slice(1).join(' · ') ?? '');
  const [lines, setLines] = useState<FilmDraftItem[]>(() => toDraftLines(editInvoice?.items));
  const [freeName, setFreeName] = useState('');
  const [freeQty, setFreeQty] = useState(1);
  const [freePrice, setFreePrice] = useState('0');
  const [discount, setDiscount] = useState(String(editInvoice?.discount ?? 0));
  const [paid, setPaid] = useState(editInvoice ? editInvoice.status === 'paid' : true);
  const [payMethod, setPayMethod] = useState<FilmPayMethod>((editInvoice?.paymentMethod as FilmPayMethod) ?? 'cash');
  const [moreOpen, setMoreOpen] = useState(false);
  const [dueDate, setDueDate] = useState(editInvoice?.dueDate ? new Date(editInvoice.dueDate).toISOString().slice(0, 10) : '');
  const [jobNote, setJobNote] = useState(editInvoice?.notes ?? '');
  const [attachments, setAttachments] = useState<InvoiceAttachment[]>(editInvoice?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'compose' | 'docs'>(initialPreviewInvoiceId ? 'docs' : 'compose');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [sqmMode, setSqmMode] = useState((editInvoice?.items ?? []).some((i) => (i.width || 0) > 0 || (i.pricePerSqm || 0) > 0));
  const gridCols = sqmMode
    ? 'grid min-w-[900px] grid-cols-[minmax(180px,1fr)_100px_90px_90px_130px_100px_110px_44px]'
    : 'grid min-w-[620px] grid-cols-[minmax(200px,1fr)_150px_100px_110px_44px]';




  const visibleQuick = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortQuickItems(quick.items.filter((i) => i.active))
      .filter((i) => (cat === 'all' ? true : i.category === cat))
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : true));
  }, [quick.items, search, cat]);

  const customerMatches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
      .slice(0, 6);
  }, [customers, customerQuery]);

  const subtotal = lines.reduce((s, i) => s + i.quantity * i.pricePerPiece, 0);
  const discountNum = Math.max(0, Number(discount) || 0);
  const netTotal = Math.max(0, subtotal - discountNum);

  /** คลิก + ที่รายการด่วน — ถ้ามีอยู่แล้วให้เพิ่มจำนวน ไม่สร้างแถวซ้ำ */
  const addQuick = (it: QuickItem) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.name === it.name && l.pricePerPiece === it.price && l.unit === it.unit);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, newLine(it.name, it.unit, it.price)];
    });
  };

  const setQty = (id: string, qty: number) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, quantity: Math.max(1, qty) } : l)));
  const setPrice = (id: string, price: number) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, pricePerPiece: Math.max(0, price) } : l)));
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  /** แก้ค่าป้าย (ราคา/ตร.ม. · กว้าง · ยาว) แล้วคำนวณราคาต่อหน่วยให้อัตโนมัติ (ยังพิมพ์ทับเองได้) */
  const setSqmField = (id: string, field: 'pricePerSqm' | 'width' | 'height', value: number) =>
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, [field]: Math.max(0, value) } as FilmDraftItem;
      const auto = filmSqmPrice(next);
      return auto > 0 ? { ...next, pricePerPiece: Math.round(auto * 100) / 100 } : next;
    }));

  const addFreeLine = () => {
    if (!freeName.trim()) { toast.error('กรุณากรอกชื่อรายการ'); return; }
    setLines((prev) => [...prev, { ...newLine(freeName.trim(), 'ชิ้น', Number(freePrice) || 0), quantity: Math.max(1, freeQty) }]);
    setFreeName(''); setFreeQty(1); setFreePrice('0');
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
    if (added.length) { setAttachments((a) => [...a, ...added]); toast.success(`แนบไฟล์แล้ว ${added.length} รายการ`); }
    else toast.error('แนบไฟล์ไม่สำเร็จ');
  };

  const docNoPreview = useMemo(() => {
    if (editInvoice) return editInvoice.invoiceNumber;
    try { return nextFilmDocNumber({ invoices, addInvoice, updateInvoice: async () => {}, generateInvoiceNumber } as any, docKind); }
    catch { return ''; }
  }, [invoices, docKind, addInvoice, generateInvoiceNumber, editInvoice]);

  const reset = () => {
    setLines([]); setDiscount('0'); setCustomerId(undefined); setCustomerName('');
    setCustomerPhone(''); setCustomerQuery(''); setDueDate(''); setJobNote(''); setAttachments([]);
  };

  /** รายการสำหรับบันทึกในโหมดแก้ไข — คงค่าเดิม (ขนาด/ราคาต่อ ตร.ม.) ของแถวที่ไม่ได้เปลี่ยน */
  const mergedEditItems = (): VinylItem[] => {
    const orig = new Map((editInvoice?.items ?? []).map((i) => [i.id, i]));
    return lines.map((l, idx) => {
      const o = orig.get(l.id);
      const total = Math.max(0, l.quantity * l.pricePerPiece - (l.discount || 0));
      return {
        ...(o ?? { width: 0, height: 0, pricePerSqm: 0 }),
        width: l.width ?? o?.width ?? 0,
        height: l.height ?? o?.height ?? 0,
        pricePerSqm: l.pricePerSqm ?? o?.pricePerSqm ?? 0,
        id: l.id || `${editInvoice?.invoiceNumber ?? 'line'}-${idx + 1}`,
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        discount: l.discount || 0,
        pricePerPiece: l.pricePerPiece,
        total,
        category: l.detail || o?.category,
      } as VinylItem;
    });
  };

  /** บันทึกใบเสร็จจริงเข้าระบบเอกสารเดิม (film_invoices) */
  const save = async (print: boolean) => {
    if (saving) return;
    if (lines.length === 0) { toast.error('ยังไม่มีรายการในใบเสร็จ'); return; }
    setSaving(true);
    try {
      const customerAddressValue = [customerOrg.trim(), customerAddress.trim()].filter(Boolean).join(' · ');
      if (editInvoice) {
        const items = mergedEditItems();
        const patch: Partial<Invoice> = {
          customerId, customerName: (customerName || 'ลูกค้าทั่วไป').trim(), customerPhone: customerPhone || undefined,
          customerAddress: customerAddressValue || undefined, items, subtotal, discount: discountNum, total: netTotal,
          paymentMethod: payMethod, notes: jobNote || undefined, dueDate: editInvoice.dueDate,
          attachments: attachments.length ? attachments : undefined, ...quickDocPaymentFields(docKind, paid, netTotal),
        };
        await updateInvoice(editInvoice.id, patch);
        await refetch?.();
        const saved = { ...editInvoice, ...patch } as Invoice;
        toast.success(`บันทึกการแก้ไขใบเสร็จ ${editInvoice.invoiceNumber} แล้ว`);
        if (print) setPreview(saved);
        onSaved?.(saved);
        return;
      }
      const draft = {
        ...emptyFilmDraft(docKind), customerId, customerName: (customerName || 'ลูกค้าทั่วไป').trim(), customerPhone,
        customerOrg, customerAddress, items: lines, dueDate: '', jobDetail: jobNote, paymentMethod: payMethod, attachments,
      };
      const docNo = nextFilmDocNumber({ invoices, addInvoice, updateInvoice: async () => {}, generateInvoiceNumber } as any, docKind);
      const payload = buildFilmDocPayload(draft, docKind, docNo);
      const created = await addInvoice({ ...payload, discount: discountNum, total: netTotal, ...quickDocPaymentFields(docKind, paid, netTotal) } as any);
      await refetch?.();
      toast.success(`บันทึกใบเสร็จ ${created?.invoiceNumber ?? docNo} แล้ว`);
      if (print && created) setPreview(created);
      onSaved?.(created ?? null);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกใบเสร็จไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const previewDraft = (): Invoice => {
    const draft = {
      ...emptyFilmDraft(docKind), customerId, customerName: (customerName || 'ลูกค้าทั่วไป').trim(), customerPhone,
      customerOrg, customerAddress, items: lines, dueDate: '', jobDetail: jobNote, paymentMethod: payMethod, attachments,
    };
    const payload = buildFilmDocPayload(draft, docKind, docNoPreview || 'ตัวอย่าง');
    return { ...(payload as any), id: 'preview', createdAt: new Date(), discount: discountNum, total: netTotal, ...quickDocPaymentFields(docKind, paid, netTotal) } as Invoice;
  };

  const importCustomer = (rows: SmartImportRow[]) => {
    const row = rows[0];
    if (!row) return;
    setCustomerName(row.product_name);
    setCustomerOrg(row.note ?? '');
    setCustomerQuery('');
  };

  const importItems = (rows: SmartImportRow[]) => {
    setLines((prev) => [...prev, ...rows.map((row) => ({
      ...newLine(row.product_name, 'ชิ้น', Math.max(0, row.price)),
      quantity: Math.max(1, row.qty), detail: row.note ?? '',
    }))]);
  };

  if (preview) {
    return <InvoicePreviewNew invoice={preview} settings={settings} onClose={() => setPreview(null)} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F7FA]" data-testid="film-quick-doc">
      <header className="flex flex-wrap items-center gap-4 border-b border-[#E6E6EC] bg-white px-5 py-3">
        {onClose && <Button variant="outline" size="sm" className="rounded-lg" onClick={onClose} data-testid="quick-doc-back"><ArrowLeft className="mr-1 h-4 w-4" /> กลับ</Button>}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{title ?? (isEdit ? 'แก้ไขใบเสร็จ' : 'ออกใบเสร็จด่วน')}</h1>
          <p className="text-xs text-muted-foreground">ใบเสร็จรับเงิน</p>
        </div>
        {!isEdit && (
          <div className="flex overflow-hidden rounded-lg border border-[#E6E6EC]">
            {([['compose', 'สร้างใบเสร็จ'], ['docs', 'จัดการใบเสร็จ']] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={tab === id} data-testid={`quick-doc-tab-${id}`} onClick={() => setTab(id)}
                className={cn('px-4 py-2 text-sm font-semibold transition-colors', tab === id ? 'text-white' : 'bg-white text-[#0B1E32] hover:bg-muted')}
                style={tab === id ? { backgroundColor: NAVY } : undefined}>{label}</button>
            ))}
          </div>
        )}
        <div className="ml-auto text-right text-sm text-muted-foreground">
          <p>เลขที่ <span className="font-semibold" style={{ color: NAVY }}>{docNoPreview || '—'}</span></p>
          <p>{new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
      </header>

      {tab === 'docs' && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="quick-doc-docs-pane">
          <Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังโหลดใบเสร็จ…</p>}>
            <LazyInvoiceManager headingLabel="จัดการใบเสร็จรับเงิน" initialPreviewInvoiceId={initialPreviewInvoiceId} />
          </Suspense>
        </div>
      )}

      <div className={cn('grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 2xl:grid-cols-[300px_minmax(560px,1fr)_340px] 2xl:overflow-hidden', tab === 'docs' && 'hidden')}>

        {/* ซ้าย: รายการด่วน */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3 2xl:overflow-y-auto">

          <h2 className="text-lg font-bold" style={{ color: NAVY }}>รายการด่วนที่บันทึกไว้</h2>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="ค้นหารายการด่วน..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => setManagerOpen(true)}>
              <Settings2 className="mr-1 h-4 w-4" /> จัดการรายการด่วน
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={cn(
                  'rounded-md border px-3 py-1 text-sm transition-colors',
                  cat === c.id ? 'border-transparent text-white' : 'border-[#E6E6EC] bg-white text-[#0B1E32] hover:bg-muted',
                )}
                style={cat === c.id ? { backgroundColor: PLUM } : undefined}
              >
                {c.label}
              </button>
            ))}
          </div>

          {quick.loading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังโหลดรายการด่วน…
            </p>
          )}
          {quick.error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {quick.error} <button className="underline" onClick={() => quick.reload()}>ลองใหม่</button>
            </div>
          )}
          {!quick.loading && !quick.error && visibleQuick.length === 0 && (
            <p className="rounded-lg border border-dashed border-[#E6E6EC] p-6 text-center text-sm text-muted-foreground">
              ไม่พบรายการด่วน — กด “จัดการรายการด่วน” เพื่อเพิ่ม
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {visibleQuick.map((it) => (
              <div key={it.id} className="relative rounded-lg border border-[#E6E6EC] bg-white p-3">
                <Star className={cn('h-4 w-4', it.pinned ? 'fill-[#7A1746] text-[#7A1746]' : 'text-muted-foreground')} />
                <p className="mt-2 font-semibold leading-snug" style={{ color: NAVY }}>{it.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-semibold" style={{ color: NAVY }}>{filmBaht(it.price)}</span> บาท / {it.unit}
                </p>
                <button
                  type="button"
                  aria-label={`เพิ่ม ${it.name}`}
                  data-testid="quick-item-add"
                  onClick={() => addQuick(it)}
                  className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full text-white"
                  style={{ backgroundColor: PLUM }}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <Button variant="outline" className="border-dashed" onClick={() => setManagerOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> บันทึกรายการด่วนใหม่
          </Button>
          <p className="text-xs text-muted-foreground">คลิก 1 ครั้ง เพื่อเพิ่มลงเอกสาร</p>
        </section>

        {/* กลาง: ลูกค้า + รายการในเอกสาร */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border border-[#E6E6EC] bg-white p-4 2xl:overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 rounded-md border border-[#E6E6EC] px-3 py-2 text-sm font-medium" style={{ color: NAVY }}>
              <User className="h-4 w-4" /> {customerName || 'ลูกค้าทั่วไป'}
            </span>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="ค้นหาชื่อ / เบอร์โทร (ไม่บังคับ)"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
              />
              {customerMatches.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-[#E6E6EC] bg-white shadow-lg">
                  {customerMatches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setCustomerId(c.id); setCustomerName(c.name);
                          setCustomerPhone(c.phone ?? ''); setCustomerQuery('');
                        }}
                      >
                        {c.name} <span className="text-muted-foreground">{c.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="ใช้ชื่อลูกค้าที่พิมพ์"
              onClick={() => { setCustomerId(undefined); setCustomerName(customerQuery.trim()); setCustomerQuery(''); }}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="shrink-0"
              data-testid="quick-doc-customer-import"
              onClick={() => setCustomerImportOpen(true)}
            >
              <ClipboardPaste className="mr-1 h-4 w-4" /> วางข้อมูลลูกค้า
            </Button>
          </div>

          {/* ชื่อ · หน่วยงาน/โรงเรียน · ที่อยู่ — กรอกในชุดเดียวกัน */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="text-sm">
              <span className="text-muted-foreground">ชื่อลูกค้า</span>
              <Input data-testid="quick-doc-customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="เช่น ครูเมย์" />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground">หน่วยงาน / โรงเรียน</span>
              <Input data-testid="quick-doc-customer-org" value={customerOrg} onChange={(e) => setCustomerOrg(e.target.value)} placeholder="เช่น โรงเรียนบ้านกอก" />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground">เบอร์โทร</span>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="08x-xxx-xxxx" />
            </label>
          </div>
          <label className="text-sm">
            <span className="text-muted-foreground">ที่อยู่</span>
            <Textarea
              data-testid="quick-doc-customer-address"
              rows={2}
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="ที่อยู่สำหรับออกใบเสร็จ (วางจาก LINE ได้เลย)"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold" style={{ color: NAVY }}>รายการในใบเสร็จ</h2>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                data-testid="quick-doc-items-import"
                onClick={() => setSmartImportOpen(true)}
              >
                <ClipboardPaste className="mr-1 h-4 w-4" /> วางรายการ (Smart Import)
              </Button>
              <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: NAVY }}>
                <input
                  type="checkbox"
                  data-testid="doc-sqm-toggle"
                  checked={sqmMode}
                  onChange={(e) => setSqmMode(e.target.checked)}
                  className="h-4 w-4 accent-[#7A1746]"
                />
                คำนวณค่าป้าย (ราคา/ตร.ม. × กว้าง × ยาว)
              </label>
            </div>
          </div>


          <div className="overflow-x-auto rounded-lg border border-[#E6E6EC]" data-testid="doc-lines-scroll">
            <div className={cn('items-center gap-2 rounded-t-lg bg-[#F7F7FA] px-3 py-2 text-sm text-muted-foreground', gridCols)}>
              <span>รายการ</span>
              {sqmMode && <><span className="text-right">ราคา/ตร.ม.</span><span className="text-right">กว้าง (ม.)</span><span className="text-right">ยาว (ม.)</span></>}
              <span className="text-center">จำนวน</span><span className="text-right">ราคา/หน่วย</span><span className="text-right">รวม</span><span />
            </div>
            {lines.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">ยังไม่มีรายการ — กดปุ่ม + ที่รายการด่วนทางซ้าย</p>
            )}
            {lines.map((l, idx) => (
              <div key={l.id} data-testid="doc-line" className={cn('items-center gap-2 border-t border-[#EFEFF3] px-3 py-3', gridCols)}>
                <span className="min-w-0 break-words font-medium" style={{ color: NAVY }}>{idx + 1}. {l.name}</span>

                {sqmMode && (
                  <>
                    <input
                      aria-label={`ราคาต่อตารางเมตร ${l.name}`}
                      data-testid="doc-line-sqm-price"
                      className="rounded-md border border-[#E6E6EC] px-1 py-1 text-right focus:outline-none"
                      inputMode="decimal"
                      value={l.pricePerSqm ?? 0}
                      onChange={(e) => setSqmField(l.id, 'pricePerSqm', Number(e.target.value) || 0)}
                    />
                    <input
                      aria-label={`ความกว้าง ${l.name}`}
                      data-testid="doc-line-width"
                      className="rounded-md border border-[#E6E6EC] px-1 py-1 text-right focus:outline-none"
                      inputMode="decimal"
                      value={l.width ?? 0}
                      onChange={(e) => setSqmField(l.id, 'width', Number(e.target.value) || 0)}
                    />
                    <input
                      aria-label={`ความยาว ${l.name}`}
                      data-testid="doc-line-height"
                      className="rounded-md border border-[#E6E6EC] px-1 py-1 text-right focus:outline-none"
                      inputMode="decimal"
                      value={l.height ?? 0}
                      onChange={(e) => setSqmField(l.id, 'height', Number(e.target.value) || 0)}
                    />
                  </>
                )}
                <div className="mx-auto flex items-center rounded-md border border-[#E6E6EC]">
                  <button type="button" aria-label="ลดจำนวน" className="px-2 py-1" onClick={() => setQty(l.id, l.quantity - 1)}><Minus className="h-4 w-4" /></button>
                  <input
                    aria-label={`จำนวน ${l.name}`}
                    className="w-12 border-x border-[#E6E6EC] py-1 text-center outline-none"
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(e) => setQty(l.id, Number(e.target.value) || 1)}
                  />
                  <button type="button" aria-label="เพิ่มจำนวน" className="px-2 py-1" onClick={() => setQty(l.id, l.quantity + 1)}><Plus className="h-4 w-4" /></button>
                </div>
                <input
                  aria-label={`ราคา ${l.name}`}
                  className="rounded-md border border-transparent px-1 py-1 text-right hover:border-[#E6E6EC] focus:border-[#E6E6EC] focus:outline-none"
                  inputMode="decimal"
                  value={l.pricePerPiece}
                  onChange={(e) => setPrice(l.id, Number(e.target.value) || 0)}
                />
                <span className="text-right font-medium" style={{ color: NAVY }}>{filmBaht(l.quantity * l.pricePerPiece)}</span>
                <button type="button" aria-label={`ลบ ${l.name}`} className="justify-self-center" onClick={() => removeLine(l.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </button>
              </div>
            ))}
          </div>


          {/* เพิ่มรายการอื่นเอง */}
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-[#E6E6EC] p-3 md:grid-cols-[1fr_150px_140px_auto]">
            <Input placeholder="พิมพ์รายการอื่น..." value={freeName} onChange={(e) => setFreeName(e.target.value)} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">จำนวน</span>
              <div className="flex flex-1 items-center rounded-md border border-[#E6E6EC]">
                <button type="button" aria-label="ลดจำนวนรายการใหม่" className="px-2 py-1" onClick={() => setFreeQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></button>
                <input aria-label="จำนวนรายการใหม่" className="w-full border-x border-[#E6E6EC] py-1 text-center outline-none" inputMode="numeric" value={freeQty} onChange={(e) => setFreeQty(Math.max(1, Number(e.target.value) || 1))} />
                <button type="button" aria-label="เพิ่มจำนวนรายการใหม่" className="px-2 py-1" onClick={() => setFreeQty((q) => q + 1)}><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">ราคา</span>
              <Input className="text-right" inputMode="decimal" value={freePrice} onChange={(e) => setFreePrice(e.target.value)} />
            </div>
            <Button variant="outline" onClick={addFreeLine} style={{ color: PLUM, borderColor: PLUM }}>
              <Plus className="mr-1 h-4 w-4" /> เพิ่ม
            </Button>
          </div>

          {/* รายละเอียดเพิ่มเติมของใบเสร็จ */}
          <div className="border-t border-[#EFEFF3] pt-3">
            <button type="button" className="flex w-full items-center justify-between text-sm" style={{ color: NAVY }} onClick={() => setMoreOpen((v) => !v)}>
              <span>หมายเหตุ / แนบไฟล์ (ไม่บังคับ)</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} />
            </button>
            {moreOpen && (
              <div className="mt-3 space-y-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">แนบไฟล์</span>
                  <div className="flex items-center gap-2">
                    <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => pickFiles(e.target.files)} />
                    <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />} เลือกไฟล์
                    </Button>
                    <span className="text-xs text-muted-foreground">{attachments.length ? `${attachments.length} ไฟล์` : 'ยังไม่มีไฟล์'}</span>
                  </div>
                </div>

                <Textarea placeholder="หมายเหตุ / รายละเอียดงาน" value={jobNote} onChange={(e) => setJobNote(e.target.value)} />
              </div>
            )}
          </div>
        </section>

        {/* ขวา: สรุปยอด */}
        <aside className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border border-[#E6E6EC] bg-white p-4 2xl:overflow-y-auto">
          <h2 className="text-lg font-bold" style={{ color: NAVY }}>สรุปยอด</h2>
          <p className="text-sm text-muted-foreground">{lines.length} รายการ</p>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">ยอดรวม</span>
            <span className="font-semibold" style={{ color: NAVY }}>{filmBaht(subtotal)} <span className="text-muted-foreground">บาท</span></span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">ส่วนลด</span>
            <div className="flex items-center gap-2">
              <Input aria-label="ส่วนลด" className="w-28 text-right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              <span className="text-muted-foreground">บาท</span>
            </div>
          </div>

          <div className="flex items-end justify-between border-t border-[#EFEFF3] pt-3">
            <span className="text-sm text-muted-foreground">ยอดสุทธิ</span>
            <span className="text-3xl font-extrabold" style={{ color: PLUM }}>
              {filmBaht(netTotal)} <span className="text-sm font-medium text-muted-foreground">บาท</span>
            </span>
          </div>

          <div>
            <p className="mb-1 text-sm text-muted-foreground">สถานะการชำระเงิน</p>
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[#E6E6EC]">
              {([[true, 'ชำระแล้ว'], [false, 'ยังไม่ชำระ']] as const).map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={paid === v}
                  onClick={() => setPaid(v)}
                  className={cn('py-2 text-sm font-semibold', paid === v ? 'text-white' : 'bg-white text-[#0B1E32]')}
                  style={paid === v ? { backgroundColor: PLUM } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm text-muted-foreground">วิธีการชำระเงิน</p>
            <div className="grid grid-cols-3 gap-2" data-testid="quick-doc-pay-methods">
              {([['cash', 'เงินสด', Banknote], ['transfer', 'โอนจ่าย', Landmark], ['credit', 'ลงบัญชี', BookText]] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={payMethod === id}
                  onClick={() => setPayMethod(id)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md border py-3 text-sm',
                    payMethod === id ? 'border-[#7A1746] text-[#7A1746]' : 'border-[#E6E6EC] text-[#0B1E32]',
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="h-12 w-full text-base font-bold text-white hover:opacity-90"
            style={{ backgroundColor: '#EA6A0A' }}
            disabled={saving || lines.length === 0}
            onClick={() => save(true)}
            data-testid="quick-doc-save-print"
          >
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Printer className="mr-2 h-5 w-5" />} บันทึกและพิมพ์
          </Button>
          <Button variant="outline" className="w-full" disabled={saving || lines.length === 0} onClick={() => save(false)}>
            <Save className="mr-2 h-4 w-4" /> บันทึกอย่างเดียว
          </Button>
          <button
            type="button"
            className="mx-auto flex items-center gap-2 text-sm underline"
            style={{ color: PLUM }}
            disabled={lines.length === 0}
            onClick={() => setPreview(previewDraft())}
          >
            <Eye className="h-4 w-4" /> ดูตัวอย่างเอกสาร
          </button>
          <p className="mt-auto text-center text-xs text-muted-foreground">กดรายการด่วน → ตรวจยอด → พิมพ์</p>
        </aside>
      </div>

      <QuickItemsManager
        open={managerOpen}
        onOpenChange={setManagerOpen}
        items={quick.items}
        loading={quick.loading}
        create={quick.create}
        update={quick.update}
        remove={quick.remove}
        move={quick.move}
      />

      <SmartImportDialog
        open={smartImportOpen}
        onOpenChange={setSmartImportOpen}
        onConfirm={importItems}
        title="วางรายการลงใบเสร็จ"
        description="วางข้อความจาก LINE / Excel (ชื่อรายการ · จำนวน · ราคา) แล้วตรวจก่อนยืนยัน"
      />
      <SmartImportDialog
        open={customerImportOpen}
        onOpenChange={setCustomerImportOpen}
        onConfirm={importCustomer}
        title="วางข้อมูลลูกค้า / หน่วยงาน"
        description="วางชื่อลูกค้าและหน่วยงาน (ใช้คอลัมน์ ชื่อสินค้า = ชื่อลูกค้า · หมายเหตุ = หน่วยงาน)"
      />
    </div>
  );
}

export default QuickDocPage;
