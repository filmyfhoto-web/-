import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { makeIdempotencyKey } from "@/lib/stockAdjust";

interface Item {
  id: string;
  snapshot_name?: string | null;
  product_name?: string | null;
  qty: number;
  received_qty: number;
}

interface Props {
  open: boolean;
  onOpenChange(o: boolean): void;
  poId: string;
  items: Item[];
  onReceived?: () => void;
}

export default function ReceiveDialog({ open, onOpenChange, poId, items, onReceived }: Props) {
  const [receiving, setReceiving] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNote(""); setReceiving({});
  }, [open]);

  const remaining = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((it) => { m[it.id] = Math.max(Number(it.qty) - Number(it.received_qty || 0), 0); });
    return m;
  }, [items]);

  function receiveAll() {
    const m: Record<string, number> = {};
    items.forEach((it) => { m[it.id] = remaining[it.id]; });
    setReceiving(m);
  }

  async function submit() {
    const lines = Object.entries(receiving)
      .map(([po_item_id, qty]) => ({ po_item_id, qty: Number(qty) || 0 }))
      .filter((l) => l.qty > 0);
    if (!lines.length) { toast.error("กรุณาระบุจำนวนที่รับ"); return; }
    for (const l of lines) {
      if (l.qty > remaining[l.po_item_id]) { toast.error("จำนวนที่รับเกินคงเหลือ"); return; }
    }
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("pos_po_receive", {
        p_po_id: poId, p_lines: lines, p_note: note || null, p_idempotency_key: makeIdempotencyKey(),
      });
      if (error) throw error;
      toast.success("รับสินค้าเรียบร้อย");
      onOpenChange(false);
      onReceived?.();
    } catch (e: any) { toast.error(e?.message || "รับสินค้าไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>รับสินค้า</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-end">
          <Button size="sm" variant="outline" onClick={receiveAll}>รับทั้งหมด</Button>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1">สินค้า</th>
                <th className="text-right px-2 py-1 w-16">สั่ง</th>
                <th className="text-right px-2 py-1 w-16">รับก่อน</th>
                <th className="text-right px-2 py-1 w-20">คงเหลือ</th>
                <th className="text-right px-2 py-1 w-24">รับครั้งนี้</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-2 py-1">{it.snapshot_name || it.product_name}</td>
                  <td className="px-2 py-1 text-right">{it.qty}</td>
                  <td className="px-2 py-1 text-right">{it.received_qty || 0}</td>
                  <td className="px-2 py-1 text-right">{remaining[it.id]}</td>
                  <td className="px-2 py-1"><Input type="number" min={0} max={remaining[it.id]}
                    value={receiving[it.id] ?? ""} onChange={(e) => setReceiving({ ...receiving, [it.id]: Number(e.target.value) || 0 })}
                    className="text-right h-8" disabled={remaining[it.id] === 0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Input placeholder="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={busy} onClick={submit}>ยืนยันรับสินค้า</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
