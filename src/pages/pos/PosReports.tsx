import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, TrendingUp, Receipt, Package, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toCsv } from "@/lib/csv";
import { toast } from "sonner";

function rangeStart(k: string): Date {
  const d = new Date();
  d.setHours(0,0,0,0);
  if (k === "today") return d;
  if (k === "7d") { d.setDate(d.getDate()-6); return d; }
  if (k === "30d") { d.setDate(d.getDate()-29); return d; }
  if (k === "month") { d.setDate(1); return d; }
  d.setDate(d.getDate()-6); return d;
}

type Receipt = { id: string; created_at: string; total: number; cancelled_at: string | null };
type Item = { name: string; qty: number; line_total: number; product_id: string | null };
type LowStock = { id: string; name: string; code: string | null; stock: number; low_stock_threshold: number | null; unit: string | null };

function download(name: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function PosReports() {
  const [range, setRange] = useState("7d");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [low, setLow] = useState<LowStock[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const start = rangeStart(range).toISOString();
    const [rec, its, ls] = await Promise.all([
      supabase.from("pos_receipts").select("id, created_at, total, cancelled_at").gte("created_at", start).limit(1000),
      supabase.from("pos_receipt_items").select("name, qty, line_total, product_id, receipt_id, pos_receipts!inner(created_at, cancelled_at)").gte("pos_receipts.created_at", start).limit(5000),
      supabase.from("products").select("id, name, code, stock, low_stock_threshold, unit").is("deleted_at", null).eq("active", true).order("stock").limit(200),
    ]);
    setReceipts((rec.data ?? []) as any as Receipt[]);
    setItems(((its.data ?? []) as any[]).filter((i) => !i.pos_receipts?.cancelled_at).map((i) => ({ name: i.name, qty: Number(i.qty), line_total: Number(i.line_total), product_id: i.product_id })));
    setLow(((ls.data ?? []) as any as LowStock[]).filter((p) => p.low_stock_threshold != null && Number(p.stock) <= Number(p.low_stock_threshold)));
    setLoading(false);
  }
  useEffect(() => { load(); }, [range]);

  const active = receipts.filter((r) => !r.cancelled_at);
  const totalSales = active.reduce((s, r) => s + Number(r.total || 0), 0);
  const billCount = active.length;
  const avgBill = billCount ? totalSales / billCount : 0;
  const totalUnits = items.reduce((s, i) => s + i.qty, 0);

  const daily = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of active) {
      const d = new Date(r.created_at); d.setHours(0,0,0,0);
      const k = d.toISOString().slice(0,10);
      map.set(k, (map.get(k) || 0) + Number(r.total || 0));
    }
    return Array.from(map.entries()).sort().map(([date, total]) => ({ date: date.slice(5), total: Math.round(total) }));
  }, [active]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; total: number }>();
    for (const i of items) {
      const key = i.product_id || i.name;
      const cur = map.get(key) || { name: i.name, qty: 0, total: 0 };
      cur.qty += i.qty; cur.total += i.line_total;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [items]);

  function exportCsv() {
    const rows = topProducts.map((t) => ({ ชื่อ: t.name, จำนวน: t.qty, ยอด: t.total.toFixed(2) }));
    if (!rows.length) { toast.error("ไม่มีข้อมูล"); return; }
    download(`pos-top-products-${range}-${new Date().toISOString().slice(0,10)}.csv`, toCsv(rows));
    toast.success("ดาวน์โหลด CSV แล้ว");
  }

  return (
    <div className="p-3 md:p-5 max-w-[1400px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> รายงาน</h2>
        <div className="flex gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">วันนี้</SelectItem>
              <SelectItem value="7d">7 วันล่าสุด</SelectItem>
              <SelectItem value="30d">30 วันล่าสุด</SelectItem>
              <SelectItem value="month">เดือนนี้</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-emerald-50">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> ยอดขายรวม</div>
          <div className="text-2xl font-bold tabular-nums">฿{totalSales.toLocaleString()}</div>
        </Card>
        <Card className="p-4 bg-sky-50">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3" /> จำนวนบิล</div>
          <div className="text-2xl font-bold tabular-nums">{billCount.toLocaleString()}</div>
        </Card>
        <Card className="p-4 bg-accent">
          <div className="text-xs text-muted-foreground">ยอดเฉลี่ย/บิล</div>
          <div className="text-2xl font-bold tabular-nums">฿{avgBill.toFixed(0)}</div>
        </Card>
        <Card className="p-4 bg-amber-50">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" /> สินค้าที่ขาย (หน่วย)</div>
          <div className="text-2xl font-bold tabular-nums">{totalUnits.toLocaleString()}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">ยอดขายรายวัน</div>
        <div style={{ width: "100%", height: 260 }}>
          {daily.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">{loading ? "กำลังโหลด..." : "ไม่มีข้อมูล"}</div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: any) => `฿${Number(v).toLocaleString()}`} />
                <Line type="monotone" dataKey="total" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="text-sm font-semibold mb-2">สินค้าขายดี (Top 20)</div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40"><tr>
                <th className="text-left px-2 py-1">สินค้า</th>
                <th className="text-right px-2 py-1 w-20">จำนวน</th>
                <th className="text-right px-2 py-1 w-24">ยอด</th>
              </tr></thead>
              <tbody>
                {topProducts.length === 0 ? (
                  <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">ไม่มีข้อมูล</td></tr>
                ) : topProducts.map((t, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1">{t.name}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{t.qty}</td>
                    <td className="px-2 py-1 text-right tabular-nums">฿{t.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-3">
          <div className="text-sm font-semibold mb-2 flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-amber-500" /> สินค้าใกล้หมด</div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40"><tr>
                <th className="text-left px-2 py-1">สินค้า</th>
                <th className="text-right px-2 py-1 w-20">คงเหลือ</th>
                <th className="text-right px-2 py-1 w-20">ต่ำสุด</th>
              </tr></thead>
              <tbody>
                {low.length === 0 ? (
                  <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">ไม่มีสินค้าใกล้หมด</td></tr>
                ) : low.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-2 py-1">{p.name}{p.code ? <span className="text-xs text-muted-foreground ml-1">{p.code}</span> : null}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-rose-600 font-medium">{Number(p.stock)} {p.unit || ""}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{Number(p.low_stock_threshold || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}