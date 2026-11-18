/** รับเงินภายหลัง — ออกใบเสร็จผูกกับงานเดิม (กันออกซ้ำ) */
import { useEffect, useState } from 'react';
import { Loader2, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  QUEUE_METHOD_LABEL, issueQueueReceipt, queueBaht, type QueuePayMethod,
} from '@/film-shop/lib/queueIntake';

const PLUM = '#7A1746';
const NAVY = '#0B1E32';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: {
    id: string; orderNo: string; customerName: string; total: number;
    /** เงินที่รับไว้แล้ว (มัดจำ/ชำระบางส่วน) */
    paidPreviously?: number;
  } | null;
  onIssued?: (receiptId: string) => void;
}

export function QueueReceiptSheet({ open, onOpenChange, order, onIssued }: Props) {
  const [method, setMethod] = useState<QueuePayMethod>('cash');
  const [received, setReceived] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const base = order?.total ?? 0;
  const paidPreviously = Math.max(0, Number(order?.paidPreviously) || 0);
  const total = Number(finalTotal) || 0;
  const adjusted = total !== base;
  /** ยอดที่ต้องรับครั้งนี้ = ยอดสุดท้าย − เงินที่รับไว้แล้ว */
  const dueNow = Math.max(0, total - paidPreviously);
  const belowPaid = total < paidPreviously;

  useEffect(() => {
    if (open) {
      setMethod('cash'); setFinalTotal(base);
      setReceived(Math.max(0, base - paidPreviously));
      setNote(''); setSaving(false);
    }
  }, [open, base, paidPreviously]);

  /** ยอดสุดท้ายเปลี่ยน → ตั้งค่า “รับเงินมา” เป็นยอดคงเหลือใหม่ */
  useEffect(() => {
    if (open) setReceived(Math.max(0, (Number(finalTotal) || 0) - paidPreviously));
  }, [finalTotal, open, paidPreviously]);

  const submit = async () => {
    if (!order || saving) return;
    if (total <= 0) { toast.error('ยอดชำระสุดท้ายต้องมากกว่า 0'); return; }
    if (belowPaid) {
      toast.error(`ยอดสุดท้ายต่ำกว่าเงินที่รับไว้แล้ว (${queueBaht(paidPreviously)} ฿) กรุณาจัดการคืนเงินแยก ไม่อนุญาตในขั้นตอนนี้`);
      return;
    }
    if (adjusted && !note.trim()) { toast.error('กรุณาระบุหมายเหตุการปรับยอด'); return; }
    if (received < dueNow) { toast.error('จำนวนเงินที่รับต้องไม่น้อยกว่ายอดคงเหลือ'); return; }
    setSaving(true);
    try {
      const res = await issueQueueReceipt(order.id, { total, method, note: note.trim() || undefined });
      toast.success(res.duplicate ? `ออกใบเสร็จไว้แล้ว ${res.receipt_no}` : `ออกใบเสร็จ ${res.receipt_no}`);
      onIssued?.(res.receipt_id);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ออกใบเสร็จไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="queue-receipt-sheet" className="rounded-t-2xl border-[#E6E6EC] bg-[#F7F7FA]">
        <SheetHeader className="-mx-6 -mt-6 mb-3 border-b border-[#E6E6EC] bg-white px-6 py-3 text-left">
          <SheetTitle className="text-xl font-bold" style={{ color: NAVY }}>รับเงิน · ออกใบเสร็จ</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 py-3">
          <p className="text-sm text-muted-foreground">
            {order?.orderNo} · {order?.customerName}
          </p>
          <div className="rounded-lg border border-[#E6E6EC] bg-white p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">ยอดตามรายการงาน</span>
              <span data-testid="qr-base">{queueBaht(base)} ฿</span>
            </div>
            {paidPreviously > 0 && (
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">รับไว้แล้ว/มัดจำ</span>
                <span data-testid="qr-paid-prev" className="text-emerald-700">
                  −{queueBaht(paidPreviously)} ฿
                </span>
              </div>
            )}
            <div className="mt-2 flex items-end justify-between border-t border-[#EFEFF3] pt-2">
              <span className="text-sm text-muted-foreground">ยอดคงเหลือที่ต้องรับครั้งนี้</span>
              <span data-testid="qr-due-now" className="text-2xl font-extrabold" style={{ color: PLUM }}>
                {queueBaht(dueNow)} <span className="text-sm font-medium text-muted-foreground">บาท</span>
              </span>
            </div>
          </div>
          {belowPaid && (
            <p data-testid="qr-below-paid" className="text-xs font-semibold text-destructive">
              ยอดสุดท้ายต่ำกว่าเงินที่รับไว้แล้ว ({queueBaht(paidPreviously)} ฿) — ต้องจัดการคืนเงินแยก ไม่อนุญาตในขั้นตอนนี้
            </p>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">ยอดชำระสุดท้าย (บาท)</Label>
            <Input
              type="number" inputMode="decimal" min={0}
              data-testid="qr-total"
              value={finalTotal}
              onChange={(e) => setFinalTotal(Number(e.target.value))}
            />
          </div>
          {adjusted && (
            <div className="space-y-1">
              <Label className="text-xs text-destructive">หมายเหตุการปรับยอด *</Label>
              <Textarea
                rows={2}
                data-testid="qr-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={total < base ? 'เช่น ลดให้ลูกค้าประจำ' : 'เช่น เพิ่มงานหน้างาน'}
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(QUEUE_METHOD_LABEL) as QueuePayMethod[]).map((m) => (
              <Button
                key={m} type="button"
                variant="outline"
                className={`h-11 rounded-md text-xs font-semibold ${method === m ? 'border-[#7A1746] text-[#7A1746]' : 'border-[#E6E6EC] text-[#0B1E32]'}`}
                onClick={() => setMethod(m)}
              >
                {QUEUE_METHOD_LABEL[m]}
              </Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">รับเงินมา (บาท)</Label>
            <Input
              type="number" inputMode="decimal" min={0}
              data-testid="qr-received"
              value={received}
              onChange={(e) => setReceived(Number(e.target.value))}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">เงินทอน</span>
            <span className="font-semibold" data-testid="qr-change">
              {queueBaht(Math.max(0, received - dueNow))} ฿
            </span>
          </div>
          <Button
            type="button" className="h-12 w-full rounded-md text-base font-bold text-white hover:opacity-90"
            style={{ backgroundColor: '#EA6A0A' }}
            data-testid="qr-confirm" disabled={saving || belowPaid}
            onClick={() => void submit()}
          >
            {saving
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังออกใบเสร็จ…</>
              : <><ReceiptText className="mr-2 h-4 w-4" /> ยืนยันรับเงิน</>}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}