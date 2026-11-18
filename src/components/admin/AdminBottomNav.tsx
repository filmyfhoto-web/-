import { NavLink } from "react-router-dom";
import { CalendarCheck, FolderOpen, Users } from "lucide-react";
import { usePendingWorkCount } from "@/hooks/usePendingWorkCount";

/** เมนูล่างสำหรับมือถือ — 3 ปุ่มหลักตามภาพอ้างอิง (ปุ่มสูง ≥ 44px) */
const TABS = [
  { to: "/admin/today", label: "วันนี้", icon: CalendarCheck },
  { to: "/admin/work-docs", label: "งานและเอกสาร", icon: FolderOpen },
  { to: "/admin/work-docs?match=1", label: "ลูกค้า & LINE", icon: Users },
];

export default function AdminBottomNav() {
  const { count: pendingWorkCount } = usePendingWorkCount();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-3 border-t border-border bg-background lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="เมนูหลักมือถือแอดมิน"
      data-testid="admin-bottom-nav"
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[12px] font-semibold ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`
          }
        >
          <t.icon className="h-5 w-5" />
          <span>{t.label}</span>
          {t.to === "/admin/work-docs" && pendingWorkCount > 0 && (
            <span
              data-testid="admin-work-docs-bottom-badge"
              className="absolute right-[18%] top-1.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-5 text-destructive-foreground"
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
