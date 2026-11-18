import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '@/film-shop/hooks/useAppData';
import {
  ORDER_CHANNEL_LABELS,
  ORDER_PAYMENT_LABELS,
  computeOrderTotals,
  missingOrderInfo,
  orderItemTotal,
  type OrderChannel,
  type OrderDraftInput,
  type OrderDraftItemInput,
  type OrderPaymentStatus,
} from '@/film-shop/types/order';

const UNITS = ['ชิ้น', 'ตร.ม.', 'เมตร', 'ชุด', 'แผ่น', 'ใบ'];

const emptyItem = (): OrderDraftItemInput => ({ description: '', quantity: 1, unit: 'ชิ้น', unitPrice: 0 });

const money = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: OrderDraftInput) => Promise<unknown>;
}

export function OrderFormDialog({ open, onOpenChange, onCreate }: Props) {
  const { customers } = useAppData();
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerPhone, setCustomerPhone] = useState('');
  const [channel, setChannel] = useState<OrderChannel>('walkin');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [hasDesign, setHasDesign] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<OrderPaymentStatus>('unpaid');
  const [deposit, setDeposit] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderDraftItemInput[]>([emptyItem()]);

  const reset = () => {
    setCustomerName(''); setCustomerId(undefined); setCustomerPhone('');
    setChannel('walkin'); setTitle(''); setDueAt(''); setIsUrgent(false); setHasDesign(false);
    setPaymentStatus('unpaid'); setDeposit(''); setDiscount(''); setNotes(''); setItems([emptyItem()]);
  };

  const totals = useMemo(
    () => computeOrderTotals(items.filter((i) => i.description.trim()), Number(discount) || 0),
    [items, discount],
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
    setSaving(true);
    const payload: OrderDraftInput = {
      customerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      channel,
      title: title.trim() || items[0]?.description?.trim() || 'งานใหม่',
      dueAt: dueAt ? new Date(dueAt) : null,
      isUrgent,
      hasDesign,
      paymentStatus,
      deposit: Number(deposit) || 0,
      discount: Number(discount) || 0,
      notes: notes.trim() || undefined,
      isDraft: asDraft,
      items: items.filter((i) => i.description.trim()),
    };
    const created = await onCreate(payload);
    setSaving(false);
    if (created) {
      toast.success(asDraft ? 'บันทึกร่างออเดอร์แล้ว' : 'รับออเดอร์เรียบร้อย');
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>รับออเดอร์ใหม่</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ord-customer">ชื่อลูกค้า *</Label>
              <Input
                id="ord-customer"
                list="film-order-customers"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  const match = customers.find((c) => c.name === e.target.value);
                  setCustomerId(match?.id);
                  if (match?.phone) setCustomerPhone(match.phone);
                }}
                placeholder="พิมพ์ชื่อ หรือเลือกจากรายชื่อเดิม"
              />
              <datalist id="film-order-customers">
                {customers.map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ord-phone">เบอร์โทร</Label>
              <Input id="ord-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" />
            </div>
            <div className="space-y-1.5">
              <Label>ช่องทาง</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as OrderChannel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_CHANNEL_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ord-due">กำหนดรับงาน</Label>
              <Input id="ord-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ord-title">ชื่องาน</Label>
              <Input id="ord-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ป้ายไวนิลงานบวช" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Switch id="ord-urgent" checked={isUrgent} onCheckedChange={setIsUrgent} />
              <Label htmlFor="ord-urgent" className="cursor-pointer">งานด่วน</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ord-design" checked={hasDesign} onCheckedChange={setHasDesign} />
              <Label htmlFor="ord-design" className="cursor-pointer">ลูกค้ามีไฟล์ออกแบบแล้ว</Label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>รายการงาน</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setItems((p) => [...p, emptyItem()])}>
                <Plus className="h-4 w-4 mr-1" /> เพิ่มรายการ
              </Button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end rounded-lg border border-border p-2">
                <div className="col-span-2 sm:col-span-5 space-y-1">
                  <Label className="text-xs">รายละเอียด</Label>
                  <Input value={item.description} onChange={(e) => patchItem(idx, { description: e.target.value })} placeholder="เช่น ไวนิล 2x3 ม." />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">จำนวน</Label>
                  <Input type="number" min={0} inputMode="decimal" value={item.quantity}
                    onChange={(e) => patchItem(idx, { quantity: Number(e.target.value) })} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">หน่วย</Label>
                  <Select value={item.unit} onValueChange={(v) => patchItem(idx, { unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">ราคา/หน่วย</Label>
                  <Input type="number" min={0} inputMode="decimal" value={item.unitPrice}
                    onChange={(e) => patchItem(idx, { unitPrice: Number(e.target.value) })} />
                </div>
                <div className="sm:col-span-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground sm:hidden">รวม {money(orderItemTotal(item))}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label="ลบรายการ"
                    onClick={() => setItems((p) => (p.length === 1 ? [emptyItem()] : p.filter((_, i) => i !== idx)))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>การชำระเงิน</Label>
              <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as OrderPaymentStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_PAYMENT_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ord-deposit">มัดจำ (บาท)</Label>
              <Input id="ord-deposit" type="number" min={0} inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ord-discount">ส่วนลด (บาท)</Label>
              <Input id="ord-discount" type="number" min={0} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ord-notes">หมายเหตุ</Label>
            <Textarea id="ord-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {missing.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>ยังขาดข้อมูล: {missing.join(', ')} — บันทึกเป็นร่างไว้ก่อนได้</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-3">
            <div className="text-sm text-muted-foreground">
              รวม {money(totals.subtotal)} บาท {Number(discount) > 0 && <>· ส่วนลด {money(Number(discount))}</>}
            </div>
            <Badge variant="secondary" className="text-base">ยอดสุทธิ {money(totals.total)} บาท</Badge>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => submit(true)} disabled={saving}>บันทึกร่าง</Button>
            <Button onClick={() => submit(false)} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              รับออเดอร์
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OrderFormDialog;