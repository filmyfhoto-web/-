import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Eye, ChevronRight } from "lucide-react";
import AccountPage, { AccountCard, EmptyState, ErrorState, ListSkeleton } from "@/components/account/AccountPage";
import { useMyOrders, type MyOrder } from "@/hooks/useMyOrders";
import { fmtDateTime, fmtTHB, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/format";
import { ACCOUNT_ROUTES, trackingRoute } from "@/lib/customerAccountRoutes";

/** ขั้นตอนงานที่ลูกค้าเข้าใจได้ เรียงตามลำดับจริงของร้าน */
const STEPS = [
  { key: "pending_quote", label: "รอเสนอราคา", hint: "ร้านกำลังตรวจไฟล์และประเมินราคา" },
  { key: "quoted", label: "รออนุมัติ / ชำระเงิน", hint: "ร้านเสนอราคาแล้ว รอคุณยืนยัน" },
  { key: "approved", label: "อนุมัติแล้ว รอผลิต", hint: "งานเข้าคิวผลิตเรียบร้อย" },
  { key: "picking", label: "กำลังผลิต", hint: "ร้านกำลังจัดทำงานของคุณ" },
  { key: "ready", label: "พร้อมรับ / จัดส่ง", hint: "งานเสร็จแล้ว รอรับหรือจัดส่ง" },
  { key: "completed", label: "เสร็จสิ้น", hint: "ส่งมอบงานเรียบร้อย" },
] as const;

function stepIndex(status: string) {
  return STEPS.findIndex((s) => s.key === status);
}

/** แถบความคืบหน้าของงานหนึ่งใบ */
function ProgressBar({ status }: { status: string }) {
  const idx = stepIndex(status);
  if (idx < 0) return null;
  return (
    <ol className="mt-3 flex items-center gap-1" aria-label="ความคืบหน้าของงาน">
      {STEPS.map((s, i) => (
        <li
          key={s.key}
          title={s.label}
          className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`}
        />
      ))}
    </ol>
  );
}

/**
 * สรุปสถานะออเดอร์แบบละเอียดสำหรับลูกค้า
 * เห็นจำนวนงานในแต่ละขั้น กรองดูรายขั้น และดาวน์โหลดเอกสารได้ทันทีเมื่อร้านออกให้แล้ว
 */
export default function OrderStatus() {
  const { orders, error, reload, loading } = useMyOrders();
  const [active, setActive] = useState<string>("all");

  const list: MyOrder[] = useMemo(() => orders ?? [], [orders]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of list) {
      const s = String(o.status ?? "");
      map[s] = (map[s] ?? 0) + 1;
    }
    return map;
  }, [list]);

  const rows = useMemo(
    () => (active === "all" ? list : list.filter((o) => String(o.status ?? "") === active)),
    [list, active],
  );

  const docReady = list.filter((o) => !!o.receipt_issued_at).length;

  return (
    <AccountPage
      title="สถานะงานของฉัน"
      description="สรุปสถานะงานทุกใบแบบละเอียด พร้อมดาวน์โหลดเอกสารเมื่อร้านออกให้แล้ว"
      path={ACCOUNT_ROUTES.status}
    >
      <AccountCard>
        <h2 className="text-[15px] font-semibold">สรุปตามขั้นตอน</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="order-status-summary">
          {STEPS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(active === s.key ? "all" : s.key)}
              data-testid={`order-status-step-${s.key}`}
              aria-pressed={active === s.key}
              className={`rounded-xl p-3 text-left ring-1 transition ${
                active === s.key ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-primary/10"
              }`}
            >
              <div className="text-[20px] font-bold tabular-nums">{counts[s.key] ?? 0}</div>
              <div className="text-[12px] font-medium leading-tight">{s.label}</div>
              <div className={`mt-0.5 text-[11px] leading-tight ${active === s.key ? "opacity-80" : "text-muted-foreground"}`}>{s.hint}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-muted-foreground">เอกสารพร้อมดาวน์โหลด {docReady} รายการ</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActive("all")}
              className="min-h-11 rounded-xl border border-border px-3 text-[13px] font-medium"
            >
              ดูทั้งหมด
            </button>
            <Link to={ACCOUNT_ROUTES.documents} className="inline-flex items-center min-h-11 rounded-xl border border-border px-3 text-[13px] font-medium">
              เอกสารของฉัน
            </Link>
          </div>
        </div>
      </AccountCard>

      {loading ? <ListSkeleton /> : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีงานในขั้นตอนนี้" hint="เมื่อมีงานเข้าระบบ สถานะจะอัปเดตที่หน้านี้" />
      ) : (
        <div className="space-y-3">
          {rows.map((o) => {
            const status = String(o.status ?? "");
            const step = STEPS[stepIndex(status)];
            const hasDoc = !!o.receipt_issued_at;
            return (
              <article key={o.id} className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-primary/10" data-testid={`order-status-${o.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold truncate">#{o.order_no || o.id.slice(0, 8)}</div>
                    <div className="text-[12px] text-muted-foreground">{fmtDateTime(o.created_at)}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${ORDER_STATUS_COLOR[status] || "bg-muted"}`}>
                    {ORDER_STATUS_LABEL[status] || "รอดำเนินการ"}
                  </span>
                </div>
                <div className="mt-1 text-[14px] font-semibold tabular-nums">{fmtTHB(o.total ?? 0)}</div>
                <ProgressBar status={status} />
                <p className="mt-2 text-[12px] text-muted-foreground">{step?.hint ?? "ร้านกำลังดูแลงานนี้ให้คุณ"}</p>
                {o.notes_to_customer && (
                  <p className="mt-2 rounded-xl bg-muted/60 p-2 text-[13px]">ข้อความจากร้าน: {o.notes_to_customer}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/my-orders/${o.id}`} className="inline-flex items-center min-h-11 rounded-xl border border-border px-3 text-[13px] font-medium">
                    ดูรายละเอียด <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <Link to={trackingRoute(o.id)} className="inline-flex items-center min-h-11 rounded-xl border border-border px-3 text-[13px] font-medium">
                    ติดตามงาน
                  </Link>
                  {hasDoc ? (
                    <>
                      <Link
                        to={`/my-orders/${o.id}/receipt`}
                        data-testid={`order-status-doc-${o.id}`}
                        className="inline-flex items-center gap-1 min-h-11 rounded-xl bg-primary px-3 text-[13px] font-medium text-primary-foreground"
                      >
                        <Eye className="h-4 w-4" aria-hidden /> ดูเอกสาร
                      </Link>
                      <Link
                        to={`/my-orders/${o.id}/receipt?print=1`}
                        className="inline-flex items-center gap-1 min-h-11 rounded-xl border border-border px-3 text-[13px] font-medium"
                      >
                        <Download className="h-4 w-4" aria-hidden /> ดาวน์โหลด PDF
                      </Link>
                    </>
                  ) : (
                    <span className="inline-flex items-center min-h-11 rounded-xl bg-muted px-3 text-[13px] text-muted-foreground">
                      เอกสารยังไม่พร้อม
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AccountPage>
  );
}