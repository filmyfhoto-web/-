import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getHostMode, resolveHostRedirect } from "@/lib/hostMode";
import { applyPwaManifest, resolvePwaApp } from "@/lib/pwaManifest";
import { syncAppProfileOverrides } from "@/lib/pwaAppProfiles";

/**
 * Sits inside `BrowserRouter` and enforces the host-based split between the
 * three workspaces:
 *   - `www.filmyynatta.com`   → customer storefront (also serves the staff /
 *     admin paths as a fallback while the subdomains' DNS propagates)
 *   - `staff.filmyynatta.com` → staff workspace: POS / stock / PO only
 *   - `admin.filmyynatta.com` → owner + admin workspace (everything)
 *
 * This is a UX/routing gate only — server-side RLS + role guards remain
 * the actual security boundary.
 */
export default function HostRedirect({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const mode = getHostMode();
  // Each workspace installs as its own web app (separate manifest id +
  // start_url), so the phone can hold customer / staff / admin side by side.
  useEffect(() => {
    const app = resolvePwaApp(pathname, mode, search);
    applyPwaManifest(app);
    // Admin-configured shortcut name/icon (if any) overrides the static file.
    syncAppProfileOverrides(app);
  }, [pathname, mode, search]);
  // Belt-and-suspenders SEO: staff/admin workspaces must never be indexed,
  // even on pages without <SeoHead>.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const id = "__admin-host-noindex";
    const existing = document.head.querySelector(`meta#${id}`) as HTMLMetaElement | null;
    if (mode === "admin" || mode === "staff") {
      if (existing) return;
      const m = document.createElement("meta");
      m.id = id;
      m.name = "robots";
      m.content = "noindex,nofollow";
      document.head.appendChild(m);
    } else if (existing) {
      existing.remove();
    }
  }, [mode]);
  const target = resolveHostRedirect(mode, pathname);
  if (target && target !== pathname) return <Navigate to={target} replace />;
  return <>{children}</>;
}