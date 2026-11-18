import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Settings,
  Package,
  Plus,
  Store,
  MessagesSquare,
  Inbox,
  FileSignature,
  Columns3,
  ClipboardList,
  BellRing,
  Link2,
  ListOrdered,
  ChevronDown,
  Sparkles,
  LogOut,
  BarChart3,
  Wrench,
  ClipboardCheck,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { Users, Calculator, ScanLine } from 'lucide-react';
import { Globe, Zap } from 'lucide-react';
import { supabase } from '@/film-shop/lib/supabase';
import { useRealtimeWithFallback } from '@/film-shop/hooks/useRealtimeWithFallback';
import { useUserRole } from '@/film-shop/hooks/useUserRole';
import { useAuth } from '@/film-shop/hooks/useAuth';
import { LEGACY_OPS_MENUS } from '@/lib/legacyUi';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  /** โหมดแท็บเล็ต — ยุบเป็นแถบไอคอน (icon rail) และกางเป็น drawer เมื่อกดปุ่ม */
  railed?: boolean;
  /** เดสก์ท็อป: ยุบเป็นแถบไอคอนแบบถาวร (จำค่าไว้ข้ามหน้า/รีเฟรช) */
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
}

/** legacy: เมนูที่เลิกใช้ในเฟส 1 — ซ่อนไว้ ยังไม่ลบไฟล์ (สลับกลับได้ที่ src/lib/legacyUi.ts) */
const ALL_FILM_NAV_ITEMS = [
  // group: งานประจำวัน
  { id: 'group-queue', label: 'Q รันงาน', icon: ListOrdered, adminOnly: false, group: 'daily', legacy: false },
  { id: 'quick-doc', label: 'ออกใบเสร็จด่วน', icon: Zap, adminOnly: false, group: 'daily', legacy: false },
  { id: 'invoices', label: 'ใบเสร็จ', icon: ClipboardCheck, adminOnly: false, group: 'daily', legacy: true },
  { id: 'stock', label: 'สินค้า / สต๊อก', icon: Package, adminOnly: false, group: 'daily', legacy: false },
  // เมนูเก่าไม่แสดง แต่คงรายการไว้เพื่อรองรับลิงก์เดิม
  { id: 'inbox', label: 'Inbox แชตลูกค้า', icon: MessagesSquare, adminOnly: false, group: 'daily', legacy: true },
  { id: 'alerts', label: 'ศูนย์แจ้งเตือน', icon: BellRing, adminOnly: false, group: 'daily', legacy: true },
  { id: 'workcenter', label: 'รับงาน / รันคิว', icon: ClipboardList, adminOnly: false, group: 'daily', legacy: true },
  { id: 'job-board', label: 'คิวงาน NATTA.Q', icon: Columns3, adminOnly: false, group: 'daily', legacy: true },
  { id: 'documents', label: 'งานที่ติดตาม', icon: FileSignature, adminOnly: false, group: 'daily', legacy: true },
  { id: 'orders', label: 'ออเดอร์', icon: Inbox, adminOnly: false, group: 'daily', legacy: true },
  { id: 'doc-command', label: 'ออกเอกสาร', icon: FileSignature, adminOnly: false, group: 'daily', legacy: true },
  // group: ข้อมูลและระบบ
  { id: 'calculator', label: 'คำนวณราคาไวนิล', icon: Calculator, adminOnly: false, group: 'data', legacy: false },
  { id: 'customers', label: 'ลูกค้า', icon: Users, adminOnly: false, group: 'data', legacy: false },
  { id: 'reports', label: 'รายงาน', icon: BarChart3, adminOnly: false, group: 'data', legacy: false },
  { id: 'applinks', label: 'ลิงก์เว็บแอป', icon: Link2, adminOnly: false, group: 'data', legacy: false },
  { id: 'site-editor', label: 'จัดการหน้าเว็บไซต์', icon: Globe, adminOnly: true, group: 'data', legacy: false },
  { id: 'settings', label: 'ตั้งค่า', icon: Settings, adminOnly: true, group: 'data', legacy: false },
];

export const FILM_NAV_ITEMS = ALL_FILM_NAV_ITEMS.filter((i) => LEGACY_OPS_MENUS || !i.legacy);

const GROUP_LABEL: Record<string, string> = {
  daily: 'งานประจำวัน',
  data: 'ข้อมูลและระบบ',
};

/** โครงเมนูตามดีไซน์ FILM SHOP — แต่ละรายการชี้ไปหน้าเดิมที่มีอยู่จริง */
const SECTIONS: { title: string; items: { id: string; label: string; icon: typeof Store; badge?: 'jobs' | 'alerts'; adminOnly?: boolean }[] }[] = [
  {
    title: 'คิวและงาน',
    items: [
      { id: 'group-queue', label: 'Q รันงาน', icon: ListOrdered },
    ],
  },
  {
    title: 'ใบเสร็จ',
    items: [
      { id: 'quick-doc', label: 'ออกใบเสร็จด่วน', icon: Zap },
    ],
  },
  {
    title: 'ข้อมูลร้าน',
    items: [
      { id: 'customers', label: 'ลูกค้า', icon: Users },
      { id: 'stock', label: 'สินค้า / สต๊อก', icon: Package },
      { id: 'site-editor', label: 'จัดการหน้าเว็บไซต์', icon: Globe, adminOnly: true },
    ],
  },
];

/** แถบเมนูซ้าย FILM SHOP — navy/indigo gradient กว้าง 272px */
export function Sidebar({
  currentPage,
  onPageChange,
  railed = false,
  collapsed = false,
  onCollapsedChange,
}: SidebarProps) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  /** เดสก์ท็อปยุบได้ถาวร / แท็บเล็ตยุบเป็น rail เสมอ */
  const railMode = railed || collapsed;
  const expanded = !railMode || (railed && drawerOpen);
  useEffect(() => { if (!railed) setDrawerOpen(false); }, [railed]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    toggleRef.current?.focus();
  }, []);

  const go = (page: string) => {
    onPageChange(page);
    // เปลี่ยนหน้าแล้วปิด drawer เสมอ (ไม่จำสถานะเปิดข้ามหน้า)
    if (railed) setDrawerOpen(false);
  };

  // Esc ปิด drawer + ล็อกสกรอลล์พื้นหลังขณะเปิด
  useEffect(() => {
    if (!railed || !drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeDrawer(); }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [railed, drawerOpen, closeDrawer]);

  /** โฟกัสรายการแรกใน drawer เมื่อเปิด */
  useEffect(() => {
    if (railed && drawerOpen) {
      asideRef.current?.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
    }
  }, [railed, drawerOpen]);

  const focusables = () =>
    Array.from(
      asideRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((el) => el.offsetParent !== null);

  /** Focus trap ใน drawer + ลูกศรขึ้น/ลงเลื่อนรายการเมนู */
  const onSidebarKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (railed && drawerOpen && e.key === 'Tab') {
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !asideRef.current?.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const navItems = Array.from(
        asideRef.current?.querySelectorAll<HTMLElement>('[data-nav-item]') ?? [],
      );
      const idx = navItems.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? navItems[(idx + 1) % navItems.length]
        : navItems[(idx - 1 + navItems.length) % navItems.length];
      next?.focus();
    }
  };
  const [newJobs, setNewJobs] = useState(0);
  const [pendingDocs, setPendingDocs] = useState(0);
  const { isAdmin } = useUserRole();
  const { signOut } = useAuth();

  const loadNewJobs = async () => {
    const { count } = await (supabase.from('film_order_jobs' as any) as any)
      .select('*', { count: 'exact', head: true })
      .not('status', 'in', '(done,cancelled)');
    setNewJobs(count ?? 0);
  };
  useEffect(() => { void loadNewJobs(); }, []);
  useRealtimeWithFallback('film_order_jobs', loadNewJobs);

  const loadPending = async () => {
    const { count } = await (supabase.from('film_order_jobs' as any) as any)
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new');
    setPendingDocs(count ?? 0);
  };
  useEffect(() => { void loadPending(); }, []);
  useRealtimeWithFallback('film_order_jobs', loadPending);

  const badgeValue = (kind?: 'jobs' | 'alerts') =>
    kind === 'jobs' ? newJobs : kind === 'alerts' ? pendingDocs : 0;

  return (
    <>
      {railed && drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-[#0B0A2A]/45 backdrop-blur-[1px]"
          onClick={closeDrawer}
          data-testid="film-sidebar-overlay"
          aria-hidden
        />
      )}
    <aside
      ref={asideRef}
      onKeyDown={onSidebarKeyDown}
      data-testid="film-sidebar"
      data-mode={railed ? (drawerOpen ? 'drawer' : 'rail') : collapsed ? 'rail' : 'full'}
      {...(railed && drawerOpen
        ? ({ role: 'dialog', 'aria-modal': true, 'aria-label': 'เมนูหลัก' } as const)
        : {})}
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col overflow-y-auto overflow-x-hidden text-white transition-[width] duration-200',
        expanded ? 'w-[272px]' : 'w-[76px]',
        railed && drawerOpen && 'shadow-[0_0_40px_-8px_rgba(0,0,0,0.6)]',
      )}
      style={{ background: 'linear-gradient(160deg,#102A43 0%,#16395C 100%)' }}
    >
      {/* แบรนด์ */}
      <div
        data-testid="film-brand"
        className={cn('flex items-center gap-3 pb-4 pt-5', expanded ? 'px-5' : 'px-3 justify-center')}
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-[15px] font-black tracking-tight text-white shadow-lg"
          style={{ background: 'linear-gradient(135deg,#3F82C4 0%,#102A43 100%)' }}
        >
          FS
        </span>
        {expanded && (
          <span className="min-w-0">
            <span className="block text-[17px] font-extrabold leading-tight tracking-wide">FILM SHOP</span>
            <span className="block truncate text-[11px] leading-tight text-white/55">NATTA GROUP</span>
          </span>
        )}
      </div>

      {(railed || onCollapsedChange) && (
        <div className={cn('pb-1', expanded ? 'px-4' : 'px-3')}>
          <button
            type="button"
            ref={toggleRef}
            data-testid="film-sidebar-toggle"
            aria-label={expanded ? 'ยุบเมนู' : 'กางเมนู'}
            aria-expanded={expanded}
            aria-controls="film-sidebar-nav"
            onClick={() => {
              if (railed) setDrawerOpen((v) => !v);
              else onCollapsedChange?.(!collapsed);
            }}
            className={cn(
              'flex h-10 items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.06] text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/[0.12]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
              expanded ? 'w-full px-3' : 'w-full justify-center px-0',
            )}
          >
            {expanded ? <PanelLeftClose className="h-[18px] w-[18px]" /> : <PanelLeftOpen className="h-[18px] w-[18px]" />}
            {expanded && <span>ยุบเมนู</span>}
          </button>
        </div>
      )}

      {railed && drawerOpen && (
        <div className="px-4 pb-1">
          <button
            type="button"
            data-drawer-close
            data-testid="film-sidebar-close"
            aria-label="ปิดเมนู"
            onClick={closeDrawer}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.06] text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <X className="h-[18px] w-[18px]" /> ปิดเมนู
          </button>
        </div>
      )}

      {/* ปุ่มหลัก */}
      <div className={cn(expanded ? 'px-4' : 'px-3')}>
        <button
          type="button"
          title="สร้างออเดอร์ใหม่"
          data-testid="film-new-order"
          onClick={() => go('group-queue')}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] text-[14px] font-bold text-white shadow-[0_6px_18px_-6px_rgba(16,42,67,0.9)] transition-transform hover:-translate-y-[1px]"
          style={{ background: 'linear-gradient(135deg,#3F82C4 0%,#2F6BA6 55%,#102A43 100%)' }}
        >
          <Plus className="h-[18px] w-[18px]" /> {expanded && 'สร้างออเดอร์ใหม่'}
        </button>
      </div>

      {/* เมนู */}
      <nav id="film-sidebar-nav" aria-label="เมนูหลัก" className={cn('mt-5 flex flex-1 flex-col', expanded ? 'px-3' : 'px-2.5')}>
        {SECTIONS.map((section, si) => (
          <div key={section.title}>
            {si > 0 && <div className="mx-2 my-3 h-px bg-white/10" />}
            {expanded && (
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-white/40">{section.title}</p>
            )}
            <div className="flex flex-col gap-1">
              {section.items.filter((item) => !item.adminOnly || isAdmin).map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                const badge = badgeValue(item.badge);
                return (
                  <button
                    key={item.id + item.label}
                    type="button"
                    data-testid={`film-nav-${item.id}`}
                    data-nav-item
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => go(item.id)}
                    title={item.label}
                    aria-label={expanded ? undefined : item.label}
                    className={cn(
                      'relative flex h-11 items-center gap-3 rounded-[12px] text-[14px] font-medium transition-colors',
                      expanded ? 'px-3' : 'justify-center px-0',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                      isActive
                        ? 'border border-primary/45 bg-primary/20 text-white'
                        : 'border border-transparent text-white/70 hover:bg-white/[0.07] hover:text-white',
                    )}
                  >
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-primary-foreground' : 'text-white/60')} />
                    {expanded && <span className="flex-1 text-left">{item.label}</span>}
                    {badge > 0 && (
                      <span
                        className={cn(
                          'rounded-full bg-[#D9468D] text-[11px] font-bold tabular-nums text-white',
                          expanded
                            ? 'px-2 py-0.5'
                            : 'absolute right-1 top-1 min-w-[16px] px-1 text-center text-[10px] leading-[16px]',
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* การ์ดแนะนำฟีเจอร์ */}
      <div className={cn('px-4 pb-3 pt-4', !expanded && 'hidden')}>
        <div className="rounded-[14px] border border-white/10 bg-white/[0.06] p-3.5">
          <div className="flex items-center gap-2 text-[13px] font-bold">
            <Sparkles className="h-4 w-4 text-primary-foreground" /> แนะนำฟีเจอร์
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-white/60">
            สร้างออเดอร์ได้ไวขึ้นด้วยเทมเพลตงานที่ใช้บ่อย
          </p>
          <button
            type="button"
            onClick={() => go('applinks')}
            className="mt-2.5 h-8 w-full rounded-[10px] bg-white/12 text-[12px] font-semibold text-white transition-colors hover:bg-white/20"
          >
            ดูวิธีใช้งาน
          </button>
        </div>
      </div>

      {/* บัญชีผู้ใช้ */}
      <div className={cn('pb-4', expanded ? 'px-4' : 'px-3')}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="film-account-switcher"
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/[0.06] py-2.5 text-left transition-colors hover:bg-white/[0.1]',
                expanded ? 'px-3' : 'justify-center px-0',
              )}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[13px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#3F82C4 0%,#102A43 100%)' }}
              >
                FS
              </span>
              {expanded && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">FILM SHOP</span>
                    <span className="block truncate text-[11px] text-white/55">
                      {isAdmin ? 'ผู้ดูแลระบบ' : 'พนักงาน'}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-white/50" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => go('reports')}>
              <BarChart3 className="mr-2 h-4 w-4" /> รายงาน
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => go('tools')}>
              <Wrench className="mr-2 h-4 w-4" /> เครื่องมือ
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => go('settings')}>
                <Settings className="mr-2 h-4 w-4" /> ตั้งค่าระบบ
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate('/receipts')}>
              <Store className="mr-2 h-4 w-4" /> สลับร้าน / เอกสาร 2 ร้าน
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="fs-back-admin" onClick={() => navigate('/admin/home')}>
              <LayoutDashboard className="mr-2 h-4 w-4" /> กลับแดชบอร์ดแอดมิน
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" /> ออกจากระบบ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
    </>
  );
}
