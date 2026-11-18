import { ReactNode, useState } from "react";
import { NavLink, useNavigate, Link } from "react-router-dom";
import {
  LayoutDashboard, PackagePlus, Camera, Boxes, AlertTriangle,
  ClipboardCheck, History, LogOut, Menu, Package, ShieldCheck, Warehouse, ScanLine,
  Inbox, UserCircle2, ArrowLeft
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import InstallPrompt, { LiveDot } from "@/components/InstallPrompt";
import OfflineBanner from "@/components/OfflineBanner";
import { useRealtimeTables } from "@/hooks/useRealtimeTable";
import { useQueryClient } from "@tanstack/react-query";
import { useSmartBack } from "@/lib/useSmartBack";

function buildNav(canEditProduct: boolean) {
  const items = [
    { to: "/staff/dashboard", label: "หน้าหลัก", icon: LayoutDashboard, end: true },
    { to: "/staff/inbox", label: "กล่องงาน", icon: Inbox, end: false },
  ];
  if (canEditProduct) {
    items.push(
      { to: "/staff/products/new", label: "เพิ่มสินค้า", icon: PackagePlus, end: false } as any,
      { to: "/staff/stock", label: "เช็ก/ปรับสต็อก", icon: Boxes, end: false } as any,
      { to: "/staff/low-stock", label: "สินค้าใกล้หมด", icon: AlertTriangle, end: false } as any,
    );
  }
  items.push(
    { to: "/staff/photos", label: "อัปรูปสินค้า", icon: Camera, end: false } as any,
    { to: "/staff/pending", label: "รายการของฉันรอตรวจ", icon: ClipboardCheck, end: false } as any,
    { to: "/staff/history", label: "ประวัติของฉัน", icon: History, end: false } as any,
    { to: "/staff/scan-history", label: "ประวัติการสแกน", icon: ScanLine, end: false } as any,
  );
  return items;
}

function NavList({ onClick }: { onClick?: () => void }) {
  const { canEditProduct, isStaff, roles } = useAuth();
  const isStockStaff = roles.includes("stock_staff");
  const items = buildNav(canEditProduct);
  return (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((n: any) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onClick}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? "admin-nav-item-active bg-gradient-primary text-white shadow-soft"
                : "admin-nav-item hover:bg-accent hover:text-accent-foreground"
            }`
          }
        >
          <n.icon className="w-4 h-4" />
          {n.label}
        </NavLink>
      ))}
      {(isStockStaff || isStaff) && (
        <NavLink to="/admin/products" onClick={onClick}
          className="mt-3 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 border border-primary/30">
          <Warehouse className="w-4 h-4" /> จัดการสต็อก
        </NavLink>
      )}
      {isStaff && (
        <NavLink to="/admin/home" onClick={onClick}
          className="mt-3 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-primary border border-dashed border-primary/40 hover:bg-primary/5">
          <ShieldCheck className="w-4 h-4" /> ไปหน้าแอดมิน
        </NavLink>
      )}
    </nav>
  );
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  const { profile, signOut, roles } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [drawer, setDrawer] = useState(false);
  const { goBack, isAtFallback } = useSmartBack("/staff/dashboard");
  const { live } = useRealtimeTables(
    ["products", "stock_movements", "product_images", "notifications"],
    () => qc.invalidateQueries()
  );
  const roleLabel = roles.includes("owner") ? "Super Admin"
    : roles.includes("admin") ? "Admin"
    : roles.includes("stock_staff") ? "พนักงานสต็อก"
    : roles.includes("photo_staff") ? "พนักงานถ่ายรูป" : "พนักงาน";
  return (
    <div className="min-h-screen bg-gradient-soft flex">
      <aside className="hidden lg:flex flex-col w-64 bg-card border-r border-border sticky top-0 h-screen">
        <Link to="/staff/dashboard" className="flex items-center gap-2 p-4 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-primary grid place-items-center text-primary-foreground">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">โซนพนักงาน</div>
            <div className="text-[11px] text-muted-foreground">{roleLabel}</div>
          </div>
        </Link>
        <div className="overflow-y-auto flex-1"><NavList /></div>
        <div className="p-3 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <LiveDot live={live} />
            <InstallPrompt compact />
          </div>
          <Link to="/staff/profile" className="flex items-center gap-2 text-xs text-muted-foreground mb-2 truncate hover:text-foreground">
            <UserCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">{profile?.full_name || profile?.email}</span>
          </Link>
          <Button variant="outline" size="sm" className="w-full rounded-xl" onClick={async () => { await signOut(); nav("/"); }}>
            <LogOut className="w-4 h-4 mr-2" /> ออกจากระบบ
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border h-14 flex items-center justify-between px-3">
          <div className="flex items-center gap-1">
          <Sheet open={drawer} onOpenChange={setDrawer}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="เปิดเมนู"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              data-testid="staff-drawer"
              data-mobile-drawer="true"
              className="p-0 w-[86vw] max-w-xs flex flex-col bg-background text-foreground h-[100dvh] max-h-[100dvh]"
            >
              <div
                className="shrink-0 px-4 min-h-14 flex items-center gap-2 border-b border-border pr-12"
                style={{ paddingTop: "env(safe-area-inset-top)" }}
              >
                <div className="w-8 h-8 rounded-xl bg-primary grid place-items-center text-primary-foreground">
                  <Package className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm leading-tight truncate text-foreground">{roleLabel}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {profile?.full_name || profile?.email}
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <NavList onClick={() => setDrawer(false)} />
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
          <Button variant="ghost" size="icon" aria-label="ย้อนกลับ" data-testid="back-button" onClick={goBack} disabled={isAtFallback}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          </div>
          <span className="font-bold text-sm inline-flex items-center gap-2">{roleLabel} <LiveDot live={live} label="" /></span>
          <div className="flex items-center gap-1">
            <InstallPrompt compact />
          <Button variant="ghost" size="icon" onClick={async () => { await signOut(); nav("/"); }}>
            <LogOut className="w-5 h-5" />
          </Button>
          </div>
        </header>
        <OfflineBanner />
        <main
          className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto min-w-0"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {!isAtFallback && (
            <Button
              variant="ghost"
              size="sm"
              className="hidden lg:inline-flex mb-4 -ml-2 rounded-xl"
              aria-label="ย้อนกลับ"
              data-testid="back-button-desktop"
              onClick={goBack}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> ย้อนกลับ
            </Button>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}