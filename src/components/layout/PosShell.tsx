import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  ArrowLeft,
  Boxes,
  Menu,
  Store as StoreIcon,
  Users,
  History,
  Settings,
  ShoppingCart,
  X,
  Truck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { usePosBadges } from "@/hooks/usePosBadges";
import { useAuthOptional, type StaffModule } from "@/contexts/AuthContext";
import OfflineBanner from "@/components/OfflineBanner";

/**
 * PosShell — dedicated blue POS workspace shell for all /pos routes.
 * Provides:
 *  - blue top bar with title "POS ขายหน้าร้าน" and "กลับหน้าหลัก"
 *  - dark left navigation on desktop (fixed width)
 *  - collapsible drawer on mobile/tablet
 *  - <Outlet/> renders page content
 *
 * Does NOT wrap AdminLayout or any document workspace chrome.
 */

type NavItem = {
  to: string;
  label: string;
  icon: typeof ShoppingCart;
  end?: boolean;
  badgeKey?: "delivery" | "lowStock" | "pendingPo" | "pendingReceipts";
  perm?: StaffModule;
};

const NAV: NavItem[] = [
  { to: "/pos", label: "หน้าขาย", icon: ShoppingCart, end: true },
  { to: "/pos/stock", label: "สต๊อกสินค้า", icon: Boxes, badgeKey: "lowStock", perm: "stock" },
  { to: "/pos/customers", label: "ลูกค้า", icon: Users },
  { to: "/pos/delivery", label: "จัดส่งสินค้า", icon: Truck, badgeKey: "delivery" },
  { to: "/pos/history", label: "ประวัติการขาย", icon: History, badgeKey: "pendingReceipts", perm: "history" },
  { to: "/pos/tools", label: "เครื่องมือ", icon: Wrench },
  { to: "/pos/settings", label: "ตั้งค่า", icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const badges = usePosBadges();
  const auth = useAuthOptional();
  const items = NAV.filter((item) => !item.perm || !auth || auth.hasPerm(item.perm));
  return (
    <nav
      className="flex flex-col gap-1 p-2"
      aria-label="POS navigation"
      data-testid="pos-shell-nav"
    >
      {items.map((item) => {
        const count = item.badgeKey ? badges[item.badgeKey] : 0;
        return (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition min-h-11",
              isActive
                ? "bg-sky-600/20 text-sky-100 ring-1 ring-sky-400/40"
                : "text-slate-300 hover:bg-slate-800 hover:text-white",
            )
          }
        >
          <span className="relative">
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            {count > 0 && (
              <span
                aria-label={`${count} รายการ`}
                data-testid={`pos-badge-${item.badgeKey}`}
                className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-900"
              />
            )}
          </span>
          <span className="truncate flex-1 font-bold">{item.label}</span>
          {count > 0 && (
            <span className="ml-auto rounded-full bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </NavLink>
        );
      })}
      <div className="h-px my-2 bg-slate-700/60" />
      <Link
        to="/admin/home"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold min-h-11 text-slate-300 hover:bg-slate-800 hover:text-white"
        data-testid="pos-shell-back"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        <span className="font-bold">กลับหน้าหลัก</span>
      </Link>
    </nav>
  );
}

/** 5 ปุ่มหลักสำหรับใช้มือเดียวบนมือถือ (แถบเมนูล่าง) */
const BOTTOM_NAV: NavItem[] = [
  { to: "/pos", label: "หน้าขาย", icon: ShoppingCart, end: true },
  { to: "/pos/stock", label: "สต๊อก", icon: Boxes, badgeKey: "lowStock", perm: "stock" },
  { to: "/pos/customers", label: "ลูกค้า", icon: Users },
  { to: "/pos/delivery", label: "จัดส่ง", icon: Truck, badgeKey: "delivery" },
  { to: "/pos/history", label: "ประวัติ", icon: History, badgeKey: "pendingReceipts", perm: "history" },
];

function BottomNav() {
  const badges = usePosBadges();
  const auth = useAuthOptional();
  const items = BOTTOM_NAV.filter((item) => !item.perm || !auth || auth.hasPerm(item.perm));
  return (
    <nav
      aria-label="POS bottom navigation"
      data-testid="pos-bottom-nav"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const count = item.badgeKey ? badges[item.badgeKey] : 0;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "relative flex min-h-[3rem] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-bold",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )
                }
              >
                <item.icon className="h-5 w-5" aria-hidden />
                <span className="truncate">{item.label}</span>
                {count > 0 && (
                  <span className="absolute right-2 top-1 rounded-full bg-destructive px-1 text-[9px] font-bold leading-4 text-destructive-foreground tabular-nums">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function PosShell() {
  const [drawer, setDrawer] = useState(false);
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return (
    <div
      className="ng-canvas min-h-screen min-h-[100dvh]"
      data-testid="pos-shell"
    >
      {/* Navy top bar */}
      <header className="admin-sidebar sticky top-0 z-30 border-b-0 text-white shadow-sm">
        <div className="ng-page-wide flex items-center gap-2 px-3 md:px-5 py-2.5">
          <Button
            size="icon"
            variant="secondary"
            aria-label="เปิดเมนู"
            data-testid="pos-shell-menu-btn"
            className="md:hidden bg-white/15 hover:bg-white/25 text-white border-0"
            onClick={() => setDrawer(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="rounded-lg min-h-10 bg-white/10 hover:bg-white/20 text-white border-0"
          >
            <Link to="/admin/home" data-testid="pos-shell-back-top">
              <ArrowLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">กลับหน้าหลัก</span>
            </Link>
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <StoreIcon className="hidden h-4 w-4 shrink-0 opacity-80 md:block" aria-hidden />
            <h1 className="truncate text-sm font-bold leading-tight md:text-base">POS หน้าร้าน</h1>
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold"
              data-testid="pos-online-dot"
              title={online ? "ออนไลน์" : "ออฟไลน์"}
            >
              <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-400" : "bg-amber-400")} aria-hidden />
              <span className="hidden sm:inline">{online ? "ออนไลน์" : "ออฟไลน์"}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button asChild size="sm" variant="secondary" className="rounded-lg min-h-10 bg-white/10 hover:bg-white/20 text-white border-0">
              <Link to="/pos/history" data-testid="pos-top-history">
                <History className="h-4 w-4 sm:mr-1" />
                <span className="hidden md:inline">ประวัติการขาย</span>
              </Link>
            </Button>
            <Button asChild size="icon" variant="secondary" className="rounded-lg min-h-10 bg-white/10 hover:bg-white/20 text-white border-0">
              <Link to="/pos/settings" aria-label="ตั้งค่า" data-testid="pos-top-settings">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="ng-page-wide flex">
        {/* Desktop dark sidebar */}
        <aside
          className="admin-sidebar hidden md:flex sticky top-14 h-[calc(100vh-3.5rem)] w-52 shrink-0 flex-col overflow-y-auto text-slate-100"
          data-testid="pos-shell-sidebar"
        >
          <div className="px-3 pt-3 pb-2 border-b border-white/10 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-white/15 grid place-items-center shadow">
              <StoreIcon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold leading-tight text-white truncate">POS หน้าร้าน</div>
              <div className="text-[10px] text-white/60 leading-none mt-0.5">NATTA GROUP</div>
            </div>
          </div>
          <NavList />
        </aside>

        {/* Mobile drawer */}
        <Sheet open={drawer} onOpenChange={setDrawer}>
          <SheetContent
            side="left"
            className="w-64 p-0 bg-slate-900 text-slate-100 border-slate-800"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="font-semibold text-white">POS ขายหน้าร้าน</span>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="ปิดเมนู"
                className="text-slate-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onNavigate={() => setDrawer(false)} />
          </SheetContent>
        </Sheet>

        <main
          className="ng-surface min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-[env(safe-area-inset-bottom)]"
        >
          <OfflineBanner />
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}