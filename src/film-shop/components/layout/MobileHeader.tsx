import { ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JobNotifications } from '@/film-shop/components/notifications/JobNotifications';
import { CustomerOrderBell } from '@/film-shop/components/notifications/CustomerOrderBell';
import { LEGACY_OPS_MENUS } from '@/lib/legacyUi';
import { StoreSwitcher } from '@/pages/receipts/StoreSwitcher';
import { RealtimeStatusButton } from '@/film-shop/components/common/RealtimeStatusButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MobileHeaderProps {
  title: string;
  userEmail?: string;
  onSignOut?: () => void;
  /** ย้อนกลับหน้าในแอป (ส่งมาจาก FilmShopApp) */
  onBack?: () => void;
}

export function MobileHeader({ title, userEmail, onSignOut, onBack }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="ย้อนกลับ"
          data-testid="back-button"
          onClick={() => (onBack ? onBack() : window.history.back())}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <StoreSwitcher current="film" compact />
        <RealtimeStatusButton compact />
        {LEGACY_OPS_MENUS && (
          <>
            <CustomerOrderBell />
            <JobNotifications />
          </>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-sm font-medium text-primary-foreground">
                  {userEmail?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {userEmail && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground truncate">
                {userEmail}
              </div>
            )}
            <DropdownMenuItem onClick={onSignOut} className="text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              ออกจากระบบ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
