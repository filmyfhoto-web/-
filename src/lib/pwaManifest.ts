/**
 * Per-workspace PWA manifests.
 *
 * The three workspaces (customer storefront, staff POS, admin console) share
 * one origin, so a single manifest would let the phone install only one app.
 * Each workspace therefore gets its own manifest with a distinct `id` and
 * `start_url`; we swap `<link rel="manifest">` + `<meta name="theme-color">`
 * at runtime based on the current host mode / pathname.
 *
 * Manifest-only: no service worker, no offline caching.
 */
import { getHostMode, type HostMode } from "./hostMode";

declare const __PWA_ASSET_VERSION__: string;

/**
 * Release tag appended to the manifest + apple-touch-icon URLs so iOS
 * re-fetches them after a deploy instead of reusing the install-time copy.
 */
export const PWA_ASSET_VERSION: string = (() => {
  try {
    return typeof __PWA_ASSET_VERSION__ === "string" && __PWA_ASSET_VERSION__ ? __PWA_ASSET_VERSION__ : "dev";
  } catch {
    return "dev";
  }
})();

/** `/icon-192.png` → `/icon-192.png?v=1.1.0-8b276bab` */
export function versionedAsset(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(PWA_ASSET_VERSION)}`;
}

export type PwaApp = "customer" | "staff" | "admin" | "pos" | "receipts" | "film-shop";

export const PWA_APPS: Record<
  PwaApp,
  {
    /** `null` = this surface is deliberately NOT installable (customer). */
    manifest: string | null;
    themeColor: string;
    label: string;
    startPath: string;
    appleTitle: string;
    appleTouchIcon: string;
  }
> = {
  // Customers can install the storefront on their phone (Safari: แชร์ → เพิ่มไปยังหน้าจอโฮม).
  customer: { manifest: "/manifest-customer.webmanifest", themeColor: "#7a5a3f", label: "หน้าร้าน (ลูกค้า)", startPath: "/shop", appleTitle: "ร้านนัฐภรณ์", appleTouchIcon: "/apple-touch-icon.png" },
  staff: { manifest: "/manifest-staff.webmanifest", themeColor: "#1d4ed8", label: "แอปงานและสต๊อก (พนักงาน)", startPath: "/pos", appleTitle: "งานและสต๊อก", appleTouchIcon: "/icons/staff-apple-touch.png" },
  admin: { manifest: "/manifest-admin.webmanifest", themeColor: "#1e3a8a", label: "แอปผู้ดูแลระบบ", startPath: "/admin/home", appleTitle: "ผู้ดูแลระบบ", appleTouchIcon: "/icons/admin-apple-touch.png" },
  // Touch cash-register app — its own icon (🏪), theme and start_url so it
  // installs side by side with the staff/admin apps.
  pos: { manifest: "/manifest-pos.webmanifest", themeColor: "#ea580c", label: "POS หน้าร้าน (จอสัมผัส)", startPath: "/pos/register", appleTitle: "POS หน้าร้าน", appleTouchIcon: "/icons/pos-apple-touch.png" },
  receipts: { manifest: "/manifest-receipts.webmanifest", themeColor: "#0f766e", label: "Receipt & Delivery", startPath: "/receipts", appleTitle: "Receipt & Delivery", appleTouchIcon: "/icons/staff-apple-touch.png" },
  "film-shop": { manifest: "/manifest-film-shop.webmanifest", themeColor: "#6366f1", label: "Film Shop (งานสั่งทำ)", startPath: "/admin/home", appleTitle: "Film Shop", appleTouchIcon: "/icons/staff-apple-touch.png" },
};

/** Which workspaces may be installed as web apps (all of them today). */
export function isInstallableApp(app: PwaApp): boolean {
  return PWA_APPS[app].manifest !== null;
}

function setMeta(name: string, content: string) {
  if (typeof document === "undefined") return;
  let m = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.name = name;
    document.head.appendChild(m);
  }
  if (m.content !== content) m.content = content;
}

function removeMeta(name: string) {
  if (typeof document === "undefined") return;
  document.head.querySelector(`meta[name="${name}"]`)?.remove();
}

/**
 * Customer surfaces must never show an install banner, so we swallow
 * `beforeinstallprompt` there (a cached manifest link or an old service
 * worker could otherwise still make Chrome offer the install).
 */
let blockerAttached = false;
let installBlocked = false;
function attachInstallBlocker() {
  if (blockerAttached || typeof window === "undefined") return;
  blockerAttached = true;
  window.addEventListener(
    "beforeinstallprompt",
    (e) => { if (installBlocked) e.preventDefault(); },
    true,
  );
}

/** Test hook: is the install prompt currently suppressed? */
export function installPromptSuppressed(): boolean {
  return installBlocked;
}

const ADMIN_PATH = /^\/(admin|accept-admin)(\/|$|-)/;
/** Public install page must expose the admin manifest before any redirect. */
const ADMIN_INSTALL_PATH = /^\/install(?:-admin|\/admin)(\/|$)/;
const STAFF_PATH = /^\/(pos|receipts|staff)(\/|$)/;
/** Touch register screen — its own installable app, checked before STAFF_PATH. */
const POS_PATH = /^\/pos\/register(\/|$)/;
const RECEIPTS_PATH = /^\/receipts(\/|$)/;
/** FILM SHOP — canonical `/film-shop*` plus the legacy `/receipts/film` alias. */
const FILM_SHOP_PATH = /^\/(film-shop|receipts\/film)(\/|$)/;

/** Paths a workspace can be bounced to before sign-in — no workspace of their own. */
const NEUTRAL_PATH = /^\/(staff\/login|auth|login|portal|launch|line-callback)(\/|$)/;

/**
 * Sticky workspace marker.
 *
 * Login/host guards redirect (e.g. `/pos/register` → `/staff/login`) and drop
 * the `?app=` query, which would install the *staff* app when the user opened
 * the POS link. Remembering the explicit choice for the tab keeps each link
 * installing as its own web app.
 */
const APP_SESSION_KEY = "pwa.app";
/**
 * Persistent counterpart of `APP_SESSION_KEY`. sessionStorage dies when iOS
 * kills the standalone window, so a phone used for the admin console would
 * forget its workspace between launches. This marker survives restarts and is
 * only ever a *hint* — real roles still decide what renders.
 */
const APP_DEVICE_KEY = "pwa.app.device";

function rememberApp(app: PwaApp) {
  try { window.sessionStorage.setItem(APP_SESSION_KEY, app); } catch { /* ignore */ }
  try {
    if (app !== "customer") window.localStorage.setItem(APP_DEVICE_KEY, app);
  } catch { /* ignore */ }
}

function isApp(v: unknown): v is PwaApp {
  return v === "admin" || v === "staff" || v === "customer" || v === "pos" || v === "receipts" || v === "film-shop";
}

/** Workspace this device last used (persisted across app restarts). */
export function deviceWorkspace(): PwaApp | null {
  try {
    const v = window.localStorage.getItem(APP_DEVICE_KEY);
    return isApp(v) ? v : null;
  } catch {
    return null;
  }
}

/** Has this device been used as the admin workspace before? */
export function isAdminWorkspaceDevice(): boolean {
  return deviceWorkspace() === "admin";
}

function rememberedApp(): PwaApp | null {
  try {
    const v = window.sessionStorage.getItem(APP_SESSION_KEY);
    return isApp(v) ? v : null;
  } catch {
    return null;
  }
}

/** Which installable app the given location belongs to. */
export function resolvePwaApp(pathname: string, mode: HostMode, search?: string): PwaApp {
  // Explicit workspace marker (`?app=staff`) wins — shared links and the PWA
  // start_url use it so the phone installs the right app from any path.
  const q = new URLSearchParams(search ?? (typeof window !== "undefined" ? window.location.search : ""));
  const explicit = q.get("app");
  if (explicit === "admin" || explicit === "staff" || explicit === "customer" || explicit === "pos" || explicit === "receipts" || explicit === "film-shop") {
    rememberApp(explicit);
    return explicit;
  }
  if (FILM_SHOP_PATH.test(pathname)) {
    rememberApp("film-shop");
    return "film-shop";
  }
  if (POS_PATH.test(pathname)) {
    rememberApp("pos");
    return "pos";
  }
  if (RECEIPTS_PATH.test(pathname)) {
    rememberApp("receipts");
    return "receipts";
  }
  if (ADMIN_PATH.test(pathname) || ADMIN_INSTALL_PATH.test(pathname) || pathname === "/admin") {
    rememberApp("admin");
    return "admin";
  }
  // Auth/host redirects strip the marker (e.g. → /staff/login) — on those
  // neutral pages keep the workspace the tab started from.
  if (NEUTRAL_PATH.test(pathname)) {
    const sticky = rememberedApp();
    if (sticky) return sticky;
    // Fresh standalone launch (sessionStorage empty): fall back to the
    // workspace this device last used, so /auth keeps the admin manifest.
    const device = deviceWorkspace();
    if (device) return device;
  }
  if (STAFF_PATH.test(pathname)) {
    rememberApp("staff");
    return "staff";
  }
  if (mode === "admin") return "admin";
  if (mode === "staff") return "staff";
  return "customer";
}

/** Point the document head at the manifest for `app`. */
export function applyPwaManifest(app: PwaApp) {
  if (typeof document === "undefined") return;
  const cfg = PWA_APPS[app];
  attachInstallBlocker();
  installBlocked = cfg.manifest === null;

  if (cfg.manifest === null) {
    // Customer surface: strip every installability signal from <head>.
    document.head.querySelector('link[rel="manifest"]')?.remove();
    removeMeta("apple-mobile-web-app-capable");
    removeMeta("mobile-web-app-capable");
    removeMeta("apple-mobile-web-app-title");
    setMeta("theme-color", cfg.themeColor);
    return;
  }

  let link = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  const manifestHref = versionedAsset(cfg.manifest);
  if (link.getAttribute("href") !== manifestHref) link.setAttribute("href", manifestHref);

  let theme = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement("meta");
    theme.name = "theme-color";
    document.head.appendChild(theme);
  }
  if (theme.content !== cfg.themeColor) theme.content = cfg.themeColor;

  // iOS "เพิ่มไปยังหน้าจอโฮม" ignores the manifest name/icons on older
  // versions: it reads these tags instead. Without them the shortcut can end
  // up untitled or with a blank screenshot icon.
  setMeta("apple-mobile-web-app-title", cfg.appleTitle);
  setMeta("apple-mobile-web-app-capable", "yes");
  setMeta("mobile-web-app-capable", "yes");

  let apple = document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!apple) {
    apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    apple.setAttribute("sizes", "180x180");
    document.head.appendChild(apple);
  }
  const appleHref = versionedAsset(cfg.appleTouchIcon);
  if (apple.getAttribute("href") !== appleHref) apple.setAttribute("href", appleHref);
}

/** Current workspace app, resolved from the live location. */
export function currentPwaApp(pathname?: string): PwaApp {
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  return resolvePwaApp(path, getHostMode());
}
