import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LatestOrder = {
  id: string;
  order_no: string;
  status: string;
  total: number;
  created_at: string;
  customer_name: string | null;
  items: any[];
  source: "guest_orders" | "orders";
};

/** ออเดอร์ล่าสุดของลูกค้า LINE คนนี้ (ดูทั้ง guest_orders และ orders) */
export function useCustomerLatestOrder(lineUserId: string | null | undefined) {
  const [order, setOrder] = useState<LatestOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!lineUserId) { setOrder(null); return; }
    setLoading(true);
    (async () => {
      const [g, o] = await Promise.all([
        supabase
          .from("guest_orders" as any)
          .select("id,order_no,status,total,created_at,customer_name,items")
          .eq("line_user_id", lineUserId)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("orders" as any)
          .select("id,order_no,status,total,created_at,guest_name")
          .eq("line_user_id", lineUserId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (!alive) return;
      const cands: LatestOrder[] = [];
      const gr = (g.data ?? [])[0] as any;
      if (gr) cands.push({
        id: gr.id, order_no: gr.order_no, status: gr.status, total: Number(gr.total ?? 0),
        created_at: gr.created_at, customer_name: gr.customer_name ?? null,
        items: Array.isArray(gr.items) ? gr.items : [], source: "guest_orders",
      });
      const or = (o.data ?? [])[0] as any;
      if (or) cands.push({
        id: or.id, order_no: or.order_no, status: String(or.status), total: Number(or.total ?? 0),
        created_at: or.created_at, customer_name: or.guest_name ?? null,
        items: [], source: "orders",
      });
      cands.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      setOrder(cands[0] ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [lineUserId, tick]);

  // เรียลไทม์: สถานะออเดอร์เปลี่ยนแล้วรีโหลดการ์ดทันที
  useEffect(() => {
    if (!lineUserId) return;
    const bump = () => setTick((t) => t + 1);
    const channel = supabase
      .channel(`latest-order:${lineUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "guest_orders", filter: `line_user_id=eq.${lineUserId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `line_user_id=eq.${lineUserId}` }, bump)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [lineUserId]);

  return { order, loading };
}
