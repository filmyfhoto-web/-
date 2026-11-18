import AdminLayout from "@/components/layout/AdminLayout";
import PosMovements from "@/pages/pos/PosMovements";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeRefresh } from "@/hooks/useRealtimeTable";

/**
 * Admin stock history — two tabs:
 *  1) "แยกสายงาน (POS/PO)" — categorized view reusing PosMovements.
 *  2) "ทั้งหมด (ทุกรายการ)" — unfiltered stock_movements incl. manual
 *     adjustments, wastage/return/transfer, and rows whose product was
 *     deleted. Guards against the regression where admins couldn't see
 *     non‑POS/PO movements.
 */
export default function AdminStock() {
  return (
    <AdminLayout>
      <Tabs defaultValue="categorized" className="w-full">
        <div className="max-w-full overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="categorized">แยกสายงาน (POS/PO)</TabsTrigger>
            <TabsTrigger value="all">ทั้งหมด (ทุกรายการ)</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="categorized" className="mt-4">
          <PosMovements />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <AllMovements />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}

type Row = {
  id: string;
  created_at: string;
  product_id: string;
  move_type: "in" | "out" | "adjust";
  qty: number;
  reason: string | null;
  ref_type: string | null;
  reference: string | null;
  note: string | null;
  before_qty: number | null;
  after_qty: number | null;
  products: { name: string | null; code?: string | null; unit: string | null } | null;
};

function AllMovements() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "in" | "out" | "adjust">("all");

  async function load() {
    setLoading(true);
    // Left join products so rows for deleted products still surface.
    const { data } = await supabase
      .from("stock_movements")
      .select("id, created_at, product_id, move_type, qty, reason, ref_type, reference, note, before_qty, after_qty, products(name, code, unit)")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtimeRefresh(["stock_movements"], () => load());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== "all" && r.move_type !== type) return false;
      if (!needle) return true;
      const hay = [
        r.products?.name, r.products?.code, r.reason, r.ref_type, r.reference, r.note, r.product_id,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, type]);

  return (
    <Card className="rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="ค้นหาชื่อสินค้า / รหัส / เหตุผล / อ้างอิง"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1">
          {(["all", "in", "out", "adjust"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1 rounded-lg text-xs border ${type === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}
            >
              {t === "all" ? "ทั้งหมด" : t === "in" ? "เข้า" : t === "out" ? "ออก" : "ปรับ"}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} รายการ</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="text-left py-2 px-2">เวลา</th>
              <th className="text-left py-2 px-2">สินค้า</th>
              <th className="text-left py-2 px-2">ประเภท</th>
              <th className="text-right py-2 px-2">จำนวน</th>
              <th className="text-left py-2 px-2">เหตุผล / อ้างอิง</th>
              <th className="text-right py-2 px-2">คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={6} className="py-6 text-center text-muted-foreground">กำลังโหลด…</td></tr>)}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">ไม่มีรายการ</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-accent/30">
                <td className="py-2 px-2 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString("th-TH")}</td>
                <td className="py-2 px-2">
                  <div className="font-medium">{r.products?.name || <span className="italic text-muted-foreground">สินค้าถูกลบ</span>}</div>
                  <div className="text-xs text-muted-foreground">{r.products?.code || r.product_id}</div>
                </td>
                <td className="py-2 px-2">
                  <Badge className={r.move_type === "in" ? "bg-emerald-100 text-emerald-800" : r.move_type === "out" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}>
                    {r.move_type === "in" ? "เข้า" : r.move_type === "out" ? "ออก" : "ปรับ"}
                  </Badge>
                </td>
                <td className="py-2 px-2 text-right font-semibold">
                  {r.move_type === "out" ? "-" : r.move_type === "in" ? "+" : ""}{Number(r.qty)}
                </td>
                <td className="py-2 px-2 text-xs">
                  <div>{r.reason || "-"}{r.ref_type ? ` · ${r.ref_type}` : ""}</div>
                  {(r.reference || r.note) && (
                    <div className="text-muted-foreground">{r.reference || ""}{r.note ? ` · ${r.note}` : ""}</div>
                  )}
                </td>
                <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                  {r.before_qty ?? "-"} → {r.after_qty ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}