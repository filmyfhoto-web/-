import { ReactNode } from "react";

export default function ShopSection({
  title,
  icon,
  action,
  emptyText,
  children,
  count,
  testId,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  emptyText?: string;
  children?: ReactNode;
  count: number;
  testId?: string;
}) {
  return (
    <section aria-label={title} className="mb-5" data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold flex items-center gap-1.5">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {count === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-6 text-center text-xs text-muted-foreground">
          {emptyText || "ยังไม่มีรายการในหมวดนี้"}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>
      )}
    </section>
  );
}
