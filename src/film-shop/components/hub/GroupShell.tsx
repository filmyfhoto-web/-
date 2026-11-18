import type { ReactNode } from 'react';
import { ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GROUPS, type GroupKey } from '@/film-shop/lib/groups';

/** หัวเรื่องกลุ่ม — แสดงชื่อและสีประจำกลุ่มตลอด flow พร้อมปุ่มกลับหน้าหลัก */
export function GroupShell({
  group, children, onHome, onBack, actions,
}: {
  group: GroupKey;
  children: ReactNode;
  onHome: () => void;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  const g = GROUPS[group];
  return (
    <div className="space-y-4" data-testid={`group-shell-${group}`}>
      <header className={cn('rounded-2xl px-4 py-4 shadow-sm', g.solid)}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{g.title}</p>
            <p className="text-xs opacity-85">{g.subtitle}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {actions}
            {onBack && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 rounded-xl"
                data-testid={`group-back-${group}`}
                onClick={onBack}
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> ย้อนกลับ
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 rounded-xl"
              data-testid={`group-home-${group}`}
              onClick={onHome}
            >
              <Home className="mr-1 h-4 w-4" /> กลับหน้าหลัก
            </Button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

/** ปุ่มเมนูใหญ่ในกลุ่ม — แตะง่ายทั้งมือถือและคอม */
export function GroupTile({
  label, description, icon: Icon, onClick, group, testId, disabled,
}: {
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  group: GroupKey;
  testId?: string;
  disabled?: boolean;
}) {
  const g = GROUPS[group];
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-[92px] w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
        'hover:bg-card disabled:opacity-50',
        g.soft,
      )}
    >
      <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', g.solid)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground sm:text-base">{label}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}
