/**
 * แจ้งเตือนเด้ง + จำสถานะการอนุญาตแบบถาวร
 *
 * เบราว์เซอร์เก็บสิทธิ์ Notification ไว้ต่อโดเมนอยู่แล้ว แต่ผู้ใช้มักไม่แน่ใจว่า
 * "เปิดแล้วหรือยัง" เราจึงบันทึกสถานะไว้ใน localStorage และขอสิทธิ์ให้อัตโนมัติ
 * ครั้งเดียวเมื่อผู้ใช้แตะหน้าจอครั้งแรก — ไม่ต้องกดตั้งค่าใหม่ทุกครั้งที่เปิดแอป
 *
 * บนมือถือที่ติดตั้งเป็น PWA (โดยเฉพาะ Android/iOS standalone) ตัวสร้าง
 * `new Notification()` ใช้ไม่ได้ ต้องใช้ service worker registration แทน
 */
const STORE_KEY = 'fs.notify.enabled';

export type NotifySupport = 'granted' | 'denied' | 'default' | 'unsupported';

function hasApi() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notifyPermission(): NotifySupport {
  if (!hasApi()) return 'unsupported';
  return Notification.permission as NotifySupport;
}

/** ผู้ใช้เคยกดเปิดแจ้งเตือนไว้แล้วหรือไม่ (จำข้ามการเปิดแอป) */
export function notifyOptedIn(): boolean {
  try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
}

function rememberOptIn(on: boolean) {
  try { localStorage.setItem(STORE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/** ขอสิทธิ์ (ถ้ายังไม่เคย) แล้วจำผลไว้ — เรียกซ้ำได้ ไม่เด้งถามซ้ำเมื่อ granted */
export async function ensureNotificationsEnabled(): Promise<NotifySupport> {
  if (!hasApi()) return 'unsupported';
  if (Notification.permission === 'granted') { rememberOptIn(true); return 'granted'; }
  if (Notification.permission === 'denied') { rememberOptIn(false); return 'denied'; }
  try {
    const res = await Notification.requestPermission();
    rememberOptIn(res === 'granted');
    return res as NotifySupport;
  } catch {
    return 'default';
  }
}

/** เดิม: ขอสิทธิ์เมื่อผู้ใช้มีปฏิสัมพันธ์ (คงชื่อไว้ให้โค้ดเดิมเรียกได้) */
export function requestDesktopNotifyPermission() {
  void ensureNotificationsEnabled();
}

/**
 * ติดตั้งครั้งเดียวตอนเปิดแอป: ถ้าผู้ใช้เคยเปิดแจ้งเตือนไว้ ให้ปลุกสิทธิ์คืน
 * อัตโนมัติเมื่อมีการแตะหน้าจอครั้งแรก (บางเบราว์เซอร์บังคับให้ขอในท่าทางผู้ใช้)
 */
export function armPersistentNotifications() {
  if (!hasApi()) return () => {};
  if (Notification.permission === 'granted') { rememberOptIn(true); return () => {}; }
  if (!notifyOptedIn()) return () => {};
  const once = () => { void ensureNotificationsEnabled(); cleanup(); };
  const cleanup = () => {
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once, { once: true });
  window.addEventListener('keydown', once, { once: true });
  return cleanup;
}

export function showDesktopNotification(title: string, body: string, onClick?: () => void, icon?: string | null) {
  if (!hasApi()) return;
  if (Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) return;
  const options: NotificationOptions = {
    body,
    tag: 'film-inbox',
    icon: icon ?? '/favicon.ico',
    badge: '/favicon.ico',
  };
  // PWA ที่ติดตั้งแล้วต้องใช้ service worker — ลองทางนี้ก่อนเสมอ
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration()
      .then((reg) => {
        if (reg) return reg.showNotification(title, options);
        throw new Error('no-sw');
      })
      .catch(() => fallbackNotification(title, options, onClick));
    return;
  }
  fallbackNotification(title, options, onClick);
}

function fallbackNotification(title: string, options: NotificationOptions, onClick?: () => void) {
  try {
    const n = new Notification(title, options);
    if (onClick) n.onclick = () => { window.focus(); onClick(); };
  } catch {
    /* ignore — ระบบไม่รองรับการแจ้งเตือนแบบนี้ */
  }
}

/**
 * ส่งแจ้งเตือนทดสอบแบบบังคับ (ไม่ข้ามแม้หน้าจอเปิดอยู่) และคืนช่องทางที่ใช้จริง
 * ใช้ในหน้าทดสอบสถานะการแจ้งเตือนบนมือถือ
 */
export async function sendTestNotification(
  title: string,
  body: string,
): Promise<{ ok: boolean; via: 'service-worker' | 'constructor' | 'none'; reason?: string }> {
  if (!hasApi()) return { ok: false, via: 'none', reason: 'อุปกรณ์/เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน' };
  if (Notification.permission !== 'granted') {
    return { ok: false, via: 'none', reason: 'ยังไม่ได้อนุญาตการแจ้งเตือน' };
  }
  const options: NotificationOptions = {
    body,
    tag: 'fs-notify-test',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
  };
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return { ok: true, via: 'service-worker' };
      }
    } catch {
      /* ลองช่องทางสำรองต่อ */
    }
  }
  try {
    // eslint-disable-next-line no-new
    new Notification(title, options);
    return { ok: true, via: 'constructor' };
  } catch (e) {
    return { ok: false, via: 'none', reason: (e as Error)?.message || 'ส่งแจ้งเตือนไม่สำเร็จ' };
  }
}

/** สถานะสภาพแวดล้อมของอุปกรณ์สำหรับหน้าทดสอบ */
export function notifyEnvironment() {
  const w = typeof window !== 'undefined' ? window : undefined;
  const standalone = !!(
    w?.matchMedia?.('(display-mode: standalone)').matches ||
    (w?.navigator as unknown as { standalone?: boolean })?.standalone
  );
  return {
    supported: hasApi(),
    permission: notifyPermission(),
    optedIn: notifyOptedIn(),
    secureContext: typeof w !== 'undefined' ? w.isSecureContext : false,
    standalone,
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    vibrate: typeof navigator !== 'undefined' && 'vibrate' in navigator,
    iOS: typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent),
  };
}