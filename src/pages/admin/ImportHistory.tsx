import { useEffect, useRef, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RefreshCcw, FileDown, ChevronDown, ChevronUp, Search, X, ArrowUpDown, ArrowUp, ArrowDown, RotateCw, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import ProductCsvImportDialog from "./ProductCsvImportDialog";

type Row = {
  id: string;
  created_at: string;
  user_id: string | null;
  filename: string | null;
  file_size: number | null;
  file_hash: string | null;
  total_rows: number;
  added: number;
  updated: number;
  deleted: number;
  failed: number;
  warnings_count: number;
  errors_count: number;
  row_results: any;
  validation: any;
  _user_name?: string;
};

function fmtBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type Job = {
  id: string;
  user_id: string | null;
  filename: string | null;
  total_rows: number;
  processed_rows: number;
  added: number;
  updated: number;
  deleted: number;
  failed: number;
  stage: "prepare" | "delete" | "upsert" | "done" | "error" | string;
  message: string | null;
  error: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  _user_name?: string;
};

export default function ImportHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "success" | "partial" | "failed">("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  type SortKey = "created_at" | "_user_name" | "status" | "filename" | "failed" | "total_rows";
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const errorRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [channelOk, setChannelOk] = useState(false);
  const profileCache = useRef<Map<string, string>>(new Map());
  const [retryOpen, setRetryOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState<number>(90);
  const [purging, setPurging] = useState(false);

  async function attachUserName(j: Job): Promise<Job> {
    if (!j.user_id) return j;
    const cached = profileCache.current.get(j.user_id);
    if (cached) { j._user_name = cached; return j; }
    const { data } = await supabase.from("profiles").select("full_name,email").eq("id", j.user_id).maybeSingle();
    const name = (data?.full_name || data?.email || j.user_id) as string;
    profileCache.current.set(j.user_id, name);
    j._user_name = name;
    return j;
  }

  async function loadJobs() {
    const cutoff = new Date(Date.now() - 30_000).toISOString();
    const { data } = await supabase
      .from("import_jobs")
      .select("*")
      .or(`finished_at.is.null,finished_at.gte.${cutoff}`)
      .order("started_at", { ascending: false })
      .limit(20);
    const map: Record<string, Job> = {};
    for (const j of (data ?? []) as Job[]) {
      await attachUserName(j);
      map[j.id] = j;
    }
    setJobs(map);
  }

  // Realtime subscription for live job progress
  useEffect(() => {
    loadJobs();
    const ch = liveChannel("admin-import-jobs")
      .on("postgres_changes", { event: "*", schema: "public", table: "import_jobs" }, async (payload) => {
        if (payload.eventType === "DELETE") {
          setJobs((m) => { const n = { ...m }; delete n[(payload.old as any).id]; return n; });
          return;
        }
        const j = await attachUserName({ ...(payload.new as Job) });
        setJobs((m) => ({ ...m, [j.id]: j }));
        // when a job finishes, refresh history table
        if (j.finished_at && (payload.old as any)?.finished_at == null) {
          load();
        }
      })
      .subscribe((s) => setChannelOk(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback polling + prune stale finished jobs from live dashboard
  useEffect(() => {
    const i = setInterval(() => {
      if (!channelOk) loadJobs();
      const cutoff = Date.now() - 30_000;
      setJobs((m) => {
        let changed = false;
        const n: Record<string, Job> = {};
        for (const [k, v] of Object.entries(m)) {
          if (v.finished_at && new Date(v.finished_at).getTime() < cutoff) { changed = true; continue; }
          n[k] = v;
        }
        return changed ? n : m;
      });
    }, 5000);
    return () => clearInterval(i);
  }, [channelOk]);

  const liveJobs = Object.values(jobs).sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  function stageBadge(j: Job) {
    if (j.stage === "done") return <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="w-3 h-3 mr-1" />เสร็จสิ้น</Badge>;
    if (j.stage === "error") return <Badge className="bg-destructive/15 text-destructive border-destructive/30"><AlertCircle className="w-3 h-3 mr-1" />ล้มเหลว</Badge>;
    if (j.stage === "delete") return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />กำลังลบ</Badge>;
    if (j.stage === "upsert") return <Badge className="bg-primary/15 text-primary border-primary/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />เพิ่ม/อัปเดต</Badge>;
    return <Badge variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />เตรียมข้อมูล</Badge>;
  }


  async function load() {
    setLoading(true);
    // auto-purge logs older than retentionDays (best-effort, non-blocking on failure)
    try {
      const cutoff = new Date(Date.now() - retentionDays * 86400_000).toISOString();
      await supabase.from("import_logs").delete().lt("created_at", cutoff);
      await supabase.from("import_jobs").delete().not("finished_at", "is", null).lt("finished_at", cutoff);
    } catch { /* ignore */ }
    const { data, error } = await supabase
      .from("import_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (data ?? []) as Row[];
    const uids = Array.from(new Set(list.map(r => r.user_id).filter(Boolean))) as string[];
    if (uids.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id, full_name, email").in("id", uids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email || p.id]));
      list.forEach(r => { r._user_name = r.user_id ? (map.get(r.user_id) as string) : "—"; });
    }
    setRows(list);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function purgeNow() {
    if (!confirm(`ลบประวัตินำเข้าที่เก่ากว่า ${retentionDays} วันออกทั้งหมด?`)) return;
    setPurging(true);
    try {
      const cutoff = new Date(Date.now() - retentionDays * 86400_000).toISOString();
      const { error: e1 } = await supabase.from("import_logs").delete().lt("created_at", cutoff);
      if (e1) throw e1;
      await supabase.from("import_jobs").delete().not("finished_at", "is", null).lt("finished_at", cutoff);
      toast.success(`ลบประวัติเก่ากว่า ${retentionDays} วันเรียบร้อย`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "ลบไม่สำเร็จ");
    } finally { setPurging(false); }
  }

  function retryImport(r: Row) {
    setRetryOpen(true);
    if (r.filename) toast.info(`เลือกไฟล์ "${r.filename}" อีกครั้งเพื่อรีรันพรีวิว`);
  }

  function statusOf(r: Row): "success" | "partial" | "failed" {
    if (r.failed === 0 && r.errors_count === 0) return "success";
    if (r.added + r.updated + r.deleted === 0) return "failed";
    return "partial";
  }

  const filtered = rows.filter(r => {
    if (status !== "all" && statusOf(r) !== status) return false;
    if (from) {
      const f = new Date(from + "T00:00:00").getTime();
      if (new Date(r.created_at).getTime() < f) return false;
    }
    if (to) {
      const t = new Date(to + "T23:59:59").getTime();
      if (new Date(r.created_at).getTime() > t) return false;
    }
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      const hay = `${r.filename ?? ""} ${r._user_name ?? ""} ${r.file_hash ?? ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    let av: any; let bv: any;
    if (sortKey === "status") { av = statusOf(a); bv = statusOf(b); }
    else if (sortKey === "created_at") { av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); }
    else { av = (a as any)[sortKey] ?? ""; bv = (b as any)[sortKey] ?? ""; }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  useEffect(() => { setPage(1); }, [q, status, from, to, pageSize]);

  function clearFilters() { setQ(""); setStatus("all"); setFrom(""); setTo(""); }
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "created_at" || k === "failed" || k === "total_rows" ? "desc" : "asc"); }
  }
  function SortHeader({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-primary ${active ? "text-primary font-semibold" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span><Icon className="w-3 h-3 opacity-70" />
      </button>
    );
  }
  function jumpToErrorRow(logId: string, rowNum: number) {
    setOpen(logId);
    setTimeout(() => {
      const el = errorRowRefs.current[`${logId}:${rowNum}`];
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("bg-destructive/10"); setTimeout(() => el.classList.remove("bg-destructive/10"), 1600); }
    }, 50);
  }

  function downloadRowResults(r: Row) {
    const blob = new Blob([
      "\uFEFFrow,code,action,mode,status,message\n" +
      ((r.row_results as any[]) ?? []).map(x =>
        [x.row, x.code, x.action, x.mode ?? "", x.status,
         `"${String(x.message ?? "").replace(/"/g, '""')}"`].join(",")).join("\n")
    ], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-${r.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function statusBadge(r: Row) {
    if (r.failed === 0 && r.errors_count === 0) {
      return <Badge className="bg-success/15 text-success border-success/30">สำเร็จ</Badge>;
    }
    if (r.added + r.updated + r.deleted === 0) {
      return <Badge className="bg-destructive/15 text-destructive border-destructive/30">ล้มเหลว</Badge>;
    }
    return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">บางส่วน</Badge>;
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/admin/products"><Button variant="ghost" size="icon" className="rounded-xl"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <h1 className="text-2xl font-bold">ประวัติการนำเข้าสินค้า</h1>
          {channelOk && <Badge variant="outline" className="ml-1 text-[10px] border-success/40 text-success">เรียลไทม์</Badge>}
        </div>
        <Button variant="outline" className="rounded-xl" onClick={load} disabled={loading}>
          <RefreshCcw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
        </Button>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">การลบอัตโนมัติ:</span>
          <span className="text-sm text-muted-foreground">ลบประวัติเก่ากว่า</span>
          <Select value={String(retentionDays)} onValueChange={(v) => setRetentionDays(Number(v))}>
            <SelectTrigger className="h-8 w-24 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[7, 30, 60, 90, 180, 365].map((n) => <SelectItem key={n} value={String(n)}>{n} วัน</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">(ทำงานทุกครั้งที่โหลด/รีเฟรชหน้า)</span>
          <div className="ml-auto">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={purgeNow} disabled={purging || loading}>
              <Trash2 className={`w-4 h-4 mr-1 ${purging ? "animate-pulse" : ""}`} /> ลบประวัติเก่าทันที
            </Button>
          </div>
        </CardContent>
      </Card>

      {liveJobs.length > 0 && (
        <Card className="rounded-2xl border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              งานที่กำลังทำงาน ({liveJobs.filter(j => !j.finished_at).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {liveJobs.map((j) => {
              const pct = j.total_rows > 0 ? Math.min(100, Math.round((j.processed_rows / j.total_rows) * 100)) : 0;
              return (
                <div key={j.id} className="rounded-xl border border-border p-3 bg-card">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" title={j.filename ?? ""}>{j.filename || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {j._user_name ?? "—"} · เริ่ม {new Date(j.started_at).toLocaleTimeString("th-TH")}
                      </div>
                    </div>
                    {stageBadge(j)}
                  </div>
                  <Progress value={pct} className="h-2" />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1.5">
                    <span className="text-muted-foreground">{j.processed_rows}/{j.total_rows} แถว · {pct}%</span>
                    {j.added > 0 && <span className="text-success">+เพิ่ม {j.added}</span>}
                    {j.updated > 0 && <span className="text-primary">อัปเดต {j.updated}</span>}
                    {j.deleted > 0 && <span>ลบ {j.deleted}</span>}
                    {j.failed > 0 && <span className="text-destructive">ผิด {j.failed}</span>}
                  </div>
                  {(j.message || j.error) && (
                    <div className={`text-[11px] mt-1 truncate ${j.stage === "error" ? "text-destructive" : "text-muted-foreground"}`} title={j.error || j.message || ""}>
                      {j.error || j.message}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">รายการ {sorted.length} / {rows.length} ครั้ง</CardTitle>
            {(q || status !== "all" || from || to) && (
              <Button variant="ghost" size="sm" className="rounded-xl" onClick={clearFilters}>
                <X className="w-3 h-3 mr-1" /> ล้างตัวกรอง
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 mt-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นชื่อไฟล์ / ผู้อัปโหลด / hash"
                className="rounded-xl pl-8"
              />
            </div>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="สถานะ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกสถานะ</SelectItem>
                <SelectItem value="success">สำเร็จ</SelectItem>
                <SelectItem value="partial">บางส่วน</SelectItem>
                <SelectItem value="failed">ล้มเหลว</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl" aria-label="ตั้งแต่วันที่" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl" aria-label="ถึงวันที่" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2"><SortHeader k="created_at" label="เวลา" /></th>
                  <th className="text-left p-2"><SortHeader k="_user_name" label="ผู้อัปโหลด" /></th>
                  <th className="text-left p-2"><SortHeader k="filename" label="ไฟล์" /></th>
                  <th className="text-right p-2">ขนาด</th>
                  <th className="text-right p-2"><SortHeader k="total_rows" label="แถว" align="right" /></th>
                  <th className="text-right p-2">เพิ่ม</th>
                  <th className="text-right p-2">อัปเดต</th>
                  <th className="text-right p-2">ลบ</th>
                  <th className="text-right p-2"><SortHeader k="failed" label="ผิด" align="right" /></th>
                  <th className="text-left p-2"><SortHeader k="status" label="สถานะ" /></th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {paged.map(r => (
                  <>
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("th-TH")}</td>
                      <td className="p-2">{r._user_name ?? "—"}</td>
                      <td className="p-2 max-w-[260px] truncate" title={r.filename ?? ""}>{r.filename ?? "—"}</td>
                      <td className="p-2 text-right">{fmtBytes(r.file_size)}</td>
                      <td className="p-2 text-right">{r.total_rows}</td>
                      <td className="p-2 text-right text-success">{r.added}</td>
                      <td className="p-2 text-right text-primary">{r.updated}</td>
                      <td className="p-2 text-right">{r.deleted}</td>
                      <td className="p-2 text-right text-destructive">{r.failed}</td>
                      <td className="p-2">{statusBadge(r)}</td>
                      <td className="p-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="sm" className="rounded-xl" title="ลองนำเข้าอีกครั้ง" onClick={() => retryImport(r)}>
                              <RotateCw className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setOpen(open === r.id ? null : r.id)}>
                              {open === r.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                          </div>
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr key={r.id + "-d"} className="bg-muted/20">
                        <td colSpan={11} className="p-3">
                          <div className="flex flex-wrap gap-2 mb-2">
                            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => downloadRowResults(r)}>
                              <FileDown className="w-4 h-4 mr-1" /> ดาวน์โหลดผลรายแถว (CSV)
                            </Button>
                              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => retryImport(r)}>
                                <RotateCw className="w-4 h-4 mr-1" /> ลองนำเข้าอีกครั้ง
                              </Button>
                            {r.file_hash && <Badge variant="outline" className="font-mono text-xs">hash: {r.file_hash.slice(0, 16)}…</Badge>}
                            <Badge variant="outline">คำเตือน {r.warnings_count}</Badge>
                            <Badge variant="outline">ข้อผิดพลาด {r.errors_count}</Badge>
                          </div>
                          {(() => {
                            const all = ((r.row_results as any[]) ?? []);
                            const failedRows = all.filter((x) => x.status === "failed");
                            if (failedRows.length === 0) return null;
                            return (
                              <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="text-sm font-semibold text-destructive">
                                    พบข้อผิดพลาด {failedRows.length} แถว
                                  </div>
                                  <span className="text-xs text-muted-foreground">คลิกเพื่อเลื่อนไปยังแถวด้านล่าง</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">
                                  {failedRows.slice(0, 200).map((x) => (
                                    <button
                                      key={x.row}
                                      type="button"
                                      onClick={() => jumpToErrorRow(r.id, x.row)}
                                      className="px-2 py-0.5 rounded-md bg-destructive/15 text-destructive text-xs hover:bg-destructive/25"
                                      title={x.message ?? ""}
                                    >
                                      แถว {x.row}{x.code ? ` · ${x.code}` : ""}
                                    </button>
                                  ))}
                                  {failedRows.length > 200 && (
                                    <span className="text-xs text-muted-foreground self-center">…และอีก {failedRows.length - 200} แถว</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                          <div className="border border-border rounded-xl overflow-auto max-h-72">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/40 sticky top-0">
                                <tr>
                                  <th className="text-left p-2">แถว</th>
                                  <th className="text-left p-2">รหัส</th>
                                  <th className="text-left p-2">ดำเนินการ</th>
                                  <th className="text-left p-2">โหมด</th>
                                  <th className="text-left p-2">สถานะ</th>
                                  <th className="text-left p-2">ข้อความ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {((r.row_results as any[]) ?? []).slice(0, 200).map((x, i) => (
                                  <tr
                                    key={i}
                                    ref={(el) => { errorRowRefs.current[`${r.id}:${x.row}`] = el; }}
                                    className="border-t border-border transition-colors"
                                  >
                                    <td className="p-2">{x.row}</td>
                                    <td className="p-2 font-mono">{x.code}</td>
                                    <td className="p-2">{x.action}</td>
                                    <td className="p-2">{x.mode ?? "—"}</td>
                                    <td className={`p-2 ${x.status === "failed" ? "text-destructive" : x.status === "success" ? "text-success" : ""}`}>{x.status}</td>
                                    <td className="p-2 text-muted-foreground">{x.message ?? ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {!sorted.length && !loading && (
                  <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">{rows.length ? "ไม่พบรายการที่ตรงกับตัวกรอง" : "ยังไม่มีประวัติการนำเข้า"}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {sorted.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t border-border text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">แสดง</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-20 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">รายการ/หน้า</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="rounded-xl" disabled={pageSafe <= 1} onClick={() => setPage(1)}>«</Button>
                <Button variant="outline" size="sm" className="rounded-xl" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>‹</Button>
                <span className="px-2 text-muted-foreground">หน้า {pageSafe} / {totalPages}</span>
                <Button variant="outline" size="sm" className="rounded-xl" disabled={pageSafe >= totalPages} onClick={() => setPage(pageSafe + 1)}>›</Button>
                <Button variant="outline" size="sm" className="rounded-xl" disabled={pageSafe >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ProductCsvImportDialog
        open={retryOpen}
        onOpenChange={setRetryOpen}
        onDone={() => { setRetryOpen(false); load(); }}
      />
    </div>
  );
}