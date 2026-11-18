import { ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import ConnectionBadge from "@/components/realtime/ConnectionBadge";
import InstallPrompt, { LiveDot } from "@/components/InstallPrompt";
import OfflineBanner from "@/components/OfflineBanner";
import BuildStamp from "@/components/common/BuildStamp";
import { useRealtimeTables } from "@/hooks/useRealtimeTable";
import { useQueryClient } from "@tanstack/react-query";
import { STOCK_STAFF_HOME, STOCK_TABS, isStockRoute, workspaceTitle } from "@/lib/adminNav";

type Props = {
  children: ReactNode;
  /** ชื่อหน้าบน header (ถ้าไม่ส่งจะดึงจากเส้นทางปัจจุบัน) */
  title?: string;
  /** ปุ่ม action เฉพาะหน้า */
  actions?: ReactNode;
};

/**
 * Workspace shell ของ NATTA GROUP — โมดูลเปิดเต็มจอ ไม่มี sidebar/bottom bar ซ้ำ
 * มีเพียง header บาง ๆ พร้อมปุ่ม “← กลับหน้าหลัก” เพียงทางเดียว
 */
export default function AdminLayout({ children, title, actions }: Props) {
  const { profile, signOut, isStaff } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const home = isStaff ? "/admin/home" : STOCK_STAFF_HOME;
  const showStockTabs = isStockRoute(pathname);
  const { live } = useRealtimeTables(
    ["products", "orders", "stock_movements", "product_images", "notifications", "product_costs", "group_prices", "customer_prices"],
    () => qc.invalidateQueries(),
  );

  return (
    <div className="ng-canvas min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-2 px-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="shrink-0 rounded-xl px-2"
              data-testid="back-button"
            >
              <Link to={home} aria-label="กลับหน้าหลัก">
                <ArrowLeft className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">กลับหน้าหลัก</span>
              </Link>
            </Button>
            <span className="h-5 w-px bg-border" aria-hidden />
            <h1 className="truncate text-sm font-bold sm:text-base" data-testid="workspace-title">
              {title ?? workspaceTitle(pathname)}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <LiveDot live={live} label="" />
            <ConnectionBadge className="hidden md:inline-flex" />
            <InstallPrompt compact />
            <span className="hidden max-w-[160px] truncate px-2 text-xs text-muted-foreground lg:inline">
              {profile?.full_name || profile?.email}
            </span>
            <Button variant="ghost" size="icon" aria-label="ออกจากระบบ" onClick={async () => { await signOut(); nav("/"); }}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {showStockTabs && (
          <div className="-mb-px flex gap-1 overflow-x-auto px-3 pb-1 lg:px-6" data-testid="stock-tabs" aria-label="แท็บสต๊อกสินค้า">
            {STOCK_TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-t-xl border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? "border-primary font-bold text-brand"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </div>
        )}
      </header>
      <OfflineBanner />
      <main className="ng-surface ng-surface-compact w-full min-w-0 flex-1 p-4 lg:p-6">
        <div className="ng-page">
          {children}
          <div className="mt-8 border-t border-border pt-4">
            <BuildStamp />
          </div>
        </div>
      </main>
    </div>
  );
}
