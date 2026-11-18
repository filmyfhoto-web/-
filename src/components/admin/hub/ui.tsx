import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

const TONES: Record<string, string> = {
  sky: "bg-sky-100 text-sky-600",
  amber: "bg-amber-100 text-amber-600",
  green: "bg-emerald-100 text-emerald-600",
  violet: "bg-accent text-primary",
};

/** การ์ดสรุปยอด (KPI) — ไอคอนซ้าย ตัวเลขใหญ่ คำบรรยายด้านล่าง */
export function StatCard({ icon: Icon, tone = "violet", label, value, foot, footTone = "green", to, testId }: {
  icon: LucideIcon;
  tone?: keyof typeof TONES | string;
  label: string;
  value: number | string;
  foot?: string;
  footTone?: "green" | "amber";
  to?: string;
  testId?: string;
}) {
  const body = (
    <>
      <span className={`w-12 h-12 grid place-items-center ${TONES[tone] ?? TONES.violet}`}>
        <Icon className="w-6 h-6" />
      </span>
      <div className="min-w-0 text-left">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-extrabold tabular-nums leading-tight">{value}</div>
        {foot && (
          <div className={`text-[11px] mt-1 ${footTone === "green" ? "text-emerald-600" : "text-amber-600"}`}>● {foot}</div>
        )}
      </div>
    </>
  );
  if (to) {
    return (
      <Link to={to} data-testid={testId} className="ng-card p-4 flex items-start gap-3 transition-colors hover:bg-accent/40">
        {body}
      </Link>
    );
  }
  return <div className="ng-card p-4 flex items-start gap-3" data-testid={testId}>{body}</div>;
}

export type BadgeTone = "green" | "amber" | "muted";

/** ป้ายสถานะ: เขียว = สำเร็จ/ใช้งานปกติ, ส้ม = รอยืนยัน/รอดำเนินการ */
export function StatusBadge({ tone, children, testId }: { tone: BadgeTone; children: React.ReactNode; testId?: string }) {
  const cls = tone === "green"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-border bg-muted text-muted-foreground";
  return (
    <span data-testid={testId} data-tone={tone} className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

/** ขั้นตอนใน Context Sidebar (วงกลมเลข + กล่องเนื้อหา) */
export function Step({ n, title, hint, children }: {
  n: number; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 mb-3" data-testid={`hub-step-${n}`}>
      <span className="w-6 h-6 shrink-0 grid place-items-center bg-emerald-600 text-emerald-50 text-xs font-bold rounded-full">{n}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {hint && <div className="text-[11px] text-muted-foreground mb-1.5">{hint}</div>}
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

/** หัวข้อของแผงงาน */
export function PanelTitle({ title, subtitle, right }: {
  title: string; subtitle?: string; right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** ชิปตัวกรองสถานะ พร้อมจำนวน (ใช้ทั้งหน้าออเดอร์และใบเบิก) */
export function StatusChips({ options, value, onChange, counts, testId }: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  counts?: Record<string, number>;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {options.map((o) => {
        const active = value === o.key;
        const n = counts?.[o.key];
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            data-active={active}
            className={`h-8 rounded-lg border px-3 text-[13px] transition-colors ${active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:bg-accent/40"}`}
          >
            {o.label}
            {typeof n === "number" && n > 0 && (
              <span className={`ml-1.5 rounded px-1 text-[10px] tabular-nums ${active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** แบ่งหน้ารายการฝั่งซ้าย */
export function Pager({ page, pages, total, onPage, testId }: {
  page: number; pages: number; total: number; onPage: (p: number) => void; testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2 text-[11px] text-muted-foreground" data-testid={testId}>
      <span>ทั้งหมด {total} รายการ</span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          className="rounded-lg border border-border px-2 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ก่อนหน้า
        </button>
        <span className="tabular-nums">{page}/{Math.max(pages, 1)}</span>
        <button
          type="button"
          className="rounded-lg border border-border px-2 py-1 disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          ถัดไป
        </button>
      </span>
    </div>
  );
}

/** สถานะว่างแบบเรียบร้อย */
export function EmptyPane({ title, hint, testId }: { title: string; hint?: string; testId?: string }) {
  return (
    <div className="grid place-items-center px-6 py-16 text-center" data-testid={testId}>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  );
}
