/**
 * บังคับให้หน้า "สำคัญ" ของหลังร้านเปิดด้วยไฟล์เวอร์ชันล่าสุดเสมอ
 *
 * ปกติ `AppUpdateGate` จะรออยู่เฉย ๆ จนหน้าจอว่างก่อนสลับเวอร์ชัน ซึ่งบางหน้า
 * (เช่น /admin/customer-hub ที่เพิ่งปล่อยใหม่) ผู้ใช้เปิดแล้วยังได้ shell เก่า
 * ค้างอยู่ ฮุคนี้เช็ก /version.json ทันทีตอนเข้าหน้า และถ้าเซิร์ฟเวอร์มีบิลด์ใหม่
 * ก็ล้างแคชไฟล์ + สลับ service worker แล้วรีโหลดครั้งเดียว
 * (มี reloadGuard กันวนลูป และไม่แตะ localStorage/เซสชันล็อกอิน)
 */
import { useEffect, useRef, useState } from "react";
import { fetchRemoteBuild, isNewerBuild, RUNNING_TAG } from "./buildUpdate";
import { refreshAppAssets } from "./appUpdate";

const SEEN_KEY = "app:fresh-build-forced";

/** ควรบังคับโหลดใหม่หรือไม่ — แกนบริสุทธิ์ เทสต์ได้โดยไม่ต้องมีเบราว์เซอร์ */
export function shouldForceFresh(
  remoteTag: string | null | undefined,
  runningTag: string,
  alreadyForcedTag: string | null,
): boolean {
  if (!isNewerBuild(remoteTag, runningTag)) return false;
  return alreadyForcedTag !== remoteTag;
}

/** ล้างแคชไฟล์เก่าและโหลดบิลด์ใหม่ (ไม่ลบข้อมูลผู้ใช้) */
export async function loadFreshBuild(): Promise<void> {
  try {
    const { applyServiceWorkerUpdate } = await import("./registerSW");
    const handled = await applyServiceWorkerUpdate();
    if (handled) {
      window.setTimeout(() => { void refreshAppAssets(); }, 5_000);
      return;
    }
  } catch { /* ignore */ }
  await refreshAppAssets();
}

/**
 * เรียกในหน้าที่ต้องได้เวอร์ชันล่าสุดแน่ ๆ
 * คืนค่า tag บนเซิร์ฟเวอร์ + สถานะว่ามีเวอร์ชันใหม่ไหม (ใช้โชว์ปุ่มสำรอง)
 */
export function useFreshBuildOnMount(runningTag: string = RUNNING_TAG) {
  const [remoteTag, setRemoteTag] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const remote = await fetchRemoteBuild();
      if (!alive || !remote?.tag) return;
      setRemoteTag(remote.tag);
      let forced: string | null = null;
      try { forced = sessionStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
      if (fired.current || !shouldForceFresh(remote.tag, runningTag, forced)) return;
      fired.current = true;
      try { sessionStorage.setItem(SEEN_KEY, remote.tag); } catch { /* ignore */ }
      await loadFreshBuild();
    };
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [runningTag]);

  return { remoteTag, hasUpdate: isNewerBuild(remoteTag, runningTag) };
}
