import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, BarChart3, Bell, Boxes, ListChecks,
  Receipt, ShoppingCart, Store, TrendingUp, Users,
} from "lucide-react";
import DashboardShell from "@/components/layout/DashboardShell";
import { supabase } from "@/integrations/supabase/client";
import { AdminActivityFeed } from "@/components/realtime/AdminActivityFeed";
import { DataListSkeleton, DataCardGridSkeleton, DataEmptyState } from "@/components/common/DataStates";
import {
  NgMetricTile, NgModuleCard, NgPanel, NgSparkline, type NgTone,
} from "@/components/dashboard/ng/DashboardPrimitives";
import { MODULE_CARDS } from "@/lib/adminNav";
import { fmtTHB } from "@/lib/format";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { NgPurchaseOrderList, type NgPoRow } from "@/components/dashboard/ng/NgPurchaseOrderList";
import { NgDashboardFilters } from "@/components/dashboard/ng/NgDashboardFilters";
import {
  CPO_READ_KEY, countUnreadIds, filterPoRows,
  loadDashFilters, loadReadMap, loadSeen, newIds, saveDashFilters, saveReadMap,
  saveSeen, toggleRead, type NgDashFilters, type ReadMap,
} from "@/lib/dashboardInbox";

const MODULE_TONE: Record<string, NgTone> = {
  "/receipts": "pink",
  "/pos": "violet",
  "/film-shop/app?p=group-queue": "orange",
  "/admin/customer-purchase-orders": "violet",
  "/admin/school-requisitions": "purple",
  "/admin/products": "green",
  "/admin/customers": "blue",
  "/admin/reports": "purple",
  "/admin/customer-hub": "violet",
};

interface OrderRow {
  id: string; order_no: string | null; status: string; total: number | null;
  created_at: string; guest_name: string | null; project_name: string | null; school_name: string | null;
}
interface LowStockRow { id: string; name: string; stock: number | null; low_stock_threshold: number | null; unit?: string | null }

const db = supabase as any;

/** ลิงก์ไปหน้าแจ้งเตือนออเดอร์เข้า พร้อมส่งตัวกรองปัจจุบันไปด้วย */
function poListTo(f: NgDashFilters, review?: string): string {
  const q = new URLSearchParams();
  const status = review ?? f.poStatus;
  if (status) q.set("review", status);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (f.org) q.set("org", f.org);
  const s = q.toString();
  return s ? `/admin/customer-purchase-orders?${s}` : "/admin/customer-purchase-orders";
}

/** แดชบอร์ดแอดมิน NATTA GROUP — แยกจากพื้นที่ทำงาน FILM SHOP (/film-shop) */
export default function AdminDashboardHome() {
  const [loading, setLoading] = useState(true);
  const { config: siteConfig } = useSiteConfig();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [poRows, setPoRows] = useState<NgPoRow[]>([]);
  const [poRead, setPoRead] = useState<ReadMap>(() => loadReadMap(CPO_READ_KEY));
  const [filters, setFilters] = useState<NgDashFilters>(() => loadDashFilters());
  const [poNew, setPoNew] = useState(0);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [counts, setCounts] = useState({ products: 0, customers: 0, pendingQuote: 0, pendingApprove: 0, shops: 0 });

  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    {
      const alive = () => aliveRef.current;
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const since = new Date(dayStart); since.setDate(since.getDate() - 1);

      const [recent, prods, pc, cc, pq, pa, po] = await Promise.all([
        supabase.from("orders")
          .select("id, order_no, status, total, created_at, guest_name, project_name, school_name")
          .is("deleted_at", null)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(60),
        supabase.from("products").select("id, name, stock, low_stock_threshold, unit").eq("active", true).limit(500),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("organizations").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_quote").is("deleted_at", null),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "quoted").is("deleted_at", null),
        db.from("customer_purchase_orders")
          .select("id, po_number, customer_name, school_or_org, items, net_total, subtotal, review_status, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (!alive()) return;

      setOrders((recent.data ?? []) as OrderRow[]);
      const nextPo: NgPoRow[] = ((po?.data ?? []) as any[]).map((r) => ({
        id: r.id,
        po_number: r.po_number,
        customer_name: r.customer_name,
        school_or_org: r.school_or_org,
        itemCount: Array.isArray(r.items) ? r.items.length : 0,
        net_total: Number(r.net_total ?? r.subtotal ?? 0),
        review_status: String(r.review_status ?? "not_sent"),
        created_at: r.created_at,
      }));
      setPoRows(nextPo);

      // แจ้งเตือนรายการใหม่เทียบกับที่เคยเห็นบนเครื่องนี้
      const seen = loadSeen();
      const freshPo = newIds(nextPo, seen.po);
      if (freshPo.length) {
        setPoNew((n) => n + freshPo.length);
        toast.success(`มีออเดอร์สั่งซื้อใหม่ ${freshPo.length} รายการ`);
      }
      saveSeen({ po: nextPo.map((r) => r.id) });

      setLowStock(
        ((prods.data ?? []) as LowStockRow[])
          .filter((p) => Number(p.stock ?? 0) <= Number(p.low_stock_threshold ?? 0))
          .sort((a, b) => Number(a.stock ?? 0) - Number(b.stock ?? 0))
          .slice(0, 5),
      );
      setCounts({
        products: pc.count ?? 0,
        customers: cc.count ?? 0,
        pendingQuote: pq.count ?? 0,
        pendingApprove: pa.count ?? 0,
        shops: 2,
      });
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const applyFilters = useCallback((next: NgDashFilters) => {
    setFilters(next);
    saveDashFilters(next);
  }, []);

  const togglePoRead = useCallback((id: string) => {
    setPoRead((m) => { const next = toggleRead(m, id); saveReadMap(CPO_READ_KEY, next); return next; });
  }, []);

  const today = useMemo(() => {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const rows = orders.filter((o) => new Date(o.created_at) >= dayStart);
    const yRows = orders.filter((o) => new Date(o.created_at) < dayStart);
    const paid = (r: OrderRow[]) =>
      r.filter((o) => ["approved", "picking", "ready", "completed"].includes(o.status))
        .reduce((s, o) => s + Number(o.total || 0), 0);
    const sum = paid(rows);
    const ySum = paid(yRows);

    const buckets: number[] = [];
    let acc = 0;
    for (let h = 0; h < 24; h += 2) {
      acc += rows
        .filter((o) => { const d = new Date(o.created_at).getHours(); return d >= h && d < h + 2; })
        .filter((o) => ["approved", "picking", "ready", "completed"].includes(o.status))
        .reduce((s, o) => s + Number(o.total || 0), 0);
      buckets.push(acc);
    }
    return {
      count: rows.length,
      sales: sum,
      growth: ySum > 0 ? Math.round(((sum - ySum) / ySum) * 100) : sum > 0 ? 100 : 0,
      buckets,
      done: rows.filter((o) => o.status === "completed").length,
      ready: rows.filter((o) => o.status === "ready").length,
    };
  }, [orders]);

  const filteredPo = useMemo(() => filterPoRows(poRows, filters), [poRows, filters]);
  const recentPo = filteredPo.slice(0, 5);
  const poUnread = useMemo(() => countUnreadIds(filteredPo, poRead), [filteredPo, poRead]);
  const orgs = useMemo(() => {
    const set = new Set<string>();
    poRows.forEach((r) => { const v = (r.school_or_org || "").trim(); if (v) set.add(v); });
    return [...set].sort((a, b) => a.localeCompare(b, "th"));
  }, [poRows]);

  return (
    <DashboardShell>
      <div className="portal-canvas -m-4 min-h-full p-4 lg:-m-6 lg:p-6" data-testid="admin-dashboard-home">
        <div className="mx-auto grid w-full max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="min-w-0 space-y-6">
          {/* HERO */}
          <section data-testid="ng-hero" className="portal-card overflow-hidden p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">จัดการร้านได้ครบ จบในที่เดียว</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">หน้าแรก</h1>
                <p className="mt-1 text-sm text-muted-foreground sm:text-base">จัดการรายการสั่งซื้อและเอกสารการทำงานของคุณได้ที่นี่</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 bg-ng-blue-tint px-3 py-1.5 text-xs font-semibold text-ng-ink">
                    <Store className="h-4 w-4" aria-hidden />
                    เปิดร้านแล้ว {counts.shops || 2} ร้าน
                  </span>
                  <Link to="/film-shop" data-testid="ng-hero-filmshop" className="inline-flex items-center gap-2 border border-ng-line-soft px-3 py-1.5 text-xs font-bold text-ng-ink transition-colors hover:bg-ng-blue-tint">
                    เปิดพื้นที่ทำงาน FILM SHOP
                  </Link>
                </div>
                <Link to="/admin/site-editor" data-testid="ng-hero-edit-image" className="mt-3 inline-block text-xs font-semibold text-primary underline underline-offset-2 hover:text-brand">
                  เปลี่ยนรูปโชว์
                </Link>
              </div>
              {siteConfig.dashboard_image_url && (
                <img src={siteConfig.dashboard_image_url} alt="รูปโชว์ของร้าน" data-testid="ng-hero-image" className="h-28 w-full shrink-0 object-cover sm:h-32 sm:w-64" loading="lazy" />
              )}
            </div>
          </section>

          {/* โมดูลหลัก */}
          {loading ? (
            <DataCardGridSkeleton count={6} className="xl:grid-cols-6" />
          ) : (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="ng-modules">
              {MODULE_CARDS.map((m) => (
                <NgModuleCard
                  key={m.to}
                  to={m.to}
                  title={m.label}
                  desc={m.desc}
                  icon={m.icon}
                  tone={MODULE_TONE[m.to] ?? "violet"}
                  testId={`ng-module-${m.to}`}
                />
              ))}
            </section>
          )}

          {/* ตัวกรองของการ์ดออเดอร์สั่งซื้อ */}
          <NgDashboardFilters value={filters} onChange={applyFilters} orgs={orgs} />

          {/* งานล่าสุด = ออเดอร์สั่งซื้อสินค้าของลูกค้า */}
          <NgPanel
            title="งานล่าสุด — ออเดอร์สั่งซื้อ"
            icon={ListChecks}
            actionLabel="ดูทั้งหมด"
            actionTo={poListTo(filters)}
            links={[
              { label: "รอลูกค้าตรวจ", to: poListTo(filters, "awaiting_customer"), testId: "ng-link-po-awaiting" },
              { label: "ขอแก้ไข", to: poListTo(filters, "revision_requested"), testId: "ng-link-po-revision" },
              { label: "ยังไม่อ่าน", to: `${poListTo(filters)}${poListTo(filters).includes("?") ? "&" : "?"}unread=1`, testId: "ng-link-po-unread" },
            ]}
            testId="ng-recent"
          >
            {(poUnread > 0 || poNew > 0) && (
              <p className="mt-2 text-[12px] font-semibold text-ng-blue" data-testid="ng-recent-unread">
                {poNew > 0 ? `ใหม่ ${poNew} รายการ · ` : ""}ยังไม่อ่าน {poUnread} รายการ
              </p>
            )}
            {loading ? (
              <DataListSkeleton rows={4} className="mt-3" testId="ng-recent-skeleton" />
            ) : recentPo.length === 0 ? (
              <DataEmptyState
                testId="ng-recent-empty"
                icon={Bell}
                title="ยังไม่มีออเดอร์สั่งซื้อ"
                desc="เมื่อลูกค้าส่งใบสั่งซื้อเข้ามา รายการล่าสุดจะแสดงที่นี่"
                className="mt-3 border-0 shadow-none"
                action={
                  <Link to="/admin/customer-purchase-orders" className="text-[12.5px] font-semibold text-ng-ink hover:underline">
                    สร้างใบสั่งซื้อใหม่
                  </Link>
                }
              />
            ) : (
              <NgPurchaseOrderList rows={recentPo} readIds={poRead} onToggleRead={togglePoRead} />
            )}
          </NgPanel>

          {/* สินค้าใกล้หมด */}
          <NgPanel
            title="สินค้าใกล้หมด"
            icon={AlertTriangle}
            actionLabel="ดูรายการทั้งหมด"
            actionTo="/admin/products?status=low"
            links={[
              { label: "เติมสต๊อก", to: "/admin/product-stock", testId: "ng-link-stock-update" },
              { label: "จัดซื้อ", to: "/admin/purchases", testId: "ng-link-purchases" },
              { label: "ประวัติสต๊อก", to: "/admin/stock", testId: "ng-link-stock-history" },
            ]}
            testId="ng-low-stock"
          >
            {loading ? (
              <DataListSkeleton rows={3} className="mt-3" testId="ng-low-stock-skeleton" />
            ) : lowStock.length === 0 ? (
              <DataEmptyState
                testId="ng-low-stock-empty"
                icon={Boxes}
                title="สต๊อกอยู่ในระดับปกติ"
                desc="ยังไม่มีสินค้าที่ต่ำกว่าจุดสั่งซื้อ"
                className="mt-3 border-0 shadow-none"
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {lowStock.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/admin/products?status=low"
                      className="flex items-center justify-between gap-3 rounded-[12px] border border-ng-line-soft bg-ng-tint px-3 py-2 text-[12.5px] transition-colors hover:bg-ng-tint-hover"
                    >
                      <span className="min-w-0 flex-1 truncate text-ng-ink">{p.name}</span>
                      <span className="shrink-0 font-bold tabular-nums text-ng-orange-deep">
                        {Number(p.stock ?? 0)} {p.unit || "ชิ้น"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </NgPanel>
          </div>

          {/* คอลัมน์ขวา */}
          <div className="min-w-0 space-y-4">
          <NgPanel
            title="ยอดขายวันนี้"
            icon={TrendingUp}
            actionLabel="ดูรายงาน"
            actionTo="/admin/reports"
            links={[{ label: "ออกเอกสาร", to: "/receipts", testId: "ng-link-sales-docs" }]}
            testId="ng-sales-today"
          >
            <p className="mt-3 text-[12px] text-ng-muted">ยอดขายรวม ({today.count} ออเดอร์)</p>
            <p className="mt-1 text-[28px] font-extrabold leading-none tabular-nums text-ng-ink">{fmtTHB(today.sales)}</p>
            <p className={`mt-2 text-[12.5px] font-semibold ${today.growth >= 0 ? "text-ng-green" : "text-ng-blue"}`}>
              {today.growth >= 0 ? "+" : ""}{today.growth}% จากเมื่อวาน
            </p>
            <NgSparkline values={today.buckets} />
            <div className="mt-1 flex justify-between text-[10.5px] text-ng-soft">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span>
            </div>
          </NgPanel>

          <NgPanel
            title="ลูกค้า"
            icon={Users}
            actionLabel="ดูทั้งหมด"
            actionTo="/admin/customers"
            links={[
              { label: "กลุ่มราคา", to: "/admin/price-groups", testId: "ng-link-price-groups" },
              { label: "ราคาลูกค้า", to: "/admin/prices", testId: "ng-link-prices" },
            ]}
            testId="ng-customers"
          >
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <NgMetricTile label="ลูกค้าทั้งหมด" value={counts.customers} unit="ราย" icon={Users} tone="blue" to="/admin/customers" testId="ng-metric-customers" />
              <NgMetricTile label="สินค้าทั้งหมด" value={counts.products} unit="รายการ" icon={Boxes} tone="green" to="/admin/products" testId="ng-metric-products" />
            </div>
          </NgPanel>

          <NgPanel title="ประกาศ / ความเคลื่อนไหว" icon={BarChart3} testId="ng-activity">
            <div className="mt-3">
              <AdminActivityFeed limit={8} table="activity_logs" />
            </div>
          </NgPanel>

          <NgPanel
            title="ลิงก์ด่วน"
            icon={ShoppingCart}
            testId="ng-quick-links"
          >
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { to: "/pos/register", label: "POS จอสัมผัส", icon: ShoppingCart },
                { to: "/receipts", label: "ออกเอกสาร", icon: Receipt },
                { to: "/admin/tools", label: "เครื่องมือ", icon: BarChart3 },
              ].map((q) => (
                <Link
                  key={q.to}
                  to={q.to}
                  data-testid={`ng-quick-link-${q.to}`}
                  className="rounded-[12px] border border-ng-line-soft bg-ng-tint p-2.5 text-center transition-colors hover:bg-ng-tint-hover"
                >
                  <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-ng-blue-tint text-ng-ink">
                    <q.icon className="h-[17px] w-[17px]" aria-hidden />
                  </span>
                  <span className="mt-1.5 block text-[11px] leading-tight text-ng-body">{q.label}</span>
                </Link>
              ))}
            </div>
          </NgPanel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
