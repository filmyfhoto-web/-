import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Check, Clock } from "lucide-react";
import AccountPage, { AccountCard, ErrorState, ListSkeleton } from "@/components/account/AccountPage";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime, fmtTHB } from "@/lib/format";
import { useMyOrderDetail } from "@/hooks/useMyOrders";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

/** 5 ขั้นตอนที่ลูกค้าเข้าใจง่าย ผูกกับสถานะจริงของงาน */
const STEPS = [
  { key: "received", label: "รับคำสั่งแล้ว", statuses: ["pending_quote", "quoted", "approved", "picking", "ready", "completed"] },
  { key: "checked", label: "ตรวจสอบไฟล์", statuses: ["quoted", "approved", "picking", "ready", "completed"] },
  { key: "producing", label: "กำลังผลิต", statuses: ["approved", "picking", "ready", "completed"] },
  { key: "qc", label: "ตรวจคุณภาพ", statuses: ["picking", "ready", "completed"] },
  { key: "ready", label: "พร้อมรับ / จัดส่ง", statuses: ["ready", "completed"] },
];

export default function Tracking() {
  const { orderId } = useParams();
  const { order, items, error, loading, reload } = useMyOrderDetail(orderId);

  // อัปเดตสดเมื่อร้านเปลี่ยนสถานะงาน — ปิด channel เมื่อออกจากหน้า
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-tracking-${orderId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, () => { void reload(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [orderId, reload]);

  const status = String(order?.status ?? "");
  const cancelled = status === "cancelled";

  return (
    <AccountPage title="ติดตามงาน" description="สถานะงานของคุณแบบเรียลไทม์" path={`${ACCOUNT_ROUTES.tracking}/${orderId ?? ""}`}>
      {loading ? <ListSkeleton rows={2} /> : error || !order ? (
        <ErrorState message={error || "ไม่พบงานนี้"} onRetry={() => void reload()} />
      ) : (
        <>
          <AccountCard>
            <div className="text-[16px] font-bold">#{order.order_no || order.id.slice(0, 8)}</div>
            <div className="text-[12px] text-muted-foreground">สั่งเมื่อ {fmtDateTime(order.created_at)}</div>
            <div className="mt-1 text-[15px] font-semibold tabular-nums">{fmtTHB(order.total ?? 0)}</div>
            {order.notes_to_customer && (
              <p className="mt-2 rounded-xl bg-accent p-3 text-[13px]" data-testid="tracking-shop-note">
                ข้อความจากร้าน: {order.notes_to_customer}
              </p>
            )}
          </AccountCard>

          <AccountCard>
            <h2 className="text-[16px] font-bold mb-3">สถานะการดำเนินงาน</h2>
            {cancelled ? (
              <p className="text-[14px] text-destructive" data-testid="tracking-cancelled">งานนี้ถูกยกเลิกแล้ว</p>
            ) : (
              <ol className="space-y-3" data-testid="tracking-timeline">
                {STEPS.map((s) => {
                  const done = s.statuses.includes(status);
                  return (
                    <li key={s.key} className="flex items-start gap-3" data-testid={`tracking-step-${s.key}`}>
                      <span className={`w-8 h-8 shrink-0 rounded-full grid place-items-center ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        {done ? <Check className="w-4 h-4" aria-hidden /> : <Clock className="w-4 h-4" aria-hidden />}
                      </span>
                      <div className="pt-1">
                        <div className={`text-[14px] ${done ? "font-semibold" : "text-muted-foreground"}`}>{s.label}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </AccountCard>

          {items.length > 0 && (
            <AccountCard>
              <h2 className="text-[16px] font-bold mb-2">รายการในงานนี้</h2>
              <ul className="divide-y divide-border/70">
                {items.map((it: any) => (
                  <li key={it.id} className="py-2 flex items-center justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate">{it.product_name}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">x{it.qty} {it.unit ?? ""}</span>
                  </li>
                ))}
              </ul>
            </AccountCard>
          )}
        </>
      )}
    </AccountPage>
  );
}
