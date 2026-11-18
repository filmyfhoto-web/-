import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Settings,
  MoreHorizontal,
  Package,
  Inbox,
  MessageSquare,
  Plus,
  Columns3,
  FileSignature,
  ClipboardList,
  MessagesSquare,
  Store,
  Link2,
  Home,
  ListOrdered,
} from 'lucide-react';
import { Users, BarChart3, ScanLine, Calculator, Zap } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useUserRole } from '@/film-shop/hooks/useUserRole';
import { useInboxUnread } from '@/film-shop/hooks/useFilmInbox';
import { LEGACY_OPS_MENUS } from '@/lib/legacyUi';

interface MobileNavProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

const allLeftItems = [
  { id: 'group-queue', label: 'Q รันงาน', icon: ListOrdered, legacy: false },
  { id: 'inbox', label: 'Inbox', icon: MessagesSquare, legacy: true },
];
const leftItems = allLeftItems.filter((i) => LEGACY_OPS_MENUS ? i.id !== 'documents' : !i.legacy);

const allRightItems = [
  { id: 'invoices', label: 'ใบเสร็จ', icon: FileSignature, legacy: true },
  { id: 'stock', label: 'สต๊อก', icon: Package, legacy: false },
];
const rightItems = allRightItems.filter((i) => !i.legacy);

const allMoreMenuItems = [
  { id: 'group-queue', label: 'Q รันงาน', icon: FileSignature, adminOnly: false },
  { id: 'quick-doc', label: 'ออกใบเสร็จด่วน', icon: Zap, adminOnly: false },
  { id: 'workcenter', label: 'รับงาน/รันคิว', icon: ClipboardList, adminOnly: false, legacy: true },
  { id: 'orders', label: 'ออเดอร์', icon: Inbox, adminOnly: false, legacy: true },
  { id: 'doc-command', label: 'ออกเอกสาร', icon: FileSignature, adminOnly: false, legacy: true },
  { id: 'stock', label: 'สินค้า/สต๊อก', icon: Package, adminOnly: false },
  { id: 'customers', label: 'ลูกค้า', icon: Users, adminOnly: false },
  { id: 'reports', label: 'รายงาน', icon: BarChart3, adminOnly: false },
  { id: 'calculator', label: 'คำนวณราคา', icon: Calculator, adminOnly: false },
  { id: 'applinks', label: 'ลิงก์เว็บแอป', icon: Link2, adminOnly: false },
  { id: 'settings', label: 'ตั้งค่า', icon: Settings, adminOnly: true },
];

/** Bottom navigation: 5 targets, thumb-reachable, with the primary intake action in the middle. */
export function MobileNav({ currentPage, onPageChange }: MobileNavProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const inboxUnread = useInboxUnread();
  const moreMenuItems = allMoreMenuItems
    .filter((i) => LEGACY_OPS_MENUS || !(i as { legacy?: boolean }).legacy)
    .filter((i) => !i.adminOnly || isAdmin);
  const isMoreActive = moreMenuItems.some((i) => i.id === currentPage);

  const Tab = ({ id, label, icon: Icon }: { id: string; label: string; icon: typeof Inbox }) => {
    const isActive = currentPage === id;
    return (
      <button
        type="button"
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onPageChange(id)}
        className={cn(
          'relative flex h-full min-h-11 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="text-[10px] font-medium">{label}</span>
        {id === 'inbox' && inboxUnread > 0 && (
          <span
            data-testid="film-mobile-inbox-tab-badge"
            className="absolute right-3 top-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground"
          >
            {inboxUnread}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav
      aria-label="เมนูหลัก"
      className="safe-area-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card"
    >
      <div className="flex h-16 items-center px-1">
        {leftItems.map((i) => <Tab key={i.id} {...i} />)}

        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => onPageChange(LEGACY_OPS_MENUS ? 'intake' : 'group-queue')}
            aria-label={LEGACY_OPS_MENUS ? 'สร้างออเดอร์' : 'เปิดงานวันนี้'}
            className="-mt-6 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform duration-150 active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>

        {rightItems.map((i) => <Tab key={i.id} {...i} />)}

        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                'relative flex h-full min-h-11 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150',
                isMoreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium">เพิ่มเติม</span>
              {inboxUnread > 0 && (
                <span
                  data-testid="film-mobile-inbox-badge"
                  className="absolute right-2 top-2 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground"
                >
                  {inboxUnread}
                </span>
              )}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="pb-3 text-left">
              <SheetTitle>เมนูเพิ่มเติม</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 pb-6">
              <button
                type="button"
                data-testid="film-mobile-nav-receipts"
                onClick={() => { setIsSheetOpen(false); onPageChange('receipts'); }}
                className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card p-2 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-muted"
              >
                <Store className="h-5 w-5" />
                <span className="text-center leading-tight">Receipt &amp; Delivery</span>
              </button>
              {moreMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onPageChange(item.id); setIsSheetOpen(false); }}
                    className={cn(
                      'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-medium transition-colors duration-150',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-center leading-tight">{item.label}</span>
                    {item.id === 'inbox' && inboxUnread > 0 && (
                      <span
                        data-testid="film-mobile-inbox-item-badge"
                        className={cn(
                          'rounded-full px-1.5 text-[10px] font-semibold',
                          isActive
                            ? 'bg-primary-foreground text-primary'
                            : 'bg-destructive text-destructive-foreground',
                        )}
                      >
                        {inboxUnread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
