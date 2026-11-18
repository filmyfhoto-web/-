import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sidebar } from '@/film-shop/components/layout/Sidebar';
import { Header } from '@/film-shop/components/layout/Header';
import { MobileNav } from '@/film-shop/components/layout/MobileNav';
import { MobileHeader } from '@/film-shop/components/layout/MobileHeader';
import { useFilmOrders } from '@/film-shop/hooks/useFilmOrders';
import { FilmStoreScopeProvider } from '@/film-shop/hooks/useFilmStoreScope';

/**
 * ทุกหน้าโหลดแบบ lazy — เปิดแอปครั้งแรกเบาและไหลลื่น
 * (เดิม import ทุกหน้าพร้อมกัน ทำให้บันเดิลใหญ่มากและหน้าค้างตอนเปิด)
 */
const Dashboard = lazy(() => import('@/film-shop/components/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const OrderIntakePage = lazy(() => import('@/film-shop/components/orders/OrderIntakePage').then((m) => ({ default: m.OrderIntakePage })));
const VinylCalculator = lazy(() => import('@/film-shop/components/calculator/VinylCalculator').then((m) => ({ default: m.VinylCalculator })));
const OrderManager = lazy(() => import('@/film-shop/components/orders/OrderManager').then((m) => ({ default: m.OrderManager })));
const JobQueue = lazy(() => import('@/film-shop/components/queue/JobQueue').then((m) => ({ default: m.JobQueue })));
const JobKanbanBoard = lazy(() => import('@/film-shop/components/board/JobKanbanBoard').then((m) => ({ default: m.JobKanbanBoard })));
const WorkcenterPage = lazy(() => import('@/film-shop/workcenter/components/WorkcenterPage').then((m) => ({ default: m.WorkcenterPage })));
const CustomerManager = lazy(() => import('@/film-shop/components/customers/CustomerManager').then((m) => ({ default: m.CustomerManager })));
const CrmOverview = lazy(() => import('@/film-shop/components/customers/CrmOverview').then((m) => ({ default: m.CrmOverview })));
const InvoiceManager = lazy(() => import('@/film-shop/components/invoices/InvoiceManager').then((m) => ({ default: m.InvoiceManager })));
const ReceiptDocPage = lazy(() => import('@/film-shop/components/documents/ReceiptDocPage').then((m) => ({ default: m.ReceiptDocPage })));
const JobTracker = lazy(() => import('@/film-shop/components/jobs/JobTracker').then((m) => ({ default: m.JobTracker })));
const TransactionManager = lazy(() => import('@/film-shop/components/transactions/TransactionManager').then((m) => ({ default: m.TransactionManager })));
const EmployeeManager = lazy(() => import('@/film-shop/components/employees/EmployeeManager').then((m) => ({ default: m.EmployeeManager })));
const SettingsManager = lazy(() => import('@/film-shop/components/settings/SettingsManager').then((m) => ({ default: m.SettingsManager })));
const AdminDashboard = lazy(() => import('@/film-shop/components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const SalesReportGenerator = lazy(() => import('@/film-shop/components/reports/SalesReportGenerator').then((m) => ({ default: m.SalesReportGenerator })));
const JobRequestsManager = lazy(() => import('@/film-shop/components/job-requests/JobRequestsManager').then((m) => ({ default: m.JobRequestsManager })));
const SalesReconciliation = lazy(() => import('@/film-shop/components/dashboard/SalesReconciliation').then((m) => ({ default: m.SalesReconciliation })));
const AuditLogViewer = lazy(() => import('@/film-shop/components/audit/AuditLogViewer').then((m) => ({ default: m.AuditLogViewer })));
const FilmToolsPage = lazy(() => import('@/film-shop/components/tools/FilmToolsPage').then((m) => ({ default: m.FilmToolsPage })));
const SiteEditorPage = lazy(() => import('@/film-shop/components/site/SiteEditorPage').then((m) => ({ default: m.SiteEditorPage })));
const DocCommandWorkspace = lazy(() => import('@/film-shop/components/commands/DocCommandWorkspace').then((m) => ({ default: m.DocCommandWorkspace })));
const EmbeddedStock = lazy(() => import('@/film-shop/components/stock/EmbeddedStock').then((m) => ({ default: m.EmbeddedStock })));
const FilmAppLinksPage = lazy(() => import('@/film-shop/components/tools/FilmAppLinksPage').then((m) => ({ default: m.FilmAppLinksPage })));
const QuickDocPage = lazy(() => import('@/film-shop/components/quickdoc/QuickDocPage').then((m) => ({ default: m.QuickDocPage })));
const EmbeddedReceipts = lazy(() => import('@/film-shop/components/receipts/EmbeddedReceipts').then((m) => ({ default: m.EmbeddedReceipts })));
const QueueGroupPage = lazy(() => import('@/film-shop/components/hub/QueueGroupPage').then((m) => ({ default: m.QueueGroupPage })));
const ShopGroupPage = lazy(() => import('@/film-shop/components/hub/ShopGroupPage').then((m) => ({ default: m.ShopGroupPage })));
const FilmShopGroupPage = lazy(() => import('@/film-shop/components/hub/FilmShopGroupPage').then((m) => ({ default: m.FilmShopGroupPage })));
const FilmInboxPage = lazy(() => import('@/film-shop/components/inbox/FilmInboxPage').then((m) => ({ default: m.FilmInboxPage })));
const GroupAlertsCenter = lazy(() => import('@/film-shop/components/notifications/GroupAlertsCenter').then((m) => ({ default: m.GroupAlertsCenter })));
const SystemTestCenter = lazy(() => import('@/film-shop/components/systest/SystemTestCenter').then((m) => ({ default: m.SystemTestCenter })));
import { useAppData } from '@/film-shop/hooks/useAppData';
import { useAuth } from '@/film-shop/hooks/useAuth';
import { useUserRole } from '@/film-shop/hooks/useUserRole';
import { useIsMobile } from '@/film-shop/hooks/use-mobile';
import { useIsTablet } from '@/film-shop/hooks/use-tablet';
import { useSidebarPreference } from '@/film-shop/hooks/useSidebarPreference';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import '@/film-shop/film-shop.css';
import { setLastStore } from '@/pages/receipts/lib/lastStore';
import { onFilmNavigate, type FilmNavFilter } from '@/film-shop/lib/filmNav';
import { armPersistentNotifications } from '@/film-shop/lib/desktopNotify';
import { LEGACY_OPS_MENUS } from '@/lib/legacyUi';

const pageTitles: Record<string, string> = {
  'group-colorlab': 'นัฐภรณ์ คัลเลอร์แล็ป',
  'group-printing': 'นัฐภรณ์ การพิมพ์',
  'group-filmshop': 'Film Shop — ใบเสร็จ',
  'group-queue': 'Q รันงาน',
  intake: 'สร้างออเดอร์',
  'doc-summary': 'สรุปเอกสารและยอดขาย',
  orders: 'ศูนย์ออเดอร์',
  receipts: 'ใบเสร็จรับเงิน (2 ร้าน)',
  'quick-doc': 'ออกใบเสร็จด่วน',
  documents: 'เอกสารที่บันทึก (2 ร้าน)',
  inbox: 'Inbox แชตลูกค้า',
  alerts: 'ศูนย์แจ้งเตือน 2 กลุ่ม',
  systest: 'ศูนย์ทดสอบระบบ (FS FILM SHOP & NATTA.Q)',
  'doc-command': 'ออกเอกสารด้วยคำสั่ง (พิมพ์/เสียง)',
  line: 'LINE OA',
  applinks: 'ลิงก์เว็บแอป',
  stock: 'สินค้า/สต๊อก',
  queue: 'คิวงาน',
  'job-board': 'บอร์ดคิวงาน (รับงาน → พร้อมส่ง)',
  workcenter: 'ศูนย์รับงานภายในร้าน / รันคิวงาน',
  calculator: 'คำนวณราคาไวนิล',
  invoices: 'ใบเสร็จรับเงิน',
  jobs: 'ติดตามสถานะงานเอกสาร',
  'job-requests': 'คำสั่งงานจากลูกค้า (LINE)',
  'line-inbox': 'กล่องงานจาก LINE',
  'queue-settings': 'ตั้งค่าคิวงาน',
  'notify-prefs': 'ตั้งค่าการแจ้งเตือน',
  customers: 'ข้อมูลลูกค้า',
  'site-editor': 'จัดการหน้าเว็บไซต์',
  reports: 'รายงานการขาย',
  audit: 'ประวัติการแก้ไข',
  'sales-check': 'ตรวจสอบยอดขาย',
  transactions: 'รายรับ/รายจ่าย',
  employees: 'ข้อมูลพนักงาน',
  admin: 'จัดการผู้ใช้ระบบ',
  settings: 'ตั้งค่าระบบ',
  tools: 'เครื่องมือขั้นสูง',
};

/** หน้าหลักของ Film Shop หลังเลิกใช้หน้า “ภาพรวม” */
export const FILM_HOME_PAGE = 'group-queue';

/** หน้าที่ถูกลบถาวร — ลิงก์เก่าเด้งกลับหน้าหลัก */
const REMOVED_PAGE_IDS = ['dashboard', 'pos', 'job-orders'];

/** เฟส 1: หน้าที่เลิกใช้ — เปิดจากลิงก์เก่าจะเด้งกลับหน้าหลัก (สลับกลับได้ที่ src/lib/legacyUi.ts) */
const LEGACY_PAGE_IDS = [
  'inbox', 'line-inbox', 'alerts', 'notify-prefs',
  'queue', 'job-board', 'workcenter', 'queue-settings', 'job-requests', 'jobs',
  'orders', 'intake', 'line',
];

/** Page ids that may be restored from the URL (?p=…) — refresh-safe deep links. */
export const FILM_PAGE_IDS = Object.keys(pageTitles).filter(
  (id) =>
    id !== 'group-filmshop' &&
    !REMOVED_PAGE_IDS.includes(id) &&
    (LEGACY_OPS_MENUS || !LEGACY_PAGE_IDS.includes(id)),
);

/**
 * Canonical redirect ของ Film Shop — ทุกทางเข้าเก่ามารวมที่ “Q รันงาน” จุดเดียว
 *  ?p=group-filmshop                → ?p=group-queue
 *  ?doc=helper                      → ?p=group-queue&q=intake
 *  ?p=invoices&t=job_order|receipt  → ?p=group-queue&q=documents
 * คืนค่า params ชุดใหม่เมื่อ URL ต้องถูกเขียนใหม่จริง (ไม่ใช่แค่ render หน้าอื่นที่ URL เดิม)
 */
export function canonicalFilmParams(sp: URLSearchParams): URLSearchParams | null {
  const next = new URLSearchParams(sp);
  let changed = false;
  if (next.get('p') === 'group-filmshop') { next.set('p', 'group-queue'); changed = true; }
  if (next.get('doc') === 'helper') {
    next.delete('doc');
    next.set('p', 'group-queue');
    next.set('q', 'intake');
    changed = true;
  }
  if (next.get('p') === 'invoices' && ['job_order', 'receipt'].includes(next.get('t') ?? '')) {
    next.delete('t');
    next.set('p', 'group-queue');
    next.set('q', 'documents');
    changed = true;
  }
  return changed ? next : null;
}

const FilmShopApp = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = (() => {
    const p = (canonicalFilmParams(searchParams) ?? searchParams).get('p');
    return p && FILM_PAGE_IDS.includes(p) ? p : FILM_HOME_PAGE;
  })();
  const [currentPage, setCurrentPage] = useState(initialPage);
  /** ประวัติการเปิดหน้าในแอปนี้ (Film Shop เป็น route เดียว จึงต้องเก็บเอง) */
  const pageStack = useRef<string[]>([]);
  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } = useSidebarPreference();
  const [pageFilter, setPageFilter] = useState<FilmNavFilter>(() => ({
    highlightOrderId: searchParams.get('o') || undefined,
    highlightNotificationId: searchParams.get('n') || undefined,
    statusBucket: searchParams.get('s') || undefined,
  }));
  const { settings } = useAppData();
  const { createOrder } = useFilmOrders();
  const { user, loading, signOut } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  /** ลิงก์เก่าของ Film Shop → เขียน URL ใหม่เป็นทางเข้า Q ทันที */
  useEffect(() => {
    const canon = canonicalFilmParams(searchParams);
    if (canon) {
      setCurrentPage('group-queue');
      setSearchParams(canon, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Pages that take over the whole canvas (only the sidebar stays visible).
  const isFullBleed = currentPage === 'receipts' || currentPage === 'documents' || currentPage === 'quick-doc';

  useEffect(() => { setLastStore('film'); }, []);

  // จำสถานะการอนุญาตแจ้งเตือนไว้ถาวร — ผู้ใช้ไม่ต้องกดอนุญาตใหม่ทุกครั้งที่เปิดแอป
  useEffect(() => armPersistentNotifications(), []);

  // Admin-only pages - redirect to dashboard if staff tries to access
  // Settings is now visible to everyone; admin-only sections inside SettingsManager
  // are gated individually so staff can view read-only configuration.
  const adminOnlyPages = ['transactions', 'employees', 'admin', 'sales-check', 'settings'];
  
  useEffect(() => {
    if (!roleLoading && !isAdmin && adminOnlyPages.includes(currentPage)) {
      setCurrentPage(FILM_HOME_PAGE);
    }
  }, [isAdmin, roleLoading, currentPage]);

  const handlePageChange = (page: string, filter?: FilmNavFilter) => {
    // ทุกอย่างทำงานในหน้า Film Shop หน้าเดียว — ไม่เด้งออกไป route อื่น
    if (REMOVED_PAGE_IDS.includes(page) || (!LEGACY_OPS_MENUS && LEGACY_PAGE_IDS.includes(page))) {
      pageStack.current = [];
      setCurrentPage(FILM_HOME_PAGE);
      setPageFilter({});
      return;
    }
    setCurrentPage((prev) => {
      if (prev !== page) pageStack.current.push(prev);
      return page;
    });
    setPageFilter(filter || {});
  };

  // Header bells / alert cards can jump to any page through the nav bus.
  useEffect(() => onFilmNavigate((page, filter) => {
    if (REMOVED_PAGE_IDS.includes(page) || (!LEGACY_OPS_MENUS && LEGACY_PAGE_IDS.includes(page))) { pageStack.current = []; setCurrentPage(FILM_HOME_PAGE); setPageFilter({}); return; }
    setCurrentPage((prev) => {
      if (prev !== page) pageStack.current.push(prev);
      return page;
    });
    setPageFilter(filter || {});
  }), []);

  /**
   * ปุ่มย้อนกลับ: ถอยหน้าในแอปก่อน → ถ้าไม่มีก็กลับหน้าหลัก Film Shop
   * → ถ้าอยู่หน้าหลักอยู่แล้วค่อยถอยประวัติเบราว์เซอร์ (หรือไปหน้าแอดมิน)
   */
  const handleBack = () => {
    const prev = pageStack.current.pop();
    if (prev) { setCurrentPage(prev); setPageFilter({}); return; }
    if (currentPage !== FILM_HOME_PAGE) { setCurrentPage(FILM_HOME_PAGE); setPageFilter({}); return; }
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' ? idx > 0 : window.history.length > 1) navigate(-1);
    else navigate('/admin/home', { replace: true });
  };

  // Keep ?p=<page> in sync so a refresh (or a shared link) reopens the same page.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    if (currentPage === FILM_HOME_PAGE) next.delete('p');
    else next.set('p', currentPage);
    if (next.toString() !== window.location.search.replace(/^\?/, '')) {
      setSearchParams(next, { replace: true });
    }
  }, [currentPage, setSearchParams]);

  // Browser back/forward and external deep links drive the page state too.
  useEffect(() => {
    const p = (canonicalFilmParams(searchParams) ?? searchParams).get('p');
    const target = p && FILM_PAGE_IDS.includes(p) ? p : FILM_HOME_PAGE;
    setCurrentPage((prev) => (prev === target ? prev : target));
    // ปุ่มในแจ้งเตือน (Web Push / LINE) ส่ง ?n=<notification> และ ?o=<order> มาด้วย
    const n = searchParams.get('n') || undefined;
    const o = searchParams.get('o') || undefined;
    if (n || o) {
      setPageFilter((prev) =>
        prev.highlightNotificationId === n && prev.highlightOrderId === o
          ? prev
          : { ...prev, highlightNotificationId: n, highlightOrderId: o },
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="film-shop-scope min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const pageFallback = (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  const renderPage = () => {
    switch (currentPage) {
      case 'group-colorlab':
        return <ShopGroupPage slug="colorlab" onHome={() => handlePageChange(FILM_HOME_PAGE)} />;
      case 'group-printing':
        return <ShopGroupPage slug="printing" onHome={() => handlePageChange(FILM_HOME_PAGE)} />;
      case 'group-filmshop':
        // ลิงก์เก่า — URL ถูกเขียนใหม่เป็น ?p=group-queue แล้ว (canonical redirect ด้านบน)
      case 'group-queue':
        return <QueueGroupPage onHome={() => handlePageChange(FILM_HOME_PAGE)} onReceipts={(invoiceId?: string) => handlePageChange('invoices', invoiceId ? { previewInvoiceId: invoiceId } : undefined)} />;
      case 'intake':
        return (
          <OrderIntakePage
            onCreate={createOrder}
            onDone={() => handlePageChange('orders')}
            onOpenDocument={(invoiceId) => handlePageChange('invoices', { previewInvoiceId: invoiceId })}
          />
        );
      case 'doc-summary':
        return <Dashboard onPageChange={handlePageChange} />;
      case 'orders':
        return (
          <OrderManager
            initialStatusBucket={pageFilter.statusBucket}
            autoFocusSearch={pageFilter.autoFocus}
            highlightOrderId={pageFilter.highlightOrderId}
            onOpenDocument={(invoiceId) => handlePageChange('invoices', { previewInvoiceId: invoiceId })}
            onNewOrder={() => handlePageChange('intake')}
          />
        );
      case 'receipts':
        return <EmbeddedReceipts />;
      case 'quick-doc':
        return <QuickDocPage />;
      case 'documents':
        return <EmbeddedReceipts sub="documents" />;
      case 'queue':
        return (
          <JobQueue
            onOpenDocument={(invoiceId) => handlePageChange('invoices', { previewInvoiceId: invoiceId })}
          />
        );
      case 'alerts':
        return <GroupAlertsCenter />;
      case 'systest':
        return <SystemTestCenter />;
      case 'inbox':
        return <FilmInboxPage onPageChange={handlePageChange} inboxTarget={pageFilter.inbox} />;
      case 'job-board':
        return <JobKanbanBoard />;
      case 'workcenter':
        return <WorkcenterPage />;
      case 'applinks':
        return <FilmAppLinksPage />;
      case 'doc-command':
        return <ReceiptDocPage />;
      case 'stock':
        return <EmbeddedStock />;
      case 'calculator':
        return <VinylCalculator />;
      case 'invoices':
        return <QuickDocPage key={pageFilter.previewInvoiceId ?? 'new'} initialPreviewInvoiceId={pageFilter.previewInvoiceId} />;
      case 'jobs':
        return <JobTracker />;
      case 'job-requests':
        return <JobRequestsManager />;
      case 'queue-settings':
      case 'notify-prefs':
        // ยุบมารวมในหน้า "ตั้งค่า" หน้าเดียว — ลิงก์เก่ายังใช้ได้
        return <SettingsManager />;
      case 'customers':
        return (
          <div className="space-y-4">
            <CrmOverview />
            <CustomerManager />
          </div>
        );
      case 'reports':
        return <SalesReportGenerator />;
      case 'site-editor':
        return <SiteEditorPage />;
      case 'audit':
        return <AuditLogViewer />;
      case 'sales-check':
        return <SalesReconciliation />;
      case 'transactions':
        return <TransactionManager />;
      case 'employees':
        return <EmployeeManager />;
      case 'admin':
        return <AdminDashboard />;
      case 'settings':
        return <SettingsManager />;
      case 'tools':
        return <FilmToolsPage onPageChange={handlePageChange} />;
      default:
        return <QueueGroupPage onHome={() => handlePageChange(FILM_HOME_PAGE)} onReceipts={(invoiceId?: string) => handlePageChange('invoices', invoiceId ? { previewInvoiceId: invoiceId } : undefined)} />;
    }
  };

  // Mobile Layout
  if (isMobile) {
    return (
      <FilmStoreScopeProvider>
      <div className="film-shop-scope min-h-screen bg-[#FAF9F6] pb-20">
        <MobileHeader 
          title={pageTitles[currentPage]} 
          userEmail={user.email}
          onSignOut={signOut}
          onBack={handleBack}
        />
        
        <main className={cn(isFullBleed ? 'p-0' : 'mx-auto w-full max-w-3xl px-4 py-5')}>
          <Suspense fallback={pageFallback}>{renderPage()}</Suspense>
        </main>


        <MobileNav currentPage={currentPage} onPageChange={handlePageChange} />
      </div>
      </FilmStoreScopeProvider>
    );
  }

  // Desktop Layout
  return (
    <FilmStoreScopeProvider>
    <div className={cn('film-shop-scope bg-[#FAF9F6]', isFullBleed ? 'h-screen overflow-hidden' : 'min-h-screen')}>
      <Sidebar
        currentPage={currentPage}
        onPageChange={handlePageChange}
        railed={isTablet}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      
      <div className={cn(
        'transition-all duration-300',
        isTablet || sidebarCollapsed ? 'ml-[76px]' : 'ml-[272px]', // Sidebar width (tablet / ยุบ = icon rail)
        isFullBleed && 'flex h-screen flex-col',
      )}>
        <Header
          title={pageTitles[currentPage]}
          shopName={settings.shopName}
          userEmail={user.email}
          onSignOut={signOut}
          compact={isFullBleed}
          onBack={handleBack}
          home={currentPage === FILM_HOME_PAGE}
          greetingName={user.email?.split('@')[0] ?? ''}
        />

        <main className={cn(isFullBleed ? 'min-h-0 flex-1 p-0' : 'mx-auto w-full max-w-[1180px] px-5 py-6 xl:px-8')}>
          <Suspense fallback={pageFallback}>{renderPage()}</Suspense>
        </main>
      </div>
    </div>
    </FilmStoreScopeProvider>
  );
};

export default FilmShopApp;
