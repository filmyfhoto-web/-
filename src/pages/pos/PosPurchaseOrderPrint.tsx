import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { PO_STATUS_LABEL_TH } from "@/lib/purchaseOrder";

export default function PosPurchaseOrderPrint() {
  const { id } = useParams();
  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [supplier, setSupplier] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: pRaw } = await supabase.from("purchase_orders" as any).select("*").eq("id", id).maybeSingle();
      const p: any = pRaw;
      const { data: its } = await supabase.from("purchase_order_items" as any).select("*").eq("po_id", id);
      setPo(p); setItems((its ?? []) as any[]);
      if (p?.supplier_id) {
        const { data: s } = await supabase.from("suppliers" as any).select("*").eq("id", p.supplier_id).maybeSingle();
        setSupplier(s);
      }
    })();
  }, [id]);

  if (!po) return <div className="p-6">กำลังโหลด…</div>;

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 15mm; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
        .print-page { max-width: 190mm; margin: 0 auto; padding: 15mm 10mm; }
      `}</style>
      <div className="no-print sticky top-0 bg-slate-100 border-b p-2 flex justify-end gap-2">
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> พิมพ์</Button>
      </div>
      <div className="print-page">
        <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">ใบสั่งซื้อ / Purchase Order</h1>
            <div className="text-sm text-slate-700 mt-1">Natta POS</div>
          </div>
          <div className="text-right text-sm">
            <div><b>เลขที่:</b> <span className="font-mono">{po.po_no}</span></div>
            <div><b>วันที่:</b> {new Date(po.created_at).toLocaleDateString("th-TH")}</div>
            <div><b>สถานะ:</b> {PO_STATUS_LABEL_TH[po.status] || po.status}</div>
            {po.reference && <div><b>อ้างอิง:</b> {po.reference}</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div className="border p-2 rounded">
            <div className="text-xs text-slate-600">ผู้ขาย / Supplier</div>
            <div className="font-semibold">{po.supplier_name || supplier?.name || "-"}</div>
            {supplier?.address && <div className="text-xs">{supplier.address}</div>}
            {supplier?.tax_id && <div className="text-xs">เลขผู้เสียภาษี: {supplier.tax_id}</div>}
            {supplier?.phone && <div className="text-xs">โทร: {supplier.phone}</div>}
          </div>
          <div className="border p-2 rounded">
            <div className="text-xs text-slate-600">หมายเหตุ</div>
            <div className="text-sm">{po.note || "-"}</div>
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border p-2 text-left">ลำดับ</th>
              <th className="border p-2 text-left">รายการ</th>
              <th className="border p-2 text-right">จำนวน</th>
              <th className="border p-2 text-right">ทุน/หน่วย</th>
              <th className="border p-2 text-right">ส่วนลด</th>
              <th className="border p-2 text-right">รวม</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td className="border p-2">{i + 1}</td>
                <td className="border p-2">
                  <div>{it.snapshot_name || it.product_name}</div>
                  <div className="text-xs text-slate-500">{it.snapshot_code || ""}</div>
                </td>
                <td className="border p-2 text-right">{Number(it.qty)} {it.snapshot_unit || ""}</td>
                <td className="border p-2 text-right">฿{Number(it.unit_cost || it.cost_price || 0).toFixed(2)}</td>
                <td className="border p-2 text-right">฿{Number(it.discount_amount || 0).toFixed(2)}</td>
                <td className="border p-2 text-right">฿{Number(it.line_total || it.total || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-3">
          <table className="text-sm">
            <tbody>
              <tr><td className="px-3 py-1">ยอดรวมสินค้า</td><td className="px-3 py-1 text-right">฿{Number(po.subtotal || 0).toFixed(2)}</td></tr>
              <tr><td className="px-3 py-1">ส่วนลด</td><td className="px-3 py-1 text-right">-฿{Number(po.discount_amount || 0).toFixed(2)}</td></tr>
              <tr><td className="px-3 py-1">ค่าจัดส่ง</td><td className="px-3 py-1 text-right">฿{Number(po.shipping_cost || 0).toFixed(2)}</td></tr>
              <tr><td className="px-3 py-1">ภาษีมูลค่าเพิ่ม</td><td className="px-3 py-1 text-right">฿{Number(po.vat_amount || 0).toFixed(2)}</td></tr>
              <tr className="font-bold border-t"><td className="px-3 py-1">ยอดสุทธิ</td><td className="px-3 py-1 text-right">฿{Number(po.grand_total || po.total || 0).toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-8 mt-16 text-sm text-center">
          <div>
            <div className="border-t border-black pt-1">ผู้อนุมัติ</div>
          </div>
          <div>
            <div className="border-t border-black pt-1">ผู้รับสินค้า</div>
          </div>
        </div>
      </div>
    </div>
  );
}
