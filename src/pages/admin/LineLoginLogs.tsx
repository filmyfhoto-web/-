import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { RefreshCw, Download, CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  groupTraces,
  filterTraces,
  tracesToCsv,
  STEP_LABEL_TH,
  type LineStepRow,
} from "@/lib/lineLoginLogs";

const RANGES = [
  { label: "1 ชม.", hours: 1 },
  { label: "24 ชม.", hours: 24 },
  { label: "7 วัน", hours: 24 * 7 },
  { label: "30 วัน", hours: 24 * 30 },
];

export default function LineLoginLogs() {
  const [rows, setRows] = useState<LineStepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [flow, setFlow] = useState<"all" | "login" | "link">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("activity_logs")
      .select("id, created_at, detail")
      .eq("action", "line.login_step")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) toast.error("โหลดบันทึกไม่สำเร็จ");
    setRows((data as unknown as LineStepRow[]) || []);
    setLoading(false);
  }, [hours]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("failed") === "1") {
      setOnlyFailed(true);
    }
    void load();
  }, [load]);

  const traces = useMemo(
    () => filterTraces(groupTraces(rows), { onlyFailed, flow, search }),
    [rows, onlyFailed, flow, search],
  );

  const stats = useMemo(() => {
    const all = groupTraces(rows);
    return {
      total: all.length,
      failed: all.filter((t) => t.failed).length,
      done: all.filter((t) => t.finished && !t.failed).length,
    };
  }, [rows]);

  const exportCsv = () => {
    const blob = new Blob([tracesToCsv(traces)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `line-login-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AdminLayout>
      <SeoHead
        title="บันทึกการเข้าสู่ระบบ LINE"
        description="ไล่ดูทุกขั้นตอนของการเข้าสู่ระบบด้วย LINE ตั้งแต่รับ code แลก token จนสร้าง session"
        path="/admin/line-login-logs"
      />
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">บันทึกการเข้าสู่ระบบ LINE</h1>
            <p className="text-sm text-muted-foreground">
              ทุกขั้นตอน: รับ code → แลก token → ยืนยัน id_token → สร้าง session
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              รีเฟรช
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!traces.length}>
              <Download className="w-4 h-4 mr-2" /> CSV
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3"><p className="text-xs text-muted-foreground">ทั้งหมด</p><p className="text-2xl font-semibold">{stats.total}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">สำเร็จ</p><p className="text-2xl font-semibold text-emerald-600">{stats.done}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">ล้มเหลว</p><p className="text-2xl font-semibold text-destructive">{stats.failed}</p></Card>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <Button key={r.hours} size="sm" variant={hours === r.hours ? "default" : "outline"} onClick={() => setHours(r.hours)}>
              {r.label}
            </Button>
          ))}
          <Button size="sm" variant={onlyFailed ? "destructive" : "outline"} onClick={() => setOnlyFailed((v) => !v)}>
            เฉพาะที่ล้มเหลว
          </Button>
          {(["all", "login", "link"] as const).map((f) => (
            <Button key={f} size="sm" variant={flow === f ? "default" : "outline"} onClick={() => setFlow(f)}>
              {f === "all" ? "ทุกแบบ" : f === "login" ? "ล็อกอิน" : "เชื่อมบัญชี"}
            </Button>
          ))}
          <Input
            className="w-56"
            placeholder="ค้นหา trace id / ขั้นตอน / ข้อผิดพลาด"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          {!loading && !traces.length && (
            <p className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีบันทึกในช่วงเวลานี้</p>
          )}
          {traces.map((t) => {
            const isOpen = open[t.traceId];
            return (
              <Card key={t.traceId + t.startedAt} className="overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50"
                  onClick={() => setOpen((o) => ({ ...o, [t.traceId]: !o[t.traceId] }))}
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                  {t.failed ? (
                    <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {t.failed
                        ? `ล้มเหลวที่: ${STEP_LABEL_TH[t.failedStep || ""] || t.failedStep}`
                        : STEP_LABEL_TH[t.lastStep] || t.lastStep}
                      {t.error ? <span className="text-destructive font-normal"> — {t.error}</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {new Date(t.startedAt).toLocaleString("th-TH")} · {t.steps.length} ขั้น · {t.totalMs} ms · trace {t.traceId}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{t.flow === "link" ? "เชื่อมบัญชี" : "ล็อกอิน"}</Badge>
                </button>
                {isOpen && (
                  <div className="border-t divide-y">
                    {t.steps.map((s) => (
                      <div key={s.id} className="p-3 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          {s.detail?.ok === false ? (
                            <XCircle className="w-3.5 h-3.5 text-destructive" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          <span className="font-medium">{STEP_LABEL_TH[String(s.detail?.step)] || s.detail?.step}</span>
                          <span className="text-muted-foreground">
                            {new Date(s.created_at).toLocaleTimeString("th-TH")}
                            {typeof s.detail?.stage_ms === "number" ? ` · ${s.detail.stage_ms} ms` : ""}
                            {s.detail?.source ? ` · ${s.detail.source}` : ""}
                          </span>
                        </div>
                        {s.detail?.error && <p className="text-destructive">{s.detail.error}</p>}
                        <pre className="bg-muted/60 rounded p-2 overflow-x-auto text-[11px]">
                          {JSON.stringify(s.detail, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
