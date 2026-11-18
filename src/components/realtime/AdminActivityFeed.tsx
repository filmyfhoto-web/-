import { useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Activity, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LEGACY_OPS_MENUS } from "@/lib/legacyUi";

type Row = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: any;
  user_id: string | null;
  created_at: string;
  __new?: boolean;
};

const TH_ACTION: Record<string, string> = {
  status_change: "เปลี่ยนสถานะ",
  doc_create: "ออกเอกสารใหม่",
  doc_update: "แก้ไขเอกสาร",
  doc_delete: "ลบเอกสาร",
  price_update: "เปลี่ยนราคา",
  stock_update: "ปรับสต๊อก",
  order_status: "เปลี่ยนสถานะออเดอร์",
  customer_update: "แก้ไขข้อมูลลูกค้า",
  product_update: "แก้ไขสินค้า",
};

function targetLink(r: Row): string | null {
  if (!r.target_id) return null;
  switch (r.target_type) {
    case "order": return LEGACY_OPS_MENUS ? `/admin/work-docs?filter=order` : null;
    case "document": return r.detail?.store_slug
      ? `/receipts/${r.detail.store_slug}/documents/${r.target_id}/edit`
      : null;
    case "product": return `/admin/products`;
    case "customer": return LEGACY_OPS_MENUS ? `/admin/customers` : null;
    default: return null;
  }
}

/**
 * Realtime feed of the latest activity across the system. Subscribes to
 * INSERTs on both `activity_logs` and `rds_activity_logs` and merges them.
 */
export function AdminActivityFeed({
  limit = 30,
  table = "activity_logs",
  storeId,
  title = "กิจกรรมล่าสุด",
}: {
  limit?: number;
  table?: string;
  storeId?: string;
  title?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      let q = supabase.from(table as any).select("*").order("created_at", { ascending: false }).limit(limit);
      if (table !== "activity_logs" && storeId) q = q.eq("store_id", storeId);
      const { data } = await q;
      if (!cancel) {
        setRows(((data ?? []) as unknown) as Row[]);
        setLoading(false);
      }
    })();
    const ch = liveChannel(`feed:${table}:${storeId ?? "all"}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table },
        (payload) => {
          const r = payload.new as Row;
          if (table !== "activity_logs" && storeId && (r as any).store_id !== storeId) return;
          setRows((prev) => [{ ...r, __new: true }, ...prev].slice(0, limit));
          window.setTimeout(() => {
            setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, __new: false } : x)));
          }, 2500);
        })
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, [limit, table, storeId]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> {title}
        </h2>
        <span className="text-[11px] text-muted-foreground">อัปเดตอัตโนมัติ</span>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground py-4 text-center">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">ยังไม่มีกิจกรรม</p>
      ) : (
        <ul className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {rows.map((r) => {
            const link = targetLink(r);
            const detail = typeof r.detail === "object" ? r.detail : {};
            const summary = detail?.summary || detail?.status || detail?.no || r.target_type || "";
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-md border border-border px-2.5 py-1.5 text-sm flex items-start gap-2 transition-colors",
                  r.__new && "bg-amber-50 dark:bg-amber-950/30 border-amber-300 animate-pulse",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-xs">{TH_ACTION[r.action] ?? r.action}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("th-TH")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{String(summary)}</p>
                </div>
                {link && (
                  <Link
                    to={link}
                    className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    ไปยังรายการ <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}