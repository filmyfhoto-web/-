/**
 * PWA install diagnostics.
 *
 * Installability fails silently on phones (wrong manifest, LINE in-app
 * browser, http, iframe...). We keep a small ring buffer of events in
 * localStorage plus a one-shot health check so support can see *why*.
 */
export type PwaLogLevel = "info" | "warn" | "error";

export type PwaLogEntry = {
  t: string;          // ISO timestamp
  level: PwaLogLevel;
  event: string;
  detail?: string;
  ua?: string;
  path?: string;
};

const KEY = "pwa_diag_log_v1";
const MAX = 50;

export function readPwaLog(): PwaLogEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as PwaLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearPwaLog() {
  try { localStorage.removeItem(KEY); } catch { /* storage disabled */ }
}

export function logPwa(level: PwaLogLevel, event: string, detail?: string) {
  const entry: PwaLogEntry = {
    t: new Date().toISOString(),
    level,
    event,
    detail,
    ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : undefined,
    path: typeof location !== "undefined" ? location.pathname : undefined,
  };
  try {
    const next = [...readPwaLog(), entry].slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage disabled (private mode) — console only */ }
  const line = `[pwa] ${event}${detail ? ` — ${detail}` : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
  return entry;
}

export function isInAppBrowserUA(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  return /\bLine\/|FBAN|FBAV|Instagram|MicroMessenger|Twitter/i.test(ua);
}

export function isIOSUA(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  return /iphone|ipad|ipod/i.test(ua);
}

export type PwaHealth = {
  manifestHref: string | null;
  manifestOk: boolean;
  manifestError?: string;
  iconsOk: boolean;
  iconsError?: string;
  serviceWorkerSupported: boolean;
  serviceWorkerActive: boolean;
  secureContext: boolean;
  inIframe: boolean;
  inAppBrowser: boolean;
  standalone: boolean;
  installPromptSeen: boolean;
  blockers: string[];
};

let sawInstallPrompt = false;
export function markInstallPromptSeen() { sawInstallPrompt = true; }

function inIframe() {
  try { return window.self !== window.top; } catch { return true; }
}

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Fetch the currently linked manifest + icons and report what is broken. */
export async function checkPwaHealth(): Promise<PwaHealth> {
  const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute("href") ?? null;
  const health: PwaHealth = {
    manifestHref: href,
    manifestOk: false,
    iconsOk: false,
    serviceWorkerSupported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    serviceWorkerActive: false,
    secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    inIframe: inIframe(),
    inAppBrowser: isInAppBrowserUA(),
    standalone: isStandaloneDisplay(),
    installPromptSeen: sawInstallPrompt,
    blockers: [],
  };

  if (!href) {
    health.manifestError = "ไม่พบ <link rel=manifest> ในหน้านี้";
    logPwa("error", "manifest_missing_link");
  } else {
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      health.manifestOk = true;
      const icons: { src?: string }[] = Array.isArray(json.icons) ? json.icons : [];
      if (!icons.length) {
        health.iconsError = "manifest ไม่มีไอคอน";
      } else {
        const results = await Promise.all(
          [...new Set(icons.map((i) => i.src).filter(Boolean) as string[])].map(async (src) => {
            try {
              const r = await fetch(src, { method: "GET", cache: "no-store" });
              return r.ok ? null : `${src} → HTTP ${r.status}`;
            } catch (e) {
              return `${src} → ${(e as Error).message}`;
            }
          }),
        );
        const bad = results.filter(Boolean) as string[];
        health.iconsOk = bad.length === 0;
        if (bad.length) health.iconsError = bad.join(", ");
      }
    } catch (e) {
      health.manifestError = (e as Error).message;
      logPwa("error", "manifest_fetch_failed", `${href}: ${(e as Error).message}`);
    }
  }

  if (health.serviceWorkerSupported) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      health.serviceWorkerActive = regs.some((r) => !!r.active);
    } catch { /* ignore */ }
  }

  if (!health.manifestOk) health.blockers.push("manifest โหลดไม่สำเร็จ");
  if (health.manifestOk && !health.iconsOk) health.blockers.push("ไอคอนแอปโหลดไม่ได้");
  if (!health.secureContext) health.blockers.push("ต้องเปิดผ่าน HTTPS");
  if (health.inIframe) health.blockers.push("อยู่ใน iframe (พรีวิว) — ติดตั้งไม่ได้");
  if (health.inAppBrowser) health.blockers.push("เบราว์เซอร์ในแอป (เช่น LINE) — ต้องเปิดใน Safari/Chrome");

  if (health.blockers.length) logPwa("warn", "install_blocked", health.blockers.join(" | "));
  else logPwa("info", "health_ok", href ?? "");

  return health;
}

export function formatPwaLog(entries: PwaLogEntry[] = readPwaLog()) {
  return entries
    .map((e) => `${e.t} [${e.level}] ${e.event}${e.detail ? ` — ${e.detail}` : ""}${e.path ? ` (${e.path})` : ""}`)
    .join("\n");
}