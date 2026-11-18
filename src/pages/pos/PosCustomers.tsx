import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import TableToolbar from "@/components/table/TableToolbar";
import { useTablePaging } from "@/hooks/useTablePaging";
import BulkActionBar from "@/components/table/BulkActionBar";
import ColumnPicker from "@/components/table/ColumnPicker";
import { useColumnPrefs, type ColumnDef } from "@/hooks/useColumnPrefs";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import { toast } from "sonner";

/**
 * POS Customers — reads the unified read-only view `v_unified_customers`
 * that merges profiles + guest_customers + film_customers + rds_customers.
 * A single search box covers every store's customer base — adding a new
 * customer in any store shows up here automatically because the view is
 * a live UNION.
 */
type Row = {
  source_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string;
  line_display_name: string | null;
  created_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  profile: "บัญชี LINE",
  guest: "Guest",
  film: "Film Shop",
  rds: "Receipt/Delivery",
};
const SOURCE_COLOR: Record<string, string> = {
  profile: "bg-emerald-100 text-emerald-700 border-emerald-300",
  guest: "bg-sky-100 text-sky-700 border-sky-300",
  film: "bg-accent text-primary border-primary/30",
  rds: "bg-amber-100 text-amber-700 border-amber-300",
};

const COLUMNS: ColumnDef[] = [
  { id: "name", label: "ชื่อ", locked: true },
  { id: "phone", label: "เบอร์" },
  { id: "email", label: "อีเมล" },
  { id: "source", label: "แหล่งข้อมูล" },
];

export default function PosCustomers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = "POS · ลูกค้า"; }, []);
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("v_unified_customers" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      setRows((data as any[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    let list = rows;
    if (source !== "all") list = list.filter((r) => r.source === source);
    if (needle) {
      list = list.filter(
        (r) => (r.name || "").toLowerCase().includes(needle) || (r.phone || "").includes(needle),
      );
    }
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => (a.name || "").localeCompare(b.name || "", "th"));
    else if (sort === "oldest") sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sorted;
  }, [rows, needle, source, sort]);

  const paging = useTablePaging(filtered, { pageSize: 50 });
  const cols = useColumnPrefs("pos-customers", COLUMNS);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rowKey = (r: Row) => r.source + ":" + r.source_id;
  const visibleKeys = paging.visible.map(rowKey);
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const toggleRow = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => (visibleKeys.every((k) => prev.has(k)) ? new Set() : new Set(visibleKeys)));

  const exportSelected = () => {
    const picked = filtered.filter((r) => selected.has(rowKey(r)));
    const head = cols.visibleColumns.map((c) => c.label).join(",");
    const body = picked
      .map((r) =>
        cols.visibleColumns
          .map((c) => `"${String((r as any)[c.id] ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "customers.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`ส่งออก ${picked.length} รายการแล้ว`);
  };

  const cell = (r: Row, id: string) => {
    if (id === "name")
      return (
        <>
          {r.name || "-"}
          {r.line_display_name && r.line_display_name !== r.name && (
            <div className="text-[10px] text-muted-foreground">LINE: {r.line_display_name}</div>
          )}
        </>
      );
    if (id === "phone") return r.phone || "-";
    if (id === "email") return r.email || "-";
    return (
      <Badge variant="outline" className={SOURCE_COLOR[r.source] ?? ""}>
        {SOURCE_LABEL[r.source] ?? r.source}
      </Badge>
    );
  };

  return (
    <div className="p-3 md:p-5 max-w-[1600px] mx-auto">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
        <Users className="h-5 w-5 text-primary" /> ลูกค้า
      </h2>
      <Card className="p-3">
        <TableToolbar
          className="mb-3"
          search={q}
          onSearchChange={setQ}
          placeholder="ค้นหาชื่อหรือเบอร์…"
          resultCount={filtered.length}
          filters={[
            {
              id: "source",
              label: "แหล่งข้อมูล",
              value: source,
              onChange: setSource,
              options: [
                { value: "all", label: "ทุกแหล่งข้อมูล" },
                { value: "profile", label: "บัญชี LINE" },
                { value: "guest", label: "Guest" },
                { value: "film", label: "Film Shop" },
                { value: "rds", label: "Receipt/Delivery" },
              ],
            },
          ]}
          sort={{
            value: sort,
            onChange: setSort,
            options: [
              { value: "recent", label: "ใหม่สุดก่อน" },
              { value: "oldest", label: "เก่าสุดก่อน" },
              { value: "name", label: "ชื่อ ก-ฮ" },
            ],
          }}
          actions={
            <ColumnPicker
              columns={cols.columns}
              isVisible={cols.isVisible}
              onToggle={cols.toggle}
              onMove={cols.move}
              onReset={cols.reset}
              hiddenCount={cols.hiddenCount}
            />
          }
        />
        <div className="text-xs text-muted-foreground mb-2">
          รวมลูกค้าจากทุกร้าน (LINE, Guest, Film Shop, Receipt/Delivery) — เพิ่มจากหน้าไหนก็ค้นเจอที่นี่
        </div>
        <BulkActionBar
          count={selected.size}
          total={filtered.length}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onClear={() => setSelected(new Set())}
          selectedIds={Array.from(selected)}
          actions={[{ label: "ส่งออก CSV", icon: Download, onRun: exportSelected }]}
        />
        <div className="overflow-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="px-3 py-2 w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="เลือกทั้งหมด" />
                </th>
                {cols.visibleColumns.map((c) => (
                  <th key={c.id} className="text-left px-3 py-2">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={cols.visibleColumns.length + 1} className="py-10 text-center text-muted-foreground">กำลังโหลด…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={cols.visibleColumns.length + 1} className="py-10 text-center text-muted-foreground">ไม่พบลูกค้า</td></tr>
              ) : paging.visible.map((r) => (
                <tr key={rowKey(r)} className="border-t">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(rowKey(r))}
                      onCheckedChange={() => toggleRow(rowKey(r))}
                      aria-label={`เลือก ${r.name || r.source_id}`}
                    />
                  </td>
                  {cols.visibleColumns.map((c) => (
                    <td key={c.id} className="px-3 py-2 text-xs">{cell(r, c.id)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paging.hasMore && (
          <div ref={paging.setSentinel} className="py-4 text-center text-xs text-muted-foreground">
            กำลังโหลดเพิ่ม… ({paging.visible.length}/{paging.total})
          </div>
        )}
      </Card>
    </div>
  );
}