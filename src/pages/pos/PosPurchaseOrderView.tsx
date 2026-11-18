import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, Truck, XCircle, Printer, Pencil } from "lucide-react";
import { PO_STATUS_LABEL_TH, PO_STATUS_TINT } from "@/lib/purchaseOrder";
import ReceiveDialog from "./ReceiveDialog";

export default function PosPurchaseOrderView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [receiveOpen, setReceiveOpen] = useState(false);

  async function load() {
    if (!id) return;
    const { data } = await supabase.from("purchase_orders" as any).select("*").eq("id", id).maybeSingle();
    const { data: its } = await supabase.from("purchase_order_items" as any).select("*").eq("po_id", id);
    const { data: hist } = await supabase.from("po_status_history" as any).select("*").eq("po_id", id).order("at", { ascending: false });
    setPo(data); setItems((its ?? []) as any[]); setHistory((hist ?? []) as any[]);
  }
  useEffect(() => { load(); }, [id]);

  async function approve() {
    const { error } = await (supabase as any).rpc("pos_po_approve", { p_po_id: id });
    if (error) toast.error(error.message); else { toast.success("อนุมัติแล้ว"); load(); }
  }
  async function cancel() {
    if (!confirm("ยกเลิกใบสั่งซื้อนี้?")) return;
    const { error } = await (supabase as any).rpc("pos_po_cancel", { p_po_id: id, p_note: null });
    if (error) toast.error(error.message?.includes("po_has_receipts") ? "รับสินค้าแล้ว ยกเลิกไม่ได้" : (error.message || "ผิดพลาด"));
    else { toast.success("ยกเลิกแล้ว"); load(); }
  }

  if (!po) return <div className="p-6 text-muted-foreground">กำลังโหลด…</div>;
  const canApprove = po.status === "pending_approval" || po.status === "draft";
  const canReceive = po.status === "approved_waiting_receipt";
  const canCancel = ["draft","pending_approval","approved_waiting_receipt"].includes(po.status);
  const canEdit = po.status === "draft" || po.status === "pending_approval";

  return (
    <div className="p-3 md:p-5 max-w-[1200px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">ใบสั่งซื้อ</div>
          <h2 className="text-xl font-bold font-mono">{po.po_no}</h2>
          <Badge className={PO_STATUS_TINT[po.status] || ""}>{PO_STATUS_LABEL_TH[po.status] || po.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="outline" onClick={() => nav(`/pos/purchase-orders/${id}/edit`)}><Pencil className="h-4 w-4 mr-1" /> แก้ไข</Button>}
          {canApprove && <Button onClick={approve} className="bg-emerald-600 hover:bg-emerald-700 text-white"><ShieldCheck className="h-4 w-4 mr-1" /> อนุมัติ</Button>}
          {canReceive && <Button onClick={() => setReceiveOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white"><Truck className="h-4 w-4 mr-1" /> รับสินค้า</Button>}
          {canCancel && <Button variant="outline" onClick={cancel}><XCircle className="h-4 w-4 mr-1" /> ยกเลิก</Button>}
          <Button variant="outline" onClick={() => window.open(`/pos/purchase-orders/${id}/print`, "_blank")}><Printer className="h-4 w-4 mr-1" /> พิมพ์</Button>
        </div>
      </div>

      <Card className="p-4 grid md:grid-cols-3 gap-3 text-sm">
        <div><div className="text-xs text-muted-foreground">ผู้ขาย</div><div className="font-medium">{po.supplier_name || "-"}</div></div>
        <div><div className="text-xs text-muted-foreground">อ้างอิง</div><div>{po.reference || "-"}</div></div>
        <div><div className="text-xs text-muted-foreground">วิธีคำนวณต้นทุน</div><div>{po.cost_method === "average" ? "ต้นทุนเฉลี่ย" : "ต้นทุนล่าสุด"}</div></div>
        <div className="md:col-span-3"><div className="text-xs text-muted-foreground">หมายเหตุ</div><div>{po.note || "-"}</div></div>
      </Card>

      <Card className="p-3">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr>
            <th className="text-left px-2 py-1">สินค้า</th>
            <th className="text-right px-2 py-1">สั่ง</th>
            <th className="text-right px-2 py-1">รับแล้ว</th>
            <th className="text-right px-2 py-1">ทุน/หน่วย</th>
            <th className="text-right px-2 py-1">รวม</th>
          </tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="px-2 py-1">
                  <div className="font-medium">{it.snapshot_name || it.product_name}</div>
                  <div className="text-xs text-muted-foreground">{it.snapshot_code || "-"}</div>
                </td>
                <td className="px-2 py-1 text-right">{Number(it.qty)}</td>
                <td className="px-2 py-1 text-right">{Number(it.received_qty || 0)}</td>
                <td className="px-2 py-1 text-right">฿{Number(it.unit_cost || it.cost_price || 0).toFixed(2)}</td>
                <td className="px-2 py-1 text-right">฿{Number(it.line_total || it.total || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end pt-3 text-sm">
          <div className="w-64 space-y-1">
            <div className="flex justify-between"><span>ยอดรวมสินค้า</span><span>฿{Number(po.subtotal || 0).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>ส่วนลด</span><span>-฿{Number(po.discount_amount || 0).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>ค่าจัดส่ง</span><span>฿{Number(po.shipping_cost || 0).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>VAT</span><span>฿{Number(po.vat_amount || 0).toFixed(2)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1"><span>รวมสุทธิ</span><span>฿{Number(po.grand_total || po.total || 0).toFixed(2)}</span></div>
          </div>
        </div>
      </Card>

      <Card className="p-3">
        <h3 className="font-semibold mb-2 text-sm">ประวัติสถานะ</h3>
        <ul className="space-y-1 text-sm">
          {history.length === 0 ? <li className="text-muted-foreground">—</li> : history.map((h) => (
            <li key={h.id} className="flex gap-2 text-xs">
              <span className="text-muted-foreground">{new Date(h.at).toLocaleString("th-TH")}</span>
              <span className="font-medium">{PO_STATUS_LABEL_TH[h.to_status] || h.to_status}</span>
              {h.note && <span className="text-muted-foreground">— {h.note}</span>}
            </li>
          ))}
        </ul>
      </Card>

      <ReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} poId={id!}
        items={items.map((it) => ({ id: it.id, snapshot_name: it.snapshot_name, product_name: it.product_name, qty: Number(it.qty), received_qty: Number(it.received_qty || 0) }))}
        onReceived={load} />
    </div>
  );
}
