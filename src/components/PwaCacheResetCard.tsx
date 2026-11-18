import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2, Loader2, HardDriveDownload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { forceUpdateApp, readSwCacheStatus, refreshAppAssets, type SwCacheStatus } from "@/lib/appUpdate";

/**
 * "รีเซ็ตแคชเว็บแอป (PWA)" — user-facing recovery from a stale installed shell,
 * so nobody has to know about the `?sw=off` kill switch.
 *
 * Two levels, both leaving localStorage / IndexedDB (login, parked bills,
 * print settings) untouched:
 *  - โหลดเวอร์ชันล่าสุด → drop asset caches + activate the waiting worker
 *  - ล้างแคชทั้งหมด     → unregister every service worker + delete every cache
 */
export default function PwaCacheResetCard({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<SwCacheStatus | null>(null);
  const [busy, setBusy] = useState<null | "refresh" | "reset">(null);

  useEffect(() => {
    let alive = true;
    void readSwCacheStatus().then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);

  const cacheCount = status?.caches.length ?? 0;
  const entryCount = (status?.caches ?? []).reduce((n, c) => n + Math.max(0, c.entries), 0);

  return (
    <section
      className={`bg-card rounded-2xl border border-border shadow-card p-5 space-y-3 ${className}`}
      data-testid="pwa-cache-reset-card"
    >
      <div className="flex items-start gap-2">
        <HardDriveDownload className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <h2 className="font-bold">รีเซ็ตแคชเว็บแอป (PWA)</h2>
          <p className="text-sm text-muted-foreground">
            ถ้าหน้าจอค้างอยู่ที่เวอร์ชันเก่า เปิดแล้วไม่อัปเดต หรือหน้าขาว ให้กดปุ่มด้านล่างเพื่อล้างไฟล์ที่ค้างในเครื่อง
            ข้อมูลการเข้าสู่ระบบ บิลพัก และการตั้งค่าการพิมพ์จะไม่ถูกลบ
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="pwa-cache-summary">
        แคชในเครื่องตอนนี้: {cacheCount} ชุด / {entryCount} ไฟล์
        {status && !status.supported && " (เบราว์เซอร์นี้ไม่รองรับ Service Worker)"}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="rounded-xl"
          data-testid="pwa-cache-refresh"
          disabled={busy !== null}
          onClick={() => { setBusy("refresh"); void refreshAppAssets(); }}
        >
          {busy === "refresh" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          โหลดเวอร์ชันล่าสุด
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="rounded-xl" data-testid="pwa-cache-reset" disabled={busy !== null}>
              {busy === "reset" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              ล้างแคชทั้งหมด
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ล้างแคชเว็บแอปทั้งหมด?</AlertDialogTitle>
              <AlertDialogDescription>
                ระบบจะถอน Service Worker และลบไฟล์แคชทั้งหมด แล้วโหลดแอปใหม่ทันที
                คุณจะไม่ถูกออกจากระบบ และข้อมูลที่บันทึกไว้ในเครื่องจะยังอยู่ครบ
                ครั้งแรกหลังล้างอาจโหลดช้ากว่าปกติเล็กน้อย
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                data-testid="pwa-cache-reset-confirm"
                onClick={() => { setBusy("reset"); void forceUpdateApp(); }}
              >
                ล้างแคชและโหลดใหม่
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}