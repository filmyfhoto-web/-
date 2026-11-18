import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/xlsx";
import { fmtDateTime, ORDER_STATUS_LABEL } from "@/lib/format";
import { Download, FileSpreadsheet, FileDown } from "lucide-react";
import { toast } from "sonner";

export default function AdminReports() {
  async function exportOrdersXlsx() {
    const { data: orders } = await supabase.from("orders").select("id, order_no, created_at, status, subtotal, discount, shipping_fee, total, note, organizations(name)").order("created_at", { ascending: false });
    const ids = (orders ?? []).map((o: any) => o.id);
    const { data: items } = ids.length
      ? await supabase.from("order_items").select("order_id, product_code, product_name, unit, qty, price, total").in("order_id", ids)
      : { data: [] as any[] };
    const ordersSheet = (orders ?? []).map((o: any) => ({
      "เลขที่": o.order_no, "วันที่": fmtDateTime(o.created_at), "หน่วยงาน": o.organizations?.name || "",
      "สถานะ": ORDER_STATUS_LABEL[o.status], "ยอดรวม": Number(o.subtotal), "ส่วนลด": Number(o.discount),
      "ค่าจัดส่ง": Number(o.shipping_fee), "รวมทั้งสิ้น": Number(o.total), "หมายเหตุ": o.note || "",
    }));
    const orderNoMap = new Map((orders ?? []).map((o: any) => [o.id, o.order_no]));
    const itemsSheet = (items ?? []).map((i: any) => ({
      "เลขที่ออเดอร์": orderNoMap.get(i.order_id) || "", "รหัสสินค้า": i.product_code,
      "สินค้า": i.product_name, "หน่วย": i.unit, "จำนวน": Number(i.qty),
      "ราคา": Number(i.price), "รวม": Number(i.total),
    }));
    downloadXlsx(`orders-${new Date().toISOString().slice(0, 10)}`, { "ออเดอร์": ordersSheet, "รายการสินค้า": itemsSheet });
    toast.success("ส่งออก Excel แล้ว");
  }

  async function exportOrders() {
    const { data } = await supabase.from("orders").select("order_no, created_at, status, subtotal, discount, shipping_fee, total, note, organizations(name)").order("created_at", { ascending: false });
    const rows = (data ?? []).map((o: any) => ({
      "เลขที่": o.order_no, "วันที่": fmtDateTime(o.created_at), "หน่วยงาน": o.organizations?.name || "",
      "สถานะ": ORDER_STATUS_LABEL[o.status], "ยอดรวม": Number(o.subtotal), "ส่วนลด": Number(o.discount),
      "ค่าจัดส่ง": Number(o.shipping_fee), "รวมทั้งสิ้น": Number(o.total), "หมายเหตุ": o.note || "",
    }));
    downloadCsv(`orders-${new Date().toISOString().slice(0,10)}`, rows);
    toast.success("ส่งออกแล้ว");
  }
  async function exportProducts() {
    const [{ data }, { data: costs }] = await Promise.all([
      supabase.from("products").select("id, code, name, unit, stock, low_stock_threshold, standard_price, active, categories(name)"),
      supabase.from("product_costs").select("product_id, cost_price"),
    ]);
    const costMap = new Map((costs ?? []).map((x: any) => [x.product_id, Number(x.cost_price)]));
    const rows = (data ?? []).map((p: any) => ({
      "รหัส": p.code, "ชื่อ": p.name, "หมวดหมู่": p.categories?.name || "", "หน่วย": p.unit,
      "สต๊อก": Number(p.stock), "จุดเตือน": Number(p.low_stock_threshold),
      "ราคาทุน": costMap.get(p.id) ?? 0, "ราคามาตรฐาน": Number(p.standard_price), "เปิดขาย": p.active ? "Y" : "N",
    }));
    downloadCsv("products", rows); toast.success("ส่งออกแล้ว");
  }
  async function exportCustomers() {
    const { data } = await supabase.from("organizations").select("name, type, contact_name, phone, email, line_id, address, approved, price_groups(name)");
    const rows = (data ?? []).map((o: any) => ({
      "ชื่อหน่วยงาน": o.name, "ประเภท": o.type, "ผู้ติดต่อ": o.contact_name, "โทร": o.phone,
      "อีเมล": o.email, "LINE": o.line_id, "ที่อยู่": o.address, "กลุ่มราคา": o.price_groups?.name || "",
      "อนุมัติ": o.approved ? "Y" : "N",
    }));
    downloadCsv("customers", rows); toast.success("ส่งออกแล้ว");
  }
  async function exportStock() {
    const { data } = await supabase.from("stock_movements").select("created_at, move_type, qty, note, products(code, name)").order("created_at", { ascending: false });
    const rows = (data ?? []).map((m: any) => ({
      "เวลา": fmtDateTime(m.created_at), "รหัสสินค้า": m.products?.code, "สินค้า": m.products?.name,
      "ประเภท": m.move_type, "จำนวน": Number(m.qty), "หมายเหตุ": m.note,
    }));
    downloadCsv("stock-movements", rows); toast.success("ส่งออกแล้ว");
  }
  async function exportLowStock() {
    const { data } = await supabase.from("products").select("code, name, unit, stock, low_stock_threshold").eq("active", true);
    const rows = (data ?? []).filter((p: any) => Number(p.stock) <= Number(p.low_stock_threshold))
      .map((p: any) => ({ "รหัส": p.code, "ชื่อ": p.name, "หน่วย": p.unit, "สต๊อก": Number(p.stock), "จุดเตือน": Number(p.low_stock_threshold) }));
    downloadCsv("low-stock", rows); toast.success("ส่งออกแล้ว");
  }

  const cards = [
    { title: "รายงานออเดอร์ (CSV)", desc: "เปิดได้ใน Google Sheets / Excel", fn: exportOrders },
    { title: "รายงานสินค้า", desc: "ข้อมูลสินค้าทั้งหมด สต๊อก ราคา", fn: exportProducts },
    { title: "รายงานลูกค้า", desc: "ข้อมูลหน่วยงาน/ลูกค้าทั้งหมด", fn: exportCustomers },
    { title: "รายงานสต๊อก", desc: "ประวัติการเคลื่อนไหวสต๊อก", fn: exportStock },
    { title: "สินค้าใกล้หมด", desc: "สินค้าที่ถึงจุดเตือนสต๊อกต่ำ", fn: exportLowStock },
  ];

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-2">รายงาน</h1>
      <p className="text-sm text-muted-foreground mb-5">ส่งออกเป็น CSV (UTF-8) เปิดได้ใน Excel และ Google Sheets</p>
      <div className="bg-card rounded-2xl border border-border p-5 shadow-card mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary grid place-items-center text-white shrink-0"><FileDown className="w-6 h-6" /></div>
          <div>
            <div className="font-bold">รายงานออเดอร์ + รายการสินค้า (Excel)</div>
            <div className="text-xs text-muted-foreground">ไฟล์ .xlsx 2 ชีท: ออเดอร์ และรายการสินค้าในออเดอร์</div>
          </div>
        </div>
        <Button onClick={exportOrdersXlsx} className="rounded-xl bg-gradient-primary text-primary-foreground"><Download className="w-4 h-4 mr-2" /> ส่งออก Excel</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map(c => (
          <div key={c.title} className="bg-card rounded-2xl border border-border p-5 shadow-card">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-primary grid place-items-center text-white shrink-0"><FileSpreadsheet className="w-6 h-6" /></div>
              <div className="flex-1">
                <div className="font-bold">{c.title}</div>
                <div className="text-xs text-muted-foreground">{c.desc}</div>
              </div>
            </div>
            <Button onClick={c.fn} className="w-full mt-4 rounded-xl bg-gradient-primary text-primary-foreground"><Download className="w-4 h-4 mr-2" /> ส่งออก CSV</Button>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}