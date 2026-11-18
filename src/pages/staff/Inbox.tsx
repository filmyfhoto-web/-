import { useCallback, useEffect, useMemo, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StaffLayout from "@/components/layout/StaffLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { fmtDateTime, fmtTHB, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import {
  ORDER_QUEUE, NEXT_STATUS, NEXT_STATUS_LABEL, OPEN_PO_STATUS, PO_TASK_LABEL,
  ageLabel, countByStatus, sortInboxOrders, type InboxOrder,
} from "@/lib/staffInbox";
import { AlertTriangle, ArrowRight, Boxes, ClipboardList, Inbox as InboxIcon, RefreshCw, Truck } from "lucide-react";

type PoTask = { id: string; po_no: string | null; supplier_name: string | null; status: string; total: number | null; created_at: string };
type StockTask = { id: string; name: string; code: string | null; status: string };

export default function StaffInbox() {
  const [orders, setOrders] = useState<InboxOrder[] | null>(null);
  const [pos, setPos] = useState<PoTask[]>([]);
  const [stock, setStock] = useState<StockTask[]>([]);
  const [tab, setTab] = useState<"orders" | "tasks">("orders");
  const [filter, setFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mem, guest, po, low] = await Promise.all([
        supabase.from("orders")
          .select("id,order_no,status,total,created_at,school_name,guest_name,organizations(name)")
          .in("status", ORDER_QUEUE as any).is("deleted_at", null)
          .order("created_at", { ascending: true }).limit(200),
        supabase.from("guest_orders")
          .select("id,order_no,status,total,created_at,customer_name")
          .in("status", ORDER_QUEUE as any)
          .order("created_at", { ascending: true }).limit(200),
        supabase.from("purchase_orders")
          .select("id,po_no,supplier_name,status,total,created_at")
          .in("status", OPEN_PO_STATUS as any)
          .order("created_at", { ascending: true }).limit(100),
        supabase.from("products")
          .select("id,name,code,status")
          .in("status", ["low_stock", "out_of_stock"] as any)
          .order("status", { ascending: true }).limit(100),
      ]);

      const rows: InboxOrder[] = [
        ...((mem.data ?? []) as any[]).map((o) => ({
          id: o.id, order_no: o.order_no, status: o.status, total: o.total, created_at: o.created_at,
          customer: o.organizations?.name || o.school_name || o.guest_name || null,
          source: "member" as const,
        })),
        ...((guest.data ?? []) as any[]).map((o) => ({
          id: o.id, order_no: o.order_no, status: o.status, total: o.total, created_at: o.created_at,
          customer: o.customer_name, source: "guest" as const,
        })),
      ];
      setOrders(sortInboxOrders(rows));
      setPos(((po.data ?? []) as any[]) as PoTask[]);
      setStock(((low.data ?? []) as any[]) as StockTask[]);
    } catch (e: any) {
      toast.error(friendlyError(e, "โหลดกล่องงานไม่สำเร็จ"));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = liveChannel(`staff-inbox-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "guest_orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const counts = useMemo(() => countByStatus(orders ?? []), [orders]);
  const shown = useMemo(
    () => (orders ?? []).filter((o) => filter === "all" || o.status === filter),
    [orders, filter]
  );
  const taskCount = pos.length + stock.length;

  async function advance(o: InboxOrder) {
    const next = NEXT_STATUS[o.status];
    if (!next) return;
    setBusyId(o.id);
    try {
      if (o.source === "member") {
        const { error } = await supabase.rpc("admin_set_order_status" as any, { p_order_id: o.id, p_status: next });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("guest_orders").update({ status: next } as any).eq("id", o.id);
        if (error) throw error;
      }
      toast.success(`อัปเดตเป็น "${ORDER_STATUS_LABEL[next] || next}" แล้ว`);
      load();
    } catch (e: any) {
      toast.error(friendlyError(e, "อัปเดตสถานะไม่สำเร็จ"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <StaffLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <InboxIcon className="w-6 h-6 text-primary" /> กล่องงาน
            </h1>
            <p className="text-sm text-muted-foreground">งานที่ต้องดำเนินการต่อ เรียงตามลำดับความเร่งด่วน</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setTab("orders")} data-testid="inbox-tab-orders"
            className={`px-4 py-2 rounded-xl text-sm font-medium border ${tab === "orders" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}>
            ออเดอร์ ({orders?.length ?? 0})
          </button>
          <button onClick={() => setTab("tasks")} data-testid="inbox-tab-tasks"
            className={`px-4 py-2 rounded-xl text-sm font-medium border ${tab === "tasks" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}>
            งาน PO / สต๊อกค้าง ({taskCount})
          </button>
        </div>

        {tab === "orders" && (
          <>
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`ทั้งหมด (${orders?.length ?? 0})`} />
              {ORDER_QUEUE.map((s) => (
                <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}
                  label={`${ORDER_STATUS_LABEL[s] || s} (${counts[s] ?? 0})`} />
              ))}
            </div>

            {orders === null ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
            ) : shown.length === 0 ? (
              <EmptyState text="ไม่มีออเดอร์ค้างในคิวนี้" />
            ) : (
              <ul className="space-y-2" data-testid="inbox-order-list">
                {shown.map((o) => (
                  <li key={`${o.source}-${o.id}`} data-testid="inbox-order-row" className="bg-card rounded-2xl border border-border shadow-card p-4 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-primary">{o.order_no || o.id.slice(0, 8)}</span>
                        <span className={`px-2 py-0.5 text-[10px] rounded-full border ${ORDER_STATUS_COLOR[o.status] || ""}`}>
                          {ORDER_STATUS_LABEL[o.status] || o.status}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{o.source === "guest" ? "ลูกค้าทั่วไป" : "สมาชิก"}</Badge>
                        <Badge variant="secondary" className="text-[10px]">รอมาแล้ว {ageLabel(o.created_at)}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground truncate mt-1">
                        {o.customer || "ไม่ระบุลูกค้า"} · {fmtDateTime(o.created_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{o.total != null ? fmtTHB(Number(o.total)) : "-"}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline" className="rounded-xl">
                        <Link to={o.source === "guest" ? "/admin/work-docs?filter=order" : `/my-orders/${o.id}`}>รายละเอียด</Link>
                      </Button>
                      {NEXT_STATUS[o.status] && (
                        <Button size="sm" data-testid="inbox-advance" className="rounded-xl" disabled={busyId === o.id} onClick={() => advance(o)}>
                          {NEXT_STATUS_LABEL[o.status]} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "tasks" && (
          <div className="space-y-5" data-testid="inbox-task-list">
            <section className="space-y-2">
              <h2 className="font-semibold flex items-center gap-2"><Truck className="w-4 h-4" /> ใบสั่งซื้อค้าง ({pos.length})</h2>
              {pos.length === 0 ? <EmptyState text="ไม่มีใบสั่งซื้อค้าง" /> : (
                <ul className="space-y-2">
                  {pos.map((p) => (
                    <li key={p.id} className="bg-card rounded-2xl border border-border shadow-card p-4 flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-primary">{p.po_no || p.id.slice(0, 8)}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {p.supplier_name || "ไม่ระบุผู้จำหน่าย"} · รอมาแล้ว {ageLabel(p.created_at)}
                        </div>
                      </div>
                      <Badge variant="secondary">{PO_TASK_LABEL[p.status] || p.status}</Badge>
                      <div className="font-semibold">{p.total != null ? fmtTHB(Number(p.total)) : "-"}</div>
                      <Button asChild size="sm" variant="outline" className="rounded-xl">
                        <Link to="/admin/purchases"><ClipboardList className="w-3.5 h-3.5 mr-1" /> เปิดใบสั่งซื้อ</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="font-semibold flex items-center gap-2"><Boxes className="w-4 h-4" /> สินค้าใกล้หมด / หมดสต๊อก ({stock.length})</h2>
              {stock.length === 0 ? <EmptyState text="สต๊อกอยู่ในเกณฑ์ปกติ" /> : (
                <ul className="space-y-2">
                  {stock.map((p) => (
                    <li key={p.id} className="bg-card rounded-2xl border border-border shadow-card p-4 flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.code || "-"}</div>
                      </div>
                      <Badge variant={p.status === "out_of_stock" ? "destructive" : "secondary"}>
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {p.status === "out_of_stock" ? "หมดสต๊อก" : "ใกล้หมด"}
                      </Badge>
                      <Button asChild size="sm" variant="outline" className="rounded-xl">
                        <Link to="/staff/low-stock">จัดการสต็อก</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </StaffLayout>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"
      }`}>
      {label}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="bg-card rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}