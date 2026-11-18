/**
 * หน้าแรกร้าน FILM SHOP (เส้นทางใหม่ `/film-shop`) — โคลนตามภาพอ้างอิง
 * ข้อมูลจริงจาก `useFilmOrders` เท่านั้น ไม่มีตัวเลขสมมติ และทุกปุ่มชี้ route ที่มีอยู่จริง
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell, Boxes, CalendarCheck, ChevronDown, ChevronRight, ClipboardList, Home, Menu,
  Bookmark, Plus, ScanLine, Store, TrendingUp, Truck, Users, X, Clock, CheckCircle2, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFilmOrders } from "@/film-shop/hooks/useFilmOrders";
import { useAuth } from "@/film-shop/hooks/useAuth";
import { useAuth as useAppAuth, type StaffModule } from "@/contexts/AuthContext";
import { ORDER_STATUS_LABELS, type FilmOrder } from "@/film-shop/types/order";

const FS_APP = "/film-shop/app";
export const FILM_SHOP_HOME_PATH = "/film-shop";

type NavItem = { label: string; to: string; icon: typeof Home; badge?: number; exact?: boolean; perm?: StaffModule };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "งานของฉัน",
    items: [
      { label: "ภาพรวม", to: FILM_SHOP_HOME_PATH, icon: Home, exact: true },
      { label: "ออกเอกสารด่วน", to: `${FS_APP}?p=quick-doc`, icon: Zap },
      { label: "งานวันนี้", to: `${FS_APP}?p=group-queue`, icon: CalendarCheck },
      { label: "แจ้งเตือน", to: "/admin/customer-purchase-orders", icon: Bell },
    ],
  },
  {
    title: "จัดการงาน",
    items: [
      { label: "งานของฉัน", to: `${FS_APP}?p=group-queue`, icon: ClipboardList },
      { label: "งานที่ติดตาม", to: `${FS_APP}?p=documents`, icon: Bookmark },
    ],
  },
  {
    title: "ข้อมูลร้าน",
    items: [
      { label: "ลูกค้า", to: "/admin/customers", icon: Users },
      { label: "สินค้า / สต๊อก", to: "/admin/products", icon: Boxes, perm: "stock" },
    ],
  },
];

type Shortcut = { label: string; desc: string; to: string; icon: typeof Home; tone: string; perm?: StaffModule };

const SHORTCUTS: Shortcut[] = [
  { label: "สร้างออเดอร์ใหม่", desc: "เริ่มสร้างงานใหม่ทันที", to: `${FS_APP}?p=group-queue&q=intake`, icon: Plus, tone: "violet" },
  { label: "ออกเอกสารด่วน", desc: "ออกใบเสร็จ/ใบสั่งจ้างแบบเร็ว", to: `${FS_APP}?p=quick-doc`, icon: Zap, tone: "blue" },
  { label: "สินค้า / สต็อก", desc: "จัดการสินค้าและสต็อก", to: "/admin/products", icon: Boxes, tone: "green", perm: "stock" },
  { label: "งานวันนี้", desc: "ดูและจัดการงานวันนี้", to: `${FS_APP}?p=group-queue`, icon: ClipboardList, tone: "orange" },
  { label: "ลูกค้า", desc: "จัดการข้อมูลลูกค้า", to: "/admin/customers", icon: Users, tone: "pink" },
];

const TONE_BG: Record<string, string> = {
  violet: "bg-[#EDE9FE] text-[#7C3AED]",
  blue: "bg-[#E0EAFF] text-[#4F46E5]",
  green: "bg-[#DCFCE7] text-[#16A34A]",
  orange: "bg-[#FFEDD5] text-[#EA580C]",
  pink: "bg-[#FCE7F3] text-[#DB2777]",
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const thTime = (d: Date) => d.toLocaleTimeString("th-TH", { hour12: false });
const thDateTime = (d: Date) =>
  `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`;

function Donut({ segments, total }: { segments: { value: number; color: string }[]; total: number }) {
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 180 180" className="h-40 w-40" role="img" aria-label="สัดส่วนงานวันนี้">
      <circle cx="90" cy="90" r={R} fill="none" stroke="#EEF0F6" strokeWidth="22" />
      {total > 0 && segments.map((s, i) => {
        const len = (s.value / total) * C;
        const el = (
          <circle key={i} cx="90" cy="90" r={R} fill="none" stroke={s.color} strokeWidth="22"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)" />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

function Spark({ points, className }: { points: number[]; className?: string }) {
  const max = Math.max(1, ...points);
  const d = points
    .map((v, i) => `${(i / Math.max(1, points.length - 1)) * 100},${34 - (v / max) * 30}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className={cn("h-9 w-full", className)} aria-hidden>
      <polyline points={d} fill="none" stroke="#7C3AED" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function FilmShopHome() {
  const { orders, loading, stats } = useFilmOrders();
  const { user } = useAuth();
  // RBAC: เห็นเฉพาะทางเข้าที่บัญชีนี้มีสิทธิ์จริง (เจ้าของ/แอดมินผ่านทุกข้อ)
  const { hasPerm } = useAppAuth();
  const allowed = (perm?: StaffModule) => !perm || hasPerm(perm);
  const navGroups = useMemo(
    () => NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.perm)) })).filter((g) => g.items.length > 0),
    [hasPerm],
  );
  const shortcuts = useMemo(() => SHORTCUTS.filter((s) => allowed(s.perm)), [hasPerm]);
  const navigate = useNavigate();
  const now = useClock();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { document.title = "FILM SHOP · NATTA GROUP"; }, []);

  const m = useMemo(() => {
    const open = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
    const producing = open.filter((o) => ["waiting_print", "producing", "finishing"].includes(o.status));
    const reviewing = open.filter((o) => ["waiting_info", "waiting_design", "waiting_customer"].includes(o.status));
    const ready = open.filter((o) => o.status === "ready");
    const done = orders.filter((o) => o.status === "delivered");
    const total = open.length;
    return { total, producing: producing.length, reviewing: reviewing.length, ready: ready.length, done: done.length };
  }, [orders]);

  const recent: FilmOrder[] = useMemo(
    () => [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5),
    [orders],
  );

  const spark = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i));
      const next = new Date(d); next.setDate(d.getDate() + 1);
      return orders.filter((o) => o.createdAt >= d && o.createdAt < next).length;
    });
    return days;
  }, [orders]);

  const pct = (n: number) => (m.total + m.done > 0 ? Math.round((n / (m.total + m.done)) * 100) : 0);

  const sidebar = (
    <div className="flex h-full w-[272px] flex-col bg-[linear-gradient(180deg,#12104f_0%,#141667_100%)] text-white">
      <div className="flex items-center gap-3 px-5 pt-6">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 text-base font-black">FS</div>
        <div className="min-w-0">
          <div className="truncate text-[17px] font-extrabold leading-tight">FILM SHOP</div>
          <div className="truncate text-[11px] tracking-wide text-white/60">NATTA GROUP</div>
        </div>
      </div>

      <div className="px-4 pt-5">
        <Link
          to={`${FS_APP}?p=group-queue&q=intake`}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,#7C3AED,#A855F7)] text-sm font-bold shadow-[0_8px_20px_-8px_rgba(124,58,237,.9)]"
        >
          <Plus className="h-4 w-4" /> สร้างออเดอร์ใหม่
        </Link>
      </div>

      <nav className="mt-5 flex-1 overflow-y-auto px-3 pb-4">
        {navGroups.map((g) => (
          <div key={g.title} className="mb-4">
            <div className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-white/45">{g.title}</div>
            <ul className="space-y-1">
              {g.items.map((it) => {
                const active = it.exact && it.to === FILM_SHOP_HOME_PATH;
                return (
                  <li key={it.label}>
                    <Link
                      to={it.to}
                      onClick={() => setDrawer(false)}
                      className={cn(
                        "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                        active
                          ? "bg-white/12 text-white ring-1 ring-white/20"
                          : "text-white/75 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      <it.icon className="h-[18px] w-[18px]" />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.label === "แจ้งเตือน" && m.reviewing > 0 && (
                        <span className="rounded-full bg-[#7C3AED] px-2 py-0.5 text-[11px] font-bold">{m.reviewing}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 pb-5">
        <button
          type="button"
          onClick={() => navigate("/admin/home")}
          className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-3 py-3 text-left ring-1 ring-white/15"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#7C3AED] text-sm font-bold">F</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">FILM SHOP</span>
            <span className="block truncate text-[11px] text-white/60">{user?.email ?? "ผู้ดูแลระบบ"}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-white/60" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F7F8FA]">
      <aside className="hidden shrink-0 lg:block">{sidebar}</aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/50" aria-label="ปิดเมนู" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0">
            {sidebar}
            <button
              onClick={() => setDrawer(false)}
              className="absolute right-[-44px] top-4 grid h-9 w-9 place-items-center rounded-full bg-white text-foreground shadow"
              aria-label="ปิดเมนู"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Header */}
        <header className="flex min-h-[84px] flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6 lg:min-h-[102px]">
          <button
            className="grid h-10 w-10 place-items-center rounded-xl border border-border lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="เปิดเมนู"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold sm:text-2xl">สวัสดีค่ะ, นัฐภรณ์ 👋</h1>
            <p className="truncate text-sm text-muted-foreground">ยินดีต้อนรับกลับสู่ร้าน FILM SHOP</p>
          </div>
          <Link
            to={`${FS_APP}?p=group-queue`}
            className="hidden h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold md:flex"
          >
            <Store className="h-4 w-4 text-muted-foreground" /> ร้าน: FILM SHOP
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Link>
          <span className="hidden h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium md:flex">
            <span className="h-2 w-2 rounded-full bg-[#22C55E]" /> ออนไลน์ · {thTime(now)}
          </span>
          <Link
            to="/admin/customer-purchase-orders"
            className="relative grid h-11 w-11 place-items-center rounded-xl border border-border"
            aria-label="แจ้งเตือน"
          >
            <Bell className="h-5 w-5" />
            {m.reviewing > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-[#EF4444] px-1.5 text-[10px] font-bold text-white">
                {m.reviewing}
              </span>
            )}
          </Link>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#7C3AED] font-bold text-white">F</span>
        </header>

        <main className="mx-auto max-w-[1280px] space-y-6 px-4 py-5 sm:px-6">
          {/* Hero */}
          <section className="rounded-2xl bg-[linear-gradient(100deg,#3B1E86_0%,#5B21B6_45%,#D6409F_100%)] p-5 text-white sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold">ภาพรวมวันนี้</h2>
                <p className="text-xs text-white/70">อัปเดตล่าสุด {thDateTime(now)}</p>
                <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[
                    { label: "งานทั้งหมด", value: m.total, icon: ClipboardList, to: `${FS_APP}?p=group-queue` },
                    { label: "กำลังดำเนินการ", value: m.producing, icon: CalendarCheck, to: `${FS_APP}?p=group-queue&s=producing` },
                    { label: "รอตรวจสอบ", value: m.reviewing, icon: Boxes, to: `${FS_APP}?p=group-queue&s=review` },
                    { label: "รอจัดส่ง", value: m.ready, icon: Truck, to: `${FS_APP}?p=group-queue&s=ready` },
                  ].map((t) => (
                    <Link key={t.label} to={t.to} className="flex items-center gap-3 rounded-xl px-1 py-1 hover:bg-white/10">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/90 text-[#5B21B6]">
                        <t.icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-white/75">{t.label}</span>
                        <span className="block text-2xl font-extrabold leading-tight">{loading ? "–" : t.value}</span>
                        <span className="block text-[11px] text-white/60">งาน</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="w-full rounded-2xl bg-white/95 p-4 text-foreground xl:w-[320px]">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EDE9FE] text-[#7C3AED]">
                    <TrendingUp className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-xs text-muted-foreground">งานใหม่วันนี้</div>
                    <div className="text-3xl font-extrabold leading-tight">
                      {loading ? "–" : stats.today} <span className="text-sm font-semibold">งาน</span>
                    </div>
                  </div>
                </div>
                <Spark points={spark} className="mt-2" />
              </div>
            </div>
          </section>

          {/* Shortcuts */}
          <section>
            <h2 className="mb-3 text-base font-extrabold">ทางลัดสำหรับคุณ</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {shortcuts.map((s) => (
                <Link
                  key={s.label}
                  to={s.to}
                  data-testid={`fs-shortcut-${s.label}`}
                  className="rounded-2xl border border-border bg-background p-4 transition-shadow hover:shadow-md"
                >
                  <span className={cn("mb-4 grid h-11 w-11 place-items-center rounded-xl", TONE_BG[s.tone])}>
                    <s.icon className="h-5 w-5" />
                  </span>
                  <div className="flex items-end justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{s.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.desc}</span>
                    </span>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#DDD6FE] text-[#7C3AED]">
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Bottom row */}
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-extrabold">งานล่าสุด</h2>
                <Link to={`${FS_APP}?p=group-queue`} className="flex items-center gap-1 text-sm font-semibold text-[#7C3AED]">
                  ดูทั้งหมด <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              {loading ? (
                <ul className="space-y-2" aria-label="กำลังโหลดงานล่าสุด">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
                  ))}
                </ul>
              ) : recent.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  ยังไม่มีงานในระบบ — กด “สร้างออเดอร์ใหม่” เพื่อเริ่มงานแรก
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {recent.map((o) => (
                    <li key={o.id}>
                      <Link to={`${FS_APP}?p=group-queue&o=${o.id}`} className="flex items-center gap-3 py-3 hover:bg-muted/40">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EDE9FE] text-[#7C3AED]">
                          <Users className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">#{o.orderNo}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {o.orgName || o.customerName || "ลูกค้าทั่วไป"}
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{thDateTime(o.createdAt)}</span>
                        <span className="shrink-0 rounded-full bg-[#F3F0FF] px-3 py-1 text-[11px] font-semibold text-[#6D28D9]">
                          {ORDER_STATUS_LABELS[o.status]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-background p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-extrabold">สรุปงานวันนี้</h2>
                <Link to="/admin/reports" className="flex items-center gap-1 text-sm font-semibold text-[#7C3AED]">
                  ดูรายงานเพิ่มเติม <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <div className="relative shrink-0">
                  <Donut
                    total={m.total + m.done}
                    segments={[
                      { value: m.producing, color: "#7C3AED" },
                      { value: m.reviewing, color: "#3B82F6" },
                      { value: m.ready, color: "#F59E0B" },
                      { value: m.done, color: "#10B981" },
                    ]}
                  />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <div className="text-2xl font-extrabold">{loading ? "–" : m.total}</div>
                      <div className="text-[11px] text-muted-foreground">งานทั้งหมด</div>
                    </div>
                  </div>
                </div>
                <ul className="w-full space-y-2 text-sm">
                  {[
                    { c: "#7C3AED", l: "กำลังดำเนินการ", v: m.producing },
                    { c: "#3B82F6", l: "รอตรวจสอบ", v: m.reviewing },
                    { c: "#F59E0B", l: "รอจัดส่ง", v: m.ready },
                    { c: "#10B981", l: "เสร็จสิ้นแล้ว", v: m.done },
                  ].map((r) => (
                    <li key={r.l} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.c }} />
                      <span className="flex-1 truncate text-muted-foreground">{r.l}</span>
                      <span className="font-bold">{r.v}</span>
                      <span className="w-10 text-right text-muted-foreground">{pct(r.v)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#E0EAFF] text-[#4F46E5]">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-xs text-muted-foreground">งานด่วนที่ยังค้าง</div>
                    <div className="text-lg font-extrabold">{stats.urgent} <span className="text-xs font-semibold">งาน</span></div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#DCFCE7] text-[#16A34A]">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-xs text-muted-foreground">พร้อมรับ/ส่งมอบ</div>
                    <div className="text-lg font-extrabold">{m.ready} <span className="text-xs font-semibold">งาน</span></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
