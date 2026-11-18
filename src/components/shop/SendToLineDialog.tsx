import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { fmtTHB } from "@/lib/format";
import { openLineWithMessage, openLine, extractLineBasicId } from "@/lib/line";
import type { CartItem } from "@/contexts/CartContext";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: CartItem[];
  prices: Record<string, { price: number | null }>;
  note: string;
  lineUrl?: string | null;
  shopName?: string;
}

export function SendToLineDialog({ open, onOpenChange, items, prices, note, lineUrl, shopName }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [extraNote, setExtraNote] = useState("");

  const rows = useMemo(() => items.map((it) => {
    const price = Number(prices[it.product_id]?.price ?? it.price ?? 0);
    return { ...it, price, subtotal: price * it.qty };
  }), [items, prices]);

  const total = rows.reduce((s, r) => s + r.subtotal, 0);
  const count = rows.reduce((s, r) => s + r.qty, 0);

  const hasMissingPrice = rows.some((r) => !r.price);

  const message = useMemo(() => {
    const lines: string[] = [];
    lines.push(`🛒 ออเดอร์ใหม่ — ${shopName || "ร้านนัฐภรณ์ เชียงกลาง"}`);
    if (name || phone) lines.push(`ผู้สั่ง: ${name}${phone ? ` (${phone})` : ""}`);
    lines.push("─────────────");
    rows.forEach((r, i) => {
      lines.push(`${i + 1}) ${r.name}${r.code ? ` [${r.code}]` : ""}`);
      lines.push(`   ${r.qty} ${r.unit || ""} × ฿${r.price.toLocaleString("th-TH")} = ฿${r.subtotal.toLocaleString("th-TH")}`);
    });
    lines.push("─────────────");
    lines.push(`รวม: ฿${total.toLocaleString("th-TH")} (${count} รายการ)`);
    const combined = [note, extraNote].filter(Boolean).join(" · ");
    if (combined) lines.push(`หมายเหตุ: ${combined}`);
    return lines.join("\n");
  }, [rows, name, phone, note, extraNote, total, count, shopName]);

  async function handleSend() {
    if (!items.length) { toast.error("ตะกร้าว่างเปล่า"); return; }
    if (!name.trim()) { toast.error("กรุณากรอกชื่อผู้สั่ง"); return; }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 9) {
      toast.error("กรุณากรอกเบอร์โทรที่ถูกต้อง"); return;
    }
    try {
      await navigator.clipboard.writeText(message);
      toast.success("คัดลอกข้อความแล้ว — เปิด LINE เพื่อวางส่งได้เลย");
    } catch {
      toast("เปิด LINE แล้ว — วางข้อความจากช่องด้านล่างเข้าไปได้เลย");
    }
    const basicId = extractLineBasicId(lineUrl || "");
    if (basicId) {
      openLineWithMessage(lineUrl || "", message);
    } else if (lineUrl) {
      openLine(lineUrl);
    } else {
      toast.error("ยังไม่ได้ตั้งค่า LINE ของร้าน");
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" /> ส่งออเดอร์ไป LINE แอดมิน
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="stl-name" className="text-xs">ชื่อผู้สั่ง *</Label>
              <Input id="stl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ - นามสกุล" />
            </div>
            <div>
              <Label htmlFor="stl-phone" className="text-xs">เบอร์โทร *</Label>
              <Input id="stl-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0xx-xxx-xxxx" />
            </div>
          </div>
          <div>
            <Label htmlFor="stl-note" className="text-xs">หมายเหตุเพิ่มเติม</Label>
            <Input id="stl-note" value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="เช่น ต้องการรับด่วน / จัดส่งที่..." />
          </div>

          <div className="rounded-xl border border-border bg-accent/30 p-3">
            <div className="text-xs font-semibold mb-2 flex items-center justify-between">
              <span>สรุปรายการ ({count} รายการ)</span>
              <span className="text-primary">{fmtTHB(total)}</span>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {rows.map((r) => (
                <div key={r.product_id} className="flex justify-between gap-2 text-[12px]">
                  <span className="truncate">{r.name} × {r.qty}</span>
                  <span className={r.price ? "" : "text-warning"}>
                    {r.price ? fmtTHB(r.subtotal) : "รอเสนอราคา"}
                  </span>
                </div>
              ))}
            </div>
            {hasMissingPrice && (
              <div className="mt-2 text-[11px] text-warning">
                บางรายการยังไม่มีราคา — ทางร้านจะแจ้งราคากลับผ่าน LINE
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">ตัวอย่างข้อความที่จะส่ง</Label>
            <Textarea readOnly value={message} className="font-mono text-[11px] min-h-[140px]" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={handleSend} className="bg-gradient-primary text-primary-foreground">
            <Send className="w-4 h-4 mr-1" /> ส่งไป LINE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendToLineDialog;