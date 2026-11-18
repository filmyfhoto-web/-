import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BellRing, ExternalLink, Package } from "lucide-react";
import { fmtDateTime, fmtTHB } from "@/lib/format";
import type { LatestOrder } from "@/hooks/useCustomerLatestOrder";
import { isStatusChanged, markStatusSeen } from "@/lib/orderStatusSeen";

const STATUS_TH: Record<string, string> = {
  new: "ออเดอร์ใหม่",
  pending: "รอดำเนินการ",
  pending_quote: "รอเสนอราคา",
  quoted: "เสนอราคาแล้ว",
  approved: "ยืนยันแล้ว",
  picking: "กำลังจัดของ",
  ready: "พร้อมรับ",
  paid: "ชำระเงินแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
};

/** สถานะออเดอร์ล่าสุดของลูกค้า พร้อมลิงก์ไปดูรายละเอียด */
export default function CustomerOrderStatusCard({ order }: { order: LatestOrder | null }) {
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!order) { setChanged(false); return; }
    const key = `${order.source}:${order.id}`;
    if (isStatusChanged(key, String(order.status))) {
      setChanged(true);
    } else {
      setChanged(false);
      markStatusSeen(key, String(order.status));
    }
  }, [order?.id, order?.status, order?.source]);

  if (!order) {
    return (
      <div className="rounded-lg border border-dashed border-border p-2 text-xs text-muted-foreground" data-testid="chat-order-status">
        ลูกค้ารายนี้ยังไม่มีออเดอร์ในระบบ
      </div>
    );
  }
  const label = STATUS_TH[String(order.status).toLowerCase()] || order.status;
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${
        changed ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "border-border bg-accent/20"
      }`}
      data-testid="chat-order-status"
      data-status-changed={changed ? "true" : "false"}
    >
      <Package className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{order.order_no}</span>
          <Badge variant="secondary" className="text-[10px]">{label}</Badge>
          {changed && (
            <Badge className="gap-1 px-1.5 text-[10px]" data-testid="chat-order-status-changed">
              <BellRing className="h-3 w-3" /> สถานะเปลี่ยน
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {fmtDateTime(order.created_at)} · {fmtTHB(Number(order.total || 0))}
        </div>
      </div>
      {changed && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          data-testid="chat-order-status-ack"
          onClick={() => { markStatusSeen(`${order.source}:${order.id}`, String(order.status)); setChanged(false); }}
        >
          รับทราบ
        </Button>
      )}
      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
        <Link to={`/my-orders/${order.id}`} data-testid="chat-order-detail-link">
          ดูรายละเอียด <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>
    </div>
  );
}
