import { useEffect, useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { launchTarget } from "@/lib/launchTarget";
import { currentPwaApp, isAdminWorkspaceDevice, type PwaApp } from "@/lib/pwaManifest";
import { logPwa } from "@/lib/pwaDiagnostics";
import { Loader2 } from "lucide-react";

const APPS: PwaApp[] = ["customer", "staff", "admin", "pos", "receipts", "film-shop"];

/**
 * PWA start_url target. Resolves the installed icon (`?app=`) plus the signed
 * in user's role into the right home screen, so each installed app opens
 * straight into a page the user can actually use.
 */
export default function Launch() {
  const [params] = useSearchParams();
  const { loading, roles, isOwner, isAdmin, isStaffAny, hasPerm, session } = useAuth();

  const app: PwaApp = useMemo(() => {
    const q = params.get("app");
    return (APPS as string[]).includes(q ?? "") ? (q as PwaApp) : currentPwaApp();
  }, [params]);

  const to = loading
    ? null
    : launchTarget(app, {
        signedIn: !!session,
        isOwner,
        isAdmin,
        isStaffAny,
        canPos: hasPerm("pos"),
        canStock: hasPerm("stock"),
        adminDevice: isAdminWorkspaceDevice(),
      });

  useEffect(() => {
    if (to) logPwa("info", "launch_redirect", `app=${app} roles=${roles.join(",") || "-"} → ${to}`);
  }, [to, app, roles]);

  if (!to) {
    return (
      <div className="min-h-[100dvh] grid place-items-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">กำลังเปิดแอป…</p>
      </div>
    );
  }

  return <Navigate to={to} replace />;
}