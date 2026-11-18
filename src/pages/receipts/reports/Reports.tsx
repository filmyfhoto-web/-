import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "../useStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { downloadXlsx } from "@/lib/xlsx";
import { tbl } from "../lib/tbl";

const DOC_LABEL: Record<string, string> = {
  receipt: "ใบเสร็จรับเงิน",
  delivery: "ใบส่งของ",
  invoice: "ใบแจ้งหนี้ (เลิกใช้)",
  quotation: "ใบเสนอราคา",
  tax_invoice: "ใบกำกับภาษี",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function Reports() {
  const { store } = useCurrentStore();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());

  const q = useQuery({
    queryKey: ["rds_reports", store?.id, from, to],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("documents") as any)
        .select("document_no,document_date,document_type,customer_name,subtotal,vat_amount,grand_total,net_total,status,internal_sale_type")
        .eq("store_id", store!.id)
        .is("deleted_at", null)
        .gte("document_date", from)
        .lte("document_date", to)
        .order("document_date");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const rows = q.data ?? [];
  const summary = useMemo(() => {
    const byType: Record<string, { count: number; total: number }> = {};
    const byDay: Record<string, number> = {};
    let total = 0, vat = 0;
    // Internal sale-type split (staff-only). Default any legacy/null rows to
    // "real_goods" so historical totals continue to add up.
    const byInternal = {
      bill_only: { count: 0, total: 0 },
      real_goods: { count: 0, total: 0 },
    } as Record<"bill_only" | "real_goods", { count: number; total: number }>;
    for (const r of rows) {
      const t = r.document_type;
      byType[t] ??= { count: 0, total: 0 };
      byType[t].count++;
      byType[t].total += Number(r.net_total) || 0;
      byDay[r.document_date] = (byDay[r.document_date] ?? 0) + (Number(r.net_total) || 0);
      total += Number(r.net_total) || 0;
      vat += Number(r.vat_amount) || 0;
      const ist: "bill_only" | "real_goods" =
        r.internal_sale_type === "bill_only" ? "bill_only" : "real_goods";
      byInternal[ist].count++;
      byInternal[ist].total += Number(r.net_total) || 0;
    }
    return { byType, byDay, byInternal, total, vat, count: rows.length };
  }, [rows]);

  function exportExcel() {
    const detail = rows.map((r) => ({
      เลขที่: r.document_no,
      วันที่: r.document_date,
      ประเภท: DOC_LABEL[r.document_type] ?? r.document_type,
      ลูกค้า: r.customer_name,
      ยอด: Number(r.subtotal),
      VAT: Number(r.vat_amount),
      สุทธิ: Number(r.net_total),
      สถานะ: r.status,
    }));
    const byType = Object.entries(summary.byType).map(([k, v]) => ({
      ประเภท: DOC_LABEL[k] ?? k, จำนวน: v.count, ยอดรวม: v.total,
    }));
    const byDay = Object.entries(summary.byDay).map(([k, v]) => ({ วันที่: k, ยอดรวม: v }));
    const byInternal = [
      { ประเภทภายใน: "ซื้อของจริง", จำนวน: summary.byInternal.real_goods.count, ยอดรวม: summary.byInternal.real_goods.total },
      { ประเภทภายใน: "ซื้อบิล", จำนวน: summary.byInternal.bill_only.count, ยอดรวม: summary.byInternal.bill_only.total },
    ];
    downloadXlsx(`report_${store?.slug}_${from}_${to}`, {
      สรุป: byType, ประเภทภายในร้าน: byInternal, รายวัน: byDay, รายละเอียด: detail,
    });
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <h1 className="text-2xl md:text-3xl font-bold">รายงานยอดขาย</h1>
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">จาก</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">ถึง</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button onClick={exportExcel} className="ml-auto">
          <FileSpreadsheet className="h-4 w-4 mr-1" /> ส่งออก Excel
        </Button>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">เอกสาร</p><p className="text-2xl font-bold">{summary.count}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">ยอดสุทธิ</p><p className="text-2xl font-bold">{summary.total.toLocaleString(undefined,{minimumFractionDigits:2})}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">VAT รวม</p><p className="text-2xl font-bold">{summary.vat.toLocaleString(undefined,{minimumFractionDigits:2})}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">เฉลี่ย/ฉบับ</p><p className="text-2xl font-bold">{(summary.count ? summary.total/summary.count : 0).toLocaleString(undefined,{minimumFractionDigits:2})}</p></Card>
      </div>

      <Card className="p-4">
        <h2 className="font-medium mb-2">สรุปตามประเภทเอกสาร</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">ประเภท</th><th className="py-2 text-right">จำนวน</th><th className="py-2 text-right">ยอดรวม</th></tr>
          </thead>
          <tbody>
            {Object.entries(summary.byType).map(([k,v]) => (
              <tr key={k} className="border-t border-border">
                <td className="py-2">{DOC_LABEL[k] ?? k}</td>
                <td className="py-2 text-right">{v.count}</td>
                <td className="py-2 text-right tabular-nums">{v.total.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={3} className="text-center text-muted-foreground py-6">ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="p-4" data-testid="internal-sale-summary">
        <h2 className="font-medium mb-2">สรุปตามประเภทภายในร้าน (เฉพาะหลังบ้าน)</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">ประเภทภายใน</th><th className="py-2 text-right">จำนวนเอกสาร</th><th className="py-2 text-right">ยอดรวม</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="py-2">ซื้อของจริง</td>
              <td className="py-2 text-right">{summary.byInternal.real_goods.count}</td>
              <td className="py-2 text-right tabular-nums">{summary.byInternal.real_goods.total.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
            </tr>
            <tr className="border-t border-border">
              <td className="py-2">ซื้อบิล</td>
              <td className="py-2 text-right">{summary.byInternal.bill_only.count}</td>
              <td className="py-2 text-right tabular-nums">{summary.byInternal.bill_only.total.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
            </tr>
            {!rows.length && <tr><td colSpan={3} className="text-center text-muted-foreground py-6">ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}