import { Link } from "react-router-dom";
import { ChevronRight, Truck } from "lucide-react";
import { fmtDateTime, fmtTHB, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/format";
import { trackingRoute } from "@/lib/customerAccountRoutes";
import type { MyOrder } from "@/hooks/useMyOrders";

/** การ์ดคำสั่งซื้อมาตรฐานของหน้าลูกค้า — เลขงาน วันที่ ยอดรวม สถานะ */
export default function OrderRowCard({ order, extra }: { order: MyOrder; extra?: React.ReactNode }) {
  const status = String(order.status ?? "");
  return (
    <article
      className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-primary/10"
      data-testid={`account-order-${order.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold truncate">#{order.order_no || order.id.slice(0, 8)}</div>
          <div className="text-[12px] text-muted-foreground">{fmtDateTime(order.created_at)}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${ORDER_STATUS_COLOR[status] || "bg-muted"}`}>
          {ORDER_STATUS_LABEL[status] || "รอดำเนินการ"}
        </span>
      </div>
      <div className="mt-2 text-[14px] font-semibold tabular-nums">{fmtTHB(order.total ?? 0)}</div>
      {extra}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={`/my-orders/${order.id}`}
          className="inline-flex items-center min-h-11 rounded-xl border border-border px-3 text-[13px] font-medium"
        >
          ดูรายละเอียด <ChevronRight className="w-4 h-4" aria-hidden />
        </Link>
        <Link
          to={trackingRoute(order.id)}
          className="inline-flex items-center gap-1 min-h-11 rounded-xl bg-primary px-3 text-[13px] font-medium text-primary-foreground"
        >
          <Truck className="w-4 h-4" aria-hidden /> ติดตามงาน
        </Link>
      </div>
    </article>
  );
}
