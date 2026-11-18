import { Link } from "react-router-dom";
import { ShoppingCart, FileSpreadsheet, ChevronRight, History } from "lucide-react";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

/** ปุ่มหลักของบัญชีลูกค้า (สั่งสินค้า / ส่ง Excel เดิม) */
const PRIMARY_ACTIONS = [
  { key: "shop", to: "/shop", icon: ShoppingCart, label: "สั่งสินค้า" },
  
  { key: "excel", to: ACCOUNT_ROUTES.excel, icon: FileSpreadsheet, label: "ส่ง Excel เดิมของฉัน" },
] as const;

/**
 * แผงทางลัดของหน้า "บัญชีของฉัน" — ปุ่มหลัก 3 อย่าง + ลิงก์ประวัติทั้งหมด
 * (กล่องรายการล่าสุดถูกยกออก เพราะหน้านี้แสดงประวัติคำสั่งซื้อเต็มอยู่แล้ว)
 */
export default function AccountActionPanel() {
  return (
    <section className="grid gap-2 sm:grid-cols-3" aria-label="ทางลัดบัญชีของฉัน" data-testid="account-action-panel">
      {PRIMARY_ACTIONS.map(({ key, to, icon: Icon, label }) => (
        <Link
          key={key}
          to={to}
          data-testid={`account-action-${key}`}
          className="flex min-h-[56px] items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-sm transition hover:opacity-95 sm:min-h-[64px]"
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{label}</span>
          <ChevronRight className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
        </Link>
      ))}

      <Link
        to={ACCOUNT_ROUTES.allHistory}
        data-testid="account-all-history"
        className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-primary/30 px-4 text-[14px] font-bold text-primary transition hover:bg-accent sm:min-h-[64px]"
      >
        <History className="h-4 w-4 shrink-0" aria-hidden />
        <span>ดูประวัติทั้งหมด</span>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
      </Link>
    </section>
  );
}
