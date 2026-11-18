/**
 * Always-visible POS build badge + update/debug surface.
 *
 * Cashiers report "ยังเห็นของเก่า" — this makes the running build obvious at a
 * glance, tells them when a newer build is live, and gives support a panel
 * with the service-worker / cache state plus a hard "บังคับอัปเดต" reset.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldAlert, Bug } from "lucide-react";
import { BUILD_INFO, formatThaiDateTime } from "@/lib/buildInfo";
import { RUNNING_TAG, useBuildUpdate } from "@/lib/buildUpdate";
import { forceUpdateApp, refreshAppAssets, readSwCacheStatus, type SwCacheStatus } from "@/lib/appUpdate";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function PosVersionBar() {
  const { remoteTag, checkedAt, hasUpdate } = useBuildUpdate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SwCacheStatus | null>(null);

  const loadStatus = useCallback(async () => setStatus(await readSwCacheStatus()), []);
  useEffect(() => { if (open) void loadStatus(); }, [open, loadStatus]);

  return (
    <>
      {hasUpdate && (
        <div
          data-testid="pos-update-banner"
          // วางไว้ล่างและกว้างจำกัด: ไม่ทับแถบเมนูด้านบนหรือปุ่มใด ๆ
          className="fixed inset-x-2 bottom-16 z-[60] mx-auto flex max-w-md items-center justify-center gap-3 rounded-xl bg-amber-500 px-3 py-2 text-sm font-bold text-amber-950 shadow-lg"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">มีเวอร์ชันใหม่พร้อมใช้งาน ({remoteTag})</span>
          <button
            type="button"
            data-testid="pos-update-banner-refresh"
            onClick={() => void refreshAppAssets()}
            className="min-h-9 shrink-0 rounded-lg bg-amber-950 px-3 font-black text-white"
          >
            รีเฟรชเดี๋ยวนี้
          </button>
        </div>
      )}

      <button
        type="button"
        data-testid="pos-version-badge"
        aria-label={`เวอร์ชัน POS ${BUILD_INFO.version} — เปิดแถบดีบัก`}
        onClick={() => setOpen(true)}
        className="fixed bottom-2 left-2 z-50 flex items-center gap-1.5 rounded-full bg-blue-950/95 px-3 py-1.5 text-xs font-black text-white shadow-lg ring-1 ring-white/25"
      >
        <Bug className="h-3.5 w-3.5" aria-hidden />
        POS v{BUILD_INFO.version}
        {hasUpdate && <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[22rem] max-w-full overflow-y-auto" data-testid="pos-debug-panel">
          <SheetHeader>
            <SheetTitle>สถานะการโหลด POS</SheetTitle>
          </SheetHeader>

          <dl className="mt-4 space-y-1 text-sm">
            <Row label="เวอร์ชันที่ใช้อยู่" value={`v${BUILD_INFO.version}`} testid="pos-debug-version" />
            <Row label="build tag" value={RUNNING_TAG} />
            <Row label="สร้างเมื่อ" value={formatThaiDateTime(BUILD_INFO.builtAt)} />
            <Row label="เวอร์ชันบนเซิร์ฟเวอร์" value={remoteTag ?? "ตรวจไม่ได้ (dev/ออฟไลน์)"} testid="pos-debug-remote" />
            <Row label="ตรวจล่าสุด" value={checkedAt ? checkedAt.toLocaleTimeString("th-TH") : "-"} />
            <Row label="สถานะ" value={hasUpdate ? "⚠️ มีเวอร์ชันใหม่" : "✅ ล่าสุดแล้ว"} testid="pos-debug-state" />
            <Row label="โหมดแอปติดตั้ง" value={status?.standalone ? "ใช่ (PWA)" : "ไม่ใช่ (เบราว์เซอร์)"} />
            <Row label="Service Worker" value={
              !status?.supported ? "ไม่รองรับ"
                : status.registrations.length === 0 ? "ไม่มี (โหลดตรงจากเซิร์ฟเวอร์)"
                : `${status.registrations.length} ตัว · ${status.controlled ? "กำลังควบคุมหน้านี้" : "ยังไม่ควบคุม"}`
            } testid="pos-debug-sw" />
          </dl>

          {!!status?.registrations.length && (
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              {status.registrations.map((r) => (
                <li key={r.scope} className="break-all">• {r.scriptURL} — {r.state}</li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <h3 className="text-sm font-bold">แคช ({status?.caches.length ?? 0})</h3>
            <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground" data-testid="pos-debug-caches">
              {status?.caches.length
                ? status.caches.map((c) => <li key={c.name} className="break-all">• {c.name} — {c.entries} ไฟล์</li>)
                : <li>ไม่มีแคช</li>}
            </ul>
          </div>

          <div className="mt-5 space-y-2">
            <button
              type="button"
              data-testid="pos-debug-refresh"
              onClick={() => void refreshAppAssets()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 font-bold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> โหลดเวอร์ชันล่าสุด
            </button>
            <button
              type="button"
              data-testid="pos-force-update"
              onClick={() => void forceUpdateApp()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 font-black text-white"
            >
              <ShieldAlert className="h-4 w-4" aria-hidden /> บังคับอัปเดต (ล้าง SW + แคช)
            </button>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="min-h-11 w-full rounded-lg border font-bold"
            >
              ตรวจสถานะอีกครั้ง
            </button>
            <p className="text-[11px] text-muted-foreground">
              การอัปเดตไม่ลบข้อมูลการขาย บิลที่พัก หรือการเข้าสู่ระบบ
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Row({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-bold break-all" data-testid={testid}>{value}</dd>
    </div>
  );
}