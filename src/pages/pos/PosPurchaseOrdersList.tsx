import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Plus, Search, Truck, Printer, FileText, MoreVertical, Pencil, History } from "lucide-react";
import { PO_STATUS_LABEL_TH, PO_STATUS_TINT } from "@/lib/purchaseOrder";

type PO = {
  id: string; po_no: string; status: string; supplier_name: string | null;
  total: number; grand_total: number | null; created_at: string; updated_at: string;
  created_by: string | null;
};

export default function PosPurchaseOrdersList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<PO[]>([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  async function load() {
    const { data } = await supabase.from("purchase_orders")
      .select("id, po_no, status, supplier_name, total, grand_total, created_at, updated_at, created_by")
      .order("created_at", { ascending: false }).limit(300);
    setRows((data ?? []) as any as PO[]);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (!q) return true;
    const t = q.toLowerCase();
    return (r.po_no || "").toLowerCase().includes(t) || (r.supplier_name || "").toLowerCase().includes(t);
  }), [rows, q, status]);

  return (
    <div className="p-3 md:p-5 max-w-[1400px] mx-auto space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" /> ใบสั่งซื้อ (PO)
        </h2>
        <Button onClick={() => nav("/pos/purchase-orders/new")} className="rounded-full bg-blue-600 hover:bg-blue-700 text-white" data-testid="pos-po-new">
          <Plus className="h-4 w-4 mr-1" /> สร้างใบสั่งซื้อ
        </Button>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-56">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="ค้นหาเลขที่ / ผู้ขาย" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            {Object.entries(PO_STATUS_LABEL_TH).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <div className="border rounded-md overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2">เลขที่</th>
              <th className="text-left px-3 py-2">สถานะ</th>
              <th className="text-left px-3 py-2">ผู้ขาย</th>
              <th className="text-right px-3 py-2">ยอดรวม</th>
              <th className="text-left px-3 py-2">อัปเดต</th>
              <th className="text-right px-3 py-2">การกระทำ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">ไม่มีใบสั่งซื้อ</td></tr>
            ) : filtered.map((p) => (
              <tr key={p.id} className="border-t hover:bg-accent/30">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link to={`/pos/purchase-orders/${p.id}`} className="text-primary hover:underline">{p.po_no}</Link>
                </td>
                <td className="px-3 py-2">
                  <Badge className={PO_STATUS_TINT[p.status] || ""}>{PO_STATUS_LABEL_TH[p.status] || p.status}</Badge>
                </td>
                <td className="px-3 py-2">{p.supplier_name || "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">฿{Number(p.grand_total ?? p.total ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-xs">{new Date(p.updated_at).toLocaleString("th-TH")}</td>
                <td className="px-3 py-2 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" data-testid={`po-row-menu-${p.po_no}`}><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => nav(`/pos/purchase-orders/${p.id}`)}>
                        <FileText className="h-4 w-4 mr-2" /> รายการสินค้า
                      </DropdownMenuItem>
                      {(p.status === "draft" || p.status === "pending_approval") && (
                        <DropdownMenuItem onClick={() => nav(`/pos/purchase-orders/${p.id}/edit`)}>
                          <Pencil className="h-4 w-4 mr-2" /> แก้ไข
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => window.open(`/pos/purchase-orders/${p.id}/print`, "_blank")}>
                        <Printer className="h-4 w-4 mr-2" /> พิมพ์
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => nav(`/pos/purchase-orders/${p.id}#history`)}>
                        <History className="h-4 w-4 mr-2" /> ประวัติสถานะ
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
