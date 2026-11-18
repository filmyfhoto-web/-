/**
 * กู้เครื่องที่ "ค้างเวอร์ชันเก่า" — ลูกค้าเปิดลิงก์แล้วยังเห็นหน้าเดิมของบิลด์เก่า
 *
 * ปกติ service worker + `syncBuildCaches` จัดการอัปเดตให้อยู่แล้ว แต่บางเครื่อง
 * (SW เก่าที่แคช index.html แบบ cache-first, iOS Safari, LINE in-app browser)
 * ติดอยู่กับ shell เดิมและรีโหลดธรรมดาก็ยังได้ของเก่า
 *
 * ตรรกะ: เทียบ tag ที่คอมไพล์มากับ `/version.json`
 *   - ต่างกันครั้งแรก  → รีโหลดเบา ๆ หนึ่งครั้ง (ปกติ SW ตัวใหม่จะเข้าคุมพอดี)
 *   - ต่างกันซ้ำอีก    → ถอน service worker + ลบแคชทั้งหมด + รีโหลดพร้อม cache-buster
 *
 * ไม่แตะ localStorage / IndexedDB → ไม่มีใครหลุดล็อกอินหรือเสียงานที่ค้างไว้
 */
import { fetchRemoteBuild, isNewerBuild, RUNNING_TAG } from "./buildUpdate";
import { claimUpdateReload } from "./reloadGuard";
import { logPwa } from "./pwaDiagnostics";

const ATTEMPT_KEY = "app:stale-shell-attempt";

export type RescueAction = "none" | "reload" | "purge";

/**
 * แกนตัดสินใจแบบบริสุทธิ์ (เทสต์ได้โดยไม่ต้องมีเบราว์เซอร์)
 *
 * นโยบายปัจจุบัน: พบบิลด์ใหม่เมื่อไหร่ "ล้างของเก่าทิ้งทันที" ไม่รอรอบสอง
 * เพื่อไม่ให้ไฟล์เวอร์ชันเก่าค้างในเครื่องลูกค้าอีกต่อไป
 * @param remoteTag tag ที่เซิร์ฟเวอร์ประกาศใน /version.json
 * @param runningTag tag ของบันเดิลที่กำลังรันอยู่
 * @param _priorAttempt เก็บไว้เพื่อความเข้ากันได้ย้อนหลัง (ไม่ใช้ตัดสินใจแล้ว)
 */
export function decideRescue(
  remoteTag: string | null | undefined,
  runningTag: string,
  _priorAttempt?: string | null,
): RescueAction {
  if (!isNewerBuild(remoteTag, runningTag)) return "none";
  return "purge";
}


/** ลบแคชไฟล์ทั้งหมดและถอน service worker ของเราออก (ไม่แตะข้อมูลผู้ใช้) */
export async function purgeShell(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.allSettled(names.map((n) => caches.delete(n)));
    }
  } catch { /* ignore */ }
}

/** URL สำหรับรีโหลดแบบเลี่ยงแคช HTTP ของเบราว์เซอร์ */
export function cacheBustedUrl(href: string, tag: string): string {
  try {
    const u = new URL(href);
    u.searchParams.set("v", tag.replace(/[^\w.-]/g, "").slice(0, 40));
    return u.toString();
  } catch {
    return href;
  }
}

/**
 * เรียกครั้งเดียวตอนบูตแอปที่เผยแพร่แล้ว
 * เว้นการทำงานในพรีวิว/เดฟ เพราะที่นั่นไม่มี /version.json ที่เทียบได้
 */
export async function rescueStaleShell(runningTag: string = RUNNING_TAG): Promise<RescueAction> {
  if (typeof window === "undefined") return "none";
  const remote = await fetchRemoteBuild();
  const remoteTag = remote?.tag ?? null;

  let prior: string | null = null;
  try { prior = sessionStorage.getItem(ATTEMPT_KEY); } catch { /* ignore */ }

  const action = decideRescue(remoteTag, runningTag, prior);
  if (action === "none") return "none";

  try { sessionStorage.setItem(ATTEMPT_KEY, remoteTag as string); } catch { /* ignore */ }

  if (!claimUpdateReload()) {
    logPwa("warn", "stale_shell_budget_exhausted", `${runningTag} → ${remoteTag}`);
    return "none";
  }

  if (action === "purge") {
    logPwa("warn", "stale_shell_purge", `${runningTag} → ${remoteTag}`);
    await purgeShell();
    window.location.replace(cacheBustedUrl(window.location.href, remoteTag as string));
    return "purge";
  }

  logPwa("info", "stale_shell_reload", `${runningTag} → ${remoteTag}`);
  window.location.reload();
  return "reload";
}
