import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  outstanding,
  validatePayment,
  type OrderPayment,
  type PaymentKind,
  type PaymentMethod,
} from '@/film-shop/lib/filmPayments';
import type { FilmOrder } from '@/film-shop/types/order';

const money = (n: number) => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(n);

interface Props {
  order: FilmOrder | null;
  payments: OrderPayment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    kind: PaymentKind;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    paidAt: Date;
    receivedBy?: string;
    note?: string;
    issueReceipt: boolean;
  }) => Promise<unknown>;
}

/** รับเงิน — deposit or top-up, optionally issuing the receipt in one step. */
export function PaymentDialog({ order, payments, open, onOpenChange, onSubmit }: Props) {
  const due = useMemo(() => (order ? outstanding(order, payments) : 0), [order, payments]);
  const hasPaid = payments.some((p) => !p.voidedAt);
  const [kind, setKind] = useState<PaymentKind>('deposit');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [note, setNote] = useState('');
  const [issueReceipt, setIssueReceipt] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(hasPaid ? 'payment' : 'deposit');
    setAmount(due ? String(due) : '');
    setReference('');
    setNote('');
    setIssueReceipt(true);
    setSaving(false);
  }, [open, due, hasPaid]);

  if (!order) return null;

  const submit = async () => {
    const err = validatePayment({ amount: Number(amount) }, order, payments);
    if (err) { toast.error(err); return; }
    setSaving(true);
    await onSubmit({
      kind,
      amount: Number(amount),
      method,
      reference: reference.trim() || undefined,
      paidAt: new Date(),
      receivedBy: receivedBy.trim() || undefined,
      note: note.trim() || undefined,
      issueReceipt,
    });
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden p-0 sm:w-full">
        <DialogHeader className="px-4 pt-4 text-left">
          <DialogTitle>รับเงิน · {order.orderNo}</DialogTitle>
          <DialogDescription>
            ยอดสุทธิ {money(order.total)} · ชำระแล้ว {money(order.total - due)} · คงเหลือ {money(due)} บาท
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>ประเภท</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as PaymentKind)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_KIND_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">จำนวนเงิน *</Label>
              <Input id="pay-amount" className="h-11" type="number" min={0} inputMode="decimal"
                value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>วิธีชำระ</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">เลขอ้างอิง</Label>
              <Input id="pay-ref" className="h-11" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-by">ผู้รับเงิน</Label>
            <Input id="pay-by" className="h-11" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-note">หมายเหตุ</Label>
            <Textarea id="pay-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
            <Label htmlFor="pay-receipt" className="cursor-pointer text-sm">ออกใบเสร็จทันที</Label>
            <Switch id="pay-receipt" checked={issueReceipt} onCheckedChange={setIssueReceipt} />
          </div>
        </div>

        <div className="safe-area-bottom flex gap-2 border-t border-border bg-card px-4 py-3">
          <Button variant="outline" className="min-h-11 flex-1 rounded-xl" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button className="min-h-11 flex-1 rounded-xl" disabled={saving} onClick={submit}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} บันทึกรับเงิน
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PaymentDialog;
