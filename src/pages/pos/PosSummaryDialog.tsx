import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ParkedCartLine } from "./parkedBills";
import type { PosCustomerRef } from "./posTypes";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lines: ParkedCartLine[];
  subtotal: number;
  discount: number;
  netTotal: number;
  customer: PosCustomerRef | null;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

/** Read-only cart summary shown before checkout. */
export default function PosSummaryDialog({
  open,
  onOpenChange,
  lines,
  subtotal,
  discount,
  netTotal,
  customer,
}: Props) {
  const totalItems = lines.reduce((s, l) => s + l.qty, 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="pos-summary-dialog">
        <DialogHeader>
          <DialogTitle>สรุปยอดตะกร้า · {totalItems} รายการ</DialogTitle>
        </DialogHeader>
        {customer && (
          <div className="text-xs bg-muted/60 rounded-md px-3 py-2">
            ลูกค้า: <span className="font-medium">{customer.name}</span>
            {customer.phone ? ` · ${customer.phone}` : ""}
            {customer.line_display_name ? ` · LINE: ${customer.line_display_name}` : ""}
          </div>
        )}
        <div className="max-h-[45vh] overflow-y-auto rounded-md border">
          {lines.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีสินค้าในตะกร้า</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">สินค้า</th>
                  <th className="text-right px-2 py-2">จำนวน</th>
                  <th className="text-right px-2 py-2">ราคา</th>
                  <th className="text-right px-3 py-2">รวม</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.product_id}-${l.variant_id ?? ""}-${i}`} className="border-t">
                    <td className="px-3 py-1.5">
                      <div className="font-medium truncate">{l.name}</div>
                      {l.variant_label && (
                        <div className="text-[11px] text-primary">{l.variant_label}</div>
                      )}
                    </td>
                    <td className="text-right tabular-nums px-2">{l.qty}</td>
                    <td className="text-right tabular-nums px-2">฿{fmt(l.unit_price)}</td>
                    <td className="text-right tabular-nums px-3 font-semibold">฿{fmt(l.qty * l.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>ยอดรวม</span>
            <span className="tabular-nums">฿{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>ส่วนลด</span>
            <span className="tabular-nums">฿{fmt(discount)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>ยอดสุทธิ</span>
            <span className="tabular-nums text-emerald-600">฿{fmt(netTotal)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}