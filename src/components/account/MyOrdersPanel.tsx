import { liveChannel } from "@/lib/realtimeChannel";
import { useGuest } from "@/contexts/GuestContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fmtDateTime, fmtTHB, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/format";
import { ClipboardList, Package, RefreshCw, BellRing, CheckCircle2, MessageCircle, Receipt, Wallet, PackageCheck, Truck, Star, UserCircle2, Bell, FileSignature, BadgePercent, Sparkles, MapPin, FileText, FolderOpen, Settings2, ShoppingCart } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataEmptyState, DataListSkeleton } from "@/components/common/DataStates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OrderSuccessLineDialog from "@/components/shop/OrderSuccessLineDialog";
import { readIdToken } from "@/lib/lineSession";
import { useLineCustomer } from "@/contexts/LineCustomerContext";
import { filterByBucket, getBucket, isBucketKey } from "@/lib/customerOrderBuckets";

/** Customer-facing status shortcuts, mapped onto real order statuses. */
const BUCKETS: { key: string; label: string; icon: typeof Wallet; statuses: string[] }[] = [
  { key: "awaiting", label: "รอประเมินราคา", icon: FileSignature, statuses: ["pending_quote"] },
  { key: "unpaid", label: "รอชำระเงิน", icon: Wallet, statuses: ["quoted"] },
  { key: "preparing", label: "กำลังผลิต", icon: PackageCheck, statuses: ["approved", "picking"] },
  { key: "shipping", label: "พร้อมรับ/จัดส่ง", icon: Truck, statuses: ["ready"] },
  { key: "done", label: "เสร็จสิ้น/ให้คะแนน", icon: Star, statuses: ["completed"] },
];

/** ทางลัดบัญชีลูกค้า (ลำดับตามภาพอ้างอิงที่ 2) */
const ACCOUNT_LINKS: { key: string; label: string; icon: typeof Wallet; to: string }[] = [
  { key: "coupons", label: "สิทธิพิเศษและคูปอง", icon: BadgePercent, to: "/cart#coupon" },
  { key: "points", label: "แต้มสะสม", icon: Sparkles, to: "/my-account#points" },
  { key: "address", label: "ที่อยู่และวิธีรับสินค้า", icon: MapPin, to: "/cart#pickup" },
  { key: "tax", label: "ข้อมูลออกใบกำกับภาษี", icon: FileText, to: "/cart#tax" },
  { key: "files", label: "ไฟล์ของฉัน", icon: FolderOpen, to: "/my-account#files" },
  { key: "contact", label: "ติดต่อร้าน", icon: MessageCircle, to: "/notifications" },
];

/**
 * แผงประวัติคำสั่งซื้อของลูกค้า — ย้ายมาจากหน้า /my-orders เดิมทั้งก้อน
 * ตอนนี้ฝังอยู่ในหน้า "ฉัน" (/my-account) เพื่อให้เหลือหน้าเดียว
 * รองรับ ?order=<id> เพื่อเลื่อนไปยังออเดอร์ที่แจ้งเตือนทาง LINE ส่งมา
 */
export default function MyOrdersPanel() {
  const { session } = useGuest();
  const { profile: lineProfile } = useLineCustomer();
  const nav = useNavigate();
  // ถังสถานะ 4 ช่องจากหน้า "บัญชีของฉัน" (deep link ?bucket=...)
  const [searchParams, setSearchParams] = useSearchParams();
  const accountBucketKey = isBucketKey(searchParams.get("bucket")) ? searchParams.get("bucket")! : "all";
  const accountBucket = getBucket(accountBucketKey);
  const [status, setStatus] = useState<string>("all");
  const [bucket, setBucket] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nudgeDialog, setNudgeDialog] = useState<{ open: boolean; order: any | null }>({ open: false, order: null });
  const [shopLine, setShopLine] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_public_settings");
      const row: any = Array.isArray(data) ? data[0] : data;
      setShopLine(row?.line_url || null);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Prefer server-scoped LINE-verified endpoint. Ownership is derived
      // from the verified id_token/Supabase JWT — never from client input.
      const id_token = readIdToken();
      if (id_token || lineProfile) {
        const { data, error } = await supabase.functions.invoke("my-line-orders", {
          body: { action: "list", ...(id_token ? { id_token } : {}) },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        setOrders(((data as any)?.orders ?? []) as any[]);
        // ตัวตนหมดอายุ → บอกให้เข้าสู่ระบบใหม่ แทนที่จะโชว์ "ไม่มีงาน" เฉยๆ
        if ((data as any)?.auth_expired) {
          setError("เซสชันหมดอายุ กรุณาเปิดจาก LINE หรือเข้าสู่ระบบใหม่เพื่อดูประวัติงานของคุณ");
        }
        return;
      }
      // Fallback for legacy guest sessions without any LINE proof.
      // ไม่มีตัวตนใดๆ → แสดงสถานะว่าง (ห้ามพาผู้ใช้ออกจากหน้า "ฉัน")
      if (!session?.guest_id || !session?.phone) { setOrders([]); return; }
      const { data, error } = await supabase.rpc("get_guest_orders", {
        p_guest_id: session.guest_id,
        p_phone: session.phone,
      });
      if (error) throw error;
      setOrders(((data as any[]) ?? []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  }, [session?.guest_id, session?.phone, lineProfile]);

  useEffect(() => { load(); }, [load]);

  // realtime: refresh when any order changes (server RPC re-filters)
  useEffect(() => {
    const ch = liveChannel("guest-my-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const visible = useMemo(() => filterByBucket(orders, accountBucketKey).filter((o: any) => {
    if (status !== "all" && o.status !== status) return false;
    if (bucket !== "all" && !(BUCKETS.find((b) => b.key === bucket)?.statuses ?? []).includes(o.status)) return false;
    if (dateFrom && new Date(o.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(o.created_at) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  }), [orders, status, bucket, dateFrom, dateTo, accountBucketKey]);

  const bucketCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of BUCKETS) m[b.key] = orders.filter((o: any) => b.statuses.includes(o.status)).length;
    return m;
  }, [orders]);

  // Orders that still need a LINE link. We only nudge for statuses where
  // an update is likely to arrive; we skip long-closed rows to avoid
  // useless prompts on ancient history.
  const unlinkedActive = useMemo(() => {
    const activeStatuses = new Set(["pending", "quoted", "confirmed", "processing"]);
    return orders.filter((o: any) => !o.line_user_id && !!o.line_link_token && activeStatuses.has(o.status));
  }, [orders]);
  const latestUnlinked = unlinkedActive[0] || null;

  // ลิงก์ "ดูรายละเอียดคำสั่งซื้อ" จาก LINE ส่งมาเป็น ?order=<id> — เลื่อนไปที่การ์ดนั้น
  const focusOrderId = searchParams.get("order");
  const scrolledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusOrderId || loading || scrolledRef.current === focusOrderId) return;
    const el = document.getElementById(`order-card-${focusOrderId}`);
    if (!el) return;
    scrolledRef.current = focusOrderId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusOrderId, loading, visible]);

  return (
    <div data-testid="my-orders-panel">
      {/* Status shortcuts driven by real order data. */}
      <section className="mb-4 rounded-2xl border border-border bg-card p-3 shadow-card" aria-label="คำสั่งซื้อของฉัน">
        <div className="text-sm font-semibold mb-2">คำสั่งซื้อของฉัน</div>
        {accountBucket && accountBucket.key !== "all" && (
          <div className="mb-2 flex items-center gap-2" data-testid="orders-account-bucket-chip">
            <span className="rounded-full bg-primary/10 text-primary text-xs px-3 py-1">
              กรอง: {accountBucket.label}
            </span>
            <button
              type="button"
              className="text-xs underline text-muted-foreground min-h-11"
              onClick={() => { const p = new URLSearchParams(searchParams); p.delete("bucket"); setSearchParams(p, { replace: true }); }}
            >
              ล้างตัวกรอง
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {BUCKETS.map((b, index) => (
            <button
              key={b.key}
              type="button"
              data-testid={`order-bucket-${b.key}`}
              aria-pressed={bucket === b.key}
              onClick={() => { setBucket((cur) => (cur === b.key ? "all" : b.key)); setStatus("all"); }}
              className={`min-h-12 rounded-xl px-1.5 py-2 grid place-items-center gap-1 text-[11px] transition sm:min-h-14 ${
                index === BUCKETS.length - 1 ? "col-span-2 sm:col-span-1" : ""
              } ${
                bucket === b.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <span className="relative">
                <b.icon className="h-5 w-5" aria-hidden />
                {bucketCounts[b.key] > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                    {bucketCounts[b.key]}
                  </span>
                )}
              </span>
              <span className="text-center leading-tight">{b.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ทางลัดบัญชี — คูปอง แต้ม ที่อยู่ ใบกำกับภาษี ไฟล์ ติดต่อร้าน */}
      <section className="mb-4 rounded-2xl border border-border bg-card p-3 shadow-card" aria-label="บัญชีของฉัน" data-testid="orders-account-links">
        <div className="text-sm font-semibold mb-2">บัญชีของฉัน</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ACCOUNT_LINKS.map((l) => (
            <Link
              key={l.key}
              to={l.to}
              data-testid={`account-link-${l.key}`}
              className="min-h-11 rounded-xl border border-border px-3 py-2 flex items-center gap-2 text-xs hover:bg-accent transition"
            >
              <l.icon className="w-4 h-4 text-primary shrink-0" aria-hidden />
              <span className="truncate">{l.label}</span>
            </Link>
          ))}
        </div>
      </section>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" /> ประวัติคำสั่งซื้อ
          <span className="text-sm font-normal text-muted-foreground">({orders.length})</span>
        </h1>
        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { load(); toast.message("รีเฟรชแล้ว"); }}>
          <RefreshCw className="w-4 h-4 mr-1" /> รีเฟรช
        </Button>
      </div>
      {session && (
        <p className="text-xs text-muted-foreground mb-3">
          แสดงเฉพาะคำสั่งซื้อของ <span className="font-medium text-foreground">{session.name}</span> ({session.phone})
          {session.org_name ? <> · {session.org_name}</> : null}
        </p>
      )}
      {latestUnlinked && (
        <div className="mb-4 bg-[#06C755]/5 border-l-4 border-[#06C755] border-y border-r border-[#06C755]/30 rounded-2xl p-3 sm:p-4 flex items-center gap-3">
          <BellRing className="w-5 h-5 text-[#06C755] shrink-0" />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-semibold">
              คุณมี {unlinkedActive.length} ออเดอร์ที่ยังไม่ผูก LINE
            </div>
            <div className="text-xs text-muted-foreground">
              ผูกครั้งเดียวเพื่อรับแจ้งเตือนสถานะออเดอร์ทันทีเมื่อร้านอัปเดต
            </div>
          </div>
          <Button
            size="sm"
            className="rounded-lg bg-[#06C755] hover:bg-[#05b84c] text-white shrink-0"
            onClick={() => setNudgeDialog({ open: true, order: latestUnlinked })}
          >
            ผูกเลย
          </Button>
        </div>
      )}
      <div className="mb-4 grid gap-2 sm:flex sm:flex-wrap">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full rounded-xl sm:w-44"><SelectValue placeholder="สถานะ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-xl sm:w-40" aria-label="วันที่เริ่ม" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-xl sm:w-40" aria-label="วันที่สิ้นสุด" />
      </div>
      {error && <div className="mb-3 text-sm text-destructive">โหลดข้อมูลล้มเหลว: {error}</div>}
      <div className="space-y-3">
        {loading && <DataListSkeleton rows={4} testId="my-orders-skeleton" />}
        {!loading && visible.map((o: any) => (
          <div
            key={o.id}
            id={`order-card-${o.id}`}
            data-testid={focusOrderId === o.id ? "order-card-focused" : undefined}
            className={`bg-card rounded-2xl p-4 border shadow-card hover:shadow-glow transition-all ${
              focusOrderId === o.id ? "border-primary ring-2 ring-primary/40" : "border-border"
            }`}
          >
            <Link to={`/my-orders/${o.id}`} className="block">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-primary">{o.order_no}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(o.created_at)}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {o.line_user_id ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-[#06C755]/10 text-[#06C755] border border-[#06C755]/30">
                    <CheckCircle2 className="w-3 h-3" /> ผูก LINE แล้ว
                  </span>
                ) : o.line_link_token ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground border border-border">
                    <MessageCircle className="w-3 h-3" /> ยังไม่ผูก LINE
                  </span>
                ) : null}
                <span className={`px-3 py-1 text-xs rounded-full border ${ORDER_STATUS_COLOR[o.status] || ""}`}>{ORDER_STATUS_LABEL[o.status] || o.status}</span>
              </div>
            </div>
            {o.note && <div className="text-sm text-muted-foreground mt-2">{o.note}</div>}
            <div className="mt-3 flex justify-between items-end">
              <div className="text-xs text-muted-foreground">ยอดรวม</div>
              <div className="font-bold text-lg">{o.total != null ? fmtTHB(Number(o.total)) : "รอเสนอราคา"}</div>
            </div>
            </Link>
            {o.due_date && (
              <div className="mt-2 text-xs text-muted-foreground">กำหนดรับ: {fmtDateTime(o.due_date)}</div>
            )}
            <div className="mt-3 flex flex-wrap gap-2" data-testid="order-card-actions">
              <Button size="sm" variant="outline" className="rounded-lg min-h-11" onClick={() => nav(`/my-orders/${o.id}`)}>
                ดูรายละเอียด
              </Button>
              {o.status === "quoted" && (
                <Button size="sm" className="rounded-lg min-h-11 bg-gradient-primary text-primary-foreground" onClick={() => nav(`/my-orders/${o.id}`)}>
                  ยืนยันแบบ / ชำระเงิน
                </Button>
              )}
              {o.status === "completed" && (
                <Button size="sm" variant="outline" className="rounded-lg min-h-11" data-testid="order-reorder" onClick={() => nav(`/my-orders/${o.id}?reorder=1`)}>
                  สั่งซ้ำ
                </Button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">ใบเสร็จ:</span>
              {o.receipt_issued_at ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-success/10 text-success border border-success/30">
                  ✅ ออกแล้ว · <span className="font-mono">{o.receipt_no}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-muted text-muted-foreground border border-border">
                  🕓 ยังไม่ออก
                </span>
              )}
            </div>
            {o.receipt_issued_at ? (
              <div className="mt-3 pt-3 border-t border-border">
                <Button
                  size="sm"
                  className="w-full rounded-lg bg-primary text-primary-foreground hover:opacity-90"
                  onClick={(e) => { e.preventDefault(); nav(`/my-orders/${o.id}/receipt`); }}
                >
                  <Receipt className="w-3.5 h-3.5 mr-1.5" /> 🧾 ดาวน์โหลดใบเสร็จ
                </Button>
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground text-center">
                ใบเสร็จจะพร้อมดาวน์โหลดหลังจากชำระเงินแล้ว
              </div>
            )}
            {!o.line_user_id && o.line_link_token && (
              <div className="mt-3 pt-3 border-t border-border">
                <Button
                  size="sm"
                  className="w-full rounded-lg bg-[#06C755] hover:bg-[#05b84c] text-white"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNudgeDialog({ open: true, order: o }); }}
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> ผูก LINE เพื่อติดตามออเดอร์
                </Button>
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && (
          <DataEmptyState
            icon={Package}
            title="ยังไม่มีคำสั่งซื้อตามเงื่อนไข"
            desc="ลองปรับตัวกรองสถานะหรือช่วงวันที่ แล้วดูอีกครั้ง"
            testId="my-orders-empty"
          />
        )}
      </div>
      <OrderSuccessLineDialog
        open={nudgeDialog.open}
        onOpenChange={(v) => setNudgeDialog((s) => ({ ...s, open: v }))}
        orderNo={nudgeDialog.order?.order_no}
        linkToken={nudgeDialog.order?.line_link_token || ""}
        shopLineUrl={shopLine}
        celebratory={false}
      />
    </div>
  );
}