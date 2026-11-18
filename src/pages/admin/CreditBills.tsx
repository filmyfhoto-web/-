import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NotebookPen, Download, Loader2, RefreshCw } from "lucide-react";
import { toCsv } from "@/lib/csv";
import { toast } from "sonner";
import { parsePosNotes, orgLabel } from "@/lib/posNotes";

type Row = {
  id: string;
  receipt_number: string;
  created_at: string;
  customer_name: string | null;
  total: number;
  notes: string | null;
  branch: string | null;
  cancelled_at: string | null;
};

const RANGES = [
  { key: "30d", label: "30 วันล่าสุด", days: 30 },
  { key: "90d", label: "90 วันล่าสุด", days: 90 },
  { key: "year", label: "1 ปีล่าสุด", days: 365 },
  { key: "all", label: "ทั้งหมด", days: 0 },
];

function startOf(key: string): string | null {
  const r = RANGES.find((x) => x.key === key);
  if (!r || !r.days) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (r.days - 1));
  return d.toISOString();
}

const fmt = (n: number) => new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

function download(name: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * รายงานบิล "ลงบัญชี" (เครดิต) สำหรับแอดมิน — สรุปจำนวนบิลและยอดค้าง
 * แยกตามโรงเรียน/หน่วยงาน และแยกตามคุณครูภายในแต่ละหน่วยงาน
 * (หน่วยงานอ่านจากหมายเหตุที่ POS บันทึกไว้ตอนขาย)
 */
export default function AdminCreditBills() {
  const [range, setRange] = useState("30d");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    let query = (supabase as any)
      .from("pos_receipts")
      .select("id, receipt_number, created_at, customer_name, total, notes, branch, cancelled_at")
      .eq("payment_status", "credit")
      .is("cancelled_at", null)
      .order("created_at", { ascending: false })
      .limit(3000);
    const start = startOf(range);
    if (start) query = query.gte("created_at", start);
    const { data, error: err } = await query;
    if (err) setError(err.message || "โหลดข้อมูลไม่สำเร็จ");
    setRows(((data as Row[]) ?? []));
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  const enriched = useMemo(
    () => rows.map((r) => {
      const p = parsePosNotes(r.notes);
      return {
        ...r,
        org: orgLabel(p.org),
        note: p.note || "",
        teacher: (r.customer_name || "").trim() || "ไม่ระบุชื่อ",
        total: Number(r.total || 0),
      };
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return enriched;
    return enriched.filter(
      (r) =>
        r.org.toLowerCase().includes(needle) ||
        r.teacher.toLowerCase().includes(needle) ||
        (r.receipt_number || "").toLowerCase().includes(needle),
    );
  }, [enriched, q]);

  const byOrg = useMemo(() => {
    const map = new Map<string, { org: string; bills: number; total: number; teachers: Map<string, { bills: number; total: number }> }>();
    for (const r of filtered) {
      const cur = map.get(r.org) || { org: r.org, bills: 0, total: 0, teachers: new Map() };
      cur.bills += 1;
      cur.total += r.total;
      const t = cur.teachers.get(r.teacher) || { bills: 0, total: 0 };
      t.bills += 1;
      t.total += r.total;
      cur.teachers.set(r.teacher, t);
      map.set(r.org, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const totalAmount = filtered.reduce((s, r) => s + r.total, 0);

  function exportCsv() {
    if (!filtered.length) { toast.error("ไม่มีข้อมูล"); return; }
    const csv = toCsv(
      filtered.map((r) => ({
        เลขที่บิล: r.receipt_number,
        วันที่: new Date(r.created_at).toLocaleString("th-TH"),
        "โรงเรียน/หน่วยงาน": r.org,
        คุณครู: r.teacher,
        สาขา: r.branch || "",
        ยอด: r.total.toFixed(2),
        หมายเหตุ: r.note,
      })),
    );
    download(`credit-bills-${range}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success("ดาวน์โหลด CSV แล้ว");
  }

  return (
    <AdminLayout>
      <SeoHead title="รายงานบิลลงบัญชี" description="สรุปบิลลงบัญชีแยกตามโรงเรียน/หน่วยงานและคุณครู" path="/admin/credit-bills" />
      <div className="space-y-4" data-testid="admin-credit-bills">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <NotebookPen className="h-6 w-6 text-orange-600" aria-hidden /> บิลลงบัญชี
            </h1>
            <p className="text-sm text-muted-foreground">สรุปยอดค้างชำระแยกตามโรงเรียน/หน่วยงาน และคุณครู</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load()} disabled={loading} data-testid="credit-refresh">
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
            </Button>
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          </div>
        </header>

        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาโรงเรียน / คุณครู / เลขที่บิล…" className="max-w-md" data-testid="credit-search" />

        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">จำนวนบิลลงบัญชี</div>
            <div className="text-2xl font-bold tabular-nums" data-testid="credit-bill-count">{filtered.length.toLocaleString()}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">ยอดค้างรวม</div>
            <div className="text-2xl font-bold tabular-nums text-orange-700" data-testid="credit-total">฿{fmt(totalAmount)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">โรงเรียน/หน่วยงาน</div>
            <div className="text-2xl font-bold tabular-nums">{byOrg.length.toLocaleString()}</div>
          </Card>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด…
          </div>
        ) : byOrg.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground" data-testid="credit-empty">ยังไม่มีบิลลงบัญชีในช่วงเวลานี้</Card>
        ) : (
          <div className="space-y-3">
            {byOrg.map((o) => (
              <Card key={o.org} className="p-3" data-testid="credit-org-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div className="font-semibold">{o.org}</div>
                  <div className="text-sm">
                    <span className="text-muted-foreground mr-3">{o.bills} บิล</span>
                    <span className="font-bold tabular-nums text-orange-700">฿{fmt(o.total)}</span>
                  </div>
                </div>
                <table className="w-full text-sm mt-2">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-1">คุณครู</th>
                      <th className="text-right px-2 py-1 w-24">จำนวนบิล</th>
                      <th className="text-right px-2 py-1 w-32">ยอดค้าง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(o.teachers.entries())
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([name, t]) => (
                        <tr key={name} className="border-t" data-testid="credit-teacher-row">
                          <td className="px-2 py-1">{name}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{t.bills}</td>
                          <td className="px-2 py-1 text-right tabular-nums">฿{fmt(t.total)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
