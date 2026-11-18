import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarCheck, Link2, ListChecks, Search, ShoppingCart } from "lucide-react";
import DashboardShell from "@/components/layout/DashboardShell";
import AdminBottomNav from "@/components/admin/AdminBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  countToday, filterOfKind, fmtWhen, isAcknowledged, KIND_LABEL, listWorkItems, matchesSearch, needsAction,
  statusLabel, thaiToday, workDocsTo, type WorkItem,
} from "@/lib/workDocs";

type Tile = {
  key: string; label: string; value: number; to: string;
  icon: typeof ShoppingCart; tint: string; ink: string;
};

/** หน้า “วันนี้” — สรุปงานที่ต้องทำจากข้อมูลจริง (ไม่รวม system/webhook error) */
export default function AdminToday() {
  const nav = useNavigate();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await listWorkItems();
        if (alive) setItems(rows);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => countToday(items), [items]);
  const todo = useMemo(
    () => items.filter((i) => needsAction(i) && matchesSearch(i, q)).slice(0, 5),
    [items, q],
  );
  const searchHits = useMemo(
    () => (q.trim() ? items.filter((i) => matchesSearch(i, q)).slice(0, 5) : []),
    [items, q],
  );

   const tiles: Tile[] = [
     {
       key: "orders", label: "คำสั่งซื้อใหม่", value: counts.newOrders, icon: ShoppingCart,
       to: workDocsTo({ filter: "order", tab: "pending" }),
       tint: "hsl(var(--ng-purple-tint))", ink: "hsl(var(--ng-purple-deep))",
     },
     {
       key: "requisitions", label: "ใบเขียนเบิกใหม่", value: counts.requisitions, icon: ListChecks,
       to: workDocsTo({ filter: "requisition", tab: "pending" }),
       tint: "hsl(var(--ng-blue-tint))", ink: "hsl(var(--ng-blue))",
     },
     {
       key: "line", label: "LINE รอจับคู่", value: counts.linePending, icon: Link2,
       to: "/admin/work-docs?match=1",
       tint: "hsl(var(--ng-orange-tint))", ink: "hsl(var(--ng-orange-deep))",
     },
     {
       key: "todo", label: "งานที่ต้องดำเนินการ", value: counts.todo, icon: ListChecks,
       to: workDocsTo({ todo: true }),
       tint: "hsl(var(--ng-green-tint))", ink: "hsl(var(--ng-green-deep))",
     },
   ];

  return (
    <DashboardShell>
      <div className="pb-20 lg:pb-0" data-testid="admin-today">
        <header className="mb-4">
          <h1 className="flex items-center gap-2 text-[22px] font-extrabold" style={{ color: "hsl(var(--ng-ink))" }}>
            <CalendarCheck className="h-6 w-6" style={{ color: "hsl(var(--ng-purple))" }} />
            วันนี้
          </h1>
          <p className="text-sm" style={{ color: "hsl(var(--ng-muted))" }}>{thaiToday()}</p>
        </header>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า หรือเลขที่รายการ"
            className="h-12 pl-9 text-[15px]"
            aria-label="ค้นหาชื่อลูกค้า หรือเลขที่รายการ"
          />
        </div>

        {q.trim() && (
          <div className="ng-card mb-4 p-0">
            {searchHits.length === 0 ? (
              <div className="p-4 text-sm" style={{ color: "hsl(var(--ng-muted))" }}>ไม่พบรายการที่ค้นหา</div>
            ) : searchHits.map((i) => (
              <button
                key={`${i.kind}-${i.id}`}
                onClick={() => nav(workDocsTo({ id: i.id, kind: i.kind, filter: filterOfKind(i.kind), tab: i.deliverySentAt ? "sent" : "pending" }))}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-accent/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{i.customerName}</span>
                  <span className="block text-xs" style={{ color: "hsl(var(--ng-muted))" }}>
                    {KIND_LABEL[i.kind]} · {i.code}
                  </span>
                </span>
                <span className="text-xs font-semibold" style={{ color: "hsl(var(--ng-purple-deep))" }}>เปิดงาน</span>
              </button>
            ))}
          </div>
        )}

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t) => (
            <Link
              key={t.key}
              to={t.to}
              data-testid={`today-tile-${t.key}`}
              className="ng-card flex min-h-[88px] items-center gap-3 transition-colors hover:border-primary/40"
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                style={{ background: t.tint, color: t.ink }}
              >
                <t.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold" style={{ color: "hsl(var(--ng-muted))" }}>
                  {t.label}
                </span>
                <span className="block text-[26px] font-extrabold leading-tight" style={{ color: "hsl(var(--ng-ink))" }}>
                  {loading ? "—" : t.value}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <section className="ng-card p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-[15px] font-bold" style={{ color: "hsl(var(--ng-ink))" }}>งานที่ต้องดำเนินการ</h2>
            <Link to={workDocsTo({ todo: true })} className="text-xs font-semibold" style={{ color: "hsl(var(--ng-purple-deep))" }}>
              ดูทั้งหมด
            </Link>
          </div>

          {loading ? (
            <div className="p-4 text-sm" style={{ color: "hsl(var(--ng-muted))" }}>กำลังโหลด…</div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ: {error}</div>
          ) : todo.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: "hsl(var(--ng-muted))" }}>
              ไม่มีงานค้าง — ส่งใบส่งของครบทุกรายการแล้ว
            </div>
          ) : (
            <ul>
              {todo.map((i) => (
                <li key={`${i.kind}-${i.id}`} className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg px-2 py-0.5 text-[11px] font-bold"
                        style={{
                         background: i.kind === "requisition" ? "hsl(var(--ng-blue-tint))" : "hsl(var(--ng-purple-tint))",
                         color: i.kind === "requisition" ? "hsl(var(--ng-blue))" : "hsl(var(--ng-purple-deep))",
                        }}>
                        {KIND_LABEL[i.kind]}
                      </span>
                      <span className="truncate text-[15px] font-semibold">{i.customerName}</span>
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "hsl(var(--ng-muted))" }}>
                      {i.code} · {fmtWhen(i.createdAt)} · {isAcknowledged(i) ? statusLabel(i) : "ยังไม่ยืนยัน"}
                    </div>
                  </div>
                  <Button
                    className="h-11 w-full sm:w-auto"
                    onClick={() => nav(workDocsTo({ id: i.id, kind: i.kind, filter: filterOfKind(i.kind), tab: "pending" }))}
                  >
                    เปิดงาน
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <AdminBottomNav />
    </DashboardShell>
  );
}
