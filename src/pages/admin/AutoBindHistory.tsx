import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";
import { ArrowLeft, RefreshCw, Loader2, Download, CheckCircle2, XCircle, Link2, FileJson } from "lucide-react";
import { reasonLabelTh } from "@/lib/liffDiagnosis";

type Row = {
  id: string;
  event: "liff_auto_bind_ok" | "liff_auto_bind_fail" | string;
  detail: Record<string, any> | null;
  created_at: string;
};

type Filter = "all" | "ok" | "fail";
type TimeRange = "24h" | "7d" | "30d" | "all";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const PAGE_SIZE = 200;

export default function AdminAutoBindHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [range, setRange] = useState<TimeRange>("7d");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [total, setTotal] = useState<number | null>(null);

  async function load(nextLimit = limit) {
    setLoading(true);
    try {
      const { data, error, count } = await (supabase as any)
        .from("line_login_diagnostics")
        .select("id, event, detail, created_at", { count: "exact" })
        .in("event", ["liff_auto_bind_ok", "liff_auto_bind_fail"])
        .order("created_at", { ascending: false })
        .range(0, nextLimit - 1);
      if (error) throw error;
      setRows(((data as unknown) as Row[]) || []);
      setTotal(typeof count === "number" ? count : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(limit); }, [limit]);


  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cutoff = (() => {
      if (range === "all") return 0;
      const ms = range === "24h" ? 86_400_000 : range === "7d" ? 7 * 86_400_000 : 30 * 86_400_000;
      return Date.now() - ms;
    })();
    return rows.filter((r) => {
      if (filter === "ok" && r.event !== "liff_auto_bind_ok") return false;
      if (filter === "fail" && r.event !== "liff_auto_bind_fail") return false;
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      if (!needle) return true;
      const d = r.detail || {};
      const hay = [d.line_user_id, d.display_name, d.reason, d.error_message]
        .filter(Boolean)
        .map((x: any) => String(x).toLowerCase())
        .join(" ");
      return hay.includes(needle);
    });
  }, [rows, filter, q, range]);

  const counts = useMemo(() => {
    let ok = 0, fail = 0;
    for (const r of rows) {
      if (r.event === "liff_auto_bind_ok") ok++;
      else if (r.event === "liff_auto_bind_fail") fail++;
    }
    return { ok, fail, total: rows.length };
  }, [rows]);

  function exportCsv() {
    const header = ["created_at", "event", "line_user_id", "display_name", "reason_code", "reason_th", "duration_ms", "endpoint", "liff_id", "ua"];
    const lines = [header.join(",")];
    for (const r of filtered) {
      const d = r.detail || {};
      const reasonCode = d.reason || d.error_message || "";
      lines.push([
        r.created_at,
        r.event,
        d.line_user_id,
        d.display_name,
        reasonCode,
        reasonCode ? reasonLabelTh(reasonCode, d.message) : "",
        d.duration_ms,
        d.endpoint,
        d.liff_id,
        d.ua,
      ].map(csvEscape).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liff-bind-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const payload = filtered.map((r) => ({ ...r, reason_th: reasonLabelTh(r.detail?.reason, r.detail?.message) }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liff-bind-log-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <SeoHead title="ประวัติ Auto-bind LINE — แอดมิน" description="ไล่ดูผลลัพธ์การผูกบัญชี LINE อัตโนมัติของลูกค้า สำเร็จ/ล้มเหลว พร้อมสาเหตุและเวลา" path="/admin/line-auto-bind-history" />

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Link2 className="w-6 h-6 text-[#06C755]" /> ประวัติ Auto-bind LINE
          </h1>
          <p className="text-sm text-muted-foreground">
            ผลลัพธ์การผูกบัญชีอัตโนมัติของลูกค้า 100 รายการล่าสุด
            {" · "}สำเร็จ {counts.ok} · ล้มเหลว {counts.fail}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/admin/line-settings"><ArrowLeft className="w-4 h-4 mr-1" /> กลับ</Link>
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-1" /> ดาวน์โหลด CSV
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={exportJson} disabled={filtered.length === 0}>
            <FileJson className="w-4 h-4 mr-1" /> JSON
          </Button>
          <Button className="rounded-xl" onClick={() => void load(limit)} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} รีเฟรช
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        {(["all","ok","fail"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="rounded-full" onClick={() => setFilter(f)}>
            {f === "all" ? "ทั้งหมด" : f === "ok" ? "สำเร็จ" : "ล้มเหลว"}
          </Button>
        ))}
        <span className="mx-1 text-muted-foreground text-xs self-center">·</span>
        {(["24h","7d","30d","all"] as TimeRange[]).map((r) => (
          <Button key={r} size="sm" variant={range === r ? "default" : "outline"} className="rounded-full" onClick={() => setRange(r)}>
            {r === "24h" ? "24 ชม." : r === "7d" ? "7 วัน" : r === "30d" ? "30 วัน" : "ทั้งหมด"}
          </Button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา line_user_id / ชื่อ / สาเหตุ" className="rounded-xl max-w-xs" />
      </div>

      <section className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {loading ? "กำลังโหลด..." : "ยังไม่มีเหตุการณ์"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-accent text-xs">
                <tr>
                  <th className="text-left p-3 whitespace-nowrap">เวลา</th>
                  <th className="text-left p-3">สถานะ</th>
                  <th className="text-left p-3">ผู้ใช้ LINE</th>
                  <th className="text-left p-3">line_user_id</th>
                  <th className="text-left p-3">สาเหตุ / รายละเอียด</th>
                  <th className="text-left p-3">ระยะเวลา</th>
                  <th className="text-left p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const d = r.detail || {};
                  const ok = r.event === "liff_auto_bind_ok";
                  const uid = d.line_user_id ? String(d.line_user_id) : "";
                  const uidShort = uid ? `${uid.slice(0,6)}…${uid.slice(-4)}` : "—";
                  const rawReason = d.reason || d.error_message || "";
                  const reason = ok ? "—" : (rawReason ? `${reasonLabelTh(rawReason, d.message)} (${rawReason})` : "unknown");
                  const isOpen = openId === r.id;
                  return (
                    <>
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                        <td className="p-3">
                          {ok ? (
                            <Badge className="bg-success text-success-foreground flex w-fit items-center gap-1"><CheckCircle2 className="w-3 h-3" /> สำเร็จ</Badge>
                          ) : (
                            <Badge className="bg-destructive text-destructive-foreground flex w-fit items-center gap-1"><XCircle className="w-3 h-3" /> ล้มเหลว</Badge>
                          )}
                        </td>
                        <td className="p-3 text-xs">{d.display_name || "—"}</td>
                        <td className="p-3 text-xs font-mono" title={uid}>{uidShort}</td>
                        <td className="p-3 text-xs max-w-md break-words">{String(reason)}</td>
                        <td className="p-3 text-xs whitespace-nowrap">{d.duration_ms != null ? `${d.duration_ms} ms` : "—"}</td>
                        <td className="p-3">
                          <Button size="sm" variant="ghost" className="rounded-lg text-xs" onClick={() => setOpenId(isOpen ? null : r.id)}>
                            {isOpen ? "ซ่อน" : "ดู payload"}
                          </Button>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr key={`${r.id}-d`} className="border-t border-border bg-muted/30">
                          <td colSpan={7} className="p-3">
                            <pre className="text-[11px] whitespace-pre-wrap break-words">{JSON.stringify(r.detail, null, 2)}</pre>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
          <span className="text-xs text-muted-foreground" data-testid="autobind-count">
            แสดง {rows.length.toLocaleString("th-TH")} จาก {(total ?? rows.length).toLocaleString("th-TH")} เหตุการณ์
          </span>
          {total != null && rows.length < total && (
            <Button size="sm" variant="outline" className="rounded-xl" data-testid="autobind-load-more"
              disabled={loading} onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              โหลดเพิ่ม
            </Button>
          )}
        </div>

      </section>
    </AdminLayout>
  );
}