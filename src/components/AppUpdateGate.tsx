import { useEffect, useRef, useState } from "react";
import { RefreshCw, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RUNNING_TAG, useBuildUpdate } from "@/lib/buildUpdate";
import { forceUpdateApp, refreshAppAssets } from "@/lib/appUpdate";

import { applyServiceWorkerUpdate } from "@/lib/registerSW";
import { markAutoUpdateApplied, readDomBlockers, shouldAutoUpdate } from "@/lib/autoUpdate";

function appLabel(pathname: string): string {
  if (pathname.startsWith("/pos") || pathname.startsWith("/receipts")) return "POS";
  if (pathname.startsWith("/admin")) return "แอดมิน";
  if (pathname.startsWith("/staff") || pathname === "/portal") return "พนักงาน";
  return "ลูกค้า";
}

/**
 * อัปเดตแบบลื่นไหล: ให้ Service Worker สลับเป็นเวอร์ชันใหม่ก่อน
 * (worker ใหม่เข้าคุม → รีโหลดครั้งเดียวเอง) ถ้าไม่มี SW ค่อยล้างแคชเอง
 */
async function smoothUpdate(): Promise<void> {
  try {
    const handled = await applyServiceWorkerUpdate();
    if (handled) {
      // controllerchange จะรีโหลดให้เอง — แต่ถ้าไม่เกิดขึ้นภายใน 8 วินาที
      // (พบบ่อยบน iOS PWA) ให้ล้างแคชไฟล์แล้วโหลดใหม่เอง แทนที่จะค้าง
      window.setTimeout(() => { void refreshAppAssets(); }, 8_000);
      return;
    }
    await refreshAppAssets();
  } catch {
    /* อัปเดตล้มเหลว = ใช้เวอร์ชันเดิมต่อได้ ห้ามค้างหน้าจอ */
  }
}

/** Persistent update recovery for every app surface, including installed PWAs. */
export default function AppUpdateGate() {
  // ตรวจเวอร์ชันถี่ขึ้น (20 วิ) + ตรวจซ้ำทุกครั้งที่กลับมาโฟกัสแท็บ (มีอยู่ใน hook)
  const { remoteTag, hasUpdate } = useBuildUpdate(20 * 1000);

  const [open, setOpen] = useState(false);
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  const lastActive = useRef(Date.now());
  // In-memory twin of the sessionStorage guard: never auto-reload twice for
  // the *same* build — but a later deploy must still reach this device.
  const firedForTag = useRef<string | null>(null);
  // The touch register holds an in-memory cart; never reload it silently.
  const autoUpdateAllowed = !pathname.startsWith("/pos/register");

  // Auto-apply a new build as soon as the screen is briefly idle and no
  // dialog / unsaved form would lose work — no banner, no user action.
  useEffect(() => {
    const bump = () => { lastActive.current = Date.now(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const id = window.setInterval(() => {
      if (!autoUpdateAllowed) return;
      if (remoteTag && firedForTag.current === remoteTag) return;
      const ok = shouldAutoUpdate({
        hasUpdate,
        targetTag: remoteTag,
        idleMs: Date.now() - lastActive.current,
        visible: document.visibilityState === "visible",
        online: navigator.onLine !== false,
        ...readDomBlockers(),
      });
      if (ok) {
        firedForTag.current = remoteTag;
        markAutoUpdateApplied(remoteTag);
        void smoothUpdate();
      }
    }, 3_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(id);
    };
  }, [hasUpdate, remoteTag, autoUpdateAllowed]);

  // เปิดกล่องข้อมูลเวอร์ชันได้จากแผง "ปรับหน้าจอ" (ไม่มีป้ายลอยบนหน้าจอแล้ว)
  useEffect(() => {
    const openDialog = () => setOpen(true);
    window.addEventListener("ui:open-update-dialog", openDialog);
    return () => window.removeEventListener("ui:open-update-dialog", openDialog);
  }, []);

  // The touch register already has its richer always-visible diagnostics.
  if (pathname === "/pos/register") return null;

  return (
    <>



      {open && (
        <div className="fixed inset-0 z-[110] grid place-items-end bg-foreground/30 p-3 sm:place-items-center" role="presentation">
          <section className="w-full max-w-md rounded-md border bg-background p-4 text-foreground shadow-xl" role="dialog" aria-modal="true" aria-labelledby="update-gate-title" data-testid="global-update-dialog">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="update-gate-title" className="font-bold">เวอร์ชันแอป {appLabel(pathname)}</h2>
                <p className="mt-1 break-all text-xs text-muted-foreground">ใช้อยู่: {RUNNING_TAG}</p>
                <p className="break-all text-xs text-muted-foreground">บนระบบ: {remoteTag ?? "ยังตรวจไม่พบ"}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="ปิด">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button onClick={() => void smoothUpdate()} data-testid="global-refresh-assets">
                <RefreshCw className="h-4 w-4" /> โหลดเวอร์ชันล่าสุด
              </Button>
              <Button variant="destructive" onClick={() => void forceUpdateApp()} data-testid="global-force-update">
                <ShieldAlert className="h-4 w-4" /> บังคับอัปเดต
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">ไม่ลบข้อมูลการขาย บิลที่พัก หรือสถานะการเข้าสู่ระบบ</p>
          </section>
        </div>
      )}
    </>
  );
}