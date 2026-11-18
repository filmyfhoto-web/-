import { useEffect, useRef, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StaffLayout from "@/components/layout/StaffLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, ScanLine, Plus, Minus, Equal, X } from "lucide-react";
import { startBarcodeScan, type StopScan } from "@/lib/barcode";

const REASONS = [
  { v: "receive_in", l: "รับเข้าใหม่" },
  { v: "sell_out", l: "ขายออก" },
  { v: "issue_use", l: "เบิกใช้" },
  { v: "damaged", l: "สินค้าชำรุด" },
  { v: "recount", l: "นับสต็อกใหม่" },
  { v: "other", l: "อื่นๆ" },
];

export default function StaffStock() {
  const { canEditProduct } = useAuth();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [dlg, setDlg] = useState<{ open: boolean; product?: any; type?: "in" | "out" | "adjust" }>({ open: false });
  const [form, setForm] = useState({ qty: "1", reason: "receive_in", note: "" });
  const [scanOpen, setScanOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<StopScan | null>(null);

  const search = async () => {
    const term = q.trim();
    let qb = supabase.from("products").select("id,code,name,unit,stock,low_stock_threshold,status,image_url,barcode")
      .order("name").limit(50);
    if (term) qb = qb.or(`name.ilike.%${term}%,code.ilike.%${term}%,barcode.eq.${term}`);
    const { data } = await qb;
    setItems(data || []);
  };

  useEffect(() => { search(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const ch = liveChannel("staff-stock")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => search())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  async function openScanner() {
    setScanOpen(true);
    setTimeout(async () => {
      if (!videoRef.current) return;
      try {
        stopRef.current = await startBarcodeScan(videoRef.current, (text) => {
          setQ(text); setScanOpen(false); stopRef.current?.(); search();
        });
      } catch (e: any) { toast.error("เปิดกล้องไม่สำเร็จ: " + e.message); setScanOpen(false); }
    }, 100);
  }
  function closeScanner() { stopRef.current?.(); setScanOpen(false); }

  function openAdjust(p: any, t: "in" | "out" | "adjust") {
    setDlg({ open: true, product: p, type: t });
    setForm({ qty: t === "adjust" ? String(p.stock || 0) : "1", reason: t === "in" ? "receive_in" : t === "out" ? "sell_out" : "recount", note: "" });
  }

  async function commit() {
    if (!dlg.product || !dlg.type) return;
    const qty = Number(form.qty);
    if (!(qty >= 0)) { toast.error("จำนวนไม่ถูกต้อง"); return; }
    const { error } = await supabase.rpc("staff_adjust_stock", {
      p_product_id: dlg.product.id,
      p_move_type: dlg.type,
      p_qty: qty,
      p_reason: form.reason,
      p_note: form.note || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("บันทึกการปรับสต็อกแล้ว");
    setDlg({ open: false });
    search();
  }

  if (!canEditProduct) return <StaffLayout><Card className="p-6 rounded-2xl">บัญชีคุณไม่มีสิทธิ์ปรับสต็อก</Card></StaffLayout>;

  return (
    <StaffLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">เช็ก / ปรับสต็อก</h1>
        <Card className="p-3 rounded-2xl">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="ค้นหา ชื่อ / SKU / บาร์โค้ด" className="rounded-xl" />
            <Button variant="outline" className="rounded-xl" onClick={search}><Search className="w-4 h-4" /></Button>
            <Button variant="outline" className="rounded-xl" onClick={openScanner}><ScanLine className="w-4 h-4" /></Button>
          </div>
        </Card>

        {/* Mobile cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-3">
          {items.map((p) => (
            <Card key={p.id} className="rounded-2xl p-3">
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-xl bg-muted overflow-hidden">
                  {p.image_url && <img src={p.image_url} alt="รูปสินค้า" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.code}{p.unit ? " · " + p.unit : ""}</div>
                  <div className="mt-1 text-sm">คงเหลือ <span className="font-bold">{Number(p.stock || 0)}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openAdjust(p, "in")}><Plus className="w-3.5 h-3.5 mr-1" />รับเข้า</Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openAdjust(p, "out")}><Minus className="w-3.5 h-3.5 mr-1" />ตัดออก</Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openAdjust(p, "adjust")}><Equal className="w-3.5 h-3.5 mr-1" />นับใหม่</Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Desktop table */}
        <Card className="rounded-2xl hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr><th className="p-3 text-left">รูป</th><th className="p-3 text-left">สินค้า</th><th className="p-3 text-left">SKU</th>
                <th className="p-3 text-right">คงเหลือ</th><th className="p-3 text-left">สถานะ</th><th className="p-3 text-center">การดำเนินการ</th></tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2"><div className="w-10 h-10 rounded bg-muted overflow-hidden">{p.image_url && <img src={p.image_url} alt="รูปสินค้า" className="w-full h-full object-cover" />}</div></td>
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2 text-xs">{p.code}</td>
                  <td className="p-2 text-right font-bold">{Number(p.stock || 0)} {p.unit}</td>
                  <td className="p-2"><StatusPill s={p.status} /></td>
                  <td className="p-2">
                    <div className="flex gap-1 justify-center">
                      <Button size="sm" variant="outline" onClick={() => openAdjust(p, "in")}><Plus className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => openAdjust(p, "out")}><Minus className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => openAdjust(p, "adjust")}><Equal className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Dialog open={dlg.open} onOpenChange={(o) => !o && setDlg({ open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dlg.type === "in" ? "รับสินค้าเข้า" : dlg.type === "out" ? "ตัดสินค้าออก" : "นับสต็อกใหม่"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">{dlg.product?.name} <span className="text-muted-foreground">({dlg.product?.code})</span></div>
            <div><Label>{dlg.type === "adjust" ? "ยอดสต็อกใหม่" : "จำนวน"}</Label>
              <Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="rounded-xl mt-1" /></div>
            <div><Label>เหตุผล</Label>
              <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{REASONS.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label>หมายเหตุ</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="rounded-xl mt-1" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg({ open: false })}>ยกเลิก</Button>
            <Button onClick={commit}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scanOpen} onOpenChange={(o) => !o && closeScanner()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>สแกนบาร์โค้ด / QR</DialogTitle></DialogHeader>
          <div className="relative">
            <video ref={videoRef} className="w-full rounded-xl bg-black aspect-video" />
            <Button variant="outline" size="icon" className="absolute top-2 right-2 rounded-full" onClick={closeScanner}><X className="w-4 h-4" /></Button>
          </div>
          <p className="text-xs text-muted-foreground">เล็งบาร์โค้ดให้ตรงกลางภาพ</p>
        </DialogContent>
      </Dialog>
    </StaffLayout>
  );
}

function StatusPill({ s }: { s: string }) {
  const m: Record<string, { l: string; c: string }> = {
    draft: { l: "ร่าง", c: "bg-muted text-foreground" },
    pending_review: { l: "รอตรวจ", c: "bg-amber-100 text-amber-700" },
    approved: { l: "อนุมัติ", c: "bg-blue-100 text-blue-700" },
    published: { l: "เปิดขาย", c: "bg-emerald-100 text-emerald-700" },
    unpublished: { l: "ปิดขาย", c: "bg-zinc-200 text-zinc-700" },
    low_stock: { l: "ใกล้หมด", c: "bg-amber-100 text-amber-700" },
    out_of_stock: { l: "หมด", c: "bg-rose-100 text-rose-700" },
  };
  const x = m[s] || { l: s, c: "bg-muted" };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${x.c}`}>{x.l}</span>;
}