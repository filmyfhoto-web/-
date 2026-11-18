import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, RefreshCw } from "lucide-react";
import CustomerLayout from "@/components/layout/CustomerLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { DataEmptyState, DataListSkeleton } from "@/components/common/DataStates";

/** โครงหน้าย่อยในกลุ่ม "บัญชีของฉัน" — หัวเรื่อง ปุ่มย้อนกลับ และความกว้างเดียวกันทุกหน้า */
export default function AccountPage({
  title, description, path, children, action,
}: {
  title: string;
  description: string;
  path: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <CustomerLayout>
      <SeoHead title={`${title} — ร้านนัฐภรณ์ เชียงกลาง`} description={description} path={path} />
      <div className="-mx-4 -mt-2 md:-mt-6 bg-gradient-account-page min-h-[calc(100svh-4rem)]">
        <header className="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 rounded-b-[24px] bg-gradient-account text-primary-foreground shadow-soft">
          <div className="mx-auto w-full max-w-[840px] flex items-center gap-2">
            <button
              type="button"
              onClick={() => nav(-1)}
              aria-label="ย้อนกลับ"
              data-testid="account-page-back"
              className="min-h-11 min-w-11 -ml-2 grid place-items-center rounded-xl hover:bg-primary-foreground/15"
            >
              <ChevronLeft className="w-6 h-6" aria-hidden />
            </button>
            <h1 className="flex-1 text-[20px] font-bold truncate">{title}</h1>
            {action}
          </div>
        </header>
        <div className="mx-auto w-full max-w-[840px] px-3 sm:px-4 -mt-3 space-y-3 pb-8">{children}</div>
      </div>
    </CustomerLayout>
  );
}

export function AccountCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-card p-4 shadow-sm ring-1 ring-primary/10 ${className}`}>{children}</section>;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return <DataListSkeleton rows={rows} testId="account-list-skeleton" />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <AccountCard className="text-center">
      <p className="text-[14px] text-destructive" role="alert">{message}</p>
      <Button variant="outline" className="mt-3 min-h-11 rounded-xl" onClick={onRetry} data-testid="account-retry">
        <RefreshCw className="w-4 h-4 mr-1" aria-hidden /> ลองใหม่
      </Button>
    </AccountCard>
  );
}

export function EmptyState({
  title, hint, cta,
}: { title: string; hint?: ReactNode; cta?: ReactNode }) {
  return <DataEmptyState title={title} desc={hint} action={cta} testId="account-empty" />;
}
