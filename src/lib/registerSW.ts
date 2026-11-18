/**
 * Single guarded service-worker registration point.
 *
 * Service workers are browser-held state: registering one inside the Lovable
 * preview/dev iframe would keep serving stale HTML and deleted chunks. So we
 * register only in the published app, and actively unregister anywhere else.
 */
import { logPwa } from "./pwaDiagnostics";
import { claimUpdateReload } from "./reloadGuard";

const SW_URL = "/sw.js";

/** Poll interval for installed apps that stay open for days. */
const SW_UPDATE_POLL_MS = 5 * 60 * 1000;

/**
 * อัปเดตแบบลื่นไหลผ่าน Service Worker:
 * ดึงเวอร์ชันใหม่ → สั่ง skipWaiting → worker ใหม่เข้าคุม → `controllerchange`
 * รีโหลดครั้งเดียวโดยไม่ต้องล้างแคชหรือใส่ query cache-buster
 *
 * คืนค่า true เมื่อมี service worker ที่จัดการให้ได้ (ผู้เรียกไม่ต้องรีโหลดเอง)
 */
export async function applyServiceWorkerUpdate(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const ours = regs.filter((r) => (r.active || r.waiting || r.installing)?.scriptURL.endsWith(SW_URL));
    if (!ours.length) return false;
    await Promise.allSettled(ours.map((r) => r.update()));
    let waiting = false;
    for (const reg of ours) {
      if (reg.waiting) {
        waiting = true;
        try { reg.waiting.postMessage({ type: "SKIP_WAITING" }); } catch { /* ignore */ }
      }
    }
    logPwa("info", "sw_update_applied", waiting ? "skip waiting" : "no waiting worker");
    return waiting;
  } catch (e) {
    logPwa("error", "sw_update_failed", (e as Error).message);
    return false;
  }
}

function hostIsPreview(host: string) {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

function inIframe() {
  try { return window.self !== window.top; } catch { return true; }
}

async function unregisterOurSW(reason: string) {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const ours = regs.filter((r) => (r.active || r.waiting || r.installing)?.scriptURL.endsWith(SW_URL));
    if (ours.length) {
      await Promise.allSettled(ours.map((r) => r.unregister()));
      logPwa("warn", "sw_unregistered", reason);
    }
  } catch (e) {
    logPwa("error", "sw_unregister_failed", (e as Error).message);
  }
}

export function registerAppServiceWorker(onNeedRefresh?: () => void) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const killSwitch = new URLSearchParams(window.location.search).has("sw")
    && new URLSearchParams(window.location.search).get("sw") === "off";

  const refuse =
    !import.meta.env.PROD ||
    inIframe() ||
    hostIsPreview(window.location.hostname) ||
    killSwitch;

  if (refuse) {
    void unregisterOurSW(
      killSwitch ? "?sw=off" : !import.meta.env.PROD ? "dev build" : inIframe() ? "iframe preview" : "preview host",
    );
    return;
  }

  // Loaded lazily so dev/preview bundles never pull in the virtual module.
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      // A new service worker taking control means fresh assets are live:
      // reload **once** so the installed app never keeps showing the old
      // build. Two guards keep this from looping on mobile:
      //  1. `hadController` — with `clientsClaim` the very first install also
      //     fires `controllerchange`; reloading there would restart every
      //     first visit for no reason.
      //  2. `claimUpdateReload()` — a hard budget of reloads per minute, so a
      //     shell that keeps mis-detecting an update can never trap the user.
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        if (!hadController) {
          logPwa("info", "sw_controller_first_install", "no reload on first control");
          return;
        }
        if (!claimUpdateReload()) {
          logPwa("warn", "sw_reload_budget_exhausted", "skipping reload to avoid a loop");
          return;
        }
        reloading = true;
        logPwa("info", "sw_controller_changed", "reloading for new version");
        window.location.reload();
      });

      const updateSW = registerSW({
        immediate: true,
        onRegisteredSW: (url, reg) => {
          logPwa("info", "sw_registered", url);
          if (!reg) return;
          // Installed PWAs stay open for days; poll so a deploy is picked up
          // without the user having to force-quit the app.
          const check = () => { void reg.update().catch(() => {}); };
          setInterval(check, SW_UPDATE_POLL_MS);
          window.addEventListener("focus", check);
          window.addEventListener("online", check);
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") check();
          });
        },
        onRegisterError: (err: unknown) => logPwa("error", "sw_register_failed", String((err as Error)?.message ?? err)),
        onNeedRefresh: () => {
          logPwa("info", "sw_update_available");
          // skipWaiting is on, but activate it explicitly in case the waiting
          // worker was installed by an older build without it.
          void updateSW(true).catch(() => onNeedRefresh?.());
        },
        onOfflineReady: () => logPwa("info", "sw_offline_ready"),
      });
    })
    .catch((e) => logPwa("error", "sw_module_load_failed", (e as Error).message));
}