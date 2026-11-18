import { ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ShoppingBag, ShoppingCart, ClipboardList, LayoutDashboard, Bell, UserRound, Tag, Home } from "lucide-react";
import { useGuest } from "@/contexts/GuestContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { customerNavyButtonClass } from "@/components/layout/CustomerBreadcrumbs";
import InstallPrompt, { LiveDot } from "@/components/InstallPrompt";
import { useRealtimeTables } from "@/hooks/useRealtimeTable";
import { useQueryClient } from "@tanstack/react-query";
import { CustomerAccountMenu } from "@/components/layout/CustomerAccountMenu";
import { useLineCustomer } from "@/contexts/LineCustomerContext";
import { getHostMode } from "@/lib/hostMode";
import BuildStamp from "@/components/common/BuildStamp";
import { useShopTheme } from "@/hooks/useShopHomeConfig";
import { themeCssVars } from "@/lib/shopHomeConfig";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  const { session } = useGuest();
  const { theme } = useShopTheme();
  const { profile, isStaff, isStaffAny } = useAuth();
  const { profile: lineProfile } = useLineCustomer();
  const lineName: string | null = lineProfile?.display_name || profile?.line_display_name || null;
  const displayName = lineName || session?.name || "";
  const { count } = useCart();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const isCartAffordancePage = pathname === "/cart" || pathname === "/shop" || pathname === "/";
  // On the customer-facing host, never surface admin entry points — even
  // for staff. Staff members open the admin subdomain directly instead.
  const hostMode = getHostMode();
  const showAdminEntry = hostMode === "admin" && (isStaff || isStaffAny);
  const qc = useQueryClient();
  // อัปเดตเฉพาะข้อมูลที่เกี่ยวข้อง — การล้างแคชทั้งหมดทำให้หน้ากระตุก/เลื่อนเด้ง
  const { live } = useRealtimeTables(
    ["products", "orders", "group_prices", "customer_prices"],
    () =>
      qc.invalidateQueries({
        predicate: (q) => {
          const head = String(q.queryKey?.[0] ?? "");
          return /product|order|price|cart|catalog/i.test(head);
        },
      })
  );

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
      isActive ? "bg-primary text-primary-foreground shadow-soft" : "text-foreground/70 hover:bg-accent"
    }`;

  const tabs = [
    { to: "/", label: "หน้าแรก", icon: Home, end: true },
    { to: "/shop", label: "สินค้า", icon: ShoppingBag },
    { to: "/notifications", label: "แจ้งเตือน", icon: Bell },
    { to: "/my-account", label: "ฉัน", icon: UserRound },
  ];


  return (
    <div
      className="portal-canvas min-h-screen shopfront-root"
      data-shopfront="nattapron"
      style={themeCssVars(theme) as React.CSSProperties}
    >
      {/* ซ่อนบนมือถือ — หน้าร้านมีแถบแบรนด์/ค้นหาแบบ sticky ของตัวเองอยู่แล้ว */}
      <header className="hidden md:block sticky top-0 z-30 border-b border-[hsl(var(--portal-line))] bg-background/95 backdrop-blur">
        <div className="ng-page flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
          {showAdminEntry && (
            <Button
              variant="outline"
              size="sm"
              className={`${customerNavyButtonClass} h-10 min-h-10 shrink-0 px-3`}
              onClick={() => nav("/admin")}
              data-testid="customer-layout-admin-back"
              aria-label="กลับแดชบอร์ดแอดมิน"
            >
              <LayoutDashboard className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">แดชบอร์ดแอดมิน</span>
            </Button>
          )}
          <Link to="/shop" className="flex items-center gap-3 font-bold text-lg">
            <div className="grid h-10 w-10 place-items-center bg-primary text-primary-foreground text-[11px] font-black shadow-sm">
              นภ
            </div>
            <span className="hidden leading-tight sm:inline">
              <span className="block text-sm tracking-tight">นัฐภรณ์ เชียงกลาง</span>
              <span className="block text-[11px] font-normal text-muted-foreground">งานพิมพ์ · เครื่องเขียน · ถ่ายรูป</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/" end className={linkCls}><Home className="w-4 h-4" /> หน้าแรก</NavLink>
            <NavLink to="/shop" className={linkCls}><ShoppingBag className="w-4 h-4" /> สินค้า</NavLink>
            <NavLink to="/deals" className={linkCls}><Tag className="w-4 h-4" /> โปรโมชัน</NavLink>
            
            <NavLink to="/my-orders" className={linkCls}><ClipboardList className="w-4 h-4" /> งานของฉัน</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            {session && (
              <span className="hidden md:inline text-xs text-muted-foreground max-w-[220px] truncate">
                {displayName} · {session.phone}
                {session.org_name ? ` · ${session.org_name}` : ""}
              </span>
            )}
            <span className="hidden sm:inline-flex"><LiveDot live={live} /></span>
            <span className="hidden sm:inline-flex"><InstallPrompt compact /></span>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => nav("/cart")}>
              <span className="relative inline-flex">
                <ShoppingCart className="w-4 h-4 mr-1" />
                {count > 0 && (
                  <span aria-hidden className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
                )}
              </span>
              ตะกร้า
              {count > 0 && <Badge className="ml-2 bg-primary text-primary-foreground tabular-nums" aria-label={`มีสินค้าในตะกร้า ${count} รายการ`}>{count}</Badge>}
            </Button>
            <CustomerAccountMenu />
          </div>
        </div>
      </header>
      <main data-scroll-stable className="ng-page overflow-x-hidden px-4 pb-28 pt-6 md:pb-24 md:pt-8">{children}</main>
      <footer className="ng-page px-4 pb-24 text-center text-xs text-muted-foreground md:pb-6">

        <div className="border-t border-border pt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <Link to="/privacy-policy" className="inline-flex items-center min-h-11 px-3 hover:text-foreground">นโยบายความเป็นส่วนตัว</Link>
          <span aria-hidden>·</span>
          <Link to="/terms-of-use" className="inline-flex items-center min-h-11 px-3 hover:text-foreground">เงื่อนไขการใช้งาน</Link>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground/80 max-w-xl mx-auto">
          เว็บไซต์นี้มีการเก็บข้อมูลการใช้งาน (เช่น สินค้าที่คุณเปิดดู) เพื่อความปลอดภัย การวิเคราะห์สินค้า และการให้บริการลูกค้า
          โดยจัดเก็บเท่าที่จำเป็นตามนโยบายความเป็นส่วนตัว
        </p>
        <BuildStamp className="mt-2" />
      </footer>
      {/* ปุ่มตะกร้าลอยสำหรับมือถือ — หน้าร้าน/หน้าตะกร้ามีปุ่มของตัวเองอยู่แล้ว */}
      {!isCartAffordancePage && (
        <button
          type="button"
          onClick={() => nav("/cart")}
          data-testid="customer-mobile-cart-fab"
          aria-label={count > 0 ? `ตะกร้า มีสินค้า ${count} รายการ` : "ตะกร้า"}
          className="md:hidden fixed right-4 bottom-24 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <ShoppingCart className="h-5 w-5" aria-hidden />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-rose-500 px-1 text-[11px] font-bold leading-5 text-white tabular-nums">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      )}
      <nav

        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border safe-bottom"
        aria-label="เมนูหลักลูกค้า"
        data-testid="customer-bottom-nav"
      >
        <div className="grid grid-cols-4">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              data-testid={`customer-tab-${t.label}`}
              className={({ isActive }) =>
                `min-h-11 py-2 grid place-items-center gap-0.5 text-[11px] font-medium ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <t.icon className="w-5 h-5" aria-hidden />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}