import { Link } from "react-router-dom";
import { BadgePercent, Gift, Loader2, History } from "lucide-react";

export interface EntitlementRowProps {
  couponCount: number;
  /** จำนวนงานที่กำลังดำเนินการอยู่ (จากคำสั่งซื้อจริง) */
  activeJobs: number;
  /** จำนวนโปรโมชันที่เปิดใช้งานวันนี้ */
  promoCount: number;
  /** จำนวนคำสั่งซื้อทั้งหมดของลูกค้า (ข้อมูลจริง — ไม่มีข้อมูลแสดง 0) */
  orderCount?: number;
}

const cell =
  "min-h-11 min-w-0 rounded-xl px-1 py-2 grid place-items-center gap-0.5 text-center transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus:outline-none";

/** แถบสรุปสิทธิ์/สถานะของลูกค้า — ข้อมูลจริงจากระบบเท่านั้น */
export default function EntitlementRow({ couponCount, activeJobs, promoCount, orderCount = 0 }: EntitlementRowProps) {
  return (
    <section
      aria-label="สรุปของฉัน"
      data-testid="shop-entitlements"
      className="mt-3 rounded-2xl border border-border bg-gradient-to-b from-card to-accent/50 p-2 grid grid-cols-4 gap-1"
    >
      <Link to="/my-orders" className={cell} data-testid="entitlement-orders">
        <History className="w-5 h-5 text-primary" aria-hidden />
        <span className="text-fluid-sm font-semibold tabular-nums">{orderCount.toLocaleString("th-TH")}</span>
        <span className="text-[11px] leading-tight text-muted-foreground">คำสั่งซื้อ</span>
      </Link>
      <Link to="/cart#coupon" className={cell} data-testid="entitlement-coupon">
        <BadgePercent className="w-5 h-5 text-primary" aria-hidden />
        <span className="text-fluid-sm font-semibold tabular-nums">{couponCount.toLocaleString("th-TH")}</span>
        <span className="text-[11px] leading-tight text-muted-foreground">คูปอง</span>
      </Link>
      <Link to="/my-orders" className={cell} data-testid="entitlement-jobs">
        <Loader2 className="w-5 h-5 text-primary" aria-hidden />
        <span className="text-fluid-sm font-semibold tabular-nums">{activeJobs.toLocaleString("th-TH")}</span>
        <span className="text-[11px] leading-tight text-muted-foreground">งานที่กำลังทำ</span>
      </Link>
      <Link to="/deals" className={cell} data-testid="entitlement-promo">
        <Gift className="w-5 h-5 text-primary" aria-hidden />
        <span className="text-fluid-sm font-semibold tabular-nums">{promoCount.toLocaleString("th-TH")}</span>
        <span className="text-[11px] leading-tight text-muted-foreground">โปรวันนี้</span>
      </Link>
    </section>
  );
}
