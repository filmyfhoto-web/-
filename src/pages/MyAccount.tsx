import CustomerLayout from "@/components/layout/CustomerLayout";
import AccountActionPanel from "@/components/account/AccountActionPanel";
import MyOrdersPanel from "@/components/account/MyOrdersPanel";
import LineIdentityCard from "@/components/account/LineIdentityCard";
import SeoHead from "@/components/SeoHead";
import { useLineCustomer } from "@/contexts/LineCustomerContext";
import { useGuest } from "@/contexts/GuestContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronRight, LogOut, RefreshCw, Phone, Building2, Sparkles, Info, Settings2, Pencil,
  History, Clock3, FileCheck2, PackageCheck, MapPin, FolderOpen, BadgePercent, Receipt,
  MessageCircle, UserCog, CheckCircle2, AlertCircle, PlusCircle,
  Upload, Truck, Store, ShoppingCart, BellRing,
} from "lucide-react";
import { logoutCustomer } from "@/lib/customerLogout";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readIdToken, hasVerifiableIdentity } from "@/lib/lineSession";
import { BUILD_INFO, formatThaiDateTime } from "@/lib/buildInfo";
import { RUNNING_TAG, useBuildUpdate } from "@/lib/buildUpdate";
import { refreshAppAssets } from "@/lib/appUpdate";
import {
  CUSTOMER_ORDER_BUCKETS_DISPLAY, countBuckets, formatBadgeCount, type CustomerOrder,
} from "@/lib/customerOrderBuckets";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import { refreshLineBinding } from "@/hooks/useLineBindingState";
import { profileInitial, safePictureUrl } from "@/lib/lineProfile";
import { useCustomerNotifications } from "@/hooks/useCustomerNotifications";
import { ACCOUNT_ROUTES, BUCKET_ROUTES } from "@/lib/customerAccountRoutes";


const BUCKET_ICONS = { history: History, clock: Clock3, fileCheck: FileCheck2, packageCheck: PackageCheck } as const;

/** การ์ด "บริการของฉัน" — ผูกกับหน้าที่มีจริงในระบบร้าน */
const ACCOUNT_SERVICES: {
  key: string; label: string; hint: string; icon: typeof MapPin; to: string;
}[] = [
  { key: "excel", label: "ส่งไฟล์ Excel เดิมของฉัน", hint: "อัปโหลดไฟล์รายการเดิม แล้วร้านจัดทำเอกสารให้", icon: FolderOpen, to: ACCOUNT_ROUTES.excel },
  { key: "all-history", label: "ประวัติทั้งหมด", hint: "ออเดอร์ ใบสั่งซื้อ และไฟล์ Excel", icon: History, to: ACCOUNT_ROUTES.allHistory },
];


/** ซิงก์ชื่อ/รูปจาก LINE ของผู้ใช้คนที่ล็อกอินอยู่ (ยืนยันตัวตนฝั่งเซิร์ฟเวอร์) */
async function syncLineProfile(): Promise<boolean> {
  if (!(await hasVerifiableIdentity())) return false;
  const id_token = readIdToken();
  const { error } = await supabase.functions.invoke("line-profile-sync", {
    body: id_token ? { id_token } : {},
  });
  await refreshLineBinding(true);
  return !error;
}

export default function MyAccount() {
  const { profile } = useLineCustomer();
  const { session } = useGuest();
  const { count: cartCount } = useCart();
  const nav = useNavigate();
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shopLine, setShopLine] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const id_token = readIdToken();
      const { data, error: e } = await supabase.functions.invoke("my-line-orders", {
        body: { action: "list", ...(id_token ? { id_token } : {}) },
      });
      if (e) throw e;
      if ((data as any)?.error) throw new Error((data as any).error);
      setOrders(((data as any)?.orders ?? []) as CustomerOrder[]);
    } catch (err: any) {
      setOrders([]);
      setError(err?.message || "โหลดไม่สำเร็จ");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // เปิดหน้าโปรไฟล์ = ซิงก์ชื่อ/รูปจาก LINE ใหม่ (ไม่สร้างบัญชีซ้ำ)
  useEffect(() => { void syncLineProfile(); }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc("get_public_settings");
        const row: any = Array.isArray(data) ? data[0] : data;
        setShopLine(row?.line_add_friend_url || row?.line_url || null);
      } catch { /* ไม่มีลิงก์ LINE ก็ซ่อนปุ่ม */ }
    })();
  }, []);

  const name = profile?.display_name || profile?.customer_name || session?.name || "บัญชีของฉัน";
  const initial = profileInitial(name);
  const pictureUrl = safePictureUrl(profile?.picture_url);
  const phone = profile?.phone || session?.phone || null;
  const lineLinked = !!profile?.line_user_id || !!profile?.display_name;
  const counts = useMemo(() => countBuckets(orders ?? []), [orders]);

  const { unread: unreadNotifs } = useCustomerNotifications();
  const { remoteTag, hasUpdate } = useBuildUpdate();
  const notifCount = counts.pending + counts.issued + unreadNotifs;

  /** วันที่เป็นสมาชิก — จากโปรไฟล์จริง (ไม่มีข้อมูลก็แสดงขีด) */
  const memberSince = useMemo(() => {
    const raw = (profile as any)?.created_at || (session as any)?.created_at;
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("th-TH", { month: "short", year: "numeric" });
  }, [profile, session]);

  return (
    <CustomerLayout>
      <SeoHead
        title="ภาพรวมบัญชีลูกค้า — ร้านนัฐภรณ์ เชียงกลาง"
        description="ข้อมูลส่วนตัว สถานะคำสั่งซื้อ เอกสาร คูปอง และการตั้งค่าบัญชีลูกค้า"
        path="/my-account"
      />

      <div className="-mx-4 -mt-4 bg-gradient-account-page min-h-[calc(100svh-4rem)] pb-2 sm:-mt-6">
        {/* 1) Header โปรไฟล์ */}
        <section
          className="mx-auto w-full max-w-4xl rounded-b-[24px] bg-gradient-account px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] text-primary-foreground shadow-soft sm:pb-10"
          data-testid="account-hero"
        >
          <div className="mx-auto w-full max-w-4xl">
            <h1 className="sr-only">บัญชีของฉัน</h1>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {pictureUrl ? (
                  <img
                    src={pictureUrl}
                    alt={`รูปโปรไฟล์ของ ${name}`}
                    className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-primary-foreground/60 sm:h-16 sm:w-16"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary-foreground/20 text-[20px] font-bold ring-2 ring-primary-foreground/45 sm:h-16 sm:w-16 sm:text-[22px]">
                    {initial}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="truncate text-[19px] font-bold leading-tight sm:text-[20px]">{name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-primary-foreground/85">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {phone || "ยังไม่ได้ระบุเบอร์โทร"}
                  </div>
                  {session?.org_name && (
                    <div className="flex items-center gap-1.5 truncate text-[12px] text-primary-foreground/75">
                      <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> {session.org_name}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-start gap-1" data-testid="account-header-actions">
                <HeaderIcon label="ตั้งค่า" srLabel="ตั้งค่าบัญชี" onClick={() => nav("/account")}>
                  <Settings2 className="h-5 w-5" />
                </HeaderIcon>
                <HeaderIcon label="ตะกร้า" srLabel="ตะกร้าสินค้า" badge={formatBadgeCount(cartCount)} testId="account-header-cart" onClick={() => nav("/cart")}>
                  <ShoppingCart className="h-5 w-5" />
                </HeaderIcon>
                <HeaderIcon label="แชท" srLabel="แชทกับร้าน / การแจ้งเตือน" badge={formatBadgeCount(notifCount)} testId="account-header-bell" onClick={() => (shopLine ? window.open(shopLine, "_blank", "noreferrer") : nav("/notifications"))}>
                  <MessageCircle className="h-5 w-5" />
                </HeaderIcon>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="account-edit-profile"
                onClick={() => nav("/account")}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-[12px] font-semibold"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden /> แก้ไขโปรไฟล์
              </button>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11px] font-medium"
                data-testid="account-line-status"
              >
                {lineLinked ? (
                  <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> ผูก LINE แล้ว</>
                ) : (
                  <><AlertCircle className="h-3.5 w-3.5" aria-hidden /> ยังไม่ได้ผูก LINE</>
                )}
              </span>
            </div>

            <div
              className="mt-3 grid grid-cols-2 divide-x divide-primary-foreground/20 rounded-2xl bg-primary-foreground/10 py-2.5"
              data-testid="account-hero-stats"
            >
              {[
                { key: "following", value: counts.pending.toLocaleString("th-TH"), label: "งานที่ติดตามอยู่" },
                { key: "orders", value: counts.all.toLocaleString("th-TH"), label: "รายการทั้งหมด" },
              ].map((s) => (
                <div key={s.key} data-testid={`account-stat-${s.key}`} className="px-1 text-center">
                  <div className="truncate text-[17px] font-bold leading-tight tabular-nums">{s.value}</div>
                  <div className="text-[11px] leading-tight text-primary-foreground/80">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-4xl space-y-3 px-3 pb-8 sm:space-y-4 sm:px-4">


          {/* ปุ่มหลักของบัญชีลูกค้า — สั่งสินค้า / ส่ง Excel เดิม */}
          <AccountActionPanel />

          {/* ประวัติคำสั่งซื้อเต็ม — รวมมาจากหน้า /my-orders เดิม (หน้าเดียวจบ) */}
          <MyOrdersPanel />

          {/* การเชื่อมโยง LINE — LINE ID + สถานะยืนยัน */}
          <LineIdentityCard />

          {/* 5) การ์ดบริการของฉัน */}
          <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-primary/10" aria-label="บริการของฉัน" data-testid="account-services">
            <h2 className="mb-3 text-[17px] font-bold">บริการของฉัน</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {ACCOUNT_SERVICES.map((s) => (
                <li key={s.key}>
                  <Link
                    to={s.to}
                    data-testid={`account-service-${s.key}`}
                    className="flex h-full items-center gap-3 rounded-xl bg-muted/50 px-3 min-h-[60px] py-3 ring-1 ring-transparent transition hover:bg-accent hover:ring-primary/15"
                  >
                    <span className="w-9 h-9 shrink-0 rounded-xl bg-card grid place-items-center shadow-sm">
                      <s.icon className="w-5 h-5 text-primary" aria-hidden />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold leading-tight">{s.label}</span>
                      <span className="block text-[12px] text-muted-foreground truncate">{s.hint}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-primary" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              data-testid="account-logout"
              onClick={() => logoutCustomer()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border min-h-12 text-[14px] font-semibold text-destructive transition hover:bg-destructive/5"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden />
              ออกจากระบบ
            </button>
          </section>


          {/* เกี่ยวกับแอป — แถบเล็กท้ายหน้า ไม่ดันโครงหน้า */}
          <section className="pt-2 pb-1 text-center" data-testid="account-app-version">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <Info className="inline w-3 h-3 mr-1 -mt-0.5 text-primary" aria-hidden />
              <span data-testid="account-build-version">v{BUILD_INFO.version}</span>
              {" · "}
              <span data-testid="account-build-date">{formatThaiDateTime(BUILD_INFO.builtAt)}</span>
              {" · "}
              <span className="font-mono break-all" data-testid="account-build-id">{RUNNING_TAG}</span>
              <span className="sr-only" data-testid="account-remote-build">{remoteTag ?? "กำลังตรวจสอบ…"}</span>
            </p>
            <div className="mt-1 flex items-center justify-center gap-1">
              <button
                type="button"
                data-testid="account-sync-line"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  const ok = await syncLineProfile();
                  setSyncing(false);
                  if (ok) toast.success("ซิงก์ข้อมูลจาก LINE แล้ว");
                  else toast.error("ซิงก์ข้อมูลจาก LINE ไม่สำเร็จ");
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground disabled:opacity-60"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} aria-hidden />
                {syncing ? "กำลังซิงก์" : "ซิงก์ LINE"}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground"
              >
                <RefreshCw className="w-3 h-3" aria-hidden /> รีเฟรช
              </button>
              {hasUpdate && (
                <button
                  type="button"
                  data-testid="account-update-now"
                  onClick={() => void refreshAppAssets()}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-primary"
                >
                  <RefreshCw className="w-3 h-3" aria-hidden /> มีเวอร์ชันใหม่ — อัปเดต
                </button>
              )}
            </div>
            {hasUpdate && <span className="sr-only" data-testid="account-update-available">มีเวอร์ชันใหม่พร้อมใช้งาน</span>}
          </section>
        </div>
      </div>
    </CustomerLayout>
  );
}

/** ปุ่มไอคอนบนหัวโปรไฟล์ พร้อมป้ายกำกับใต้ไอคอนและ badge จำนวน (ซ่อนเมื่อเป็น 0) */
function HeaderIcon({
  label, srLabel, children, onClick, badge, testId,
}: {
  label: string; srLabel?: string; children: React.ReactNode; onClick: () => void; badge?: string | null; testId?: string;
}) {
  const full = srLabel || label;
  return (
    <button
      type="button"
      aria-label={badge ? `${full} ${badge} รายการ` : full}
      data-testid={testId}
      onClick={onClick}
      className="relative min-h-11 min-w-11 px-1 pt-1.5 pb-1 rounded-xl grid justify-items-center gap-1 text-primary-foreground hover:bg-primary-foreground/15 transition"
    >
      {children}
      <span className="text-[11px] leading-none font-medium text-primary-foreground/90">{label}</span>
      {badge && (
        <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}
