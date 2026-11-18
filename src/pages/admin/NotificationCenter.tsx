import AdminLayout from "@/components/layout/AdminLayout";
import { liveChannel } from "@/lib/realtimeChannel";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Send, Inbox, Activity, FlaskConical, AlertTriangle } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { maskLineUserId } from "@/hooks/useLineBindingState";

/**
 * One page for order notification delivery: what was queued, to whom, its
 * status, the last error and a single deliberate resend action. The list is
 * read straight from `notification_outbox` — the server-side source of truth.
 */

type Row = {
  id: string;
  created_at: string;
  sent_at: string | null;
  event_type: string;
  ref_type: string;
  ref_id: string | null;
  recipient: string | null;
  status: string;
  attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  provider_message_id: string | null;
  payload: { text?: string } | null;
};

type RunRow = {
  id: string;
  trigger_source: string | null;
  started_at: string;
  finished_at: string | null;
  claimed: number | null;
  sent: number | null;
  failed: number | null;
  dead: number | null;
  error: string | null;
};

/** Self-test rows never leave the system; they are hidden from the list by
 *  default so operators only see real customer traffic. */
export const SELFTEST_REF_TYPE = "system_self_test";

/** No successful run for longer than this = the worker is considered stale. */
const STALE_MS = 3 * 60_000;

const STATUS_LABEL: Record<string, string> = {
  pending: "รอส่ง",
  processing: "กำลังส่ง",
  sent: "ส่งแล้ว",
  failed: "ส่งไม่สำเร็จ",
  dead: "หยุดส่งถาวร",
  skipped: "ข้าม",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-sky-100 text-sky-800",
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  dead: "bg-destructive/10 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

export function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

/** `notification_outbox` / `notification_dispatch_runs` are operational tables
 *  that are not part of the generated Database types, so they are reached
 *  through a minimal structural view of the query builder instead of `any`. */
type LooseQuery = {
  select: (cols: string) => LooseQuery;
  order: (col: string, opts: { ascending: boolean }) => LooseQuery;
  limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};
const db = supabase as unknown as { from: (table: string) => LooseQuery };

export default function NotificationCenter() {
  const [rows, setRows] = useState<Row[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [lineReady, setLineReady] = useState<boolean | null>(null);
  const [selfTestResult, setSelfTestResult] = useState<
    { rows?: number; claimed?: number; sent?: number; duplicate_suppressed?: boolean } | null
  >(null);
  const { busy, run } = useSubmitGuard();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: runData }] = await Promise.all([
      db
        .from("notification_outbox")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("notification_dispatch_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20),
    ]);
    if (error) toast.error("โหลดรายการแจ้งเตือนไม่สำเร็จ");
    setRows((data ?? []) as Row[]);
    setRuns((runData ?? []) as RunRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // LINE readiness: an access token + at least one enabled admin recipient are
  // what the queue needs before anything can actually be delivered.
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.functions.invoke("line-config-check", { body: {} });
      if (error) { setLineReady(false); return; }
      const d = data as { ok?: boolean; token_ok?: boolean } | null;
      setLineReady(!!(d?.ok ?? d?.token_ok));
    })();
  }, []);

  // Live health: the worker writes a row every minute, so subscribe instead of
  // making the admin hit refresh to find out whether the queue is moving.
  useEffect(() => {
    const ch = liveChannel("notification-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_dispatch_runs" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_outbox" }, () => void load())
      .subscribe();
    const t = setInterval(() => void load(), 60_000);
    return () => { void supabase.removeChannel(ch); clearInterval(t); };
  }, [load]);

  const drain = () =>
    run(async () => {
      if (!window.confirm("ยืนยันส่งข้อความที่ค้างในคิวทั้งหมดตอนนี้?")) return;
      const { error } = await supabase.functions.invoke("notify-dispatch", {
        body: { action: "drain", limit: 25 },
      });
      if (error) { toast.error("ส่งคิวไม่สำเร็จ"); return; }
      toast.success("สั่งส่งคิวแล้ว — ดูผลจากสถานะในตาราง");
      await load();
    });

  /** Safe health check: queues and completes one test item on an internal
   *  channel. It never sends a LINE message and never touches an order. */
  const selfTest = () =>
    run(async () => {
      if (!window.confirm("ทดสอบระบบคิว (ไม่ส่งข้อความหาลูกค้า) ใช่หรือไม่?")) return;
      const { data, error } = await supabase.functions.invoke("notify-dispatch", {
        body: { action: "self_test", client_request_id: `selftest:${Date.now()}` },
      });
      if (error) { toast.error("ทดสอบไม่สำเร็จ"); return; }
      const d = (data ?? {}) as { rows?: number; claimed?: number; sent?: number; duplicate_suppressed?: boolean };
      setSelfTestResult(d);
      toast.success(
        `ทดสอบสำเร็จ — คิว ${d.rows ?? 1} รายการ · หยิบ ${d.claimed ?? 0} · ส่ง ${d.sent ?? 0}` +
          (d.duplicate_suppressed ? " · กันส่งซ้ำได้" : ""),
      );
      await load();
    });

  const resend = (row: Row) =>
    run(async () => {
      if (!row.ref_id || !row.recipient) { toast.error("ไม่มีผู้รับสำหรับส่งใหม่"); return; }
      const { error } = await supabase.functions.invoke("notify-dispatch", {
        body: {
          action: "enqueue",
          // Only the row id travels: the server re-reads recipient and text
          // from the outbox so the browser can never pick a destination.
          outbox_id: row.id,
          // Always present: makes an accidental double submit collapse onto
          // the row the first call created instead of sending twice.
          client_request_id: `manual:${row.id}`,
        },
      });
      if (error) { toast.error("ตั้งคิวส่งใหม่ไม่สำเร็จ"); return; }
      toast.success("เพิ่มลงคิวส่งใหม่แล้ว");
      await load();
    });

  const confirmResend = (row: Row) => {
    if (!window.confirm("ยืนยันส่งข้อความนี้ใหม่อีกครั้ง?")) return;
    void resend(row);
  };

  const lastRun = runs[0];
  const lastOk = runs.find((r) => !!r.finished_at && !r.error);
  const staleMs = lastOk ? Date.now() - new Date(lastOk.started_at).getTime() : null;
  const healthy = staleMs !== null && staleMs < STALE_MS;

  const realRows = rows.filter((r) => r.ref_type !== SELFTEST_REF_TYPE);
  const visibleRows = showTests ? rows : realRows;

  const counts = realRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const pendingRows = realRows.filter((r) => r.status === "pending" || r.status === "failed");
  const oldestPending = pendingRows.length
    ? pendingRows.reduce((a, b) => (new Date(a.created_at) < new Date(b.created_at) ? a : b))
    : null;
  const oldestPendingMin = oldestPending
    ? Math.max(0, Math.round((Date.now() - new Date(oldestPending.created_at).getTime()) / 60000))
    : null;

  return (
    <AdminLayout>
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Inbox className="w-5 h-5" /> ศูนย์แจ้งเตือนออเดอร์
            </h1>
            <p className="text-xs text-muted-foreground">
              สถานะการส่ง LINE ทั้งหมดมาจากคิวกลางฝั่งเซิร์ฟเวอร์ — 1 เหตุการณ์ ส่ง 1 ครั้ง
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-2" /> รีเฟรช
            </Button>
            <Button size="sm" onClick={() => void drain()} disabled={busy}>
              <Send className="w-4 h-4 mr-2" /> ส่งคิวที่ค้าง
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void selfTest()} disabled={busy} data-testid="selftest-btn">
              <FlaskConical className="w-4 h-4 mr-2" /> ทดสอบระบบคิว
            </Button>
          </div>
        </header>

        <section className="rounded-xl border p-3" data-testid="dispatch-health">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="w-4 h-4" /> สถานะตัวส่งอัตโนมัติ
            <Badge variant="secondary" className={healthy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
              {healthy ? "ทำงานปกติ" : "ยังไม่มีรอบล่าสุด"}
            </Badge>
          </div>
          {!healthy && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900" data-testid="stale-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                ระบบส่งอัตโนมัติไม่ได้ทำงานสำเร็จเกิน 3 นาที
                {staleMs !== null ? ` (ล่าสุด ${Math.round(staleMs / 60000)} นาทีที่แล้ว)` : " (ยังไม่พบรอบที่สำเร็จ)"}
                {lastRun?.error ? ` — ข้อผิดพลาดล่าสุด: ${lastRun.error}` : ""}
                <div>กด “ส่งคิวที่ค้าง” เพื่อส่งทันที และแจ้งผู้ดูแลระบบให้ตรวจงานอัตโนมัติ</div>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            ระบบทำงานทุก 1 นาทีโดยอัตโนมัติ — ปุ่ม “ส่งคิวที่ค้าง” เป็นเครื่องมือสำหรับเจ้าของ/แอดมินเท่านั้น ไม่ใช่กลไกหลัก
          </p>
          {lastRun ? (
            <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <div>รอบล่าสุด: {fmtDateTime(lastRun.started_at)} ({lastRun.trigger_source ?? "-"})</div>
              <div>{lastRun.finished_at ? `เสร็จเมื่อ ${fmtDateTime(lastRun.finished_at)}` : "กำลังทำงาน…"}</div>
              <div>
                claimed {lastRun.claimed ?? 0} · sent {lastRun.sent ?? 0} · failed {lastRun.failed ?? 0} · dead {lastRun.dead ?? 0}
              </div>
              {lastRun.error && <div className="text-destructive">error: {lastRun.error}</div>}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">ยังไม่มีข้อมูลรอบการส่ง</div>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-xs" data-testid="queue-counts">
            <Badge variant="secondary" className={STATUS_STYLE.pending}>รอส่ง {counts.pending ?? 0}</Badge>
            <Badge variant="secondary" className={STATUS_STYLE.processing}>กำลังส่ง {counts.processing ?? 0}</Badge>
            <Badge variant="secondary" className={STATUS_STYLE.sent}>ส่งแล้ว {counts.sent ?? 0}</Badge>
            <Badge variant="secondary" className={STATUS_STYLE.failed}>ไม่สำเร็จ {counts.failed ?? 0}</Badge>
            <Badge variant="secondary" className={STATUS_STYLE.dead}>หยุดส่งถาวร {counts.dead ?? 0}</Badge>
            <Badge variant="secondary" className={STATUS_STYLE.skipped}>ข้าม {counts.skipped ?? 0}</Badge>
            <span className="self-center text-muted-foreground">
              {oldestPendingMin === null ? "ไม่มีรายการค้าง" : `รายการค้างนานสุด ${oldestPendingMin} นาที`}
            </span>
            <Badge
              variant="secondary"
              data-testid="line-readiness"
              className={lineReady === false ? "bg-rose-100 text-rose-800" : lineReady ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}
            >
              {lineReady === null ? "กำลังตรวจการตั้งค่า LINE" : lineReady ? "ตั้งค่า LINE พร้อมใช้งาน" : "ยังตั้งค่า LINE ไม่ครบ"}
            </Badge>
          </div>
          {selfTestResult && (
            <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900" data-testid="selftest-result">
              ผลทดสอบล่าสุด (ไม่ส่ง LINE): คิว {selfTestResult.rows ?? 1} รายการ · หยิบ {selfTestResult.claimed ?? 0} · ส่ง {selfTestResult.sent ?? 0}
              {selfTestResult.duplicate_suppressed ? " · สั่งซ้ำแล้วไม่เกิดรายการซ้ำ" : ""}
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <Button size="sm" variant="ghost" data-testid="toggle-tests" onClick={() => setShowTests((v) => !v)}>
            {showTests ? "ซ่อนรายการทดสอบระบบ" : "แสดงรายการทดสอบระบบ"}
          </Button>
        </div>

        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left p-2">เหตุการณ์</th>
                <th className="text-left p-2">ผู้รับ</th>
                <th className="text-left p-2">สถานะ</th>
                <th className="text-left p-2">พยายาม</th>
                <th className="text-left p-2">เวลา</th>
                <th className="text-left p-2">ข้อผิดพลาด</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">ยังไม่มีรายการในคิว</td></tr>
              )}
              {visibleRows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2">
                    <div className="font-medium">{r.event_type}</div>
                    <div className="text-[11px] text-muted-foreground">{r.ref_type}</div>
                  </td>
                  <td className="p-2 font-mono text-xs">{maskLineUserId(r.recipient)}</td>
                  <td className="p-2">
                    <Badge className={STATUS_STYLE[r.status] ?? ""} variant="secondary">
                      {statusLabel(r.status)}
                    </Badge>
                  </td>
                  <td className="p-2 text-xs">{r.attempts}</td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {fmtDateTime(r.sent_at || r.created_at)}
                  </td>
                  <td className="p-2 text-xs text-destructive max-w-[220px] truncate" title={r.last_error ?? ""}>
                    {r.last_error ?? "-"}
                  </td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => confirmResend(r)}>
                      ส่งใหม่
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}