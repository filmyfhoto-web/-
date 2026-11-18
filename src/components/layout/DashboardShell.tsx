import { ReactNode, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut, Menu, Settings, UserCircle2, LayoutGrid } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import InstallPrompt, { LiveDot } from "@/components/InstallPrompt";
import OfflineBanner from "@/components/OfflineBanner";
import BuildStamp from "@/components/common/BuildStamp";
import { useRealtimeTables } from "@/hooks/useRealtimeTable";
import { usePendingWorkCount } from "@/hooks/usePendingWorkCount";
import { useQueryClient } from "@tanstack/react-query";
import { APP_NAME, APP_SUBTITLE, DASHBOARD_NAV } from "@/lib/adminNav";

function NavList({ onClick, pendingWorkCount }: { onClick?: () => void; pendingWorkCount: number }) {
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="เมนูหลัก">
      <div className="admin-nav-group-title px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide">
        เมนูหลัก
      </div>
      {DASHBOARD_NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          onClick={onClick}
          end={n.to === "/admin/home"}
          className={({ isActive }) =>
            `relative flex items-center gap-2.5 px-3 min-h-11 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive ? "admin-nav-item-active" : "admin-nav-item"
            }`
          }
        >
          <n.icon className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate">{n.label}</span>
          {n.to === "/admin/work-docs" && pendingWorkCount > 0 && (
            <span
              data-testid="admin-work-docs-badge"
              className="grid min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-5 text-destructive-foreground"
              aria-label={`งานใหม่ ${pendingWorkCount > 99 ? "99+" : pendingWorkCount} รายการ`}
            >
              {pendingWorkCount > 99 ? "99+" : pendingWorkCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}


/**
 * Dashboard shell ของ NATTA GROUP — sidebar กรมท่าเข้มเฉพาะหน้าแดชบอร์ด
 * โมดูลอื่นเปิดเต็มจอผ่าน AdminLayout (workspace shell) แทน
 */
export default function DashboardShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [drawer, setDrawer] = useState(false);
  const { count: pendingWorkCount } = usePendingWorkCount();
  const { live } = useRealtimeTables(

    ["products", "orders", "stock_movements", "product_images", "notifications", "product_costs", "group_prices", "customer_prices"],
    () => qc.invalidateQueries(),
  );

  return (
    <div className="ng-canvas min-h-screen flex">
      <aside className="admin-sidebar hidden lg:flex flex-col w-64 sticky top-0 h-screen">
        <Link to="/admin/home" className="flex items-center gap-2 p-4 border-b border-white/15">
          <div className="w-9 h-9 rounded-xl bg-white/15 grid place-items-center text-white">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm leading-tight text-white">{APP_NAME}</div>
            <div className="text-[11px] text-white/70">{APP_SUBTITLE}</div>
          </div>
        </Link>
        <div className="overflow-y-auto flex-1"><NavList pendingWorkCount={pendingWorkCount} /></div>
        <div className="p-3 border-t border-white/15">
          <div className="flex items-center justify-between mb-2">
            <LiveDot live={live} />
            <InstallPrompt compact />
          </div>
          <Link to="/admin/profile" className="flex items-center gap-2 text-xs text-white/70 mb-2 truncate hover:text-white">
            <UserCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">{profile?.full_name || profile?.email}</span>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
            onClick={async () => { await signOut(); nav("/"); }}
          >
            <LogOut className="w-4 h-4 mr-2" /> ออกจากระบบ
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur lg:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="เปิดเมนู">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                data-testid="admin-drawer"
                data-mobile-drawer="true"
                className="p-0 w-[86vw] max-w-xs flex flex-col bg-background text-foreground h-[100dvh] max-h-[100dvh]"
              >
                <div
                  className="shrink-0 px-4 min-h-14 flex items-center gap-2 border-b border-border pr-12"
                  style={{ paddingTop: "env(safe-area-inset-top)" }}
                >
                  <div className="w-8 h-8 rounded-xl bg-primary grid place-items-center text-primary-foreground">
                    <LayoutGrid className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm leading-tight truncate text-foreground">{APP_NAME}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{APP_SUBTITLE}</div>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                  <NavList onClick={() => setDrawer(false)} pendingWorkCount={pendingWorkCount} />
                </div>
                <div
                  className="shrink-0 border-t border-border p-3 flex items-center justify-between gap-2"
                  style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
                >
                  <InstallPrompt compact />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={async () => { setDrawer(false); await signOut(); nav("/"); }}
                  >
                    <LogOut className="w-4 h-4 mr-1" /> ออกจากระบบ
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <div className="font-bold leading-tight truncate lg:hidden">{APP_NAME}</div>
              <div className="hidden text-[11px] text-muted-foreground sm:block lg:hidden">{APP_SUBTITLE}</div>
              <div className="hidden font-bold leading-tight lg:block">แดชบอร์ด</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <LiveDot live={live} label="" />
            <Link
              to="/admin/profile"
              className="hidden items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent sm:inline-flex"
            >
              <UserCircle2 className="w-4 h-4" />
              <span className="max-w-[140px] truncate">{profile?.full_name || profile?.email}</span>
            </Link>
            <Button asChild variant="ghost" size="icon" aria-label="ตั้งค่า" data-testid="admin-settings-icon">
              <Link to="/admin/settings"><Settings className="w-5 h-5" /></Link>
            </Button>
            <Button variant="ghost" size="icon" aria-label="ออกจากระบบ" onClick={async () => { await signOut(); nav("/"); }}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>
        <OfflineBanner />
        <main className="ng-surface ng-surface-compact flex-1 w-full min-w-0 p-4 lg:p-6">
          <div className="ng-page">
            {children}
            <div className="mt-8 pt-4 border-t border-border">
              <BuildStamp />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
