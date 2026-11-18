import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ชุด Skeleton / Empty state ของหน้าแรก FILM SHOP
 * ใช้โทนและรัศมีเดียวกับการ์ดจริง (NATTA GROUP) เพื่อไม่ให้ layout กระตุกตอนโหลดเสร็จ
 */

export function Shimmer({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block animate-pulse rounded-[8px] bg-muted', className)}
    />
  );
}

/** แบนเนอร์ภาพรวม + การ์ดงานใหม่วันนี้ */
export function HeroSkeleton() {
  return (
    <section
      data-testid="fs-hero-skeleton"
      aria-busy="true"
      aria-label="กำลังโหลดภาพรวมวันนี้"
      className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="relative overflow-hidden rounded-[16px] bg-primary p-4 sm:rounded-[18px] sm:p-5 xl:p-6">
        <span className="block h-[18px] w-40 animate-pulse rounded-[8px] bg-white/25" aria-hidden />
        <span className="mt-2 block h-[12px] w-56 animate-pulse rounded-[8px] bg-white/15" aria-hidden />
        <div className="mt-4 grid grid-cols-2 gap-x-2 gap-y-4 sm:mt-6 sm:gap-y-6 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-0 sm:px-4 sm:first:pl-0">
              <span className="block h-[12px] w-24 animate-pulse rounded-[8px] bg-white/20" aria-hidden />
              <span className="mt-2 block h-[26px] w-16 animate-pulse rounded-[8px] bg-white/25" aria-hidden />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[16px] border border-[#E7EAF2] bg-white p-4 shadow-[0_2px_8px_-6px_rgba(16,23,61,0.25)] sm:rounded-[18px] sm:p-5">
        <Shimmer className="h-[14px] w-28" />
        <Shimmer className="mt-3 h-[32px] w-24" />
        <Shimmer className="mt-3 h-[12px] w-40" />
        <Shimmer className="mt-4 h-[64px] w-full" />
      </div>
    </section>
  );
}

/** การ์ดทางลัด 5 ใบ */
export function ShortcutSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      data-testid="fs-shortcut-skeleton"
      aria-busy="true"
      className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-5 xl:gap-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[14px] border border-[#E7EAF2] bg-white p-3 shadow-[0_2px_8px_-6px_rgba(16,23,61,0.25)] sm:rounded-[16px] sm:p-4"
        >
          <Shimmer className="h-10 w-10 rounded-[12px] sm:h-11 sm:w-11" />
          <Shimmer className="mt-3 h-[14px] w-3/4" />
          <Shimmer className="mt-2 hidden h-[12px] w-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** การ์ดแถวล่าง (งานล่าสุด / สรุปงานวันนี้) */
export function PanelSkeleton({ rows = 5, testId }: { rows?: number; testId?: string }) {
  return (
    <div
      data-testid={testId}
      aria-busy="true"
      className="rounded-[16px] border border-[#E7EAF2] bg-white p-4 shadow-[0_2px_8px_-6px_rgba(16,23,61,0.25)] sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <Shimmer className="h-[15px] w-28" />
        <Shimmer className="h-[13px] w-20" />
      </div>
      <div className="mt-3 divide-y divide-[#F0F2F7]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Shimmer className="h-9 w-9 rounded-[11px]" />
            <div className="min-w-0 flex-1">
              <Shimmer className="h-[13px] w-2/3" />
              <Shimmer className="mt-2 h-[11px] w-1/3" />
            </div>
            <Shimmer className="h-[22px] w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** สถานะ “ยังไม่มีข้อมูล” — ต้องมีปุ่มที่ทำงานจริงเสมอ */
export function EmptyState({
  icon: Icon,
  title,
  desc,
  actionLabel,
  onAction,
  testId,
  className,
}: {
  icon: LucideIcon;
  title: string;
  desc?: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn('flex flex-col items-center justify-center px-4 py-8 text-center', className)}
    >
      <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-accent text-primary">
        <Icon className="h-[22px] w-[22px]" />
      </span>
      <p className="mt-3 text-[14px] font-bold text-foreground">{title}</p>
      {desc && <p className="mt-1 max-w-[280px] text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 h-10 rounded-[12px] bg-primary px-4 text-[13px] font-bold text-primary-foreground shadow-soft"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}