import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, Timer, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { triggerSync, SyncAuthError } from "../lib/syncStub";
import { tbl } from "../lib/tbl";

// Exponential backoff schedule (seconds) between auto-retry attempts.
const BACKOFF_SEC = [30, 60, 120, 240, 480];
const MAX_ATTEMPTS = BACKOFF_SEC.length;

type FailedRow = {
  id: string;
  document_no: string;
  google_sheet_sync_status: string | null;
  google_drive_sync_status: string | null;
};

export default function SyncAutoRetryCard({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState<boolean>(
    () => (typeof window !== "undefined" ? localStorage.getItem(`rds_auto_retry_${storeId}`) !== "0" : true),
  );
  const [attempt, setAttempt] = useState(0);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ at: string; ok: number; failed: number } | null>(null);
  const runningRef = useRef(false);

  const failedQ = useQuery({
    queryKey: ["rds_failed_docs", storeId],
    queryFn: async () => {
      const { data } = await supabase
        .from(tbl("documents") as any)
        .select("id,document_no,google_sheet_sync_status,google_drive_sync_status")
        .eq("store_id", storeId)
        .is("deleted_at", null)
        .or("google_sheet_sync_status.eq.failed,google_drive_sync_status.eq.failed")
        .limit(50);
      return (data as any[]) ?? [];
    },
    refetchInterval: 15_000,
  });

  const failed = (failedQ.data ?? []) as FailedRow[];

  // Schedule next retry when there are failures + auto-retry is on.
  useEffect(() => {
    if (!enabled || failed.length === 0 || attempt >= MAX_ATTEMPTS) {
      setNextAt(null);
      return;
    }
    if (nextAt) return; // already scheduled
    const delay = BACKOFF_SEC[attempt] * 1000;
    setNextAt(Date.now() + delay);
  }, [enabled, failed.length, attempt, nextAt]);

  // Reset attempt count when all failures clear.
  useEffect(() => {
    if (failed.length === 0 && attempt !== 0) {
      setAttempt(0);
      setNextAt(null);
    }
  }, [failed.length, attempt]);

  // Countdown tick.
  useEffect(() => {
    if (!nextAt) { setCountdown(0); return; }
    const tick = () => {
      const remain = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
      setCountdown(remain);
      if (remain === 0 && !runningRef.current) {
        void runRetry();
      }
    };
    tick();
    const h = window.setInterval(tick, 1000);
    return () => window.clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextAt]);

  function toggle(v: boolean) {
    setEnabled(v);
    localStorage.setItem(`rds_auto_retry_${storeId}`, v ? "1" : "0");
    if (!v) {
      setNextAt(null);
      setAttempt(0);
    }
  }

  async function runRetry(manual = false) {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setNextAt(null);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const r of failed) {
        const targets: Array<"sheet" | "drive"> = [];
        if (r.google_sheet_sync_status === "failed") targets.push("sheet");
        if (r.google_drive_sync_status === "failed") targets.push("drive");
        const target = targets.length === 2 ? "both" : targets[0];
        if (!target) continue;
        try {
          const { ok } = await triggerSync([r.id], target as any);
          if (ok) okCount++;
          else failCount++;
        } catch (e) {
          if (e instanceof SyncAuthError) {
            toast.error("Session หมดอายุ ต้องเข้าสู่ระบบใหม่ก่อนซิงก์ต่อ");
            throw e;
          }
          failCount++;
        }
      }
      setLastResult({ at: new Date().toISOString(), ok: okCount, failed: failCount });
      if (manual) {
        if (okCount > 0) toast.success(`ลองใหม่สำเร็จ ${okCount} ฉบับ`);
        if (failCount > 0) toast.error(`ยังล้มเหลว ${failCount} ฉบับ`);
      }
      if (failCount > 0 && enabled) {
        setAttempt((a) => a + 1);
      } else {
        setAttempt(0);
      }
      qc.invalidateQueries({ queryKey: ["rds_failed_docs", storeId] });
      qc.invalidateQueries({ queryKey: ["rds_sync_status", storeId] });
    } catch { /* auth error already toasted */ }
    finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  const stopped = attempt >= MAX_ATTEMPTS && failed.length > 0;
  const fmtSec = (s: number) => {
    if (s < 60) return `${s} วินาที`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return rs ? `${m} นาที ${rs} วินาที` : `${m} นาที`;
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <RefreshCw className={`h-5 w-5 shrink-0 ${running ? "animate-spin text-primary" : "text-muted-foreground"}`} />
          <div className="min-w-0">
            <p className="font-medium">ลองซิงก์ซ้ำอัตโนมัติ</p>
            <p className="text-xs text-muted-foreground">
              เมื่อการเชื่อมล้มเหลว ระบบจะลองใหม่ให้อัตโนมัติสูงสุด {MAX_ATTEMPTS} ครั้ง (30วิ → 1น → 2น → 4น → 8น)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch id={`auto-retry-${storeId}`} checked={enabled} onCheckedChange={toggle} />
          <Label htmlFor={`auto-retry-${storeId}`} className="!mb-0 text-xs">
            {enabled ? "เปิด" : "ปิด"}
          </Label>
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">เอกสารที่ล้มเหลว</dt>
          <dd className={`font-medium ${failed.length ? "text-destructive" : ""}`}>{failed.length} ฉบับ</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ครั้งที่ลอง</dt>
          <dd className="font-medium">{attempt} / {MAX_ATTEMPTS}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ลองใหม่ใน</dt>
          <dd className="font-medium inline-flex items-center gap-1">
            {running ? (
              <><RefreshCw className="h-3 w-3 animate-spin" /> กำลังลองใหม่…</>
            ) : nextAt && countdown > 0 ? (
              <><Timer className="h-3 w-3" /> {fmtSec(countdown)}</>
            ) : stopped ? (
              <span className="text-destructive">หยุด (ถึงครั้งสูงสุด)</span>
            ) : failed.length === 0 ? (
              <span className="text-green-700 dark:text-green-300 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> ไม่มีที่ต้องลอง</span>
            ) : !enabled ? (
              <span className="text-muted-foreground">ปิดอยู่</span>
            ) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ผลครั้งล่าสุด</dt>
          <dd className="font-medium">
            {lastResult ? (
              <>
                <span className="text-green-700 dark:text-green-300">{lastResult.ok}</span>
                {" / "}
                <span className={lastResult.failed ? "text-destructive" : ""}>{lastResult.failed}</span>
                <span className="text-muted-foreground"> · {new Date(lastResult.at).toLocaleTimeString("th-TH")}</span>
              </>
            ) : "—"}
          </dd>
        </div>
      </dl>

      {stopped && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">ลองซิงก์ครบ {MAX_ATTEMPTS} ครั้งแล้วยังไม่สำเร็จ</p>
            <p className="text-muted-foreground">ตรวจสอบสถานะการเชื่อม Google Drive ด้านบน หรือกด "ลองใหม่ตอนนี้" เพื่อเริ่มรอบใหม่</p>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setAttempt(0); void runRetry(true); }}
          disabled={running || failed.length === 0}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${running ? "animate-spin" : ""}`} /> ลองใหม่ตอนนี้
        </Button>
      </div>
    </Card>
  );
}