import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AccountPage, { EmptyState, ErrorState, ListSkeleton } from "@/components/account/AccountPage";
import OrderRowCard from "@/components/account/OrderRowCard";
import { useMyOrders } from "@/hooks/useMyOrders";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

const FILTERS = [
  { key: "all", label: "ทั้งหมด", match: (s: string) => ["pending_quote", "quoted", "approved", "picking", "ready"].includes(s) },
  { key: "file", label: "รอตรวจไฟล์", match: (s: string) => s === "pending_quote" },
  { key: "unpaid", label: "รอชำระเงิน", match: (s: string) => s === "quoted" },
];

export default function PendingOrders() {
  const { orders, error, reload, loading } = useMyOrders();
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    return (orders ?? []).filter((o) => f.match(String(o.status ?? "")));
  }, [orders, filter]);

  return (
    <AccountPage title="รอดำเนินการ" description="งานที่ร้านกำลังดำเนินการให้คุณ" path={ACCOUNT_ROUTES.pending}>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="ตัวกรองสถานะ">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            data-testid={`pending-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-[13px] font-medium transition ${
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-primary/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <ListSkeleton /> : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="ยังไม่มีคำสั่งซื้อที่รอดำเนินการ"
          hint="เลือกซื้อสินค้าจากร้านได้เลย ร้านจะยืนยันคำสั่งซื้อให้ภายในเวลาทำการ"
          cta={<Link to="/shop" className="inline-flex items-center min-h-11 rounded-xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground">เลือกซื้อสินค้า</Link>}
        />
      ) : (
        <div className="space-y-3">{rows.map((o) => <OrderRowCard key={o.id} order={o} />)}</div>
      )}
    </AccountPage>
  );
}
