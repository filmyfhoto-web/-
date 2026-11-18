import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Send, ShieldCheck, Truck, ScanLine } from "lucide-react";
import { toast } from "sonner";
import SupplierEditorDialog, { type SupplierRow } from "./SupplierEditorDialog";
import { lineTotal, poTotals } from "@/lib/purchaseOrder";
import { makeIdempotencyKey } from "@/lib/stockAdjust";

type Product = { id: string; code: string | null; name: string; unit: string | null; barcode: string | null; has_variants: boolean };
type Variant = { id: string; sku: string | null; name: string | null };
type Line = {
  key: string;
  product_id: string;
  variant_id?: string | null;
  name: string;
  code?: string | null;
  unit?: string | null;
  qty: number;
  unit_cost: number;
  discount_amount: number;
  discount_percent: number;
};

export default function PosPurchaseOrderEditor() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const preselectProduct = sp.get("product");
  const nav = useNavigate();

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierEditor, setSupplierEditor] = useState(false);

  const [supplierId, setSupplierId] = useState<string>("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [other, setOther] = useState(0);
  const [vatOn, setVatOn] = useState(false);
  const [vatIncluded, setVatIncluded] = useState(false);
  const [vatRate, setVatRate] = useState(7);
  const [costMethod, setCostMethod] = useState<"last" | "average">("last");
  const [status, setStatus] = useState<string>("draft");
  const [saving, setSaving] = useState(false);

  async function loadRefData() {
    const [{ data: sups }, { data: prods }] = await Promise.all([
      supabase.from("suppliers" as any).select("id, name, code, phone, is_active").is("archived_at", null).order("name"),
      supabase.from("products").select("id, code, name, unit, barcode, has_variants").eq("active", true).is("deleted_at", null).order("name").limit(500),
    ]);
    setSuppliers(((sups ?? []) as unknown) as SupplierRow[]);
    setProducts(((prods ?? []) as unknown) as Product[]);
  }

  useEffect(() => { loadRefData(); }, []);

  useEffect(() => {
    if (!id || id === "new") return;
    (async () => {
      const { data: po } = await supabase.from("purchase_orders" as any).select("*").eq("id", id).maybeSingle();
      const { data: items } = await supabase.from("purchase_order_items" as any).select("*").eq("po_id", id);
      if (!po) return;
      const p: any = po;
      setSupplierId(p.supplier_id || "");
      setNote(p.note || ""); setReference(p.reference || "");
      setDiscount(Number(p.discount_amount || 0));
      setShipping(Number(p.shipping_cost || 0));
      setOther(Number(p.other_cost || 0));
      setVatOn(!!p.vat_enabled); setVatIncluded(!!p.vat_included);
      setVatRate(Number(p.vat_rate || 7));
      setCostMethod((p.cost_method as any) || "last");
      setStatus(p.status);
      setLines((items ?? []).map((it: any) => ({
        key: it.id, product_id: it.product_id, variant_id: it.variant_id,
        name: it.snapshot_name || it.product_name, code: it.snapshot_code, unit: it.snapshot_unit,
        qty: Number(it.qty), unit_cost: Number(it.unit_cost || it.cost_price || 0),
        discount_amount: Number(it.discount_amount || 0), discount_percent: Number(it.discount_percent || 0),
      })));
    })();
  }, [id]);

  useEffect(() => {
    if (preselectProduct && products.length && lines.length === 0) {
      const p = products.find((x) => x.id === preselectProduct);
      if (p && !p.has_variants) addProduct(p);
    }
     
  }, [preselectProduct, products]);

  const totals = useMemo(() => poTotals({
    lines: lines.map((l) => ({ qty: l.qty, unit_cost: l.unit_cost, discount_amount: l.discount_amount, discount_percent: l.discount_percent })),
    discount_amount: discount, shipping_cost: shipping, other_cost: other,
    vat_enabled: vatOn, vat_included: vatIncluded, vat_rate: vatRate,
  }), [lines, discount, shipping, other, vatOn, vatIncluded, vatRate]);

  function addProduct(p: Product) {
    setLines((old) => [...old, {
      key: `k${Date.now()}-${Math.random()}`,
      product_id: p.id, variant_id: null,
      name: p.name, code: p.code, unit: p.unit,
      qty: 1, unit_cost: 0, discount_amount: 0, discount_percent: 0,
    }]);
  }

  const filteredProducts = useMemo(() => {
    const t = productSearch.trim().toLowerCase();
    if (!t) return [];
    return products.filter((p) =>
      (p.name || "").toLowerCase().includes(t) ||
      (p.code || "").toLowerCase().includes(t) ||
      (p.barcode || "").toLowerCase().includes(t)
    ).slice(0, 8);
  }, [productSearch, products]);

  async function fetchVariants(productId: string): Promise<Variant[]> {
    const { data } = await supabase.from("product_variants")
      .select("id, sku, name").eq("product_id", productId).eq("active", true);
    return (data ?? []) as Variant[];
  }

  async function handleAddProduct(p: Product) {
    if (p.has_variants) {
      const vs = await fetchVariants(p.id);
      const sku = prompt(`เลือก SKU สำหรับ ${p.name}\n${vs.map((v, i) => `${i + 1}. ${v.sku || v.name}`).join("\n")}\nกรอกหมายเลข:`);
      const idx = Number(sku) - 1;
      if (isNaN(idx) || !vs[idx]) { toast.error("ต้องเลือก SKU"); return; }
      const v = vs[idx];
      setLines((old) => [...old, {
        key: `k${Date.now()}-${Math.random()}`,
        product_id: p.id, variant_id: v.id,
        name: `${p.name} · ${v.sku || v.name || ""}`, code: p.code, unit: p.unit,
        qty: 1, unit_cost: 0, discount_amount: 0, discount_percent: 0,
      }]);
    } else {
      addProduct(p);
    }
    setProductSearch("");
  }

  function updLine(i: number, patch: Partial<Line>) {
    setLines((old) => old.map((l, j) => j === i ? { ...l, ...patch } : l));
  }

  function buildPayload() {
    const chosen = suppliers.find((s) => s.id === supplierId);
    return {
      id: id && id !== "new" ? id : null,
      supplier_id: supplierId || null,
      supplier_name: chosen?.name || null,
      note, reference,
      discount_amount: discount, shipping_cost: shipping, other_cost: other,
      vat_enabled: vatOn, vat_included: vatIncluded, vat_rate: vatRate,
      cost_method: costMethod,
      lines: lines.map((l) => ({
        product_id: l.product_id, variant_id: l.variant_id || null,
        qty: l.qty, unit_cost: l.unit_cost,
        discount_amount: l.discount_amount, discount_percent: l.discount_percent,
      })),
    };
  }

  async function doSave(next: "draft" | "pending_approval" | "receive_now") {
    if (!lines.length) { toast.error("กรุณาเพิ่มรายการสินค้า"); return; }
    if (!supplierId) { toast.error("กรุณาเลือกผู้ขาย"); return; }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (next === "receive_now") {
        const { data, error } = await (supabase as any).rpc("pos_po_create_and_receive", { p: payload, p_idempotency_key: makeIdempotencyKey() });
        if (error) throw error;
        toast.success("นำเข้าใบสั่งซื้อสำเร็จ");
        nav(`/pos/purchase-orders/${(data as any).po_id}`);
      } else {
        const { data: newId, error } = await (supabase as any).rpc("pos_po_upsert", { p: payload });
        if (error) throw error;
        if (next === "pending_approval") {
          const { error: e2 } = await (supabase as any).rpc("pos_po_submit_approval", { p_po_id: newId });
          if (e2) throw e2;
        }
        toast.success(id && id !== "new" ? "อัปเดตใบสั่งซื้อสำเร็จ" : "สร้างใบสั่งซื้อสำเร็จ");
        nav(`/pos/purchase-orders/${newId}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  const editable = !id || id === "new" || status === "draft" || status === "pending_approval";

  return (
    <div className="p-3 md:p-5 max-w-[1400px] mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{id && id !== "new" ? "แก้ไขใบสั่งซื้อ" : "ใบสั่งซื้อใหม่"}</h2>
        <div className="flex gap-2">
          {editable && (
            <>
              <Button variant="outline" disabled={saving} onClick={() => doSave("draft")}><Save className="h-4 w-4 mr-1" /> บันทึกร่าง</Button>
              <Button disabled={saving} onClick={() => doSave("pending_approval")} className="bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="pos-po-submit-approval"><Send className="h-4 w-4 mr-1" /> ขออนุมัติ</Button>
              <Button disabled={saving} onClick={() => doSave("receive_now")} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="pos-po-receive-now"><Truck className="h-4 w-4 mr-1" /> นำเข้าทันที</Button>
            </>
          )}
        </div>
      </div>

      {!editable && (
        <Card className="p-3 text-sm text-muted-foreground">ใบสั่งซื้อสถานะปัจจุบันแก้ไขไม่ได้ ({status})</Card>
      )}

      <Card className="p-3 grid md:grid-cols-3 gap-3">
        <div>
          <div className="flex items-center justify-between">
            <Label>ผู้ขาย *</Label>
            <button className="text-xs text-primary hover:underline" onClick={() => setSupplierEditor(true)}>+ เพิ่มผู้ขาย</button>
          </div>
          <Select value={supplierId} onValueChange={setSupplierId} disabled={!editable}>
            <SelectTrigger data-testid="pos-po-supplier"><SelectValue placeholder="— เลือกผู้ขาย —" /></SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id!}>{s.name}{s.code ? ` · ${s.code}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>เลขอ้างอิง</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={!editable} />
        </div>
        <div>
          <Label>วิธีคำนวณต้นทุน</Label>
          <Select value={costMethod} onValueChange={(v) => setCostMethod(v as any)} disabled={!editable}>
            <SelectTrigger data-testid="pos-po-cost-method"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="last">ต้นทุนล่าสุด</SelectItem>
              <SelectItem value="average">ต้นทุนเฉลี่ย</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-3">
          <Label>หมายเหตุ</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!editable} />
        </div>
      </Card>

      <Card className="p-3 space-y-2">
        {editable && (
          <div className="relative">
            <div className="flex items-center gap-1">
              <ScanLine className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="ค้นหาสินค้า / รหัส / บาร์โค้ด" value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)} data-testid="pos-po-product-search" />
            </div>
            {filteredProducts.length > 0 && (
              <div className="absolute z-20 mt-1 bg-popover border rounded-md shadow max-h-64 overflow-auto w-full">
                {filteredProducts.map((p) => (
                  <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                    onClick={() => handleAddProduct(p)}>
                    <span className="font-medium">{p.name}</span>{p.code && <span className="text-xs text-muted-foreground ml-2">{p.code}</span>}
                    {p.has_variants && <span className="text-xs text-primary ml-2">มี SKU</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1">สินค้า</th>
                <th className="text-right px-2 py-1 w-20">จำนวน</th>
                <th className="text-right px-2 py-1 w-24">ทุน/หน่วย</th>
                <th className="text-right px-2 py-1 w-24">ส่วนลด(บาท)</th>
                <th className="text-right px-2 py-1 w-20">ส่วนลด(%)</th>
                <th className="text-right px-2 py-1 w-28">รวม</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">ยังไม่มีรายการ</td></tr>
              ) : lines.map((l, i) => (
                <tr key={l.key} className="border-t">
                  <td className="px-2 py-1">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.code || "-"}</div>
                  </td>
                  <td className="px-2 py-1"><Input type="number" min={1} value={l.qty}
                    onChange={(e) => updLine(i, { qty: Number(e.target.value) || 0 })} disabled={!editable} className="text-right h-8" /></td>
                  <td className="px-2 py-1"><Input type="number" min={0} value={l.unit_cost}
                    onChange={(e) => updLine(i, { unit_cost: Number(e.target.value) || 0 })} disabled={!editable} className="text-right h-8" /></td>
                  <td className="px-2 py-1"><Input type="number" min={0} value={l.discount_amount}
                    onChange={(e) => updLine(i, { discount_amount: Number(e.target.value) || 0 })} disabled={!editable} className="text-right h-8" /></td>
                  <td className="px-2 py-1"><Input type="number" min={0} max={100} value={l.discount_percent}
                    onChange={(e) => updLine(i, { discount_percent: Number(e.target.value) || 0 })} disabled={!editable} className="text-right h-8" /></td>
                  <td className="px-2 py-1 text-right tabular-nums">฿{lineTotal(l).toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">
                    {editable && <Button size="icon" variant="ghost" onClick={() => setLines((o) => o.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-3 grid md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <div><Label>ส่วนลดใบสั่งซื้อ</Label>
            <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} disabled={!editable} /></div>
          <div><Label>ค่าจัดส่ง</Label>
            <Input type="number" min={0} value={shipping} onChange={(e) => setShipping(Number(e.target.value) || 0)} disabled={!editable} /></div>
          <div><Label>ค่าอื่น ๆ</Label>
            <Input type="number" min={0} value={other} onChange={(e) => setOther(Number(e.target.value) || 0)} disabled={!editable} /></div>
          <div className="flex items-center gap-3 pt-2">
            <Switch checked={vatOn} onCheckedChange={setVatOn} disabled={!editable} data-testid="pos-po-vat" />
            <Label className="flex items-center gap-1">VAT ({vatRate}%)</Label>
            <label className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={vatIncluded} onChange={(e) => setVatIncluded(e.target.checked)} disabled={!editable || !vatOn} />
              รวมภาษีแล้ว
            </label>
          </div>
        </div>
        <div className="space-y-1 text-sm bg-muted/30 rounded p-3">
          <div className="flex justify-between"><span>ยอดรวมสินค้า</span><span className="tabular-nums">฿{totals.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>ฐานภาษี</span><span className="tabular-nums">฿{totals.taxable.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>ภาษีมูลค่าเพิ่ม</span><span className="tabular-nums">฿{totals.vat.toFixed(2)}</span></div>
          <div className="flex justify-between text-base font-bold pt-1 border-t"><span>ยอดสุทธิ</span>
            <span className="tabular-nums" data-testid="pos-po-grand">฿{totals.grand.toFixed(2)}</span></div>
        </div>
      </Card>

      <SupplierEditorDialog open={supplierEditor} onOpenChange={setSupplierEditor}
        onSaved={async (id) => { await loadRefData(); setSupplierId(id); }} />
    </div>
  );
}
