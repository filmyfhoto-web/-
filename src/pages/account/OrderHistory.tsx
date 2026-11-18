import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RotateCcw, Search } from "lucide-react";
import AccountPage, { EmptyState, ErrorState, ListSkeleton } from "@/components/account/AccountPage";
import OrderRowCard from "@/components/account/OrderRowCard";
import { Input } from "@/components/ui/input";
import { useMyOrders } from "@/hooks/useMyOrders";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

const FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "active", label: "กำลังทำ" },
  { key: "done", label: "เสร็จแล้ว" },
  { key: "cancelled", label: "ยกเลิก" },
];

export default function OrderHistory() {
  const { orders, error, reload, loading } = useMyOrders();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const nav = useNavigate();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      const s = String(o.status ?? "");
      const okFilter =
        filter === "all" ? true :
        filter === "done" ? s === "completed" :
        filter === "cancelled" ? s === "cancelled" :
        !["completed", "cancelled"].includes(s);
      const okTerm = !term || `${o.order_no ?? ""} ${o.note ?? ""}`.toLowerCase().includes(term);
      return okFilter && okTerm;
    });
  }, [orders, filter, q]);

  return (
    <AccountPage title="ประวัติคำสั่งซื้อ" description="ประวัติงานทั้งหมดของบัญชีคุณ" path={ACCOUNT_ROUTES.history}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาเลขงานหรือรายละเอียด"
          aria-label="ค้นหาคำสั่งซื้อ"
          data-testid="history-search"
          className="pl-9 min-h-11 rounded-xl bg-card"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`history-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-[13px] font-medium ${
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
          title="ยังไม่มีคำสั่งซื้อในเงื่อนไขนี้"
          cta={<Link to="/shop" className="inline-flex items-center min-h-11 rounded-xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground">เลือกซื้อสินค้า</Link>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((o) => (
            <OrderRowCard
              key={o.id}
              order={o}
              extra={
                <button
                  type="button"
                  data-testid={`history-reorder-${o.id}`}
                  onClick={() => nav("/shop", { state: { reorderFrom: o.id, note: o.note ?? "" } })}
                  className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-primary min-h-11"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden /> สั่งซ้ำ
                </button>
              }
            />
          ))}
        </div>
      )}
    </AccountPage>
  );
}
