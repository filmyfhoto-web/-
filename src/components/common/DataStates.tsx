import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ชุด Skeleton / Empty / Error กลางของระบบ (NATTA GROUP)
 * ใช้โทน รัศมี และเงาเดียวกับหน้าแดชบอร์ด เพื่อให้ทุกหน้า (ลูกค้า / รายการออเดอร์)
 * แสดงสถานะกำลังโหลดและไม่มีข้อมูลเหมือนกันทั้งระบบ
 * Presentation only — ไม่มี business logic
 */

export function Shimmer({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-[8px] bg-ng-blue-tint", className)} />;
}

/** โครงรายการ (ออเดอร์ / แจ้งเตือน / เอกสาร) */
export function DataListSkeleton({
  rows = 4,
  testId = "data-list-skeleton",
  className,
}: { rows?: number; testId?: string; className?: string }) {
  return (
    <div
      data-testid={testId}
      aria-busy="true"
      aria-live="polite"
      aria-label="กำลังโหลดข้อมูล"
      className={cn("space-y-2.5", className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[14px] border border-ng-line bg-white p-3 shadow-[0_2px_8px_-6px_rgba(16,23,61,0.25)] sm:p-4"
        >
          <Shimmer className="h-10 w-10 shrink-0 rounded-[12px]" />
          <div className="min-w-0 flex-1">
            <Shimmer className="h-[13px] w-2/3" />
            <Shimmer className="mt-2 h-[11px] w-1/3" />
          </div>
          <Shimmer className="h-[22px] w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** โครงการ์ดแบบกริด (การ์ดสรุป / เมนูลูกค้า) */
export function DataCardGridSkeleton({
  count = 4,
  testId = "data-grid-skeleton",
  className,
}: { count?: number; testId?: string; className?: string }) {
  return (
    <div data-testid={testId} aria-busy="true" className={cn("grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[14px] border border-ng-line bg-white p-3 shadow-[0_2px_8px_-6px_rgba(16,23,61,0.25)] sm:p-4">
          <Shimmer className="h-10 w-10 rounded-[12px]" />
          <Shimmer className="mt-3 h-[14px] w-3/4" />
          <Shimmer className="mt-2 h-[11px] w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** สถานะ “ยังไม่มีข้อมูล” — ปุ่มต้องทำงานจริงเสมอ */
export function DataEmptyState({
  icon: Icon,
  title,
  desc,
  actionLabel,
  onAction,
  action,
  testId = "data-empty",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  desc?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center rounded-[16px] border border-ng-line bg-white px-4 py-9 text-center shadow-[0_2px_8px_-6px_rgba(16,23,61,0.25)]",
        className,
      )}
    >
      {Icon && (
        <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-ng-blue-tint text-ng-ink">
          <Icon className="h-[22px] w-[22px]" aria-hidden />
        </span>
      )}
      <p className="mt-3 text-[14px] font-bold text-ng-ink">{title}</p>
      {desc && <p className="mt-1 max-w-[300px] text-[12.5px] leading-relaxed text-ng-muted">{desc}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 h-11 rounded-[12px] px-4 text-[13px] font-bold text-white shadow-[0_6px_18px_-8px_rgba(124,58,237,0.9)]"
          style={{ background: "var(--ng-hero-gradient)" }}
        >
          {actionLabel}
        </button>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** สถานะโหลดไม่สำเร็จ พร้อมปุ่มลองใหม่จริง */
export function DataErrorState({
  message,
  onRetry,
  testId = "data-error",
}: { message: string; onRetry?: () => void; testId?: string }) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className="rounded-[16px] border border-destructive/30 bg-destructive/5 p-4 text-center text-[13px] text-destructive"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 h-11 rounded-[12px] border border-destructive/40 px-4 text-[13px] font-semibold text-destructive"
        >
          ลองใหม่
        </button>
      )}
    </div>
  );
}
