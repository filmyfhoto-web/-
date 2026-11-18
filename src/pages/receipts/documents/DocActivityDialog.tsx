import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { fetchDocActivity, type DocActivityRow } from "../lib/activityLog";
import { getDocLabel } from "../lib/docTheme";

interface Props {
  open: boolean;
  onClose: () => void;
  storeId: string | null | undefined;
  docId: string | null;
  docNo: string | null;
}

/**
 * Human-readable Thai label per action — covers the audit events we emit
 * from `DocumentForm` (type change, DN guard block, print) plus a few
 * background events written by DB triggers. Unknown actions fall back to
 * the raw string so legacy entries still display something useful.
 */
const ACTION_LABEL: Record<string, { label: string; tone: "default" | "destructive" | "secondary" | "outline" }> = {
  document_type_change:           { label: "ย้ายประเภทเอกสาร", tone: "secondary" },
  delivery_blocked_no_quotation:  { label: "บล็อกการสร้างใบส่งของ", tone: "destructive" },
  document_print:                 { label: "พิมพ์เอกสาร", tone: "default" },
  document_print_error:           { label: "พิมพ์ไม่สำเร็จ", tone: "destructive" },
  document_status_change:         { label: "เปลี่ยนสถานะ", tone: "outline" },
  document_create:                { label: "สร้างเอกสาร", tone: "default" },
  document_restore_from_sheets:   { label: "กู้คืนจาก Sheets", tone: "secondary" },
};

function formatDetail(action: string, detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  const d = detail as Record<string, any>;
  if (action === "document_type_change") {
    const from = `${getDocLabel(d.from_type)} ${d.from_no ?? ""}`.trim();
    const to = `${getDocLabel(d.to_type)} ${d.new_no ?? d.to_no ?? ""}`.trim();
    return `${from}  →  ${to}`;
  }
  if (action === "delivery_blocked_no_quotation") {
    const reason =
      d.reason === "quotation_not_printed"
        ? "ใบเสนอราคาที่อ้างอิงยังไม่ได้พิมพ์"
        : "ไม่ได้อ้างอิงใบเสนอราคา";
    const rel = d.related_document_no ? ` · อ้างถึง ${d.related_document_no}` : "";
    return `${reason}${rel}`;
  }
  if (action === "document_status_change") {
    return `${d.old_status ?? "—"} → ${d.new_status ?? "—"}`;
  }
  const keys = Object.keys(d).filter((k) => d[k] !== null && d[k] !== "");
  if (!keys.length) return "";
  return keys.slice(0, 3).map((k) => `${k}: ${String(d[k])}`).join(" · ");
}

/**
 * Read-only timeline dialog. Lists every audit row that references this
 * document so users can answer "why does this DN exist? who blocked the
 * last attempt? when was the QT converted?" without leaving the page.
 */
export default function DocActivityDialog({ open, onClose, storeId, docId, docNo }: Props) {
  const [rows, setRows] = useState<DocActivityRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchDocActivity(storeId ?? "", docId, docNo).then((r) => {
      if (!cancelled) {
        setRows(r);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [open, storeId, docId, docNo]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="doc-activity-dialog" className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>ประวัติเอกสาร {docNo ?? ""}</DialogTitle>
          <DialogDescription>
            ประวัติการเปลี่ยนประเภท, การบล็อกการสร้าง, การพิมพ์, และเหตุการณ์อื่นที่เกี่ยวข้องกับเอกสารฉบับนี้
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> กำลังโหลด…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            ยังไม่มีกิจกรรมสำหรับเอกสารนี้
          </div>
        ) : (
          <ol className="space-y-2">
            {rows.map((r) => {
              const meta = ACTION_LABEL[r.action] ?? { label: r.action, tone: "outline" as const };
              return (
                <li key={r.id} className="rounded-md border p-3 text-sm flex flex-col gap-1" data-testid="doc-activity-row">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={meta.tone}>{meta.label}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  <div className="text-foreground/90">{formatDetail(r.action, r.detail)}</div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}