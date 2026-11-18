import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Truck, Package, MapPin, Phone, Search } from "lucide-react";
import { toast } from "sonner";

type Receipt = {
  id: string;
  receipt_number: string;
  created_at: string;
  total: number;
  customer_name: string | null;
  delivery_status: string | null;
  delivery_address: string | null;
  delivery_phone: string | null;
  delivery_fee: number;
  cancelled_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  preparing: "กำลังจัดเตรียม",
  shipping: "กำลังจัดส่ง",
  delivered: "จัดส่งแล้ว",
  cancelled: "ยกเลิก",
};
const STATUS_TINT: Record<string, string> = {
  preparing: "bg-amber-100 text-amber-800",
  shipping: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};

export default function PosDelivery() {
  const [rows, setRows] = useState<Receipt[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addr, setAddr] = useState("");
  const [phone, setPhone] = useState("");
  const [fee, setFee] = useState("");
  const [dstatus, setDstatus] = useState("preparing");
  const [busy, setBusy] = useState(false);

  async function load() {
    let q1 = supabase
      .from("pos_receipts")
      .select("id, receipt_number, created_at, total, customer_name, delivery_status, delivery_address, delivery_phone, delivery_fee, cancelled_at")
      .not("delivery_status", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status === "active") q1 = q1.in("delivery_status", ["preparing", "shipping"]);
    else if (status !== "all") q1 = q1.eq("delivery_status", status);
    const { data } = await q1;
    setRows((data ?? []) as any as Receipt[]);
  }
  useEffect(() => { load(); }, [status]);

  const filtered = useMemo(
    () => rows.filter((r) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return (r.receipt_number || "").toLowerCase().includes(s) ||
             (r.customer_name || "").toLowerCase().includes(s) ||
             (r.delivery_phone || "").toLowerCase().includes(s);
    }),
    [rows, q],
  );

  function openEdit(r: Receipt) {
    setOpenId(r.id);
    setAddr(r.delivery_address || "");
    setPhone(r.delivery_phone || "");
    setFee(String(r.delivery_fee || 0));
    setDstatus(r.delivery_status || "preparing");
  }

  async function save() {
    if (!openId) return;
    setBusy(true);
    const { error } = await supabase
      .from("pos_receipts")
      .update({
        delivery_address: addr || null,
        delivery_phone: phone || null,
        delivery_fee: Number(fee) || 0,
        delivery_status: dstatus,
      })
      .eq("id", openId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("บันทึกเรียบร้อย");
    setOpenId(null);
    load();
  }

  async function quickStatus(id: string, next: string) {
    const { error } = await supabase.from("pos_receipts").update({ delivery_status: next }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("อัปเดตสถานะแล้ว"); load(); }
  }

  const current = filtered.find((r) => r.id === openId);

  return (
    <div className="p-3 md:p-5 max-w-[1400px] mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">จัดส่งสินค้า</h2>
        <span className="text-xs text-muted-foreground ml-1">จัดการคำสั่งขายที่ต้องจัดส่ง</span>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-56">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="ค้นหาบิล / ลูกค้า / โทร" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">กำลังดำเนินการ</SelectItem>
            <SelectItem value="preparing">กำลังจัดเตรียม</SelectItem>
            <SelectItem value="shipping">กำลังจัดส่ง</SelectItem>
            <SelectItem value="delivered">จัดส่งแล้ว</SelectItem>
            <SelectItem value="cancelled">ยกเลิก</SelectItem>
            <SelectItem value="all">ทั้งหมด</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="grid gap-2">
        {filtered.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
            ยังไม่มีคำสั่งจัดส่ง เพิ่มการจัดส่งได้จากประวัติการขายที่ต้องส่ง
          </Card>
        ) : filtered.map((r) => (
          <Card key={r.id} className="p-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-primary">{r.receipt_number}</span>
                  <Badge className={STATUS_TINT[r.delivery_status || ""] || ""}>
                    {STATUS_LABEL[r.delivery_status || ""] || r.delivery_status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("th-TH")}
                  </span>
                </div>
                <div className="text-sm font-semibold">{r.customer_name || "ลูกค้า"}</div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-1">
                  {r.delivery_address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.delivery_address}</span>}
                  {r.delivery_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.delivery_phone}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">ยอดขาย + ค่าส่ง</div>
                <div className="font-bold tabular-nums">
                  ฿{(Number(r.total) + Number(r.delivery_fee || 0)).toLocaleString()}
                </div>
                {r.delivery_fee > 0 && (
                  <div className="text-xs text-muted-foreground">ค่าส่ง ฿{Number(r.delivery_fee).toLocaleString()}</div>
                )}
              </div>
              <div className="flex gap-1 flex-wrap">
                {r.delivery_status === "preparing" && (
                  <Button size="sm" onClick={() => quickStatus(r.id, "shipping")} className="bg-sky-600 hover:bg-sky-700">
                    เริ่มจัดส่ง
                  </Button>
                )}
                {r.delivery_status === "shipping" && (
                  <Button size="sm" onClick={() => quickStatus(r.id, "delivered")} className="bg-emerald-600 hover:bg-emerald-700">
                    ส่งสำเร็จ
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => openEdit(r)}>แก้ไข</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>รายละเอียดจัดส่ง {current?.receipt_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">ที่อยู่จัดส่ง</label>
              <Textarea value={addr} onChange={(e) => setAddr(e.target.value)} rows={3} placeholder="บ้านเลขที่ ถนน แขวง เขต จังหวัด รหัสไปรษณีย์" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">เบอร์โทร</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ค่าจัดส่ง (บาท)</label>
                <Input type="number" min={0} step="1" value={fee} onChange={(e) => setFee(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">สถานะ</label>
              <Select value={dstatus} onValueChange={setDstatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preparing">กำลังจัดเตรียม</SelectItem>
                  <SelectItem value="shipping">กำลังจัดส่ง</SelectItem>
                  <SelectItem value="delivered">จัดส่งแล้ว</SelectItem>
                  <SelectItem value="cancelled">ยกเลิก</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenId(null)}>ยกเลิก</Button>
              <Button onClick={save} disabled={busy}>บันทึก</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}