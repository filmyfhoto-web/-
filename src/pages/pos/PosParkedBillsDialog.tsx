import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, Play } from "lucide-react";
import { loadParkedBills, removeParkedBill, type ParkedBill } from "./parkedBills";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRestore: (bill: ParkedBill) => void;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export default function PosParkedBillsDialog({ open, onOpenChange, onRestore }: Props) {
  const [bills, setBills] = useState<ParkedBill[]>([]);

  useEffect(() => {
    if (open) setBills(loadParkedBills());
  }, [open]);

  const refresh = () => setBills(loadParkedBills());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col max-h-[100dvh] gap-0" data-testid="pos-parked-dialog">
        <DialogHeader>
          <DialogTitle>บิลที่พักไว้ ({bills.length})</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-2">
          {bills.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีบิลที่พักไว้</div>
          ) : (
            bills.map((b) => {
              const total = b.lines.reduce((s, l) => s + l.qty * l.unit_price, 0) - (b.discount || 0);
              const items = b.lines.reduce((s, l) => s + l.qty, 0);
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/40"
                  data-testid={`pos-parked-item-${b.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{b.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(b.parked_at).toLocaleString("th-TH")} · {items} รายการ · ฿{fmt(Math.max(0, total))}
                      {b.customer ? ` · ${b.customer.name}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      onRestore(b);
                      removeParkedBill(b.id);
                      onOpenChange(false);
                    }}
                    data-testid={`pos-parked-restore-${b.id}`}
                  >
                    <Play className="mr-1 h-4 w-4" /> เรียก
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    aria-label="ลบบิลที่พัก"
                    onClick={() => {
                      removeParkedBill(b.id);
                      refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter className="shrink-0 border-t pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}