import { useEffect, useState } from "react";
import { isStandaloneDisplay, logPwa } from "@/lib/pwaDiagnostics";

export type PwaInstallState = {
  /** กำลังเปิดจากไอคอนบนหน้าจอโฮม (standalone) */
  standalone: boolean;
  /** ระบบยืนยันว่าติดตั้งแอปนี้ไว้แล้ว (Chrome: getInstalledRelatedApps / event appinstalled) */
  installed: boolean;
  /** ตรวจครั้งล่าสุดเมื่อไร — ใช้แสดงว่าอัปเดตเรียลไทม์จริง */
  checkedAt: number;
};

async function relatedAppInstalled(): Promise<boolean> {
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  if (typeof nav.getInstalledRelatedApps !== "function") return false;
  try {
    const apps = await nav.getInstalledRelatedApps();
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return false;
  }
}

/**
 * สถานะการติดตั้ง PWA แบบเรียลไทม์:
 * ฟัง display-mode, appinstalled, การกลับมาโฟกัสหน้า และ poll เบา ๆ
 * เพื่อให้การ์ดบนหน้า /install/admin เปลี่ยนสถานะเองทันทีหลังผู้ใช้ติดตั้ง
 */
export function usePwaInstalled(pollMs = 2000): PwaInstallState {
  const [state, setState] = useState<PwaInstallState>(() => ({
    standalone: isStandaloneDisplay(),
    installed: isStandaloneDisplay(),
    checkedAt: Date.now(),
  }));

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      const sa = isStandaloneDisplay();
      const related = sa ? true : await relatedAppInstalled();
      if (!alive) return;
      setState((prev) => {
        const next = { standalone: sa, installed: sa || related, checkedAt: Date.now() };
        if (next.installed && !prev.installed) logPwa("info", "install_detected", sa ? "standalone" : "related app");
        return next;
      });
    };

    void refresh();

    const mq = window.matchMedia?.("(display-mode: standalone)");
    const onMq = () => void refresh();
    mq?.addEventListener?.("change", onMq);
    window.addEventListener("appinstalled", onMq);
    window.addEventListener("focus", onMq);
    document.addEventListener("visibilitychange", onMq);
    const timer = window.setInterval(onMq, pollMs);

    return () => {
      alive = false;
      mq?.removeEventListener?.("change", onMq);
      window.removeEventListener("appinstalled", onMq);
      window.removeEventListener("focus", onMq);
      document.removeEventListener("visibilitychange", onMq);
      window.clearInterval(timer);
    };
  }, [pollMs]);

  return state;
}
