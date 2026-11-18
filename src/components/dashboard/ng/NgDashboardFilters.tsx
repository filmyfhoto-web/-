import { CPO_REVIEW_LABEL, type CpoReviewStatus } from "@/lib/customerPoTotals";
import type { NgDashFilters } from "@/lib/dashboardInbox";
import { hasActiveDashFilters } from "@/lib/dashboardInbox";

const PO_STATUSES: CpoReviewStatus[] = [
  "not_sent", "awaiting_customer", "revision_requested", "confirmed", "documented",
] as CpoReviewStatus[];

const field = "h-8 rounded-[9px] border border-ng-line bg-white px-2 text-[12px] text-ng-ink outline-none focus:border-ng-line";

/** แถบตัวกรองของการ์ด "งานล่าสุด — ออเดอร์สั่งซื้อ" บนแดชบอร์ด */
export function NgDashboardFilters({
  value, onChange, orgs,
}: { value: NgDashFilters; onChange: (next: NgDashFilters) => void; orgs: string[] }) {
  const set = (patch: Partial<NgDashFilters>) => onChange({ ...value, ...patch });
  return (
    <section
      data-testid="ng-dash-filters"
      className="flex flex-wrap items-center gap-2 rounded-[14px] border border-ng-line bg-white p-3"
    >
      <span className="text-[12px] font-bold text-ng-ink">ตัวกรอง</span>
      <input
        type="date" aria-label="ตั้งแต่วันที่" data-testid="ng-filter-from"
        value={value.from} onChange={(e) => set({ from: e.target.value })} className={field}
      />
      <span className="text-[12px] text-ng-soft">ถึง</span>
      <input
        type="date" aria-label="ถึงวันที่" data-testid="ng-filter-to"
        value={value.to} onChange={(e) => set({ to: e.target.value })} className={field}
      />
      <select
        aria-label="สถานะออเดอร์สั่งซื้อ" data-testid="ng-filter-po-status"
        value={value.poStatus} onChange={(e) => set({ poStatus: e.target.value })} className={field}
      >
        <option value="">ออเดอร์สั่งซื้อ: ทุกสถานะ</option>
        {PO_STATUSES.map((s) => (
          <option key={s} value={s}>{CPO_REVIEW_LABEL[s] ?? s}</option>
        ))}
      </select>
      <select
        aria-label="หน่วยงาน" data-testid="ng-filter-org"
        value={value.org} onChange={(e) => set({ org: e.target.value })} className={field}
      >
        <option value="">ทุกหน่วยงาน</option>
        {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {hasActiveDashFilters(value) && (
        <button
          type="button" data-testid="ng-filter-clear"
          onClick={() => onChange({ from: "", to: "", poStatus: "", org: "" })}
          className="h-8 rounded-[9px] border border-ng-line px-2.5 text-[12px] font-semibold text-ng-muted hover:border-ng-line hover:text-ng-ink"
        >
          ล้างตัวกรอง
        </button>
      )}
    </section>
  );
}

export default NgDashboardFilters;
