import { Link } from "react-router-dom";
import { CPO_REVIEW_LABEL, type CpoReviewStatus, fmtMoney } from "@/lib/customerPoTotals";

export interface NgPoRow {
  id: string;
  po_number: string | null;
  customer_name: string | null;
  school_or_org: string | null;
  itemCount: number;
  net_total: number;
  review_status: string;
  created_at: string;
}

const TONE: Record<string, string> = {
  not_sent: "bg-ng-chip text-ng-muted",
  awaiting_customer: "bg-ng-blue-tint text-ng-blue",
  revision_requested: "bg-ng-orange-tint text-ng-orange-deep",
  confirmed: "bg-ng-green-tint text-ng-green-deep",
  documented: "bg-ng-blue-tint text-ng-ink",
};

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  return d >= today ? `วันนี้ ${time} น.` : `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${time} น.`;
}

/** รายการใบสั่งซื้อของลูกค้าล่าสุด (การ์ด "งานล่าสุด" บนแดชบอร์ด) */
export function NgPurchaseOrderList({
  rows, readIds, onToggleRead,
}: { rows: NgPoRow[]; readIds: Record<string, true>; onToggleRead?: (id: string) => void }) {
  return (
    <ul className="mt-3 space-y-2" data-testid="ng-recent-po-list">
      {rows.map((r) => {
        const unread = !readIds[r.id];
        return (
          <li key={r.id}>
            <Link
              to={`/admin/customer-purchase-orders?focus=${r.id}&review=${r.review_status}`}
              data-testid="ng-recent-po-item"
              data-unread={unread ? "true" : undefined}
              className="block rounded-[12px] border border-ng-line-soft bg-ng-tint px-3 py-2.5 transition-colors hover:bg-ng-tint-hover"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-ng-ink">
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-ng-blue" aria-label="ยังไม่อ่าน" />}
                  <span className="truncate">{r.po_number || "ยังไม่มีเลขที่"}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE[r.review_status] ?? "bg-ng-chip text-ng-muted"}`}>
                  {CPO_REVIEW_LABEL[r.review_status as CpoReviewStatus] ?? r.review_status}
                </span>
              </div>
              <p className="mt-1 truncate text-[12.5px] text-ng-ink">
                {r.customer_name || "ไม่ระบุลูกค้า"}
                {r.school_or_org ? ` · ${r.school_or_org}` : ""}
                {` · ${r.itemCount} รายการ`}
              </p>
              <div className="mt-1 flex items-center justify-between text-[11.5px]">
                <span className="font-bold tabular-nums text-ng-ink">{fmtMoney(r.net_total)} บาท</span>
                <span className="tabular-nums text-ng-muted">{when(r.created_at)}</span>
              </div>
            </Link>
            {onToggleRead && (
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  data-testid="ng-recent-po-read"
                  onClick={() => onToggleRead(r.id)}
                  className="rounded-[8px] border border-ng-line bg-white px-2 py-0.5 text-[11px] font-semibold text-ng-muted hover:border-ng-line hover:text-ng-ink"
                >
                  {unread ? "ทำเครื่องหมายว่าอ่านแล้ว" : "ทำเป็นยังไม่อ่าน"}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default NgPurchaseOrderList;