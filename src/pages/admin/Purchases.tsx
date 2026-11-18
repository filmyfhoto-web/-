import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Truck, Trash2, ListChecks } from "lucide-react";
import { fmtDateTime, fmtTHB, genDocNo, PO_STATUS_LABEL } from "@/lib/format";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import BulkActionBar from "@/components/BulkActionBar";
import { Link } from "react-router-dom";

export default function AdminPurchases() {
  const { user } = useAuth();
  const [pos, setPos] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState<{ product_id: string; product_name: string; qty: number; cost_price: number }[]>([]);
  const bulk = useBulkSelect(pos);

  async function load() {
    const [{ data: p }, { data: pr }, { data: costs }, { data: sups }] = await Promise.all([
      supabase.from("purchase_orders").select("*, purchase_order_items(*)").order("created_at", { ascending: false }),
      supabase.from("products").select("id, code, name").order("name"),
      supabase.from("product_costs").select("product_id, cost_price"),
      supabase.from("suppliers" as any).select("id, name, phone").order("name"),
    ]);
    const costMap = new Map((costs ?? []).map((x: any) => [x.product_id, Number(x.cost_price)]));
    setPos(p ?? []);
    setProducts((pr ?? []).map((x: any) => ({ ...x, cost_price: costMap.get(x.id) ?? 0 })));
    setSuppliers((sups ?? []) as any[]);
  }
  useEffect(() => { load(); }, []);

  function addLine(pid: string) {
    const p = products.find(x => x.id === pid); if (!p) return;
    setLines(prev => [...prev, { product_id: p.id, product_name: p.name, qty: 1, cost_price: Number(p.cost_price) }]);
  }

  async function create() {
    const po_no = genDocNo("PO");
    const total = lines.reduce((s, l) => s + l.qty * l.cost_price, 0);
    const chosen = suppliers.find((s: any) => s.id === supplierId);
    const supplierName = supplier.trim() || chosen?.name || "";
    if (!supplierName) return toast.error("กรุณาเลือกหรือกรอกชื่อผู้จำหน่าย");
    const { data: po, error } = await supabase.from("purchase_orders").insert({
      po_no,
      supplier_name: supplierName,
      supplier_id: supplierId || null,
      total,
      created_by: user?.id,
    } as any).select("id").single();
    if (error) return toast.error(error.message);
    await supabase.from("purchase_order_items").insert(lines.map(l => ({ po_id: po.id, ...l, total: l.qty * l.cost_price })));
    toast.success("สร้างใบจัดซื้อแล้ว");
    setOpen(false); setLines([]); setSupplier(""); setSupplierId(""); load();
  }

  async function changeStatus(po: any, status: string) {
    if (status === "received" && po.status !== "received") {
      // Stock only ever moves through the central RPC (-> stock_movements).
      // The idempotency key makes a double "received" click a no-op.
      for (const it of po.purchase_order_items) {
        if (!it.product_id) continue;
        const { error } = await supabase.rpc("pos_adjust_stock" as never, {
          p_product_id: it.product_id,
          p_variant_id: null,
          p_mode: "add",
          p_qty: Number(it.qty),
          p_reason: "receive_in",
          p_reference: po.po_no,
          p_note: `รับเข้าจาก ${po.po_no}`,
          p_idempotency_key: `po:${po.id}:${it.id ?? it.product_id}`,
        } as never);
        if (error) return toast.error(`รับเข้าไม่สำเร็จ: ${error.message}`);
      }
    }
    await supabase.from("purchase_orders").update({ status: status as any }).eq("id", po.id);
    toast.success("อัปเดตสถานะแล้ว"); load();
  }

  async function bulkDelete() {
    const ids = bulk.selectedArray; if (!ids.length) return;
    await supabase.from("purchase_order_items").delete().in("po_id", ids);
    const { error } = await supabase.from("purchase_orders").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`ลบ ${ids.length} ใบ`); bulk.exit(); load();
  }

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold">จัดซื้อเข้าร้าน</h1>
        <div className="flex gap-2">
        <Button variant={bulk.selectMode ? "default" : "outline"} className="rounded-xl" onClick={() => bulk.selectMode ? bulk.exit() : bulk.setSelectMode(true)}>
          <ListChecks className="w-4 h-4 mr-1" /> {bulk.selectMode ? "ออกจากโหมดเลือก" : "เลือกหลายรายการ"}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-xl bg-gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> สร้างใบจัดซื้อ</Button></DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>ใบจัดซื้อใหม่</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground">ผู้จำหน่าย</label>
                <Link to="/admin/suppliers" className="text-xs text-primary hover:underline">
                  จัดการรายการผู้จำหน่าย →
                </Link>
              </div>
              <Select value={supplierId} onValueChange={(v) => {
                setSupplierId(v);
                const s = suppliers.find((x: any) => x.id === v);
                if (s) setSupplier(s.name);
              }}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="— เลือกจากรายการที่บันทึกไว้ —" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}{s.phone ? ` · ${s.phone}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="หรือพิมพ์ชื่อผู้จำหน่ายใหม่"
                value={supplier}
                onChange={(e) => { setSupplier(e.target.value); if (supplierId) setSupplierId(""); }}
                className="rounded-xl"
              />
            </div>
            <Select onValueChange={addLine}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="+ เลือกสินค้า" /></SelectTrigger>
              <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted-foreground"><th className="text-left p-2">สินค้า</th><th className="text-right p-2">จำนวน</th><th className="text-right p-2">ราคาทุน</th><th className="text-right p-2">รวม</th><th></th></tr></thead>
                <tbody>{lines.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">{l.product_name}</td>
                    <td className="p-2 text-right"><Input type="number" value={l.qty} onChange={(e) => setLines(p => p.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} className="w-20 h-8 rounded-lg text-right ml-auto" /></td>
                    <td className="p-2 text-right"><Input type="number" value={l.cost_price} onChange={(e) => setLines(p => p.map((x, j) => j === i ? { ...x, cost_price: Number(e.target.value) } : x))} className="w-24 h-8 rounded-lg text-right ml-auto" /></td>
                    <td className="p-2 text-right">{fmtTHB(l.qty * l.cost_price)}</td>
                    <td><Button size="icon" variant="ghost" onClick={() => setLines(p => p.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <Button onClick={create} className="rounded-xl bg-gradient-primary text-primary-foreground">บันทึก</Button>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <div className="space-y-3">
        {pos.map(p => (
          <div key={p.id} className="bg-card rounded-2xl border border-border p-4 shadow-card">
            <div className="flex flex-wrap justify-between items-start gap-2">
              <div className="flex items-start gap-3">
                {bulk.selectMode && <div className="pt-1"><Checkbox checked={bulk.ids.has(p.id)} onCheckedChange={() => bulk.toggle(p.id)} /></div>}
                <div>
                <div className="font-bold text-primary flex items-center gap-2"><Truck className="w-4 h-4" /> {p.po_no}</div>
                <div className="text-xs text-muted-foreground">{p.supplier_name || "-"} · {fmtDateTime(p.created_at)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{PO_STATUS_LABEL[p.status]}</Badge>
                <Select value={p.status} onValueChange={(v) => changeStatus(p, v)}>
                  <SelectTrigger className="rounded-xl w-36 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PO_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-sm mt-2 text-muted-foreground">{p.purchase_order_items?.length || 0} รายการ · รวม {fmtTHB(p.total)}</div>
          </div>
        ))}
      </div>
      {bulk.selectMode && bulk.count > 0 && (
        <BulkActionBar count={bulk.count} onCancel={bulk.exit} onConfirm={() => { void bulkDelete(); }}
          itemLabel="ใบจัดซื้อ"
          previewNames={bulk.selectedArray.map(id => {
            const p: any = pos.find((x: any) => x.id === id);
            return p ? (p.po_no || p.id.slice(0, 8)) : null;
          }).filter(Boolean) as string[]}
          confirmDescription={`ลบใบจัดซื้อ ${bulk.count} ใบ พร้อมรายการในใบ`} />
      )}
    </AdminLayout>
  );
}