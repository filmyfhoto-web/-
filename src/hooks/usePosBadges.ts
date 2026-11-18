import { useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import { useBadgeSettings } from "@/lib/posBadgeSettings";

export interface PosBadges {
  delivery: number;
  lowStock: number;
  pendingPo: number;
  pendingReceipts: number;
  todaySales: number;
  todayCount: number;
}

const EMPTY: PosBadges = {
  delivery: 0,
  lowStock: 0,
  pendingPo: 0,
  pendingReceipts: 0,
  todaySales: 0,
  todayCount: 0,
};

export function usePosBadges(): PosBadges {
  const [b, setB] = useState<PosBadges>(EMPTY);
  const settings = useBadgeSettings();

  async function load() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startISO = start.toISOString();

    const master = settings.enabled;
    const deliveryQ = master && settings.delivery.enabled && settings.delivery.statuses.length > 0
      ? supabase.from("pos_receipts").select("id", { count: "exact", head: true }).in("delivery_status", settings.delivery.statuses)
      : Promise.resolve({ count: 0, data: null } as any);
    const poQ = master && settings.pendingPo.enabled && settings.pendingPo.statuses.length > 0
      ? supabase.from("purchase_orders").select("id", { count: "exact", head: true }).in("status", settings.pendingPo.statuses)
      : Promise.resolve({ count: 0, data: null } as any);
    const receiptsQ = master && settings.pendingReceipts.enabled
      ? supabase.from("pos_receipts").select("id", { count: "exact", head: true }).eq("payment_status", "pending").is("cancelled_at", null)
      : Promise.resolve({ count: 0, data: null } as any);
    const lowQ = master && settings.lowStock.enabled
      ? supabase.from("products").select("id, stock, low_stock_threshold")
      : Promise.resolve({ data: [] } as any);

    const [delivery, po, receipts, today, low] = await Promise.all([
      deliveryQ,
      poQ,
      receiptsQ,
      supabase.from("pos_receipts").select("total, cancelled_at").gte("created_at", startISO),
      lowQ,
    ]);

    const todayRows = (today.data ?? []).filter((r: { cancelled_at: string | null }) => !r.cancelled_at);
    const defTh = settings.lowStock.defaultThreshold;
    const lowRows = (low.data ?? []).filter(
      (r: { stock: number | null; low_stock_threshold: number | null }) => {
        const th = Number(r.low_stock_threshold ?? 0) > 0 ? Number(r.low_stock_threshold) : defTh;
        return th > 0 && Number(r.stock ?? 0) <= th;
      },
    );

    setB({
      delivery: delivery.count ?? 0,
      lowStock: lowRows.length,
      pendingPo: po.count ?? 0,
      pendingReceipts: receipts.count ?? 0,
      todayCount: todayRows.length,
      todaySales: todayRows.reduce((s, r: { total: number }) => s + Number(r.total || 0), 0),
    });
  }

  useEffect(() => {
    load();
    const ch = liveChannel(`pos-badges-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_receipts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => load())
      .subscribe();
    const t = setInterval(load, 60_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  return b;
}