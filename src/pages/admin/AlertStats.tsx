import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BarChart3, Bell, Download, FilePlus2, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/xlsx";
import {
  buildDailyStats,
  fetchActivityStatsData,
  sumStats,
  DOWNLOAD_ACTIONS,
  DOWNLOAD_KIND_LABEL_TH,
  type DailyActivityStat,
} from "@/lib/orderActivityStats";

const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const COLUMNS = [
  "วันที่",
  "ออเดอร์ใหม่",
  "รับทราบ",
  "ส่ง LINE ซ้ำ",
  "อัตโนมัติ",
  "ดาวน์โหลด",
  "CSV",
  "Excel (XLSX)",
  "ใบสั่งงาน (PDF)",
  "สร้างเอกสาร",
  "เปลี่ยนสถานะ",
];

function toRow(r: DailyActivityStat) {
  return {
    "วันที่": r.day,
    "ออเดอร์ใหม่": r.newOrders,
    "รับทราบ": r.acks,
    "ส่ง LINE ซ้ำ": r.resends,
    "อัตโนมัติ": r.autoResends,
    "ดาวน์โหลด": r.downloads,
    "CSV": r.downloadsByKind.order_export_csv ?? 0,
    "Excel (XLSX)": r.downloadsByKind.order_export_xlsx ?? 0,
    "ใบสั่งงาน (PDF)": r.downloadsByKind.order_pdf_download ?? 0,
    "สร้างเอกสาร": r.documentsCreated,
    "เปลี่ยนสถานะ": r.statusChanges,
  };
}

export default function AlertStats() {
  const today = iso(new Date());
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const [from, setFrom] = useState(iso(start));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<DailyActivityStat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { logs, orders, error } = await fetchActivityStatsData(from, to);
    if (error) toast.error(error);
    setRows(buildDailyStats(logs, orders));
    setLoading(false);
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => sumStats(rows), [rows]);

  function preset(days: number) {
    const f = new Date();
    f.setDate(f.getDate() - (days - 1));
    setFrom(iso(f));
    setTo(iso(new Date()));
  }

  function exportFile(format: "csv" | "xlsx") {
    const data = [...rows.map(toRow), { ...toRow(total), "วันที่": "รวมทั้งหมด" }];
    const filename = `admin-alert-stats-${from}_${to}`;
    const branding = { storeName: "ร้านนัฐภรณ์ เชียงกลาง", subtitle: "สรุปกิจกรรมการแจ้งเตือนของแอดมิน" };
    if (format === "csv") downloadCsv(filename, data, COLUMNS, undefined, branding);
    else downloadXlsx(filename, { stats: data }, undefined, branding);
    toast.success("ส่งออกแล้ว");
  }

  const cards = [
    { label: "ออเดอร์ใหม่", value: total.newOrders, icon: Bell },
    { label: "รับทราบ", value: total.acks, icon: BarChart3 },
    { label: "ส่ง LINE ซ้ำ", value: total.resends, icon: Send, sub: `อัตโนมัติ ${total.autoResends}` },
    { label: "ดาวน์โหลดเอกสาร", value: total.downloads, icon: Download },
    { label: "สร้างเอกสาร", value: total.documentsCreated, icon: FilePlus2 },
  ];

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> สถิติกิจกรรมการแจ้งเตือน
          </h1>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportFile("csv")} data-testid="stats-export-csv">
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportFile("xlsx")} data-testid="stats-export-xlsx">
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/admin/work-docs?filter=order">กลับหน้างานและเอกสาร</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">ช่วงวันที่</span>
          <Input type="date" className="w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="stats-from" />
          <span className="text-muted-foreground">–</span>
          <Input type="date" className="w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} data-testid="stats-to" />
          <Button size="sm" variant="outline" onClick={() => preset(1)}>วันนี้</Button>
          <Button size="sm" variant="outline" onClick={() => preset(7)}>7 วัน</Button>
          <Button size="sm" variant="outline" onClick={() => preset(30)}>30 วัน</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="stats-cards">
          {cards.map((c) => (
            <Card key={c.label} className="rounded-2xl">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <c.icon className="w-3.5 h-3.5" /> {c.label}
                </div>
                <div className="text-2xl font-bold">{c.value.toLocaleString("th-TH")}</div>
                {c.sub && <div className="text-xs text-muted-foreground">{c.sub}</div>}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {DOWNLOAD_ACTIONS.map((a) => (
            <span key={a} className="rounded-full border border-border px-2.5 py-1">
              {DOWNLOAD_KIND_LABEL_TH[a]}: {(total.downloadsByKind[a] ?? 0).toLocaleString("th-TH")}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงเวลานี้</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm" data-testid="stats-table">
              <thead className="bg-muted/50">
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c} className="px-3 py-2 text-left whitespace-nowrap font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.day} className="border-t border-border">
                    {COLUMNS.map((c) => (
                      <td key={c} className="px-3 py-2 whitespace-nowrap">{(toRow(r) as any)[c]}</td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  {COLUMNS.map((c) => (
                    <td key={c} className="px-3 py-2 whitespace-nowrap">
                      {c === "วันที่" ? "รวมทั้งหมด" : (toRow(total) as any)[c]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}