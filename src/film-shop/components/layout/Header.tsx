import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, ChevronDown, LogOut, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JobNotifications } from '@/film-shop/components/notifications/JobNotifications';
import { LineJobRequestsBell } from '@/film-shop/components/notifications/LineJobRequestsBell';
import { CustomerOrderBell } from '@/film-shop/components/notifications/CustomerOrderBell';
import { GroupAlertsBell } from '@/film-shop/components/notifications/GroupAlertsBell';
import { LEGACY_OPS_MENUS } from '@/lib/legacyUi';
import { StoreSwitcher } from '@/pages/receipts/StoreSwitcher';
import { RealtimeStatusButton } from '@/film-shop/components/common/RealtimeStatusButton';
import { filmNavigate } from '@/film-shop/lib/filmNav';
import { supabase } from '@/film-shop/lib/supabase';
import { useRealtimeWithFallback } from '@/film-shop/hooks/useRealtimeWithFallback';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  title: string;
  shopName: string;
  userEmail?: string;
  onSignOut?: () => void;
  /** Slimmer bar for full-bleed pages so the content gets the whole screen. */
  compact?: boolean;
  /** ย้อนกลับหน้าในแอป (ส่งมาจาก FilmShopApp) */
  onBack?: () => void;
  /** หน้าแรก — แสดงคำทักทายแทนชื่อหน้า ตามดีไซน์ FILM SHOP */
  home?: boolean;
  /** ชื่อผู้ใช้ที่แสดงในคำทักทาย */
  greetingName?: string;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

/** จำนวนงานที่ยังไม่ปิด — ใช้เป็นตัวเลขบนกระดิ่ง (ข้อมูลจริงจากคิวงาน) */
function useOpenJobCount() {
  const [count, setCount] = useState(0);
  const load = async () => {
    const { count: c } = await (supabase.from('film_order_jobs' as any) as any)
      .select('*', { count: 'exact', head: true })
      .not('status', 'in', '(done,cancelled)');
    setCount(c ?? 0);
  };
  useEffect(() => { void load(); }, []);
  useRealtimeWithFallback('film_order_jobs', load);
  return count;
}

export function Header({ title, shopName, userEmail, onSignOut, compact, onBack, home, greetingName }: HeaderProps) {
  const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
  const clock = useClock();
  const openJobs = useOpenJobCount();
  const initial = (greetingName || userEmail || 'F').charAt(0).toUpperCase();

  return (
    <header
      className={`sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-[#E7EAF2] bg-white px-[30px] ${
        compact ? 'h-12' : home ? 'h-[102px]' : 'h-16'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {!home && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="ย้อนกลับ"
            data-testid="back-button"
            onClick={() => (onBack ? onBack() : filmNavigate('dashboard'))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {home ? (
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-extrabold leading-tight text-[#10173D]">
              สวัสดีค่ะ, {greetingName || 'ผู้ใช้งาน'} 👋
            </h1>
            <p className="truncate text-[13.5px] text-[#5B6690]">ยินดีต้อนรับกลับสู่ร้าน {shopName || 'FILM SHOP'}</p>
          </div>
        ) : (
          <div className="min-w-0">
            <h1 className={`truncate font-semibold tracking-tight text-[#10173D] ${compact ? 'text-sm' : 'text-lg'}`}>{title}</h1>
            {!compact && <p className="truncate text-xs text-muted-foreground">{shopName} · {today}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <StoreSwitcher current="film" />

        {home && (
          <span className="hidden items-center gap-2 rounded-full border border-[#E7EAF2] bg-white px-3 py-[7px] text-[12.5px] font-medium text-[#5B6690] lg:inline-flex">
            <span className="h-2 w-2 rounded-full bg-[#2FB889]" />
            ออนไลน์ • {clock} น.
          </span>
        )}

        <RealtimeStatusButton />

        {LEGACY_OPS_MENUS && (
          <>
            <CustomerOrderBell />
            <GroupAlertsBell />
            <LineJobRequestsBell onOpenInvoice={(invoiceId) => filmNavigate('invoices', { previewInvoiceId: invoiceId })} />
            <JobNotifications />
          </>
        )}

        <button
          type="button"
          aria-label="งานที่ยังไม่ปิด"
          data-testid="film-header-bell"
          onClick={() => filmNavigate('group-queue')}
          className="relative grid h-10 w-10 place-items-center rounded-[12px] border border-[#E7EAF2] bg-white text-[#10173D] transition-colors hover:bg-[#F6F5FF]"
        >
          <Bell className="h-[18px] w-[18px]" />
          {openJobs > 0 && (
            <span className="absolute -right-1.5 -top-1.5 min-w-[20px] rounded-full bg-[#D9468D] px-1 text-center text-[11px] font-bold leading-[20px] text-white">
              {openJobs}
            </span>
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full p-0.5"
              aria-label="บัญชีผู้ใช้"
            >
              <span
                className="grid h-10 w-10 place-items-center rounded-full text-[14px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#D9468D 0%,#7C3AED 100%)' }}
              >
                {initial}
              </span>
              <ChevronDown className="h-4 w-4 text-[#5B6690]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {userEmail && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground truncate">{userEmail}</div>
            )}
            <DropdownMenuItem onClick={() => filmNavigate('settings')}>
              <Store className="mr-2 h-4 w-4" /> ตั้งค่าร้าน
            </DropdownMenuItem>
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
