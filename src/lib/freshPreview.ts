/**
 * เปิด "ดูตัวอย่างแอพ" ให้ได้เวอร์ชันล่าสุดเสมอ
 *
 * แท็บที่เปิดจาก PWA/มือถือมักถูก service worker หรือ bfcache ให้หน้าเดิม
 * จึงบังคับอัปเดต service worker ก่อน แล้วเปิดลิงก์พร้อม query ที่ไม่ซ้ำ
 * เพื่อให้เบราว์เซอร์ดึง HTML ใหม่จากเครือข่ายจริง ๆ
 */
import { applyServiceWorkerUpdate } from "./registerSW";

/** `/shop` → `/shop?fresh=1723300000000` */
export function freshUrl(path: string): string {
  const u = new URL(path, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  u.searchParams.set("fresh", String(Date.now()));
  return u.pathname + u.search + u.hash;
}

/** เปิดหน้าตัวอย่างในแท็บใหม่แบบไม่ติดแคช */
export function openFreshPreview(path: string) {
  const href = freshUrl(path);
  // เปิดแท็บทันที (กัน popup blocker) แล้วค่อยสั่งอัปเดต service worker เบื้องหลัง
  const win = typeof window !== "undefined" ? window.open(href, "_blank", "noopener") : null;
  void applyServiceWorkerUpdate().catch(() => {});
  return win;
}
