/**
 * Host-based split between the customer storefront and the staff/admin
 * workspace. Purely a UX/routing gate — real data access is still enforced
 * server-side by RLS and role checks.
 *
 * - `admin.<domain>` → "admin"
 * - anything else (www / apex / *.lovable.app) → "customer"
 * - localhost / preview → "customer" by default, overridable via
 *   `?mode=admin` (persisted in localStorage) or `localStorage.__hostMode`
 *   so developers can exercise both surfaces from the same sandbox.
 */

export type HostMode = "admin" | "staff" | "customer";

const LS_KEY = "__hostMode";

/** Hostnames that are always the admin workspace. */
export const ADMIN_HOSTS = [
  "admin.filmyynatta.com",
];

/** Canonical URLs used when redirecting across origins. */
export const ADMIN_HOST_PRIMARY = "admin.filmyynatta.com";
export const STAFF_HOST_PRIMARY = "staff.filmyynatta.com";
/**
 * Apex, not `www.` — hosting 302s `www.filmyynatta.com` → `filmyynatta.com`,
 * and a cross-origin redirect on `/manifest.webmanifest` or `start_url`
 * makes the phone refuse to install the web app.
 */
export const CUSTOMER_HOST_PRIMARY = "filmyynatta.com";

/** Public origin every shared/installable link must use. */
export const PUBLIC_ORIGIN = `https://${CUSTOMER_HOST_PRIMARY}`;

/**
 * The `.lovable.app` mirror of the published site. Real customers must never
 * stay on it: it is fine to load, but any link built from it (LINE callbacks,
 * installed PWA start_url) sends people to a Lovable-branded host instead of
 * the shop's own domain.
 */
export const PUBLISHED_LOVABLE_HOST = "www-filmyynatta-com.lovable.app";

/**
 * Origin to hand to third parties (LINE OAuth, share links). Falls back to the
 * public apex whenever the current origin is a preview/sandbox/Lovable mirror.
 */
export function publicOrigin(): string {
  if (typeof window === "undefined") return PUBLIC_ORIGIN;
  const host = (window.location?.hostname || "").toLowerCase();
  if (!host) return window.location?.origin || PUBLIC_ORIGIN;
  if (host === "localhost" || host === "127.0.0.1") return window.location.origin;
  if (isNonPublicHost(host)) return PUBLIC_ORIGIN;
  return window.location.origin;
}

/**
 * When the published Lovable mirror is opened as a real top-level page,
 * return the same path on the shop's own domain so the customer (and every
 * LINE round-trip started from that page) stays on `filmyynatta.com`.
 * Returns null for the editor preview (iframe), dev, and preview hosts.
 */
export function canonicalPublicUrl(loc: {
  hostname: string;
  pathname: string;
  search?: string;
  hash?: string;
}, opts: { inIframe: boolean; isProd: boolean }): string | null {
  if (!opts.isProd || opts.inIframe) return null;
  if (loc.hostname.toLowerCase() !== PUBLISHED_LOVABLE_HOST) return null;
  return `${PUBLIC_ORIGIN}${loc.pathname}${loc.search ?? ""}${loc.hash ?? ""}`;
}

/** Browser entry point for `canonicalPublicUrl` — call before rendering. */
export function enforceCanonicalHost(): boolean {
  if (typeof window === "undefined") return false;
  let inIframe = false;
  try { inIframe = window.self !== window.top; } catch { inIframe = true; }
  const target = canonicalPublicUrl(window.location, {
    inIframe,
    isProd: import.meta.env.PROD,
  });
  if (!target) return false;
  window.location.replace(target);
  return true;
}

/**
 * True for hosts that require a Lovable account (editor preview / sandbox) or
 * that only exist on the developer machine. Links copied from these hosts must
 * never be handed to staff — they'd hit a Lovable sign-in wall.
 */
export function isNonPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".localhost") ||
    h.endsWith(".lovable.app") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovable.dev")
  );
}

/** Canonical admin sign-in URL — use for cross-domain "Admin login" links. */
export const ADMIN_LOGIN_URL = `https://${ADMIN_HOST_PRIMARY}/auth`;
/** Canonical staff sign-in URL. */
export const STAFF_LOGIN_URL = `https://${STAFF_HOST_PRIMARY}/staff`;

/**
 * URL to share for a workspace.
 *
 * The dedicated `admin.` / `staff.` subdomains are not provisioned yet, so a
 * hard-coded `https://admin.filmyynatta.com/...` link is simply dead. Every
 * workspace path is served on the current origin, so build the link from
 * `window.location.origin` and mark the workspace with `?app=` (used to pick
 * the right installable manifest).
 */
export function workspaceUrl(mode: HostMode, path: string): string {
  const qs = `${path.includes("?") ? "&" : "?"}app=${mode}`;
  if (typeof window === "undefined") return `${PUBLIC_ORIGIN}${path}${qs}`;
  const host = window.location.hostname.toLowerCase();
  // Preview/sandbox hosts sit behind a Lovable login, and `www.` 302s to the
  // apex (which breaks manifest + start_url). Always share the public apex.
  const origin =
    host === "www.filmyynatta.com" || isNonPublicHost(host)
      ? PUBLIC_ORIGIN
      : window.location.origin;
  return `${origin}${path}${qs}`;
}

function isKnownAdminHost(host: string): boolean {
  if (!host) return false;
  if (ADMIN_HOSTS.includes(host)) return true;
  if (host.startsWith("admin.")) return true;
  return false;
}

function isKnownStaffHost(host: string): boolean {
  if (!host) return false;
  return host === STAFF_HOST_PRIMARY || host.startsWith("staff.");
}

function isKnownCustomerHost(host: string): boolean {
  return (
    host === "filmyynatta.com" ||
    host === "www.filmyynatta.com" ||
    (host.endsWith(".filmyynatta.com") && !host.startsWith("admin.") && !host.startsWith("staff."))
  );
}

/** Hostname of the workspace for a given mode (production only). */
export function hostForMode(mode: HostMode): string {
  if (mode === "admin") return ADMIN_HOST_PRIMARY;
  if (mode === "staff") return STAFF_HOST_PRIMARY;
  return CUSTOMER_HOST_PRIMARY;
}

/**
 * Absolute URL of the other workspace, used when we need to bounce a
 * request across origins (e.g. customer typed an /admin URL on www).
 * Returns null on preview/localhost, or whenever the target host has not
 * been confirmed reachable — callers then fall back to in-app routing so a
 * missing DNS record can never produce a redirect loop.
 */
export function crossOriginUrlFor(mode: HostMode, pathname: string, search = ""): string | null {
  if (typeof window === "undefined") return null;
  const current = window.location.hostname.toLowerCase();
  // Only ever bounce between real production hosts.
  if (!isKnownAdminHost(current) && !isKnownStaffHost(current) && !isKnownCustomerHost(current)) {
    return null;
  }
  const target = hostForMode(mode);
  if (target === current) return null;
  // Loop guard: only bounce a given target once per tab.
  try {
    const key = `__hostBounce:${target}`;
    if (window.sessionStorage.getItem(key)) return null;
    window.sessionStorage.setItem(key, "1");
  } catch { /* ignore */ }
  return `https://${target}${pathname}${search || ""}`;
}

function readOverride(): HostMode | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("mode");
    if (q === "admin" || q === "customer" || q === "staff") {
      try { window.localStorage.setItem(LS_KEY, q); } catch { /* ignore */ }
      return q;
    }
    const stored = window.localStorage.getItem(LS_KEY);
    if (stored === "admin" || stored === "customer" || stored === "staff") return stored;
  } catch { /* ignore */ }
  return null;
}

export function getHostMode(hostname?: string): HostMode {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")).toLowerCase();
  // Real production split by hostname.
  if (isKnownAdminHost(host)) return "admin";
  if (isKnownStaffHost(host)) return "staff";
  // Dev/preview overrides only apply when we aren't on a real admin host.
  const override = readOverride();
  if (override) return override;
  return "customer";
}

/** Paths that only the owner/admin workspace may serve. */
const ADMIN_ONLY_PREFIXES = [
  "/admin",
  "/admin-login",
  "/accept-admin",
];

/** Paths that belong to the staff workspace (admins get these too). */
const STAFF_PREFIXES = [
  "/pos",
  "/receipts",
  "/staff",
];

/** Paths that belong to the customer storefront. */
const CUSTOMER_PREFIXES = [
  "/shop",
  "/cart",
  "/my-orders",
  "/my-account",
  "/quote-status",
  "/l/",
  "/verify-line",
  "/me/",
];

/** Paths every workspace may render (auth, legal, diagnostics). */
const SHARED_PREFIXES = [
  "/login",
  "/po/",
  "/auth",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacy-policy",
  "/terms-of-use",
  "/faq",
  "/domain-status",
  "/join-store",
  "/.lovable",
];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || pathname === p);
}

export function isAdminPath(pathname: string): boolean {
  // Broad guard: anything under /admin (including unknown/future routes and
  // /admin-login) counts as an admin path so it never leaks on the customer
  // domain, even if the React Router config hasn't been updated.
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/admin-")) {
    return true;
  }
  return matchesPrefix(pathname, ADMIN_ONLY_PREFIXES) || matchesPrefix(pathname, STAFF_PREFIXES);
}

/** True for admin-exclusive paths (not served on the staff workspace). */
export function isAdminOnlyPath(pathname: string): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/admin-")) {
    return true;
  }
  return matchesPrefix(pathname, ADMIN_ONLY_PREFIXES);
}

export function isStaffPath(pathname: string): boolean {
  return matchesPrefix(pathname, STAFF_PREFIXES);
}

export function isSharedPath(pathname: string): boolean {
  return matchesPrefix(pathname, SHARED_PREFIXES);
}

export function isCustomerPath(pathname: string): boolean {
  return matchesPrefix(pathname, CUSTOMER_PREFIXES);
}

/** Home route of each workspace. */
export function homePathFor(mode: HostMode): string {
  if (mode === "admin") return "/admin/home";
  if (mode === "staff") return "/staff/home";
  return "/shop";
}

/**
 * Return a redirect target when the current path doesn't belong on the
 * current host, or `null` when it's fine to render.
 */
export function resolveHostRedirect(mode: HostMode, pathname: string): string | null {
  // "/" is handled by the role-aware landing router (`Index`), which sends
  // signed-out visitors to /welcome and each role to its single home. The
  // host must not pre-empt that decision, or signed-out customers would
  // land on a gated page and bounce.
  if (mode === "staff" && isAdminOnlyPath(pathname)) {
    // Admin-only surface never renders on the staff workspace.
    return "/pos";
  }
  if (mode === "staff" && isCustomerPath(pathname)) {
    return "/pos";
  }
  // The customer domain keeps serving staff/admin paths as a fallback while
  // DNS for the dedicated subdomains propagates, so no gating here.
  return null;
}