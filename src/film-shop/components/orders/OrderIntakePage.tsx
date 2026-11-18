import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, AlertTriangle, Loader2, ArrowLeft, Paperclip, FileText, Wallet, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '@/film-shop/hooks/useAppData';
import { Segmented } from '@/film-shop/components/common/Pieces';
import { uploadOrderAttachment } from '@/film-shop/lib/orderAttachments';
import { PaymentDialog } from './PaymentDialog';
import { useOrderPayments } from '@/film-shop/hooks/useOrderPayments';
import { buildDocumentFromOrder, linkDocumentToOrder } from '@/film-shop/lib/orderDocuments';
import {
  ORDER_CHANNEL_LABELS,
  ORDER_PAYMENT_LABELS,
  VAT_RATES,
  computeOrderTotals,
  missingOrderInfo,
  orderItemTotal,
  type FilmOrder,
  type OrderAttachment,
  type OrderChannel,
  type OrderDraftInput,
  type OrderDraftItemInput,
  type OrderPaymentStatus,
} from '@/film-shop/types/order';

const UNITS = ['ชิ้น', 'ตร.ม.', 'เมตร', 'ชุด', 'แผ่น', 'ใบ'];
const emptyItem = (): OrderDraftItemInput => ({ description: '', quantity: 1, unit: 'ชิ้น', unitPrice: 0 });
const money = (n: number) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

type Artwork = 'has' | 'design' | 'waiting';

const ARTWORK_OPTIONS: { value: Artwork; label: string }[] = [
  { value: 'has', label: 'มีไฟล์แล้ว' },
  { value: 'design', label: 'ร้านออกแบบ' },
  { value: 'waiting', label: 'รอลูกค้าส่ง' },
];

const ARTWORK_NOTE: Record<Artwork, string> = {
  has: '',
  design: 'ร้านออกแบบให้',
  waiting: 'รอลูกค้าส่งไฟล์',
};

interface Props {
  onCreate: (input: OrderDraftInput) => Promise<FilmOrder | null>;
  onDone: () => void;
  /** Jump straight to a generated document (invoice manager preview). */
  onOpenDocument?: (invoiceId: string) => void;
}

/**
 * รับงานใหม่ — one screen, no wizard. Summary sticks to the bottom so the
 * shop can confirm price and save with one thumb.
 */
export function OrderIntakePage({ onCreate, onDone, onOpenDocument }: Props) {
  const { customers, employees, addInvoice, generateInvoiceNumber } = useAppData();
  const [saving, setSaving] = useState<'draft' | 'confirm' | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerPhone, setCustomerPhone] = useState('');
  const [orgName, setOrgName] = useState('');
  const [assignee, setAssignee] = useState('');
  const [channel, setChannel] = useState<OrderChannel>('walkin');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [artwork, setArtwork] = useState<Artwork>('has');
  const [paymentStatus, setPaymentStatus] = useState<OrderPaymentStatus>('unpaid');
  const [deposit, setDeposit] = useState('');
  const [discount, setDiscount] = useState('');
  const [vatRate, setVatRate] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderDraftItemInput[]>([emptyItem()]);
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState<FilmOrder | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const { payments, receivePayment } = useOrderPayments(saved?.id);

  const totals = useMemo(
    () => computeOrderTotals(items.filter((i) => i.description.trim()), Number(discount) || 0, vatRate),
    [items, discount, vatRate],
  );
  const missing = useMemo(
    () => missingOrderInfo({ customerName, items, dueAt: dueAt ? new Date(dueAt) : null }),
    [customerName, items, dueAt],
  );

  const patchItem = (idx: number, patch: Partial<OrderDraftItemInput>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const submit = async (asDraft: boolean) => {
    if (!customerName.trim()) {
      toast.error('กรอกชื่อลูกค้าก่อน');
      return;
    }
    if (!asDraft && missing.length > 0) {
      toast.error(`ยังขาด: ${missing.join(', ')} — บันทึกเป็นร่างได้`);
      return;
    }
    setSaving(asDraft ? 'draft' : 'confirm');
    const artNote = ARTWORK_NOTE[artwork];
    const payload: OrderDraftInput = {
      customerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      orgName: orgName.trim() || undefined,
      assignee: assignee.trim() || undefined,
      channel,
      title: title.trim() || items[0]?.description?.trim() || 'งานใหม่',
      dueAt: dueAt ? new Date(dueAt) : null,
      isUrgent,
      hasDesign: artwork === 'has',
      paymentStatus,
      deposit: Number(deposit) || 0,
      discount: Number(discount) || 0,
      vatRate,
      notes: [notes.trim(), artNote].filter(Boolean).join(' · ') || undefined,
      attachments,
      isDraft: asDraft,
      items: items.filter((i) => i.description.trim()),
    };
    const created = await onCreate(payload);
    setSaving(null);
    if (created) {
      toast.success(asDraft ? 'บันทึกร่างแล้ว' : 'รับออเดอร์เรียบร้อย');
      setSaved(created);
    }
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      const up = await uploadOrderAttachment(f);
      if (up) setAttachments((prev) => [...prev, up]);
      else toast.error(`อัปโหลด ${f.name} ไม่สำเร็จ`);
    }
    setUploading(false);
  };

  const createJobOrder = async () => {
    if (!saved) return;
    setDocBusy(true);
    const number = generateInvoiceNumber('job_order');
    const doc = await addInvoice(buildDocumentFromOrder(saved, 'job_order', number) as never);
    setDocBusy(false);
    if (!doc?.id) return;
    await linkDocumentToOrder(saved.id, doc.id, 'job_order');
    toast.success(`สร้างใบสั่งจ้าง ${doc.invoiceNumber} แล้ว`);
    onOpenDocument?.(doc.id);
  };

  if (saved) {
    return (
      <div className="animate-fade-in mx-auto max-w-2xl space-y-4 pb-24">
        <div className="space-y-2 rounded-2xl border border-success/40 bg-success/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 className="h-5 w-5" /> บันทึกออเดอร์ {saved.orderNo} แล้ว
          </p>
          <p className="text-sm text-muted-foreground">
            ลูกค้า {saved.customerName} · ยอดสุทธิ {money(saved.total)} บาท — ออกเอกสารต่อได้เลยโดยไม่ต้องกรอกใหม่
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2" data-testid="intake-next-actions">
          <Button className="min-h-12 rounded-xl" disabled={docBusy} onClick={createJobOrder}>
            {docBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />} ออกใบสั่งจ้าง
          </Button>
          <Button variant="outline" className="min-h-12 rounded-xl" onClick={() => setPayOpen(true)}>
            <Wallet className="mr-1 h-4 w-4" /> ออกใบเสร็จ/รับมัดจำ
          </Button>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" className="min-h-11" onClick={() => setSaved(null)}>รับงานใหม่อีกงาน</Button>
          <Button variant="ghost" className="min-h-11" onClick={onDone}>ไปที่รายการออเดอร์</Button>
        </div>

        <PaymentDialog
          order={saved}
          payments={payments}
          open={payOpen}
          onOpenChange={setPayOpen}
          onSubmit={async (input) => {
            const res = await receivePayment(saved, input, addInvoice as never);
            if (res?.receipt?.id) onOpenDocument?.(res.receipt.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-32">
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" className="-ml-2 min-h-11 gap-2" onClick={onDone}>
          <ArrowLeft className="h-4 w-4" /> กลับ
        </Button>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">ลูกค้า</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="in-customer">ชื่อลูกค้า *</Label>
              <Input
                id="in-customer"
                list="film-intake-customers"
                className="h-11"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  const match = customers.find((c) => c.name === e.target.value);
                  setCustomerId(match?.id);
                  if (match?.phone) setCustomerPhone(match.phone);
                }}
                placeholder="พิมพ์ชื่อ หรือเลือกจากรายชื่อเดิม"
              />
              <datalist id="film-intake-customers">
                {customers.map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-phone">เบอร์โทร</Label>
              <Input id="in-phone" className="h-11" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-org">หน่วยงาน / บริษัท</Label>
              <Input id="in-org" className="h-11" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="เช่น โรงเรียนบ้านนา" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-assignee">ผู้รับผิดชอบ</Label>
              <Input id="in-assignee" list="film-intake-staff" className="h-11" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
              <datalist id="film-intake-staff">
                {employees.map((e) => <option key={e.id} value={e.name} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>ช่องทาง</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as OrderChannel)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_CHANNEL_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-due">กำหนดรับงาน</Label>
              <Input id="in-due" className="h-11" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">งาน</h2>
          <div className="space-y-1.5">
            <Label htmlFor="in-title">ชื่องาน</Label>
            <Input id="in-title" className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ป้ายไวนิลงานบวช" />
          </div>

          <div className="space-y-1.5">
            <Label>สถานะไฟล์งาน</Label>
            <Segmented<Artwork> label="สถานะไฟล์งาน" value={artwork} onChange={setArtwork} options={ARTWORK_OPTIONS} />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
            <Label htmlFor="in-urgent" className="cursor-pointer text-sm">งานด่วน</Label>
            <Switch id="in-urgent" checked={isUrgent} onCheckedChange={setIsUrgent} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>รายการงาน</Label>
              <Button type="button" variant="outline" size="sm" className="min-h-11 rounded-xl" onClick={() => setItems((p) => [...p, emptyItem()])}>
                <Plus className="mr-1 h-4 w-4" /> เพิ่ม
              </Button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-border p-2 sm:grid-cols-12">
                <div className="col-span-2 space-y-1 sm:col-span-5">
                  <Label className="text-xs">รายละเอียด</Label>
                  <Input className="h-11" value={item.description} onChange={(e) => patchItem(idx, { description: e.target.value })} placeholder="เช่น ไวนิล 2x3 ม." />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">จำนวน</Label>
                  <Input className="h-11" type="number" min={0} inputMode="decimal" value={item.quantity} onChange={(e) => patchItem(idx, { quantity: Number(e.target.value) })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">หน่วย</Label>
                  <Select value={item.unit} onValueChange={(v) => patchItem(idx, { unit: v })}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">ราคา/หน่วย</Label>
                  <Input className="h-11" type="number" min={0} inputMode="decimal" value={item.unitPrice} onChange={(e) => patchItem(idx, { unitPrice: Number(e.target.value) })} />
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1">
                  <span className="text-xs tabular-nums text-muted-foreground sm:hidden">รวม {money(orderItemTotal(item))}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="ลบรายการ"
                    className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive"
                    onClick={() => setItems((p) => (p.length === 1 ? [emptyItem()] : p.filter((_, i) => i !== idx)))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">การชำระเงินและหมายเหตุ</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>สถานะชำระ</Label>
              <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as OrderPaymentStatus)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_PAYMENT_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-deposit">มัดจำ</Label>
              <Input id="in-deposit" className="h-11" type="number" min={0} inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-discount">ส่วนลด</Label>
              <Input id="in-discount" className="h-11" type="number" min={0} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ภาษีมูลค่าเพิ่ม</Label>
              <Select value={String(vatRate)} onValueChange={(v) => setVatRate(Number(v))}>
                <SelectTrigger className="h-11" aria-label="ภาษีมูลค่าเพิ่ม"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((r) => <SelectItem key={r} value={String(r)}>VAT {r}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-files">แนบไฟล์งาน</Label>
            <Input id="in-files" className="h-11" type="file" multiple disabled={uploading}
              onChange={(e) => pickFiles(e.target.files)} />
            {attachments.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {attachments.map((a) => (
                  <li key={a.url} className="flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> {a.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="in-notes">หมายเหตุ</Label>
            <Textarea id="in-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </section>
      </div>

      {/* Sticky summary */}
      <div className="safe-area-bottom fixed bottom-16 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur md:bottom-0 md:left-56">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3">
          {missing.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" /> ยังขาด: {missing.join(', ')}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="leading-tight">
              <p className="text-xs text-muted-foreground">
                ยอดรวม{totals.vatAmount > 0 ? ` (รวม VAT ${totals.vatRate}% = ${money(totals.vatAmount)})` : ''}
              </p>
              <p className="text-xl font-semibold tabular-nums">{money(totals.total)} บาท</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="min-h-11 rounded-xl" disabled={!!saving} onClick={() => submit(true)}>
                {saving === 'draft' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} บันทึกร่าง
              </Button>
              <Button className="min-h-11 rounded-xl" disabled={!!saving} onClick={() => submit(false)}>
                {saving === 'confirm' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} รับงาน
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderIntakePage;
