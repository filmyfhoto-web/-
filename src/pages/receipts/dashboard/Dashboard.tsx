import { useEffect, useMemo, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore, storeBasePath, useStoreSlug } from "../useStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Receipt, Truck, Wallet, CalendarDays, CalendarRange, Percent, Users, Package, ClipboardList, ShoppingBag } from "lucide-react";
import { AdminActivityFeed } from "@/components/realtime/AdminActivityFeed";
import { tbl } from "../lib/tbl";

const TH_TYPES: Record<string, string> = {
  receipt: "ใบเสร็จรับเงิน",
  delivery: "ใบส่งของ",
  tax_invoice: "ใบกำกับภาษี",
  quotation: "ใบเสนอราคา",
  // Legacy fallback so historical rows still show a label.
  invoice: "ใบแจ้งหนี้ (เลิกใช้)",
};

const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  to,
  tone = "primary",
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
  to?: string;
  tone?: "primary" | "amber" | "emerald" | "sky" | "rose" | "violet" | "orange" | "teal" | "slate";
}) {
  const tones: Record<string, { bg: string; ring: string; icon: string; grad: string }> = {
    primary: { bg: "bg-primary/10", ring: "ring-primary/20", icon: "text-primary", grad: "from-primary/60 to-primary" },
    amber:   { bg: "bg-amber-500/10", ring: "ring-amber-500/20", icon: "text-amber-600", grad: "from-amber-400 to-amber-600" },
    emerald: { bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", icon: "text-emerald-600", grad: "from-emerald-400 to-emerald-600" },
    sky:     { bg: "bg-sky-500/10", ring: "ring-sky-500/20", icon: "text-sky-600", grad: "from-sky-400 to-sky-600" },
    rose:    { bg: "bg-rose-500/10", ring: "ring-rose-500/20", icon: "text-rose-600", grad: "from-rose-400 to-rose-600" },
    violet:  { bg: "bg-accent/60", ring: "ring-primary/20", icon: "text-primary", grad: "from-primary to-primary" },
    orange:  { bg: "bg-orange-500/10", ring: "ring-orange-500/20", icon: "text-orange-600", grad: "from-orange-400 to-orange-600" },
    teal:    { bg: "bg-teal-500/10", ring: "ring-teal-500/20", icon: "text-teal-600", grad: "from-teal-400 to-teal-600" },
    slate:   { bg: "bg-slate-500/10", ring: "ring-slate-500/20", icon: "text-slate-600", grad: "from-slate-400 to-slate-600" },
  };
  const t = tones[tone] ?? tones.primary;
  const inner = (
    <Card
      className={cn(
        "relative overflow-hidden p-5 flex items-start gap-4 transition-all ring-1",
        t.ring,
        to && "cursor-pointer hover:-translate-y-0.5 hover:shadow-glow"
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", t.grad)} />
      <div className={cn("rounded-xl p-2.5", t.bg, t.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-1" />
        ) : (
          <p className="text-xl md:text-2xl font-bold text-foreground mt-0.5 truncate">{value}</p>
        )}
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      </div>
    </Card>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

export default function ReceiptsDashboard() {
  const { store, slug } = useCurrentStore();
  const qc = useQueryClient();
  const storeId = store?.id;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStart = `${todayStr.slice(0, 7)}-01`;

  const docsQ = useQuery({
    queryKey: ["rds_dashboard_docs", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("documents") as any)
        .select("id, document_no, document_type, document_date, grand_total, vat_amount, customer_name, status, internal_sale_type")
        .eq("store_id", storeId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const countsQ = useQuery({
    queryKey: ["rds_dashboard_counts", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const [c, p] = await Promise.all([
        supabase.from(tbl("customers") as any).select("id", { count: "exact", head: true }).eq("store_id", storeId!),
        supabase.from(tbl("products") as any).select("id", { count: "exact", head: true }).eq("store_id", storeId!),
      ]);
      return { customers: c.count ?? 0, products: p.count ?? 0 };
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const ch = liveChannel(`dashboard-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tbl("documents"), filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: ["rds_dashboard_docs", storeId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [storeId, qc]);

  const stats = useMemo(() => {
    const docs = docsQ.data ?? [];
    const isSale = (t: string) => t === "receipt" || t === "tax_invoice" || t === "delivery";
    return {
      total: docs.length,
      receipts: docs.filter((d) => d.document_type === "receipt").length,
      // Colorlab merges receipt + tax_invoice into one combined document type,
      // so the "รวมใบเสร็จ/ใบกำกับภาษี" tile sums both without double-counting.
      receiptsCombined: docs.filter(
        (d) => d.document_type === "receipt" || d.document_type === "tax_invoice" || d.document_type === "invoice",
      ).length,
      deliveries: docs.filter((d) => d.document_type === "delivery").length,
      sumAll: docs.reduce((s, d) => s + Number(d.grand_total || 0), 0),
      today: docs
        .filter((d) => d.document_date === todayStr && isSale(d.document_type))
        .reduce((s, d) => s + Number(d.grand_total || 0), 0),
      month: docs
        .filter((d) => d.document_date >= monthStart && isSale(d.document_type))
        .reduce((s, d) => s + Number(d.grand_total || 0), 0),
      vat: docs.reduce((s, d) => s + Number(d.vat_amount || 0), 0),
      // Internal sale split (staff-only metrics). `bill_only` = ซื้อบิล,
      // `real_goods` = ซื้อของจริง. Anything else falls back to `real_goods`.
      billOnlyCount: docs.filter((d) => d.internal_sale_type === "bill_only").length,
      realGoodsCount: docs.filter((d) => (d.internal_sale_type ?? "real_goods") === "real_goods").length,
      billOnlySum: docs
        .filter((d) => d.internal_sale_type === "bill_only" && isSale(d.document_type))
        .reduce((s, d) => s + Number(d.grand_total || 0), 0),
      realGoodsSum: docs
        .filter((d) => (d.internal_sale_type ?? "real_goods") === "real_goods" && isSale(d.document_type))
        .reduce((s, d) => s + Number(d.grand_total || 0), 0),
      latest: docs.slice(0, 10),
    };
  }, [docsQ.data, todayStr, monthStart]);

  const loading = docsQ.isLoading;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">{store?.name ?? "..."}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard tone="primary" to={`${storeBasePath(slug)}/documents`} icon={FileText} label="จำนวนเอกสารทั้งหมด" value={String(stats.total)} loading={loading} />
        {slug === "colorlab" ? (
          <StatCard
            tone="rose"
            to={`${storeBasePath(slug)}/documents?type=receipt_tax`}
            icon={Receipt}
            label="รวมใบเสร็จ/ใบกำกับภาษี"
            value={String(stats.receiptsCombined)}
            loading={loading}
          />
        ) : (
          <StatCard tone="rose" to={`${storeBasePath(slug)}/documents?type=receipt`} icon={Receipt} label="รวมใบเสร็จ" value={String(stats.receipts)} loading={loading} />
        )}
        <StatCard tone="sky" to={`${storeBasePath(slug)}/documents?type=delivery`} icon={Truck} label="รวมใบส่งของ" value={String(stats.deliveries)} loading={loading} />
        <StatCard tone="emerald" to={`${storeBasePath(slug)}/documents`} icon={Wallet} label="รวมยอดเงิน (บาท)" value={fmt(stats.sumAll)} loading={loading} />
        <StatCard tone="orange" to={`${storeBasePath(slug)}/reports`} icon={CalendarDays} label="ยอดขายวันนี้" value={fmt(stats.today)} loading={loading} />
        <StatCard tone="amber" to={`${storeBasePath(slug)}/reports`} icon={CalendarRange} label="ยอดขายเดือนนี้" value={fmt(stats.month)} loading={loading} />
        {store?.vat_enabled && (
          <StatCard tone="violet" to={`${storeBasePath(slug)}/reports`} icon={Percent} label="VAT รวม" value={fmt(stats.vat)} loading={loading} />
        )}
        <StatCard tone="teal" to={`${storeBasePath(slug)}/customers`} icon={Users} label="จำนวนลูกค้า" value={String(countsQ.data?.customers ?? 0)} loading={countsQ.isLoading} />
        <StatCard tone="slate" to={`${storeBasePath(slug)}/products`} icon={Package} label="จำนวนสินค้า" value={String(countsQ.data?.products ?? 0)} loading={countsQ.isLoading} />
      </div>

      {/* Internal sale-type breakdown (staff-only metrics; never reaches customers). */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4" data-testid="internal-sale-stats">
        <StatCard tone="emerald" to={`${storeBasePath(slug)}/documents`} icon={ShoppingBag} label="ยอดขาย — ซื้อของจริง" value={fmt(stats.realGoodsSum)} loading={loading} />
        <StatCard tone="orange" to={`${storeBasePath(slug)}/documents`} icon={ClipboardList} label="ยอดขาย — ซื้อบิล" value={fmt(stats.billOnlySum)} loading={loading} />
        <StatCard tone="emerald" to={`${storeBasePath(slug)}/documents`} icon={ShoppingBag} label="จำนวนเอกสารซื้อของจริง" value={String(stats.realGoodsCount)} loading={loading} />
        <StatCard tone="orange" to={`${storeBasePath(slug)}/documents`} icon={ClipboardList} label="จำนวนเอกสารซื้อบิล" value={String(stats.billOnlyCount)} loading={loading} />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">เอกสารล่าสุด</h2>
          <Button asChild variant="outline" size="sm">
            <Link to={`${storeBasePath(slug)}/documents`}>ดูทั้งหมด</Link>
          </Button>
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : stats.latest.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">ยังไม่มีเอกสาร</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs uppercase">
                <tr>
                  <th className="py-2 pr-3">เลขที่</th>
                  <th className="py-2 pr-3">วันที่</th>
                  <th className="py-2 pr-3">ประเภท</th>
                  <th className="py-2 pr-3">ลูกค้า</th>
                  <th className="py-2 pr-3 text-right">ยอด</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stats.latest.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="py-2 pr-3 font-mono text-xs">{d.document_no}</td>
                    <td className="py-2 pr-3">{d.document_date}</td>
                    <td className="py-2 pr-3">
                      {slug === "colorlab" &&
                      (d.document_type === "receipt" || d.document_type === "tax_invoice" || d.document_type === "invoice")
                        ? "ใบเสร็จรับเงิน/ใบกำกับภาษี"
                        : (TH_TYPES[d.document_type] ?? d.document_type)}
                    </td>
                    <td className="py-2 pr-3">{d.customer_name || "-"}</td>
                    <td className="py-2 pr-3 text-right">{fmt(Number(d.grand_total || 0))}</td>
                    <td className="py-2 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`${storeBasePath(slug)}/documents/${d.id}/edit`}>ดู</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {store?.id && (
        <AdminActivityFeed limit={30} table={tbl("activity_logs")} storeId={store.id} title="ฟีดกิจกรรมร้าน" />
      )}
    </div>
  );
}