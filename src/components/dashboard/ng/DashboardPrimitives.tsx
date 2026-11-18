import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** โทนสี pill สถานะ (ชุดเดียวกันทั้งแดชบอร์ดแอดมินและ FILM SHOP) */
export const NG_TONE_PILL: Record<string, string> = {
  violet: "bg-ng-blue-tint text-ng-ink",
  blue: "bg-ng-blue-tint text-ng-blue",
  orange: "bg-ng-orange-tint text-ng-orange-deep",
  green: "bg-ng-green-tint text-ng-green-deep",
  gray: "bg-ng-chip text-ng-muted",
};

/** โทนไอคอน — ล็อกด้วย design tokens (ห้าม hardcode hex) */
export const NG_ICON_TONE = {
  violet: "bg-ng-blue-tint text-ng-blue",
  purple: "bg-ng-blue-tint2 text-ng-blue",
  pink: "bg-ng-blue-tint text-ng-blue",
  blue: "bg-ng-blue-tint text-ng-blue",
  orange: "bg-ng-orange-tint text-ng-orange",
  green: "bg-ng-green-tint text-ng-green",
} as const;
export type NgTone = keyof typeof NG_ICON_TONE;

export const NG_CARD =
  "rounded-[16px] border border-ng-line bg-white shadow-[0_2px_8px_-6px_rgba(16,23,61,0.25)]";

/** ปุ่มลิงก์ด่วนเล็ก ๆ ในหัวการ์ด */
export function NgPanelAction({ label, to, onClick }: { label: string; to?: string; onClick?: () => void }) {
  const cls = "flex items-center gap-1 text-[12.5px] font-semibold text-ng-ink hover:underline";
  if (to) {
    return (
      <Link to={to} className={cls}>
        {label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    );
  }
  if (!onClick) return null;
  return (
    <button type="button" onClick={onClick} className={cls}>
      {label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/** การ์ดพื้นฐานของแดชบอร์ด — หัวข้อ + ลิงก์ด่วน (มีปลายทางจริงเท่านั้น) */
export function NgPanel({
  title, icon: Icon, actionLabel, actionTo, onAction, links, children, testId, className,
}: {
  title: string;
  icon?: LucideIcon;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  /** ลิงก์ด่วนเพิ่มเติมใต้หัวข้อ */
  links?: { label: string; to: string; testId?: string }[];
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section data-testid={testId} className={cn(NG_CARD, "p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14.5px] font-bold text-ng-ink sm:text-[15px]">
          {Icon ? <Icon className="h-[18px] w-[18px] text-ng-blue" aria-hidden /> : null}
          {title}
        </h3>
        {actionLabel ? <NgPanelAction label={actionLabel} to={actionTo} onClick={onAction} /> : null}
      </div>
      {links?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {links.map((l) => (
            <Link
              key={l.to + l.label}
              to={l.to}
              data-testid={l.testId}
              className="rounded-[9px] border border-ng-line px-2.5 py-1 text-[11.5px] font-semibold text-ng-muted transition-colors hover:border-ng-line hover:text-ng-ink"
            >
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** กราฟเส้นเล็กจากข้อมูลจริง (ไม่มีข้อมูล = เส้นแบน) */
export function NgSparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * 100;
      const y = 40 - (v / max) * 34;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 44"
      preserveAspectRatio="none"
      className={cn("mt-3 h-[76px] w-full text-ng-blue", className)}
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** การ์ดโมดูลบนแดชบอร์ด (ปลายทางเป็น route จริงเสมอ) */
export function NgModuleCard({
  to, title, desc, icon: Icon, tone, testId,
}: {
  to: string;
  title: string;
  desc?: string;
  icon: LucideIcon;
  tone: NgTone;
  testId?: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className={cn(
        NG_CARD,
        "group block rounded-[14px] p-3 text-center transition-colors hover:bg-ng-card-hover sm:rounded-[16px] sm:p-4",
      )}
    >
      <span className={cn("mx-auto grid h-11 w-11 place-items-center rounded-full", NG_ICON_TONE[tone])}>
        <Icon className="h-[20px] w-[20px]" aria-hidden />
      </span>
      <span className="mt-2.5 block text-[13px] font-bold text-ng-ink sm:text-[13.5px]">{title}</span>
      {desc ? <span className="mt-1 hidden text-[11.5px] leading-snug text-ng-muted sm:block">{desc}</span> : null}
      <span className="mt-2.5 inline-flex items-center gap-1 rounded-[9px] border border-ng-line px-2.5 py-1 text-[11.5px] font-semibold text-ng-muted transition-colors group-hover:border-ng-line group-hover:text-ng-ink">
        เข้าใช้งาน <ArrowRight className="h-3 w-3" aria-hidden />
      </span>
    </Link>
  );
}

/** ตัวเลขเมตริกในกล่องย่อย (ลิงก์ไปหน้าเกี่ยวข้องได้) */
export function NgMetricTile({
  label, value, unit, icon: Icon, tone, to, testId,
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon: LucideIcon;
  tone: NgTone;
  to: string;
  testId?: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="block rounded-[14px] border border-ng-line-soft bg-ng-tint p-3 text-left transition-colors hover:bg-ng-tint-hover"
    >
      <span className={cn("grid h-9 w-9 place-items-center rounded-full", NG_ICON_TONE[tone])}>
        <Icon className="h-[17px] w-[17px]" aria-hidden />
      </span>
      <span className="mt-2 block text-[12px] text-ng-muted">{label}</span>
      <span className="mt-0.5 block text-[24px] font-extrabold leading-none tabular-nums text-ng-ink">
        {value}
        {unit ? <span className="ml-1.5 text-[12px] font-medium text-ng-soft">{unit}</span> : null}
      </span>
    </Link>
  );
}
