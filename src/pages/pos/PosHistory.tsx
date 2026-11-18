import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { receiptPath } from "./openReceipt";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History, Search, Printer, XCircle, Eye, Truck } from "lucide-react";
import { toast } from "sonner";

type R = {
  id: string; receipt_number: string; created_at: string; total: number;
  subtotal: number; discount: number; payment_type: string | null;
  payment_status: string; cancelled_at: string | null; customer_name: string | null;
};
type Item = { id: string; name: string; qty: number; unit_price: number; line_total: number; unit: string | null; variant_label: string | null };

function rangeStart(k: string): string | null {
  const d = new Date();
  if (k === "today") { d.setHours(0,0,0,0); return d.toISOString(); }
  if (k === "7d") { d.setDate(d.getDate()-7); return d.toISOString(); }
  if (k === "30d") { d.setDate(d.getDate()-30); return d.toISOString(); }
  return null;
}

const STATUS_TINT: Record<string,string> = {
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  void: "bg-rose-100 text-rose-800",
  refunded: "bg-slate-200 text-slate-700",
};
const STATUS_LABEL: Record<string,string> = { paid: "ชำระแล้ว", pending: "รอชำระ", void: "ยกเลิก", refunded: "คืนเงิน" };

export default function PosHistory() {
  const navigate = useNavigate();
  /** Reprint = same-tab preview only. No checkout RPC, no stock mutation. */
  const openReceiptPage = (receiptId: string) =>
    navigate(receiptPath(receiptId, { returnTo: "/pos/history" }), {
      state: { returnTo: "/pos/history" },
    });
  const [rows, setRows] = useState<R[]>([]);
  const [range, setRange] = useState("7d");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    let query = supabase.from("pos_receipts").select("id, receipt_number, created_at, total, subtotal, discount, payment_type, payment_status, cancelled_at, customer_name")
      .order("created_at", { ascending: false }).limit(200);
    const s = rangeStart(range);
    if (s) query = query.gte("created_at", s);
    const { data, error } = await query;
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as any as R[]);
  }
  useEffect(() => { load(); }, [range]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (status !== "all") {
      if (status === "void" && !r.cancelled_at) return false;
      if (status !== "void" && r.cancelled_at) return false;
      if (status !== "void" && r.payment_status !== status) return false;
    }
    if (q && !(r.receipt_number || "").toLowerCase().includes(q.toLowerCase()) &&
        !(r.customer_name || "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, status, q]);

  async function openDetail(id: string) {
    setOpenId(id); setItems([]);
    const { data } = await supabase.from("pos_receipt_items").select("id, name, qty, unit_price, line_total, unit, variant_label").eq("receipt_id", id);
    setItems((data ?? []) as any as Item[]);
  }

  async function cancelReceipt(id: string) {
    if (!confirm("ยกเลิกบิลนี้และคืนสต๊อก?")) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("pos_cancel_receipt", { p_receipt_id: id, p_reason: "ยกเลิกจากประวัติ" });
    setBusy(false);
    if (error) toast.error(error.message || "ยกเลิกไม่สำเร็จ");
    else { toast.success("ยกเลิกบิลเรียบร้อย"); setOpenId(null); load(); }
  }

  async function markForDelivery(id: string) {
    const { error } = await supabase.from("pos_receipts").update({ delivery_status: "preparing" }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("ส่งไปยังหน้าจัดส่งแล้ว"); load(); }
  }

  const current = filtered.find((r) => r.id === openId);
  const totalSum = filtered.filter((r) => !r.cancelled_at).reduce((s, r) => s + Number(r.total || 0), 0);

  return (
    <div className="p-3 md:p-5 max-w-[1400px] mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2"><History className="h-5 w-5 text-primary" /> ประวัติการขาย</h2>
        <div className="text-sm text-muted-foreground">ยอดรวมช่วงที่กรอง: <span className="font-bold text-foreground tabular-nums">฿{totalSum.toLocaleString()}</span></div>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-56">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="ค้นหาเลขที่บิล / ลูกค้า" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">วันนี้</SelectItem>
            <SelectItem value="7d">7 วันล่าสุด</SelectItem>
            <SelectItem value="30d">30 วันล่าสุด</SelectItem>
            <SelectItem value="all">ทั้งหมด</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            <SelectItem value="paid">ชำระแล้ว</SelectItem>
            <SelectItem value="pending">รอชำระ</SelectItem>
            <SelectItem value="void">ยกเลิก</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="border rounded-md overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2">เลขที่บิล</th>
              <th className="text-left px-3 py-2">วันที่</th>
              <th className="text-left px-3 py-2">ลูกค้า</th>
              <th className="text-left px-3 py-2">การชำระ</th>
              <th className="text-left px-3 py-2">สถานะ</th>
              <th className="text-right px-3 py-2">ยอดรวม</th>
              <th className="text-right px-3 py-2 w-20">การกระทำ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">ไม่มีบิล</td></tr>
            ) : filtered.map((r) => {
              const st = r.cancelled_at ? "void" : r.payment_status;
              return (
                <tr key={r.id} className="border-t hover:bg-accent/30">
                  <td className="px-3 py-2 font-mono text-xs">
                    <button className="text-primary hover:underline" onClick={() => openDetail(r.id)}>{r.receipt_number}</button>
                  </td>
                  <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleString("th-TH")}</td>
                  <td className="px-3 py-2">{r.customer_name || "-"}</td>
                  <td className="px-3 py-2 text-xs">{r.payment_type || "-"}</td>
                  <td className="px-3 py-2"><Badge className={STATUS_TINT[st] || ""}>{STATUS_LABEL[st] || st}</Badge></td>
                  <td className="px-3 py-2 text-right tabular-nums">฿{Number(r.total || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openDetail(r.id)} aria-label="ดูบิล"><Eye className="h-4 w-4" /></Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openReceiptPage(r.id)}
                        aria-label="พิมพ์ซ้ำ"
                        data-testid={`pos-history-print-${r.id}`}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>บิล {current?.receipt_number}</DialogTitle></DialogHeader>
          {current && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">วันที่: </span>{new Date(current.created_at).toLocaleString("th-TH")}</div>
                <div><span className="text-muted-foreground">ลูกค้า: </span>{current.customer_name || "-"}</div>
                <div><span className="text-muted-foreground">การชำระ: </span>{current.payment_type || "-"}</div>
                <div><span className="text-muted-foreground">สถานะ: </span>
                  <Badge className={STATUS_TINT[current.cancelled_at ? "void" : current.payment_status] || ""}>
                    {STATUS_LABEL[current.cancelled_at ? "void" : current.payment_status] || current.payment_status}
                  </Badge>
                </div>
              </div>
              <div className="border rounded max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs"><tr>
                    <th className="text-left px-2 py-1">สินค้า</th>
                    <th className="text-right px-2 py-1 w-16">จำนวน</th>
                    <th className="text-right px-2 py-1 w-20">ราคา/หน่วย</th>
                    <th className="text-right px-2 py-1 w-24">รวม</th>
                  </tr></thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-2 py-1">{it.name}{it.variant_label ? ` · ${it.variant_label}` : ""}</td>
                        <td className="px-2 py-1 text-right">{Number(it.qty)} {it.unit || ""}</td>
                        <td className="px-2 py-1 text-right">฿{Number(it.unit_price).toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">฿{Number(it.line_total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold"><span>ยอดสุทธิ</span><span>฿{Number(current.total || 0).toFixed(2)}</span></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => openReceiptPage(current.id)}><Printer className="h-4 w-4 mr-1" /> พิมพ์ซ้ำ</Button>
                {!current.cancelled_at && (
                  <Button variant="outline" onClick={() => markForDelivery(current.id)}>
                    <Truck className="h-4 w-4 mr-1" /> จัดส่ง
                  </Button>
                )}
                {!current.cancelled_at && current.payment_status !== "void" && (
                  <Button variant="outline" onClick={() => cancelReceipt(current.id)} disabled={busy} className="text-rose-600">
                    <XCircle className="h-4 w-4 mr-1" /> ยกเลิกบิล
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}