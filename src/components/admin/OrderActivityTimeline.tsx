import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";
import {
  fetchOrderActivity,
  orderActionLabel,
  summarizeDetail,
  type OrderActivityRow,
} from "@/lib/orderActivity";

const FILTERS: Array<{ key: string; label: string; match: (a: string) => boolean }> = [
  { key: "all", label: "ทั้งหมด", match: () => true },
  {
    key: "downloads",
    label: "ดาวน์โหลดทั้งหมด",
    match: (a) => a === "order_export_csv" || a === "order_export_xlsx" || a === "order_pdf_download",
  },
  { key: "csv", label: "CSV", match: (a) => a === "order_export_csv" },
  { key: "xlsx", label: "Excel (XLSX)", match: (a) => a === "order_export_xlsx" },
  { key: "pdf", label: "ใบสั่งงาน (PDF)", match: (a) => a === "order_pdf_download" },
  { key: "docs", label: "สร้างเอกสาร", match: (a) => a === "order_document_create" },
  { key: "line", label: "ส่ง LINE ซ้ำ", match: (a) => a === "order_line_resend" },
];

/**
 * Read-only audit timeline for a single order. Staff-only data — the RPC
 * itself refuses non-staff callers, so this renders empty for customers.
 */
export default function OrderActivityTimeline({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<OrderActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await fetchOrderActivity(orderId));
    setLoading(false);
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    return rows.filter((r) => f.match(r.action));
  }, [rows, filter]);

  return (
    <div className="space-y-2" data-testid="order-activity-timeline">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <History className="w-4 h-4" /> ประวัติการกระทำ
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            data-testid="timeline-filter"
            aria-label="กรองประเภทกิจกรรม"
          >
            {FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
        </div>
      ) : shown.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {rows.length === 0 ? "ยังไม่มีประวัติการกระทำ" : "ไม่มีรายการตามตัวกรองนี้"}
        </div>
      ) : (
        <ol className="relative border-l pl-4 space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
              <div className="font-medium">{orderActionLabel(r.action)}</div>
              <div className="text-xs text-muted-foreground">
                {fmtDateTime(r.created_at)}
                {r.user_email ? ` · ${r.user_email}` : ""}
              </div>
              {summarizeDetail(r.detail) && (
                <div className="text-xs text-muted-foreground">{summarizeDetail(r.detail)}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}