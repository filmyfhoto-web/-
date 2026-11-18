/**
 * Warm the offline cache for the pages people open when the shop's internet
 * drops: the app shell, the storefront and the customer job-order link.
 * Runs once per session, only when a service worker is actually controlling
 * the page (published app) and the device is online.
 */
const WARM_PATHS = ["/", "/cart", "/shop", "/pos/register"];
const FLAG = "pwa.warmed.v1";

export function warmOfflineCache(paths: string[] = WARM_PATHS): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!navigator.onLine || !navigator.serviceWorker.controller) return;
  try {
    if (sessionStorage.getItem(FLAG)) return;
    sessionStorage.setItem(FLAG, "1");
  } catch { /* private mode — warm anyway */ }

  const run = () => {
    for (const p of paths) {
      // A navigate-mode fetch populates the NetworkFirst "html-nav" cache.
      void fetch(p, { mode: "same-origin", credentials: "same-origin", cache: "no-cache" }).catch(() => {});
    }
  };
  if ("requestIdleCallback" in window) (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(run);
  else setTimeout(run, 3000);
}
