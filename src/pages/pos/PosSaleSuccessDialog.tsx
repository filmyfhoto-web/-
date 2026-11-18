import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Printer, Eye, ShoppingCart } from "lucide-react";
import { formatBaht } from "./receiptPrefs";

export interface PosSaleSuccess {
  receiptId: string;
  receiptNumber: string;
  total: number;
  cashReceived: number | null;
  change: number | null;
  paymentLabel: string;
  itemCount: number;
  /** ชื่อคุณครู/ลูกค้าที่ผูกกับบิล (แสดงบนสรุปบิล โดยเฉพาะบิลลงบัญชี) */
  customerName?: string | null;
  /** โรงเรียน/หน่วยงานของคุณครู */
  customerOrg?: string | null;
  /** บิลนี้เป็นการ "ลงบัญชี" (ยังไม่ชำระ) */
  isCredit?: boolean;
  /** เหตุผล/หมายเหตุที่แคชเชียร์บันทึกไว้ */
  note?: string | null;
}

interface Props {
  sale: PosSaleSuccess | null;
  onClose: () => void;
  onPrint: (sale: PosSaleSuccess) => void;
  onView: (sale: PosSaleSuccess) => void;
}

/**
 * Shown right after a successful checkout. The cart is already cleared at
 * this point (the sale is committed server-side), so this dialog is purely
 * about what to do with the receipt: print, inspect, or start the next bill.
 * "ขายต่อ" is auto-focused so a cashier can just hit Enter between customers.
 */
export default function PosSaleSuccessDialog({ sale, onClose, onPrint, onView }: Props) {
  const nextRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (sale) {
      const t = setTimeout(() => nextRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [sale]);

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md flex flex-col max-h-[100dvh] gap-0" data-testid="pos-sale-success">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" /> ขายสำเร็จ
          </DialogTitle>
          <DialogDescription>บันทึกใบเสร็จและตัดสต๊อกเรียบร้อยแล้ว</DialogDescription>
        </DialogHeader>
        {sale && (
          <>
          {/* scrollable body + pinned action footer: on a phone the “ขายต่อ”
              button must never fall below the fold */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-2" data-testid="pos-sale-success-body">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">เลขที่บิล</span>
                <span className="font-mono font-semibold" data-testid="success-receipt-number">
                  {sale.receiptNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">จำนวนรายการ</span>
                <span>{sale.itemCount} รายการ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">วิธีชำระ</span>
                <span>{sale.paymentLabel}</span>
              </div>
              {sale.isCredit && (
                <div className="mt-1 rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800" data-testid="success-credit-badge">
                  บิลลงบัญชี (ยังไม่ชำระเงิน)
                </div>
              )}
              {sale.customerName && (
                <div className="mt-1 flex justify-between gap-2">
                  <span className="text-muted-foreground">คุณครู/ลูกค้า</span>
                  <span className="text-right font-semibold" data-testid="success-customer-name">
                    {sale.customerName}
                    {sale.customerOrg ? (
                      <span className="block text-xs font-normal text-muted-foreground" data-testid="success-customer-org">
                        {sale.customerOrg}
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
              {sale.note && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">หมายเหตุ</span>
                  <span className="text-right" data-testid="success-note">{sale.note}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t pt-1 text-base font-bold">
                <span>ยอดสุทธิ</span>
                <span className="tabular-nums">฿{formatBaht(sale.total)}</span>
              </div>
              {sale.cashReceived != null && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">รับเงิน</span>
                    <span className="tabular-nums">฿{formatBaht(sale.cashReceived)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-emerald-600">
                    <span>เงินทอน</span>
                    <span className="tabular-nums" data-testid="success-change">
                      ฿{formatBaht(sale.change || 0)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div
            className="shrink-0 space-y-2 border-t pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
            data-testid="pos-sale-success-actions"
          >
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => onPrint(sale)} data-testid="success-print">
                <Printer className="mr-1 h-4 w-4" /> พิมพ์ใบเสร็จ
              </Button>
              <Button variant="outline" onClick={() => onView(sale)} data-testid="success-view">
                <Eye className="mr-1 h-4 w-4" /> ดูบิล
              </Button>
            </div>
            <Button
              ref={nextRef}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={onClose}
              data-testid="success-next"
            >
              <ShoppingCart className="mr-1 h-4 w-4" /> ขายต่อ (บิลใหม่)
            </Button>
          </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}