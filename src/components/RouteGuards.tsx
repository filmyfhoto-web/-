import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type StaffModule } from "@/contexts/AuthContext";
import { useGuest } from "@/contexts/GuestContext";
import MovedToMyShop from "@/pages/MovedToMyShop";
import { LEGACY_CUSTOMER_UI } from "@/lib/legacyUi";
import { ErrorBoundary } from "./ErrorBoundary";
import { useEffect } from "react";
import { toast } from "sonner";
import { logDeepLinkIntercepted } from "@/lib/deepLinkLog";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

const Loading = () => (
  <div className="min-h-screen grid place-items-center text-muted-foreground">กำลังโหลด...</div>
);

/**
 * Roles/permissions could not be read. Redirecting here would look like a
 * forced logout ("เข้าแอดมินแล้วเด้ง"), so show an explicit retry screen and
 * keep the session intact.
 */
function RoleLoadFailed() {
  const { refresh } = useAuth();
  return (
    <div className="min-h-screen grid place-items-center p-6" data-testid="role-load-failed">
      <div className="max-w-sm w-full text-center space-y-3">
        <h2 className="text-lg font-bold">โหลดสิทธิ์การใช้งานไม่สำเร็จ</h2>
        <p className="text-sm text-muted-foreground">
          ระบบยังอ่านข้อมูลสิทธิ์ของคุณไม่ได้ (การเชื่อมต่อขัดข้อง) — ยังไม่ได้ออกจากระบบ
        </p>
        <button
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
          onClick={() => { void refresh(); }}
        >
          ลองอีกครั้ง
        </button>
        <button
          className="w-full h-11 rounded-xl border border-border"
          onClick={() => window.location.reload()}
        >
          รีเฟรชหน้า
        </button>
      </div>
    </div>
  );
}

/**
 * True when we must NOT make an allow/deny decision yet: the role query
 * failed and we have no roles cached from an earlier successful load.
 */
function useRolesUnknown() {
  const { loadError, roles } = useAuth();
  return !!loadError && (roles?.length ?? 0) === 0;
}

/**
 * Where to send a signed-in staff member who lacks access to the requested
 * page. Never `/staff` — that path renders the staff sign-in landing, so
 * bouncing an authenticated user there looks like a forced logout.
 */
function useDeniedTarget() {
  const { isOwner, isAdmin, isStaffAny } = useAuth();
  if (isOwner || isAdmin) return "/admin/home";
  if (isStaffAny) return "/staff/home";
  return "/no-access";
}

/**
 * หน้าจอแจ้ง "ไม่มีสิทธิ์เข้าถึง" แบบชัดเจน — ผู้ใช้ที่ล็อกอินอยู่แล้วจะได้รู้เหตุผล
 * แทนการถูกเด้งกลับเงียบ ๆ จนเข้าใจผิดว่าแอปพัง
 */
function AccessDenied({ message, to }: { message: string; to: string }) {
  const { profile, signOut } = useAuth();
  const loc = useLocation();
  return (
    <main className="min-h-[100dvh] grid place-items-center px-5 py-10" data-testid="access-denied">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center space-y-4 shadow-sm">
        <ShieldAlert className="w-10 h-10 mx-auto text-amber-500" />
        <h1 className="text-xl font-bold">ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-xs text-muted-foreground break-all">
          หน้าที่เรียก: {loc.pathname}
          {profile?.email ? ` · บัญชี: ${profile.email}` : ""}
        </p>
        <div className="flex flex-col gap-2">
          <Link to={to} replace className="h-11 grid place-items-center rounded-xl bg-primary text-primary-foreground font-semibold">
            กลับหน้าที่ใช้งานได้
          </Link>
          <button
            className="h-11 rounded-xl border border-border text-sm"
            onClick={async () => { await signOut(); window.location.assign("/staff/login"); }}
          >
            เข้าสู่ระบบด้วยบัญชีอื่น
          </button>
        </div>
      </div>
    </main>
  );
}

/**
 * ผู้ใช้ที่มีบทบาทอยู่แล้วแต่สิทธิ์ไม่พอ → แสดงข้อความอธิบายในหน้าเดิม
 * ส่วนบัญชีที่ยังไม่มีบทบาทใด ๆ → ส่งไปหน้ารวม (/no-access, /shop) เหมือนเดิม
 */
function Denied({ to, message }: { to: string; message: string }) {
  const { isStaffAny } = useAuth();
  useEffect(() => { toast.error(message, { id: "route-denied" }); }, [message]);
  if (isStaffAny) return <AccessDenied message={message} to={to} />;
  return <Navigate to={to} replace />;
}

/**
 * Staff sign-in URL that remembers exactly where the user was heading
 * (deep links from LINE notifications keep their `?p=…&order=…` query).
 */
function useStaffLoginTarget() {
  const loc = useLocation();
  const raw = `${loc.pathname}${loc.search}`;
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
  return next ? `/staff/login?next=${encodeURIComponent(next)}` : "/staff/login";
}

/** ส่งไปหน้าล็อกอินพนักงาน พร้อมบันทึกปลายทางเดิมลง activity log */
function ToStaffLogin({ to, guard }: { to: string; guard: string }) {
  const loc = useLocation();
  const intended = `${loc.pathname}${loc.search}`;
  useEffect(() => {
    logDeepLinkIntercepted(intended, guard);
    toast.error("กรุณาเข้าสู่ระบบก่อนเข้าใช้งานหน้านี้", { id: "route-login-required" });
  }, [intended, guard]);
  return <Navigate to={to} replace />;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">กำลังโหลด...</div>;
  if (!user) {
    // ลิงก์เฉพาะหน่วยงาน: /shop?ref=<slug> สำหรับผู้ที่ยังไม่ได้สมัคร → ส่งไปหน้าสมัครพร้อม pre-fill หน่วยงาน
    // และส่ง next= เพื่อให้กลับมาที่ /shop?ref=<slug> หลังล็อกอิน
    const params = new URLSearchParams(loc.search);
    const ref = params.get("ref");
    if (ref && /^[a-zA-Z0-9-]{2,80}$/.test(ref)) {
      const next = loc.pathname + loc.search;
      return (
        <Navigate
          to={`/signup?org=${encodeURIComponent(ref)}&next=${encodeURIComponent(next)}`}
          replace
        />
      );
    }
    {
      // ส่ง next เสมอ (รวม query + hash) เพื่อให้กลับมาทำงานต่อได้ทันทีหลังล็อกอิน
      const back = `${loc.pathname}${loc.search}${loc.hash}`;
      return (
        <Navigate
          to={`/login?next=${encodeURIComponent(back)}`}
          state={{ from: back }}
          replace
        />
      );
    }

  }
  return <>{children}</>;
}

export function RequireStaff({ children }: { children: ReactNode }) {
  return <RequireStaffInner>{children}</RequireStaffInner>;
}

/**
 * Customer-facing gate: a signed-out visitor is sent ONCE to the LINE
 * sign-in screen with a safe same-origin `next` path (never a loop).
 */
export function RequireCustomerAuth({ children }: { children: ReactNode }) {
  // เฟส 1: หน้าลูกค้าเลิกใช้ — ย้ายไปขายที่ LINE MyShop (คืนค่าก่อนเรียก hook ใด ๆ)
  if (!LEGACY_CUSTOMER_UI) return <MovedToMyShop />;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) {
    const raw = `${loc.pathname}${loc.search}`;
    const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";
    return <Navigate to={`/customer/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function RequireStaffInner({ children }: { children: ReactNode }) {
  const { user, isStaff, loading } = useAuth();
  const denied = useDeniedTarget();
  const rolesUnknown = useRolesUnknown();
  const loginTo = useStaffLoginTarget();
  if (loading) return <Loading />;
  if (!user) return <ToStaffLogin to={loginTo} guard="staff" />;
  if (rolesUnknown) return <RoleLoadFailed />;
  if (!isStaff) return <Denied to={denied} message="หน้านี้สำหรับผู้ดูแลระบบเท่านั้น" />;
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export function RequireStaffAny({ children }: { children: ReactNode }) {
  const { user, isStaffAny, loading } = useAuth();
  const rolesUnknown = useRolesUnknown();
  const loginTo = useStaffLoginTarget();
  if (loading) return <Loading />;
  if (!user) return <ToStaffLogin to={loginTo} guard="staff_any" />;
  if (rolesUnknown) return <RoleLoadFailed />;
  if (!isStaffAny) return <Denied to="/shop" message="บัญชีนี้ยังไม่ได้รับสิทธิ์พนักงาน" />;
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export function RequireOwner({ children }: { children: ReactNode }) {
  const { user, isOwner, loading } = useAuth();
  const denied = useDeniedTarget();
  const rolesUnknown = useRolesUnknown();
  const loginTo = useStaffLoginTarget();
  if (loading) return <Loading />;
  if (!user) return <ToStaffLogin to={loginTo} guard="owner" />;
  if (rolesUnknown) return <RoleLoadFailed />;
  if (!isOwner) return <Denied to={denied} message="หน้านี้สำหรับเจ้าของกิจการเท่านั้น" />;
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export function RequireStockEdit({ children }: { children: ReactNode }) {
  const { user, canEditProduct, loading } = useAuth();
  const denied = useDeniedTarget();
  const rolesUnknown = useRolesUnknown();
  const loginTo = useStaffLoginTarget();
  if (loading) return <Loading />;
  if (!user) return <ToStaffLogin to={loginTo} guard="stock_edit" />;
  if (rolesUnknown) return <RoleLoadFailed />;
  if (!canEditProduct) return <Denied to={denied} message="คุณไม่มีสิทธิ์แก้ไขสินค้า/สต๊อก" />;
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

/**
 * Per-person module gate. Owners/admins always pass; other staff need the
 * matching switch enabled by the owner (server-side mirror: has_staff_perm).
 */
export function RequireStaffPerm({ module, children }: { module: StaffModule; children: ReactNode }) {
  const { user, isStaffAny, loading, hasPerm } = useAuth();
  const denied = useDeniedTarget();
  const rolesUnknown = useRolesUnknown();
  const loginTo = useStaffLoginTarget();
  if (loading) return <Loading />;
  if (!user) return <ToStaffLogin to={loginTo} guard="staff_perm" />;
  if (rolesUnknown) return <RoleLoadFailed />;
  if (!isStaffAny) return <Denied to="/shop" message="บัญชีนี้ยังไม่ได้รับสิทธิ์พนักงาน" />;
  if (!hasPerm(module)) return <Denied to={denied} message="คุณยังไม่ได้รับสิทธิ์ใช้งานส่วนนี้" />;
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export function RequireGuest({ children }: { children: ReactNode }) {
  const { session } = useGuest();
  const loc = useLocation();
  useEffect(() => {
    if (!session?.org_id) {
      toast.error("กรุณาเข้าใช้งานผ่านลิงก์โรงเรียนที่ทางร้านส่งให้", {
        id: "guest-required",
        duration: 4000,
      });
    }
  }, [session?.org_id]);
  if (!session?.org_id) {
    return <Navigate to="/s" state={{ from: loc.pathname + loc.search }} replace />;
  }
  return <ErrorBoundary>{children}</ErrorBoundary>;
}