import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataEmptyState, DataListSkeleton } from '@/components/common/DataStates';

/**
 * Small shared presentation pieces for the Film Shop module.
 * Presentation only — no data access, no business rules.
 */

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/**
 * PageHeader — one title treatment for every Film Shop page.
 * Keeps title/description on the left and real actions on the right;
 * on mobile the actions wrap under the title instead of shrinking.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header data-testid="fs-page-header" className="mb-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
          {description && <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** SectionCard — the single white card shell used across the app. */
export function SectionCard({
  title,
  action,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card shadow-sm', padded && 'p-3 sm:p-4', className)}>
      {title && <div className={cn('mb-3', !padded && 'p-3 pb-0 sm:p-4 sm:pb-0')}><SectionTitle action={action}>{title}</SectionTitle></div>}
      {children}
    </section>
  );
}

export type StatusTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';

const STATUS_TONE: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-secondary text-secondary-foreground',
  info: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/12 text-destructive',
};

/** StatusBadge — semantic-only colours, never ad-hoc hex/utility colours. */
export function StatusBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-testid="fs-status-badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5',
        STATUS_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** FilterBar — sticky-safe row for search + filters, scrolls sideways on mobile. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-testid="fs-filter-bar"
      className={cn('flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm', className)}
    >
      {children}
    </div>
  );
}

/** DataTableShell — horizontal scroll container so tables never break the page width. */
export function DataTableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-card shadow-sm', className)}>
      <div className="w-full overflow-x-auto">{children}</div>
    </div>
  );
}

/** MobilePageActions — bottom action row that clears the mobile tab bar. */
export function MobilePageActions({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="fs-mobile-actions"
      className="safe-area-bottom sticky bottom-16 z-20 -mx-4 mt-4 flex gap-2 border-t border-border bg-card/95 px-4 py-2 backdrop-blur md:hidden"
    >
      {children}
    </div>
  );
}

export type TileTone = 'neutral' | 'primary' | 'urgent' | 'success';

const TILE_TONE: Record<TileTone, string> = {
  neutral: 'bg-muted text-foreground/70',
  primary: 'bg-secondary text-primary',
  urgent: 'bg-warning/15 text-warning',
  success: 'bg-success/12 text-success',
};

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: TileTone;
  onClick?: () => void;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-shadow duration-150',
        onClick && 'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', TILE_TONE[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-semibold leading-none tabular-nums">{value}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{label}</span>
        </span>
      </div>
      {hint && <p className="mt-2 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </Comp>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  desc,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  desc?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return <DataEmptyState icon={Icon} title={title} desc={desc} actionLabel={actionLabel} onAction={onAction} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return <DataListSkeleton rows={rows} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      <p>{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-2 min-h-11" onClick={onRetry}>ลองใหม่</Button>
      )}
    </div>
  );
}

/** Accessible segmented control (radiogroup) used for short single-choice fields. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 rounded-lg px-2 text-xs font-medium transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const thaiDateLong = (d = new Date()) =>
  d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });

/** MetricCard — alias of StatTile, the one KPI card used across Film Shop. */
export const MetricCard = StatTile;