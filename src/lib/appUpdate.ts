/**
 * "โหลดเวอร์ชันล่าสุด" — force the installed PWA off a stale shell.
 *
 * Only *asset* caches are dropped (workbox precache + our runtime asset
 * caches). Business data, auth tokens and anything in localStorage /
 * IndexedDB are deliberately left untouched, so a cashier never gets logged
 * out or loses parked bills by pressing the button.
 */

import { claimUpdateReload } from "./reloadGuard";

/**
 * Runtime cache buckets that only ever hold build output. Never data or auth.
 *
 * The Workbox *precache* is deliberately NOT listed: it backs the navigation
 * fallback (`navigateFallback: "/index.html"`). Deleting it under a still-
 * registered service worker leaves navigations with no fallback entry, which
 * is exactly the "old page / blank page that never updates" symptom on iOS
 * Safari and the LINE in-app browser. The precache is replaced by the new
 * service worker instead (`cleanupOutdatedCaches`).
 */
const ASSET_CACHE_MATCH = [
  /^static-assets$/,
  /^pwa-assets$/,
  /^html-nav$/,
  /^images$/,
];

function isAssetCache(name: string): boolean {
  return ASSET_CACHE_MATCH.some((re) => re.test(name));
}

/** Test seam: which of the given cache names would be deleted. */
export function assetCacheNames(names: string[]): string[] {
  return names.filter(isAssetCache);
}

const BUILD_TAG_KEY = "app:build-tag";

/**
 * ล้างแคช *ไฟล์ build* หนึ่งครั้งเมื่อเปิดแอปด้วยเวอร์ชันใหม่
 *
 * ทำงานตอนเริ่มแอป: ถ้า tag ที่คอมไพล์มากับ bundle ต่างจากที่เคยบันทึกไว้
 * แปลว่าเพิ่งอัปเดต จึงทิ้งเฉพาะแคชไฟล์ static/HTML ที่อาจค้างของเก่า
 * — ไม่แตะ workbox precache (navigation fallback), ไม่แตะ localStorage /
 * IndexedDB จึงไม่ทำให้หลุดล็อกอินหรือวนกลับหน้าล็อกอิน และไม่รีโหลดซ้ำ
 */
export async function syncBuildCaches(runningTag: string): Promise<boolean> {
  if (typeof window === "undefined" || !runningTag) return false;
  let previous: string | null = null;
  try { previous = window.localStorage.getItem(BUILD_TAG_KEY); } catch { return false; }
  if (previous === runningTag) return false;
  try { window.localStorage.setItem(BUILD_TAG_KEY, runningTag); } catch { /* ignore */ }
  if (!previous) return false; // ครั้งแรกบนเครื่องนี้ — ไม่มีของเก่าให้ล้าง
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.allSettled(assetCacheNames(names).map((n) => caches.delete(n)));
    }
  } catch {
    /* ignore */
  }
  return true;
}

export async function refreshAppAssets(): Promise<void> {
  // A refresh must never be able to trap the phone in a reload loop; if the
  // budget for this minute is used up the app just keeps running.
  if (typeof window !== "undefined" && !claimUpdateReload()) return;
  // 1. Pull the newest service worker and hand control to it. Without this a
  //    freshly installed worker can sit in "waiting" forever while the phone
  //    keeps rendering the previous shell.
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
      for (const reg of regs) {
        const waiting = reg.waiting;
        if (waiting) {
          try { waiting.postMessage({ type: "SKIP_WAITING" }); } catch { /* ignore */ }
        }
      }
      // give the new worker a moment to take over before we reload
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } catch {
    /* ignore */
  }
  // 2. Drop only the runtime asset buckets, so a stale hashed chunk or a stale
  //    HTML navigation response can never be replayed. Business data, auth
  //    tokens, parked bills and the offline queue are untouched.
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(assetCacheNames(names).map((n) => caches.delete(n)));
    }
  } catch {
    /* cache API unavailable — the reload below is still worth doing */
  }
  if (typeof window !== "undefined") {
    const u = new URL(window.location.href);
    // A cache-buster in the address bar survives every later navigation and
    // makes shared/bookmarked links ugly — strip any previous one and use a
    // plain reload; the SW swap above is what actually delivers new assets.
    u.searchParams.delete("v");
    window.location.replace(u.toString());
  }
}

/**
 * "บังคับอัปเดต" — the heavy hammer: unregister every service worker and drop
 * every Cache Storage bucket, then hard-reload. localStorage / IndexedDB (auth
 * session, parked bills, POS settings) are deliberately untouched.
 */
export async function forceUpdateApp(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.allSettled(names.map((n) => caches.delete(n)));
    }
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    const u = new URL(window.location.href);
    u.searchParams.set("v", Date.now().toString(36));
    window.location.replace(u.toString());
  }
}

export type SwCacheStatus = {
  supported: boolean;
  registrations: { scriptURL: string; state: string; scope: string }[];
  controlled: boolean;
  caches: { name: string; entries: number }[];
  standalone: boolean;
  online: boolean;
};

/** Snapshot of what the browser currently holds — powers the POS debug bar. */
export async function readSwCacheStatus(): Promise<SwCacheStatus> {
  const status: SwCacheStatus = {
    supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    registrations: [],
    controlled: typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? !!navigator.serviceWorker.controller
      : false,
    caches: [],
    standalone:
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true),
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
  };
  try {
    if (status.supported) {
      const regs = await navigator.serviceWorker.getRegistrations();
      status.registrations = regs.map((r) => {
        const w = r.active ?? r.waiting ?? r.installing;
        return {
          scriptURL: w?.scriptURL ?? "-",
          state: r.waiting ? "waiting (มีเวอร์ชันใหม่รอ)" : (w?.state ?? "unknown"),
          scope: r.scope,
        };
      });
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      status.caches = await Promise.all(
        names.map(async (name) => {
          try {
            const c = await caches.open(name);
            return { name, entries: (await c.keys()).length };
          } catch {
            return { name, entries: -1 };
          }
        }),
      );
    }
  } catch {
    /* ignore */
  }
  return status;
}
