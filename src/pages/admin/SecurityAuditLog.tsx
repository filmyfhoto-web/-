import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShieldAlert, Download, RefreshCw } from "lucide-react";
import { downloadCsv } from "@/lib/csv";

type Row = {
  id: string;
  event_type: string;
  severity: string;
  actor_user_id: string | null;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

const SEV_COLOR: Record<string, string> = {
  info: "bg-sky-100 text-sky-700 border-sky-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  error: "bg-rose-100 text-rose-700 border-rose-200",
  critical: "bg-red-200 text-red-800 border-red-300",
};

export default function AdminSecurityAuditLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("security_audit_log" as any)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    const list = ((data as unknown) as Row[]) ?? [];
    setRows(list);
    const ids = Array.from(new Set(list.map(r => r.actor_user_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, any> = {};
      (ps ?? []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email }; });
      setProfiles(map);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [rangeDays]);

  const eventTypes = useMemo(() => Array.from(new Set(rows.map(r => r.event_type))).sort(), [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (severity !== "all" && r.severity !== severity) return false;
      if (eventType !== "all" && r.event_type !== eventType) return false;
      if (fromDate && r.created_at < fromDate) return false;
      if (toDate && r.created_at > toDate + "T23:59:59") return false;
      if (!q) return true;
      const t = q.toLowerCase();
      const p = r.actor_user_id ? profiles[r.actor_user_id] : null;
      return (
        r.event_type.toLowerCase().includes(t) ||
        (r.target_id || "").toLowerCase().includes(t) ||
        (r.ip || "").includes(t) ||
        (p?.full_name || "").toLowerCase().includes(t) ||
        (p?.email || "").toLowerCase().includes(t) ||
        JSON.stringify(r.detail || {}).toLowerCase().includes(t)
      );
    });
  }, [rows, profiles, q, severity, eventType, fromDate, toDate]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return {
      total: rows.length,
      today: rows.filter(r => new Date(r.created_at) >= today).length,
      warnings: rows.filter(r => r.severity === "warning" || r.severity === "error" || r.severity === "critical").length,
      linePush: rows.filter(r => r.event_type.startsWith("line_push")).length,
    };
  }, [rows]);

  function exportCsv() {
    if (!filtered.length) return;
    downloadCsv(
      `security_audit_${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map(r => {
        const p = r.actor_user_id ? profiles[r.actor_user_id] : null;
        return {
          เวลา: new Date(r.created_at).toLocaleString("th-TH"),
          เหตุการณ์: r.event_type,
          ระดับ: r.severity,
          ผู้กระทำ: p?.full_name || p?.email || r.actor_user_id || "",
          เป้าหมาย: `${r.target_type || ""}:${r.target_id || ""}`,
          IP: r.ip || "",
          รายละเอียด: JSON.stringify(r.detail || {}),
        };
      })
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-primary" /> Audit Log ความปลอดภัย
          </h1>
          <p className="text-sm text-muted-foreground">บันทึกการพยายามส่ง LINE, การเปลี่ยนสิทธิ์ดูต้นทุน และเหตุการณ์อ่อนไหวอื่น ๆ (30 วันล่าสุด)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1.5" />รีเฟรช</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" />ส่งออก CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">
        <Stat label="เหตุการณ์ทั้งหมด (30 วัน)" value={stats.total} tone="sky" />
        <Stat label="วันนี้" value={stats.today} tone="violet" />
        <Stat label="เตือน/ผิดพลาด" value={stats.warnings} tone="amber" />
        <Stat label="ส่ง LINE" value={stats.linePush} tone="emerald" />
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="p-4 border-b border-border space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">ช่วงเวลา:</span>
            {[7, 30, 90].map(d => (
              <Button key={d} size="sm" variant={rangeDays === d ? "default" : "outline"} className="h-7 text-xs" onClick={() => setRangeDays(d)}>
                {d} วัน
              </Button>
            ))}
            <div className="flex gap-1 items-center ml-2">
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-7 text-xs w-36" />
              <span className="text-xs text-muted-foreground">ถึง</span>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-7 text-xs w-36" />
              {(fromDate || toDate) && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setFromDate(""); setToDate(""); }}>ล้าง</Button>
              )}
            </div>
          </div>
          <div className="grid md:grid-cols-4 gap-2">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เหตุการณ์/ผู้ใช้/IP/เป้าหมาย..." className="rounded-xl pl-10" />
          </div>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="ระดับ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกระดับ</SelectItem>
              <SelectItem value="info">info</SelectItem>
              <SelectItem value="warning">warning</SelectItem>
              <SelectItem value="error">error</SelectItem>
              <SelectItem value="critical">critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="ประเภทเหตุการณ์" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภท</SelectItem>
              {eventTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent text-xs">
              <tr>
                <th className="text-left p-3 whitespace-nowrap">เวลา</th>
                <th className="text-left p-3">เหตุการณ์</th>
                <th className="text-left p-3">ระดับ</th>
                <th className="text-left p-3">ผู้กระทำ</th>
                <th className="text-left p-3">เป้าหมาย</th>
                <th className="text-left p-3">รายละเอียด</th>
                <th className="text-left p-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">กำลังโหลด…</td></tr>}
              {!loading && filtered.map(r => {
                const p = r.actor_user_id ? profiles[r.actor_user_id] : null;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-accent/30 align-top">
                    <td className="p-3 text-xs whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                    <td className="p-3"><code className="text-xs">{r.event_type}</code></td>
                    <td className="p-3">
                      <Badge variant="outline" className={SEV_COLOR[r.severity] || ""}>{r.severity}</Badge>
                    </td>
                    <td className="p-3 text-xs">
                      {p ? <><div className="font-medium">{p.full_name || "-"}</div><div className="text-muted-foreground">{p.email}</div></> : <span className="text-muted-foreground">system</span>}
                    </td>
                    <td className="p-3 text-xs font-mono">{r.target_type ? `${r.target_type}:${(r.target_id || "").slice(0, 12)}` : "-"}</td>
                    <td className="p-3 text-xs max-w-md">
                      <code className="text-[11px] text-muted-foreground break-all">{JSON.stringify(r.detail || {}).slice(0, 200)}</code>
                    </td>
                    <td className="p-3 text-xs font-mono">{r.ip || "-"}</td>
                  </tr>
                );
              })}
              {!loading && !filtered.length && (
                <tr><td colSpan={7} className="p-10 text-center text-muted-foreground text-sm">ยังไม่มีบันทึก</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "sky" | "violet" | "amber" | "emerald" }) {
  const map = {
    sky: "from-sky-50 to-sky-100 text-sky-700 border-sky-200",
    violet: "from-accent to-muted text-primary border-primary/20",
    amber: "from-amber-50 to-amber-100 text-amber-700 border-amber-200",
    emerald: "from-emerald-50 to-emerald-100 text-emerald-700 border-emerald-200",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-sm bg-gradient-to-br ${map}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
    </div>
  );
}