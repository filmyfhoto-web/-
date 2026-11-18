import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Archive, Search } from "lucide-react";
import { toast } from "sonner";
import SupplierEditorDialog, { type SupplierRow } from "./SupplierEditorDialog";

export default function PosSuppliers() {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [current, setCurrent] = useState<Partial<SupplierRow> | null>(null);

  async function load() {
    let query = supabase.from("suppliers" as any).select("*").order("name");
    if (!showArchived) query = query.is("archived_at", null);
    const { data } = await query;
    setRows(((data ?? []) as unknown) as SupplierRow[]);
  }
  useEffect(() => { load(); }, [showArchived]);

  async function archive(id: string) {
    if (!confirm("ปิดใช้งานผู้ขายรายนี้?")) return;
    const { error } = await (supabase as any).rpc("pos_supplier_archive", { p_id: id });
    if (error) toast.error(error.message?.includes("supplier_in_use") ? "ผู้ขายถูกใช้ในใบสั่งซื้อแล้ว" : (error.message || "ผิดพลาด"));
    else { toast.success("ปิดใช้งานแล้ว"); load(); }
  }

  const filtered = rows.filter((s) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (s.name || "").toLowerCase().includes(t)
      || (s.code || "").toLowerCase().includes(t)
      || (s.phone || "").toLowerCase().includes(t);
  });

  return (
    <div className="p-3 md:p-5 max-w-[1200px] mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">ผู้ขาย / ผู้ผลิต</h2>
        <Button onClick={() => { setCurrent(null); setEditorOpen(true); }} className="rounded-full" data-testid="pos-supplier-add">
          <Plus className="h-4 w-4 mr-1" /> เพิ่มผู้ขาย
        </Button>
      </div>
      <Card className="p-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="ค้นหาชื่อ / รหัส / โทร" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "ซ่อนที่ปิดใช้งาน" : "แสดงที่ปิดใช้งาน"}
        </Button>
      </Card>
      <div className="border rounded-md overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2">รหัส</th>
              <th className="text-left px-3 py-2">ชื่อ</th>
              <th className="text-left px-3 py-2">สาขา</th>
              <th className="text-left px-3 py-2">โทร</th>
              <th className="text-left px-3 py-2">อีเมล</th>
              <th className="text-center px-3 py-2">สถานะ</th>
              <th className="text-right px-3 py-2">การกระทำ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">ไม่มีผู้ขาย</td></tr>
            ) : filtered.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{s.code || "-"}</td>
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 text-xs">{s.branch || "-"}</td>
                <td className="px-3 py-2 text-xs">{s.phone || "-"}</td>
                <td className="px-3 py-2 text-xs">{s.email || "-"}</td>
                <td className="px-3 py-2 text-center">
                  {s.is_active ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">ใช้งาน</Badge>
                    : <Badge variant="secondary" className="bg-slate-200 text-slate-700">ปิดใช้งาน</Badge>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setCurrent(s); setEditorOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {s.is_active && (
                    <Button size="sm" variant="ghost" onClick={() => archive(s.id)}>
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SupplierEditorDialog open={editorOpen} onOpenChange={setEditorOpen} initial={current} onSaved={() => load()} />
    </div>
  );
}
