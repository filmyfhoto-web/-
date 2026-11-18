import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Login from "./pages/Login.tsx";
const Signup = lazy(() => import("./pages/Signup.tsx"));
const AcceptAdminInvite = lazy(() => import("./pages/AcceptAdminInvite.tsx"));
const JoinStore = lazy(() => import("./pages/JoinStore.tsx"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent.tsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const CustomerLineLink = lazy(() => import("./pages/customer/LineLink.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const Terms = lazy(() => import("./pages/Terms.tsx"));
const PrintPreviewHarness = lazy(() => import("./pages/dev/PrintPreviewHarness.tsx"));
const AutomationDemo = lazy(() => import("./pages/dev/AutomationDemo.tsx"));
const Shop = lazy(() => import("./pages/Shop.tsx"));

const Guide = lazy(() => import("./pages/Guide.tsx"));
const ShopPos = lazy(() => import("./pages/ShopPos.tsx"));
const ShopAccountLink = lazy(() => import("./pages/ShopAccountLink.tsx"));
const LiffShop = lazy(() => import("./pages/LiffShop.tsx"));
const LiffLink = lazy(() => import("./pages/LiffLink.tsx"));
const Cart = lazy(() => import("./pages/Cart.tsx"));
const MyOrders = lazy(() => import("./pages/MyOrders.tsx"));
const MyAccount = lazy(() => import("./pages/MyAccount.tsx"));
const CustomerNotifications = lazy(() => import("./pages/customer/CustomerNotifications.tsx"));
const MyOrderDetail = lazy(() => import("./pages/MyOrderDetail.tsx"));
const OrderReceipt = lazy(() => import("./pages/OrderReceipt.tsx"));
const PurchaseOrder = lazy(() => import("./pages/PurchaseOrder.tsx"));
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
const GuestEntry = lazy(() => import("./pages/GuestEntry.tsx"));
const SchoolEntry = lazy(() => import("./pages/SchoolEntry.tsx"));
const SchoolInvalid = lazy(() => import("./pages/SchoolInvalid.tsx"));
// หน้า "บัญชีของฉัน" ฝั่งลูกค้า — lazy ทั้งหมดเพื่อไม่ให้ bundle หน้าแรกโต
const AccountPendingOrders = lazy(() => import("./pages/account/PendingOrders.tsx"));
const AccountOrderHistory = lazy(() => import("./pages/account/OrderHistory.tsx"));
const AccountOrderStatus = lazy(() => import("./pages/account/OrderStatus.tsx"));
const AccountNotifyTest = lazy(() => import("./pages/account/NotifyTest.tsx"));
const LineDebug = lazy(() => import("./pages/LineDebug.tsx"));
const AccountDocuments = lazy(() => import("./pages/account/MyDocuments.tsx"));
const AccountCoupons = lazy(() => import("./pages/account/Coupons.tsx"));
const AccountAddresses = lazy(() => import("./pages/account/Addresses.tsx"));
const AccountUpload = lazy(() => import("./pages/account/UploadFiles.tsx"));
const AccountTracking = lazy(() => import("./pages/account/Tracking.tsx"));
const AccountShopInfo = lazy(() => import("./pages/account/ShopInfo.tsx"));
const AccountContact = lazy(() => import("./pages/account/ContactShop.tsx"));
const AccountExcelIntake = lazy(() => import("./pages/account/ExcelIntake.tsx"));
const AccountUnifiedHistory = lazy(() => import("./pages/account/UnifiedHistory.tsx"));
const AdminCustomer360 = lazy(() => import("./pages/admin/Customer360.tsx"));
const AdminHubNotificationDetail = lazy(() => import("./pages/admin/HubNotificationDetail.tsx"));
const AdminProducts = lazy(() => import("./pages/admin/Products.tsx"));
const AdminImportHistory = lazy(() => import("./pages/admin/ImportHistory.tsx"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers.tsx"));
const AdminPrices = lazy(() => import("./pages/admin/Prices.tsx"));
const AdminPriceGroups = lazy(() => import("./pages/admin/PriceGroups.tsx"));
const AdminPurchases = lazy(() => import("./pages/admin/Purchases.tsx"));
const AdminOrderDeepLink = lazy(() => import("./pages/admin/OrderDeepLink.tsx"));
const AdminOrderDesk = lazy(() => import("./pages/admin/OrderDesk.tsx"));
const AdminToday = lazy(() => import("./pages/admin/AdminToday.tsx"));
const AdminWorkDocs = lazy(() => import("./pages/admin/WorkDocs.tsx"));
const CustomerPoReview = lazy(() => import("./pages/po/CustomerPoReview.tsx"));
const AdminSuppliers = lazy(() => import("./pages/admin/Suppliers.tsx"));
const AdminStock = lazy(() => import("./pages/admin/Stock.tsx"));
const AdminProductStockUpdate = lazy(() => import("./pages/admin/ProductStockUpdate.tsx"));
const AdminReports = lazy(() => import("./pages/admin/Reports.tsx"));
const AdminSecurity = lazy(() => import("./pages/admin/Security.tsx"));
const AdminSecurityAuditLog = lazy(() => import("./pages/admin/SecurityAuditLog.tsx"));
const AdminNotifications = lazy(() => import("./pages/admin/Notifications.tsx"));
const NotificationCenter = lazy(() => import("./pages/admin/NotificationCenter.tsx"));
const AdminCreditBills = lazy(() => import("./pages/admin/CreditBills.tsx"));
const AdminNotificationSettings = lazy(() => import("./pages/admin/NotificationSettings.tsx"));
const AlertStats = lazy(() => import("./pages/admin/AlertStats.tsx"));
const AdminEnvSecrets = lazy(() => import("./pages/admin/EnvSecrets.tsx"));
const AdminControlRoom = lazy(() => import("./pages/admin/ControlRoom.tsx"));
const AdminSettings = lazy(() => import("./pages/admin/Settings.tsx"));
const SettingsHub = lazy(() => import("./pages/admin/SettingsHub.tsx"));
const AdminTools = lazy(() => import("./pages/admin/Tools.tsx"));
const BossDocAi = lazy(() => import("./pages/admin/BossDocAi.tsx"));
const PosStoreProfilePage = lazy(() => import("./pages/admin/PosStoreProfile.tsx"));
const ShopHomeDesignPage = lazy(() => import("./pages/admin/ShopHomeDesign.tsx"));
const Welcome = lazy(() => import("./pages/Welcome.tsx"));
const Landing = lazy(() => import("./pages/Landing.tsx"));
const Diagnostics = lazy(() => import("./pages/Diagnostics.tsx"));
const AdminSiteEditor = lazy(() => import("./film-shop/components/site/SiteEditorPage.tsx"));
const AdminDashboardHome = lazy(() => import("./pages/admin/AdminDashboardHome.tsx"));
const DiagnosticsRoutes = lazy(() => import("./pages/DiagnosticsRoutes.tsx"));
const Sitemap = lazy(() => import("./pages/Sitemap.tsx"));
const StaffPortal = lazy(() => import("./pages/StaffPortal.tsx"));
const NoAccess = lazy(() => import("./pages/NoAccess.tsx"));
const CustomerLogin = lazy(() => import("./pages/customer/CustomerLogin.tsx"));
const LineOauthCallback = lazy(() => import("./pages/customer/LineOauthCallback.tsx"));
const StaffLogin = lazy(() => import("./pages/staff/StaffLogin.tsx"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin.tsx"));
const StaffHome = lazy(() => import("./pages/staff/StaffHome.tsx"));
const AdminStaff = lazy(() => import("./pages/admin/Staff.tsx"));
const AdminReview = lazy(() => import("./pages/admin/Review.tsx"));
import Launch from "./pages/Launch.tsx";
const AdminLineNotifications = lazy(() => import("./pages/admin/LineNotifications.tsx"));
const AdminLinkRequests = lazy(() => import("./pages/admin/LinkRequests.tsx"));
const AdminLiffCheck = lazy(() => import("./pages/admin/LiffCheck.tsx"));
const AdminAutoBindHistory = lazy(() => import("./pages/admin/AutoBindHistory.tsx"));
const AdminLineWebhookEvents = lazy(() => import("./pages/admin/LineWebhookEvents.tsx"));
const AdminLineWebhookStatus = lazy(() => import("./pages/admin/LineWebhookStatus.tsx"));
const AdminLineRecipients = lazy(() => import("./pages/admin/LineRecipients.tsx"));
const AdminProductViews = lazy(() => import("./pages/admin/ProductViews.tsx"));
const AdminTutorialViews = lazy(() => import("./pages/admin/TutorialViews.tsx"));
const AdminReplyTemplates = lazy(() => import("./pages/admin/ReplyTemplates.tsx"));
const AdminInbox = lazy(() => import("./pages/admin/Inbox.tsx"));
const AdminAlertRules = lazy(() => import("./pages/admin/AlertRules.tsx"));
const AdminLineConnectionTest = lazy(() => import("./pages/admin/LineConnectionTest.tsx"));
const AdminLineWebhookTest = lazy(() => import("./pages/admin/LineWebhookTest.tsx"));
const AdminLineSecretVault = lazy(() => import("./pages/admin/LineSecretVault.tsx"));
const AdminLineIdentityStatus = lazy(() => import("./pages/admin/LineIdentityStatus.tsx"));
const AdminLineSettings = lazy(() => import("./pages/admin/LineSettings.tsx"));
const AdminLineGroups = lazy(() => import("./pages/admin/LineGroups.tsx"));
const AdminLineGroupNotifyStatus = lazy(() => import("./pages/admin/LineGroupNotifyStatus.tsx"));
const AdminLineGroupRoles = lazy(() => import("./pages/admin/LineGroupRoles.tsx"));
const AdminLineDeliveryLog = lazy(() => import("./pages/admin/LineDeliveryLog.tsx"));
const AdminLineVerifyWebhookLog = lazy(() => import("./pages/admin/LineVerifyWebhookLog.tsx"));
const AdminLineBindings = lazy(() => import("./pages/admin/LineBindings.tsx"));
const AdminLineRoomAdmins = lazy(() => import("./pages/admin/LineRoomAdmins.tsx"));
const AdminLinePhoneBindings = lazy(() => import("./pages/admin/LinePhoneBindings.tsx"));
const AdminLineCallbacks = lazy(() => import("./pages/admin/LineCallbacks.tsx"));
const AdminLineSummary = lazy(() => import("./pages/admin/LineSummary.tsx"));
const AdminLineLoginLogs = lazy(() => import("./pages/admin/LineLoginLogs.tsx"));
const MyLineStatus = lazy(() => import("./pages/MyLineStatus.tsx"));
const FaqLineOa = lazy(() => import("./pages/FaqLineOa.tsx"));
const VerifyLine = lazy(() => import("./pages/VerifyLine.tsx"));
const StaffDashboard = lazy(() => import("./pages/staff/Dashboard.tsx"));
const StaffProductNew = lazy(() => import("./pages/staff/ProductNew.tsx"));
const StaffPhotos = lazy(() => import("./pages/staff/Photos.tsx"));
const StaffStock = lazy(() => import("./pages/staff/Stock.tsx"));
const StaffLowStock = lazy(() => import("./pages/staff/LowStock.tsx"));
const StaffPending = lazy(() => import("./pages/staff/Pending.tsx"));
const StaffHistory = lazy(() => import("./pages/staff/History.tsx"));
const ScanHistory = lazy(() => import("./pages/staff/ScanHistory.tsx"));
const StaffInbox = lazy(() => import("./pages/staff/Inbox.tsx"));
const StaffProfile = lazy(() => import("./pages/StaffProfile.tsx"));
const ReceiptsLayout = lazy(() => import("./pages/receipts/ReceiptsLayout.tsx"));
const StorePicker = lazy(() => import("./pages/receipts/StorePicker.tsx"));
const AdminAppLinks = lazy(() => import("./pages/admin/AppLinks.tsx"));
const FilmShopApp = lazy(() => import("./film-shop/FilmShopApp.tsx"));
const FilmShopHome = lazy(() => import("./pages/film-shop/FilmShopHome.tsx"));
const FilmShopEntry = lazy(() => import("./pages/receipts/FilmShopEntry.tsx"));
const FsShareEntry = lazy(() => import("./pages/FsShareEntry.tsx"));
const FilmIntakeForm = lazy(() => import("./pages/FilmIntakeForm.tsx"));
const FileIntakePreview = lazy(() => import("./pages/FileIntakePreview.tsx"));
const InstallAdminApp = lazy(() => import("./pages/InstallAdminApp.tsx"));
const FsShareLinks = lazy(() => import("./pages/admin/FsShareLinks.tsx"));
const DocumentForm = lazy(() => import("./pages/receipts/documents/DocumentForm.tsx"));
const DocumentsList = lazy(() => import("./pages/receipts/documents/DocumentsList.tsx"));
const RevisionHistory = lazy(() => import("./pages/receipts/documents/RevisionHistory.tsx"));
const SyncHistory = lazy(() => import("./pages/receipts/documents/SyncHistory.tsx"));
const SyncArchive = lazy(() => import("./pages/receipts/documents/SyncArchive.tsx"));
const SheetTemplate = lazy(() => import("./pages/receipts/documents/SheetTemplate.tsx"));
const PrintDocument = lazy(() => import("./pages/receipts/documents/PrintDocument.tsx"));
const PrintPreview = lazy(() => import("./pages/receipts/documents/PrintPreview.tsx"));
const POS = lazy(() => import("./pages/receipts/pos/POS.tsx"));
const CentralPOS = lazy(() => import("./pages/pos/CentralPOS.tsx"));
import PosShell from "./components/layout/PosShell.tsx";
const PosStock = lazy(() => import("./pages/pos/PosStock.tsx"));
const PosStockImport = lazy(() => import("./pages/pos/PosStockImport.tsx"));
const PosCustomers = lazy(() => import("./pages/pos/PosCustomers.tsx"));
const PosHistory = lazy(() => import("./pages/pos/PosHistory.tsx"));
const PosReports = lazy(() => import("./pages/pos/PosReports.tsx"));
const PosSettings = lazy(() => import("./pages/pos/PosSettings.tsx"));
const PosScanHistory = lazy(() => import("./pages/pos/PosScanHistory.tsx"));
const PosStaffHub = lazy(() => import("./pages/pos/PosStaffHub.tsx"));
const StaffRoleRequest = lazy(() => import("./pages/pos/StaffRoleRequest.tsx"));
const PosPurchaseOrdersList = lazy(() => import("./pages/pos/PosPurchaseOrdersList.tsx"));
const PosPurchaseOrderEditor = lazy(() => import("./pages/pos/PosPurchaseOrderEditor.tsx"));
const PosPurchaseOrderView = lazy(() => import("./pages/pos/PosPurchaseOrderView.tsx"));
const PosPurchaseOrderPrint = lazy(() => import("./pages/pos/PosPurchaseOrderPrint.tsx"));
const PosSuppliers = lazy(() => import("./pages/pos/PosSuppliers.tsx"));
const PosPricing = lazy(() => import("./pages/pos/PosPricing.tsx"));
const PosMovements = lazy(() => import("./pages/pos/PosMovements.tsx"));
const PosDelivery = lazy(() => import("./pages/pos/PosDelivery.tsx"));
const PosDashboard = lazy(() => import("./pages/pos/PosDashboard.tsx"));
const PosReceiptPrint = lazy(() => import("./pages/pos/PosReceiptPrint.tsx"));
const PosRegister = lazy(() => import("./pages/pos/PosRegister.tsx"));
const PosTools = lazy(() => import("./pages/pos/PosTools.tsx"));
import { Navigate as _NavigateAlias } from "react-router-dom";
function PerStorePosRedirect() {
  const slug = (typeof window !== "undefined" ? window.location.pathname.split("/")[2] : "") || "";
  return <_NavigateAlias to={slug ? `/pos/${slug}` : "/pos"} replace />;
}
  /**
   * เส้นทางงานลูกค้ารวมอยู่ที่ตะกร้าและประวัติ ส่วนงานแอดมินรวมอยู่ใน Work Docs
   * เก็บ URL เดิมไว้เป็น redirect เพื่อไม่ให้ลิงก์เก่าพัง
   */
function CustomerPurchaseOrdersRoute() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const req = params.get("tab") === "requisitions" || params.get("filter") === "requisition";
  const next = new URLSearchParams();
  next.set("filter", req ? "requisition" : "order");
  const id = params.get("id") || params.get("order") || params.get("focus");
  if (id) next.set("id", id);
  next.set("kind", req ? "requisition" : "order");
  return <Navigate to={`/admin/work-docs?${next.toString()}`} replace />;
}

const ReceiptsSettings = lazy(() => import("./pages/receipts/Placeholders.tsx").then((m) => ({ default: m.ReceiptsSettings })));
const ReceiptsDashboard = lazy(() => import("./pages/receipts/dashboard/Dashboard.tsx"));
const ReceiptsProducts = lazy(() => import("./pages/receipts/master/ProductsList.tsx"));
const ReceiptsCustomers = lazy(() => import("./pages/receipts/master/CustomersList.tsx"));
const ReceiptsCategories = lazy(() => import("./pages/receipts/master/CategoriesList.tsx"));
const ReceiptsReports = lazy(() => import("./pages/receipts/reports/Reports.tsx"));
const ReceiptsActivity = lazy(() => import("./pages/receipts/activity/ActivityLogs.tsx"));
const LogoPdfCheck = lazy(() => import("./pages/receipts/settings/LogoPdfCheck.tsx"));
import { AuthProvider } from "./contexts/AuthContext.tsx";
import { GuestProvider } from "@/contexts/GuestContext";
import { CartProvider } from "./contexts/CartContext.tsx";
import { LineCustomerProvider } from "./contexts/LineCustomerContext.tsx";
import { RequireAuth, RequireCustomerAuth, RequireStaff, RequireStaffAny, RequireOwner, RequireStockEdit, RequireStaffPerm } from "./components/RouteGuards.tsx";
import RequireLineLink from "./components/RequireLineLink.tsx";
import RequireOrderAccess from "./components/customer/RequireOrderAccess.tsx";

import HostRedirect from "./components/HostRedirect.tsx";
import MovedToMyShop from "./pages/MovedToMyShop.tsx";
import { LEGACY_CUSTOMER_UI, LEGACY_OPS_MENUS, LINE_OA_UI } from "@/lib/legacyUi";
const DomainStatus = lazy(() => import("./pages/DomainStatus.tsx"));
const StaffLanding = lazy(() => import("./pages/StaffLanding.tsx"));
const StaffLineApprovals = lazy(() => import("./pages/admin/StaffLineApprovals.tsx"));
import NotificationToasts from "./components/realtime/NotificationToasts.tsx";
import GlobalRealtime from "./components/realtime/GlobalRealtime.tsx";
import MobileTableFit from "./components/MobileTableFit.tsx";
import AppUpdateGate from "./components/AppUpdateGate.tsx";
import LayoutTuner from "./components/common/LayoutTuner.tsx";

import NavLoopWatcher from "./components/NavLoopWatcher.tsx";

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm">กำลังโหลดหน้า…</p>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live-first but smooth: realtime pushes invalidate exactly what changed,
      // so a short freshness window is enough and prevents refetch storms
      // (which caused flicker + jank when switching pages/tabs).
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <GuestProvider>
          <LineCustomerProvider>
          <CartProvider>
            <HostRedirect>
            <GlobalRealtime />
            <MobileTableFit />
            <NotificationToasts />
            <AppUpdateGate />
            <LayoutTuner />

            <NavLoopWatcher />
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/landing" element={<Landing />} />
              {/* ติดตั้งเว็บแอปแอดมินได้จากทุกอุปกรณ์ (เปิดสาธารณะ ไม่ต้องล็อกอิน) */}
              <Route path="/install/admin" element={<InstallAdminApp />} />
              <Route path="/install-admin" element={<InstallAdminApp />} />
              {/* Staff-only entry doors (owner/admin 🖥️ vs staff 📦) */}
              <Route path="/portal" element={<StaffPortal />} />
              {/* Friendly terminal screen — must never bounce to a login page. */}
              <Route path="/no-access" element={<NoAccess />} />
              <Route path="/customer/login" element={LEGACY_CUSTOMER_UI ? <CustomerLogin /> : <MovedToMyShop />} />
              {/* Service order (คำสั่งงาน) retired — keep the old URL safe. */}
              <Route path="/order" element={<Navigate to="/shop" replace />} />
              <Route path="/auth/line/callback" element={<LineOauthCallback />} />
              <Route path="/staff/login" element={<StaffLogin />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth" element={<Login />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/accept-admin" element={<AcceptAdminInvite />} />
              <Route path="/join-store" element={<JoinStore />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy-policy" element={<Privacy />} />
              <Route path="/terms-of-use" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/dev/print-harness" element={<PrintPreviewHarness />} />
              {/* โหมดทดลอง (พรีวิวเท่านั้น) — ไม่บันทึกและไม่ส่ง LINE จริง */}
              <Route path="/admin/automation-demo" element={<AutomationDemo />} />
              <Route path="/faq/line-oa" element={LINE_OA_UI ? <FaqLineOa /> : <MovedToMyShop />} />
              <Route path="/domain-status" element={<DomainStatus />} />
              <Route path="/staff" element={<StaffLanding />} />
              <Route path="/s" element={<Navigate to="/shop" replace />} />
              <Route path="/s/:slug" element={<Navigate to="/shop" replace />} />
              <Route path="/school/invalid" element={LEGACY_CUSTOMER_UI ? <SchoolInvalid /> : <MovedToMyShop />} />
              <Route path="/school/:token" element={LEGACY_CUSTOMER_UI ? <SchoolEntry /> : <MovedToMyShop />} />
              <Route path="/account" element={LEGACY_CUSTOMER_UI ? <RequireCustomerAuth><Account /></RequireCustomerAuth> : <MovedToMyShop />} />
              <Route path="/account/line" element={LEGACY_CUSTOMER_UI ? <RequireCustomerAuth><CustomerLineLink /></RequireCustomerAuth> : <MovedToMyShop />} />
              <Route path="/account/orders/pending" element={<RequireLineLink><AccountPendingOrders /></RequireLineLink>} />
              <Route path="/account/orders/history" element={<RequireLineLink><AccountOrderHistory /></RequireLineLink>} />
              <Route path="/account/orders/status" element={<RequireLineLink><AccountOrderStatus /></RequireLineLink>} />
              <Route path="/account/notify-test" element={LEGACY_CUSTOMER_UI ? <AccountNotifyTest /> : <MovedToMyShop />} />
              <Route path="/account/line-debug" element={LEGACY_CUSTOMER_UI ? <LineDebug /> : <MovedToMyShop />} />
              <Route path="/notify-test" element={LEGACY_CUSTOMER_UI ? <AccountNotifyTest /> : <MovedToMyShop />} />
              <Route path="/account/documents" element={<RequireLineLink><AccountDocuments /></RequireLineLink>} />
              <Route path="/account/coupons" element={<RequireLineLink><AccountCoupons /></RequireLineLink>} />
              <Route path="/account/addresses" element={<RequireLineLink><AccountAddresses /></RequireLineLink>} />
              <Route path="/account/upload" element={<RequireLineLink><AccountUpload /></RequireLineLink>} />
              <Route path="/account/tracking/:orderId" element={<RequireLineLink><AccountTracking /></RequireLineLink>} />
              <Route path="/account/tracking" element={<Navigate to="/account/orders/pending" replace />} />
              <Route path="/account/new-order" element={<Navigate to="/shop" replace />} />
              <Route path="/account/shop" element={<RequireLineLink><AccountShopInfo /></RequireLineLink>} />
              <Route path="/account/contact" element={<RequireLineLink><AccountContact /></RequireLineLink>} />
              <Route path="/account/excel" element={LEGACY_CUSTOMER_UI ? <AccountExcelIntake /> : <MovedToMyShop />} />
              <Route path="/account/history" element={LEGACY_CUSTOMER_UI ? <RequireCustomerAuth><AccountUnifiedHistory /></RequireCustomerAuth> : <MovedToMyShop />} />
              {/* หน้า LINE mini app ถูกยกเลิก — ลิงก์เก่าเด้งกลับหน้าสินค้า */}
              <Route path="/line" element={<Navigate to="/shop" replace />} />
              <Route path="/line/*" element={<Navigate to="/shop" replace />} />
              <Route path="/shop" element={LEGACY_CUSTOMER_UI ? <Shop /> : <MovedToMyShop />} />
              <Route path="/school-requisition" element={<Navigate to="/cart" replace />} />
              <Route path="/quick-doc" element={<Navigate to="/film-shop/app?p=quick-doc" replace />} />

             {/* alias: bottom-nav "โปรโมชั่น" — same storefront, scrolled to promos */}
             <Route path="/promotions" element={LEGACY_CUSTOMER_UI ? <Shop /> : <MovedToMyShop />} />
             {/* alias: bottom-nav "ดีลพิเศษ" */}
             <Route path="/deals" element={LEGACY_CUSTOMER_UI ? <Shop /> : <MovedToMyShop />} />
             {/* alias: bottom-nav "หมวดหมู่" — หน้าร้านเดิม เลื่อนไปยังบล็อกหมวดหมู่ */}
             <Route path="/categories" element={LEGACY_CUSTOMER_UI ? <Shop /> : <MovedToMyShop />} />
             <Route path="/shop/pos" element={<RequireLineLink><ShopPos /></RequireLineLink>} />
              <Route path="/l/shop" element={LEGACY_CUSTOMER_UI ? <LiffShop /> : <MovedToMyShop />} />
              <Route path="/l/link" element={LEGACY_CUSTOMER_UI ? <LiffLink /> : <MovedToMyShop />} />
              <Route path="/shop/account" element={<RequireLineLink><ShopAccountLink /></RequireLineLink>} />
              <Route path="/cart" element={LEGACY_CUSTOMER_UI ? <Cart /> : <MovedToMyShop />} />
              <Route path="/purchase-order" element={LEGACY_CUSTOMER_UI ? <RequireAuth><PurchaseOrder /></RequireAuth> : <MovedToMyShop />} />
              <Route path="/my-orders" element={<RequireLineLink><MyOrders /></RequireLineLink>} />
              {/* ลิงก์เก่าในข้อความ LINE: /account/orders?order=... → หน้า "ฉัน" พร้อม query เดิม */}
              <Route path="/account/orders" element={<RequireLineLink><MyOrders /></RequireLineLink>} />
              <Route path="/my-account" element={<RequireLineLink><MyAccount /></RequireLineLink>} />
             <Route path="/notifications" element={<RequireLineLink><CustomerNotifications /></RequireLineLink>} />
              <Route path="/my-orders/:id" element={LEGACY_CUSTOMER_UI ? <RequireOrderAccess><MyOrderDetail /></RequireOrderAccess> : <MovedToMyShop />} />
              <Route path="/my-orders/:id/receipt" element={LEGACY_CUSTOMER_UI ? <RequireOrderAccess><ErrorBoundary><OrderReceipt /></ErrorBoundary></RequireOrderAccess> : <MovedToMyShop />} />
              <Route path="/quote-status" element={<Navigate to="/my-orders" replace />} />
              <Route path="/quote-status/:id" element={LEGACY_CUSTOMER_UI ? <RequireOrderAccess><MyOrderDetail /></RequireOrderAccess> : <MovedToMyShop />} />

              {/* PWA start_url — routes each installed app by the user's role. */}
              <Route path="/launch" element={<Launch />} />
              {/* Support/debug: shows redirect targets + build/SW state. */}
              <Route path="/diagnostics" element={<Diagnostics />} />
              <Route path="/diagnostics/routes" element={<DiagnosticsRoutes />} />
              {/* แผนผังเว็บ: รวมทุกหน้าในแอปไว้ที่เดียว */}
              <Route path="/sitemap" element={<Sitemap />} />
              {/* แดชบอร์ดหลัก NATTA GROUP คงเดิมที่ /admin/home; หน้า “วันนี้” อยู่ที่ /admin/today */}
              <Route path="/admin" element={<Navigate to="/admin/home" replace />} />
              <Route path="/admin/home" element={<RequireStaff><AdminDashboardHome /></RequireStaff>} />
              <Route path="/admin/modules" element={<Navigate to="/admin/home" replace />} />
              {/* Legacy dashboard links always land on the main dashboard. */}
              <Route path="/admin/dashboard" element={<Navigate to="/admin/home" replace />} />
              {/* “จัดการหน้าเว็บไซต์/รูปโชว์” เป็นตั้งค่าทั่วไป — อยู่ในโซนแอดมิน ไม่ใช่ FILM SHOP */}
              <Route path="/admin/site-editor" element={<RequireStaff><AdminSiteEditor /></RequireStaff>} />
              <Route path="/admin/staff-line" element={<RequireOwner><StaffLineApprovals /></RequireOwner>} />
              <Route path="/admin/fs-share-links" element={<RequireOwner><FsShareLinks /></RequireOwner>} />
              <Route path="/admin/onboarding" element={<Navigate to="/admin/home" replace />} />
              {/* “สต๊อกสินค้า” — ทางเข้าเดียว แล้วเปิดแท็บแรก (สินค้า) */}
              <Route path="/admin/inventory" element={<Navigate to="/admin/products" replace />} />
              <Route path="/admin/products" element={<RequireStockEdit><AdminProducts /></RequireStockEdit>} />
              <Route path="/admin/product-stock" element={<RequireStockEdit><AdminProductStockUpdate /></RequireStockEdit>} />
              <Route path="/admin/imports" element={<RequireStockEdit><AdminImportHistory /></RequireStockEdit>} />
              <Route path="/admin/customers" element={<RequireStaff><AdminCustomers /></RequireStaff>} />
              <Route path="/admin/customer-360" element={<RequireStaff><AdminCustomer360 /></RequireStaff>} />
              {/* หน้า “ลูกค้า & LINE OA” ยุบเข้า /admin/work-docs แล้ว (เปิดเป็น dialog ด้วย ?match=1) */}
              <Route path="/admin/customer-hub" element={<Navigate to="/admin/work-docs?match=1" replace />} />
              <Route path="/admin/customer-hub/n/:id" element={<RequireStaff><AdminHubNotificationDetail /></RequireStaff>} />
              <Route path="/admin/prices" element={<RequireStockEdit><AdminPrices /></RequireStockEdit>} />
              <Route path="/admin/price-groups" element={<RequireStaff><AdminPriceGroups /></RequireStaff>} />
              {/* Legacy order links open the current order workspace at the original URL. */}
              <Route path="/admin/orders" element={<Navigate to="/admin/customer-purchase-orders" replace />} />
              {/* ลิงก์จากบอทไลน์: ต้องพาไปงานใบนั้นจริง พร้อมคง ?export ไว้ */}
              <Route path="/admin/orders/:id" element={<RequireStaff><AdminOrderDeepLink /></RequireStaff>} />

              {/* Public token-scoped customer view removed — public order share link is disabled. */}
              <Route path="/o/:token" element={<Navigate to="/" replace />} />
              <Route path="/admin/purchases" element={<RequireStockEdit><AdminPurchases /></RequireStockEdit>} />
              {/* flow เดียว: งานและเอกสาร — ลิงก์เดิมทั้งหมดยังใช้ได้ (เปิดพร้อมตัวกรอง) */}
              <Route path="/admin/today" element={<RequireStaff><AdminToday /></RequireStaff>} />
              <Route path="/admin/work-docs" element={<RequireStaff><AdminWorkDocs /></RequireStaff>} />
              <Route path="/admin/customer-purchase-orders" element={<RequireStaff><CustomerPurchaseOrdersRoute /></RequireStaff>} />
              <Route path="/admin/order-desk" element={<Navigate to="/admin/work-docs?filter=order" replace />} />
              <Route path="/admin/school-requisitions" element={<Navigate to="/admin/work-docs?filter=requisition" replace />} />
              <Route path="/admin/requisition-desk" element={<Navigate to="/admin/work-docs?filter=requisition" replace />} />
              {/* หน้าโต๊ะจัดการเดิม (เก็บไว้สำหรับงานย้อนหลัง) */}
              <Route path="/admin/order-desk/legacy" element={<RequireStaff><AdminOrderDesk /></RequireStaff>} />
              <Route path="/admin/requisition-desk/legacy" element={<Navigate to="/admin/work-docs?filter=requisition" replace />} />

              {/* Public token-scoped order review link sent to the customer via LINE. */}
              <Route path="/po/:token" element={LEGACY_CUSTOMER_UI ? <CustomerPoReview /> : <MovedToMyShop />} />
              <Route path="/admin/suppliers" element={<RequireStockEdit><AdminSuppliers /></RequireStockEdit>} />
              <Route path="/admin/stock" element={<RequireStockEdit><AdminStock /></RequireStockEdit>} />
              <Route path="/admin/reports" element={<RequireStaff><AdminReports /></RequireStaff>} />
              <Route path="/admin/credit-bills" element={<RequireStaff><AdminCreditBills /></RequireStaff>} />
              <Route path="/admin/security" element={<RequireStaff><AdminSecurity /></RequireStaff>} />
              <Route path="/admin/security-audit" element={<RequireStaff><AdminSecurityAuditLog /></RequireStaff>} />
              {/* แจ้งเตือนย้ายไปอยู่บนหน้า “งานและเอกสาร” แล้ว (เปิดแผงด้วย ?notif=1) */}
              <Route path="/admin/notifications" element={LEGACY_OPS_MENUS ? <RequireStaff><AdminNotifications /></RequireStaff> : <Navigate to="/admin/work-docs?notif=1" replace />} />
              {/* ออเดอร์ลูกค้า (เว็บแอป) รวมเข้า “งานและเอกสาร” — คงลิงก์เดิมไว้เป็น redirect */}
              <Route path="/admin/order-alerts" element={<Navigate to="/admin/work-docs?filter=order" replace />} />
              <Route path="/admin/notification-center" element={LEGACY_OPS_MENUS ? <RequireStaff><NotificationCenter /></RequireStaff> : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/notification-settings" element={<RequireStaff><AdminNotificationSettings /></RequireStaff>} />
              <Route path="/admin/alert-stats" element={LEGACY_OPS_MENUS ? <RequireStaff><AlertStats /></RequireStaff> : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/settings" element={<RequireStaff><SettingsHub /></RequireStaff>} />
              <Route path="/admin/env-secrets" element={<RequireOwner><AdminEnvSecrets /></RequireOwner>} />
              {/* ห้องควบคุมงาน — เจ้าของร้าน/แอดมินเท่านั้น */}
              <Route path="/admin/control-room" element={<RequireStaff><AdminControlRoom /></RequireStaff>} />
              <Route path="/admin/tools" element={<RequireStaff><AdminTools /></RequireStaff>} />
              {/* บอส — AI ผู้ช่วยออกเอกสาร */}
              <Route path="/admin/boss" element={<RequireStaff><BossDocAi /></RequireStaff>} />
              <Route path="/admin/boss-docs" element={<RequireStaff><BossDocAi /></RequireStaff>} />
              <Route path="/admin/settings/store" element={<RequireStaff><AdminSettings /></RequireStaff>} />
              <Route path="/admin/pos-store" element={<RequireStaff><PosStoreProfilePage /></RequireStaff>} />
              <Route path="/admin/shop-home" element={<RequireStaff><ShopHomeDesignPage /></RequireStaff>} />
              <Route path="/admin/app-links" element={<RequireStaff><AdminAppLinks /></RequireStaff>} />
              {/* รวมศูนย์ไว้ที่ “จัดการหน้าแอพ” */}
              <Route path="/admin/app-shortcuts" element={<Navigate to="/admin/shop-home" replace />} />
              <Route path="/admin/review" element={<RequireStaff><AdminReview /></RequireStaff>} />
              {/* Guest orders page removed — everything lives in the alerts page now. */}
              <Route path="/admin/guest-orders" element={<Navigate to="/admin/work-docs?filter=order" replace />} />
              <Route path="/admin/line-notifications" element={LINE_OA_UI ? (<RequireStaff><AdminLineNotifications /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/link-requests" element={<RequireStaff><AdminLinkRequests /></RequireStaff>} />
              <Route path="/admin/line-liff-check" element={LINE_OA_UI ? (<RequireStaff><AdminLiffCheck /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/liff-check" element={<RequireStaff><AdminLiffCheck /></RequireStaff>} />
              <Route path="/admin/line-auto-bind-history" element={LINE_OA_UI ? (<RequireStaff><AdminAutoBindHistory /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-webhook-events" element={LINE_OA_UI ? (<RequireStaff><AdminLineWebhookEvents /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-webhook-status" element={LINE_OA_UI ? (<RequireStaff><AdminLineWebhookStatus /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-recipients" element={LINE_OA_UI ? (<RequireStaff><AdminLineRecipients /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/product-views" element={<RequireStaff><AdminProductViews /></RequireStaff>} />
              <Route path="/admin/tutorial-views" element={<RequireStaff><AdminTutorialViews /></RequireStaff>} />
              <Route path="/admin/reply-templates" element={LINE_OA_UI ? (<RequireStaff><AdminReplyTemplates /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              {/* โปรโมชั่น/แคมเปญที่แสดงบนหน้าแรกร้านและหน้าบัญชีลูกค้า */}
              <Route path="/admin/shop-promos" element={<Navigate to="/admin/shop-home" replace />} />
              <Route path="/admin/inbox" element={LINE_OA_UI && LEGACY_OPS_MENUS ? <RequireStaff><AdminInbox /></RequireStaff> : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/alert-rules" element={<RequireStaff><AdminAlertRules /></RequireStaff>} />
              <Route path="/admin/line-connection-test" element={LINE_OA_UI ? (<RequireStaff><AdminLineConnectionTest /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-webhook-test" element={LINE_OA_UI ? (<RequireStaff><AdminLineWebhookTest /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-secret-vault" element={LINE_OA_UI ? (<RequireStaff><AdminLineSecretVault /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-identity-status" element={LINE_OA_UI ? (<RequireStaff><AdminLineIdentityStatus /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-settings" element={LINE_OA_UI ? (<RequireStaff><AdminLineSettings /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              {/* หน้า LINE MyShop ถูกปลดออกจากระบบ — คงเฉพาะข้อมูล/ฟังก์ชันเบื้องหลังไว้ */}
              <Route path="/admin/myshop" element={<Navigate to="/admin/settings" replace />} />
              {/* ระบบกลุ่มบอท — คงไว้เสมอ (ไม่ใช่ LINE OA inbox) */}
              <Route path="/admin/line-groups" element={<RequireStaff><AdminLineGroups /></RequireStaff>} />
              {/* สถานะแจ้งเตือนกลุ่มเดียว (group-only) — คงไว้เสมอ */}
              <Route path="/admin/line-notify-status" element={<RequireStaff><AdminLineGroupNotifyStatus /></RequireStaff>} />
              {/* บทบาท/สิทธิ์ของกลุ่มออเดอร์ขั้นเทพ และ botรันงาน — คงไว้เสมอ */}
              <Route path="/admin/line-group-roles" element={<RequireStaff><AdminLineGroupRoles /></RequireStaff>} />
              <Route path="/admin/line-delivery-log" element={LINE_OA_UI ? (<RequireStaff><AdminLineDeliveryLog /></RequireStaff>) : <Navigate to="/admin/home" replace />} />

              <Route path="/admin/line-verify-webhook-log" element={LINE_OA_UI ? (<RequireStaff><AdminLineVerifyWebhookLog /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-room-admins" element={LINE_OA_UI ? (<RequireStaff><AdminLineRoomAdmins /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-bindings" element={LINE_OA_UI ? (<RequireStaff><AdminLineBindings /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-phone-bindings" element={LINE_OA_UI ? (<RequireStaff><AdminLinePhoneBindings /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-callbacks" element={LINE_OA_UI ? (<RequireStaff><AdminLineCallbacks /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-summary" element={LINE_OA_UI ? (<RequireStaff><AdminLineSummary /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/admin/line-login-logs" element={LINE_OA_UI ? (<RequireStaff><AdminLineLoginLogs /></RequireStaff>) : <Navigate to="/admin/home" replace />} />
              <Route path="/me/line-status" element={<MyLineStatus />} />
              <Route path="/verify-line" element={<VerifyLine />} />
              <Route path="/admin/staff" element={<RequireOwner><AdminStaff /></RequireOwner>} />
              <Route path="/staff/dashboard" element={<RequireStaffAny><StaffDashboard /></RequireStaffAny>} />
              <Route path="/staff/home" element={<RequireStaffAny><StaffHome /></RequireStaffAny>} />
              <Route path="/staff/products/new" element={<RequireStaffAny><StaffProductNew /></RequireStaffAny>} />
              <Route path="/staff/photos" element={<RequireStaffAny><StaffPhotos /></RequireStaffAny>} />
              <Route path="/staff/stock" element={<RequireStaffAny><StaffStock /></RequireStaffAny>} />
              <Route path="/staff/low-stock" element={<RequireStaffAny><StaffLowStock /></RequireStaffAny>} />
              <Route path="/staff/pending" element={<RequireStaffAny><StaffPending /></RequireStaffAny>} />
              <Route path="/staff/history" element={<RequireStaffAny><StaffHistory /></RequireStaffAny>} />
              <Route path="/staff/scan-history" element={<RequireStaffAny><ScanHistory /></RequireStaffAny>} />
              <Route path="/staff/inbox" element={<RequireStaffAny><StaffInbox /></RequireStaffAny>} />
              <Route path="/staff/profile" element={<RequireStaffAny><StaffProfile /></RequireStaffAny>} />
              <Route path="/admin/profile" element={<RequireStaffAny><StaffProfile /></RequireStaffAny>} />
              <Route path="/receipts" element={<RequireStaffAny><StorePicker /></RequireStaffAny>} />
              {/* Touch cash register (dedicated 🏪 PWA) — declared BEFORE the /pos
                  shell so `:storeSlug` can never swallow /pos/register. */}
              <Route path="/pos/register" element={<RequireStaffPerm module="pos"><PosRegister /></RequireStaffPerm>} />
              {/* POS workspace — dedicated blue shell, NOT AdminLayout. */}
              <Route path="/pos" element={<RequireStaffAny><PosShell /></RequireStaffAny>}>
                <Route index element={<CentralPOS />} />
                <Route path="stock" element={<RequireStaffPerm module="stock"><PosStock /></RequireStaffPerm>} />
                <Route path="dashboard" element={<PosDashboard />} />
                <Route path="stock/import" element={<RequireStaffPerm module="stock"><PosStockImport /></RequireStaffPerm>} />
                <Route path="customers" element={<PosCustomers />} />
                <Route path="purchase-orders" element={<RequireStaffPerm module="po"><PosPurchaseOrdersList /></RequireStaffPerm>} />
                <Route path="purchase-orders/new" element={<RequireStaffPerm module="po"><PosPurchaseOrderEditor /></RequireStaffPerm>} />
                <Route path="purchase-orders/:id" element={<RequireStaffPerm module="po"><PosPurchaseOrderView /></RequireStaffPerm>} />
                <Route path="purchase-orders/:id/edit" element={<RequireStaffPerm module="po"><PosPurchaseOrderEditor /></RequireStaffPerm>} />
                <Route path="suppliers" element={<RequireStaffPerm module="po"><PosSuppliers /></RequireStaffPerm>} />
                <Route path="history" element={<RequireStaffPerm module="history"><PosHistory /></RequireStaffPerm>} />
                <Route path="reports" element={<RequireStaffPerm module="history"><PosReports /></RequireStaffPerm>} />
                <Route path="pricing" element={<PosPricing />} />
                <Route path="movements" element={<RequireStaffPerm module="stock"><PosMovements /></RequireStaffPerm>} />
                <Route path="delivery" element={<PosDelivery />} />
                <Route path="settings" element={<PosSettings />} />
                <Route path="tools" element={<PosTools />} />
                <Route path="scan-history" element={<RequireStaffPerm module="history"><PosScanHistory /></RequireStaffPerm>} />
                <Route path="staff" element={<PosStaffHub />} />
                <Route path="role-request" element={<StaffRoleRequest />} />
                <Route path=":storeSlug" element={<CentralPOS />} />
              </Route>
              <Route path="/pos/purchase-orders/:id/print" element={<RequireStaffPerm module="po"><PosPurchaseOrderPrint /></RequireStaffPerm>} />
              <Route path="/pos/receipt/:id" element={<RequireStaffAny><PosReceiptPrint /></RequireStaffAny>} />
              {/* Standalone print route — no receipts shell so only the document paints on paper. */}
              <Route path="/receipts/:storeSlug/documents/:id/print" element={<RequireStaffAny><PrintDocument /></RequireStaffAny>} />
              {/* Full-page pre-print preview (all print controls live here). */}
              <Route path="/receipts/:storeSlug/documents/:id/print-preview" element={<RequireStaffAny><PrintPreview /></RequireStaffAny>} />
              {/* Nattaworks removed — redirect any old links back to the picker. */}
              <Route path="/receipts/nattaworks" element={<Navigate to="/receipts" replace />} />
              <Route path="/receipts/nattaworks/*" element={<Navigate to="/receipts" replace />} />
              <Route path="/nattaworks" element={<Navigate to="/receipts" replace />} />
              <Route path="/nattaworks/*" element={<Navigate to="/receipts" replace />} />
              {/* FILM SHOP: fully separated app copied 1:1 from the FILM Shop project. */}
              {/* Share link: exchanges a token for a real session, then lands on FILM SHOP. */}
              <Route path="/fs/:token" element={<FsShareEntry />} />
              {/* ฟอร์มรับงานจากกลุ่ม LINE — token อายุสั้นในลิงก์คือสิทธิ์เข้าใช้ */}
              <Route path="/film-intake" element={<FilmIntakeForm />} />
              {/* หน้าทดลอง (พรีวิวเท่านั้น) — อ่านข้อมูลจากไฟล์แนบ ไม่กระทบ LINE/คิวจริง */}
              <Route path="/film-intake-preview" element={<FileIntakePreview />} />
              {/* เส้นทางเก่า: redirect อย่างเดียว ไม่เรนเดอร์หน้าโครงเก่าอีกต่อไป */}
              <Route path="/receipts/film" element={<FilmShopEntry />} />
              <Route path="/receipts/film/*" element={<FilmShopEntry />} />
              {/* หน้าแรกร้าน FILM SHOP (เส้นทางใหม่) + หน้างานย่อยเดิมของร้าน */}
              <Route path="/film-shop" element={<RequireStaffAny><FilmShopHome /></RequireStaffAny>} />
              <Route path="/film-shop/app" element={<RequireStaffAny><FilmShopApp /></RequireStaffAny>} />
              <Route path="/film-shop/app/*" element={<RequireStaffAny><FilmShopApp /></RequireStaffAny>} />
              <Route path="/receipts/:storeSlug" element={<RequireStaffAny><ReceiptsLayout /></RequireStaffAny>}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<ReceiptsDashboard />} />
                {/* Per-store POS moved to central /pos — keep URL alive as a redirect. */}
                <Route path="pos" element={<PerStorePosRedirect />} />
                <Route path="documents" element={<DocumentsList />} />
                <Route path="documents/new" element={<DocumentForm />} />
                <Route path="documents/:id/edit" element={<DocumentForm />} />
                <Route path="documents/:id/revisions" element={<RevisionHistory />} />
                <Route path="documents/:id/sync" element={<SyncHistory />} />
                <Route path="sync-history" element={<SyncArchive />} />
                <Route path="documents/sheet-template" element={<SheetTemplate />} />
                <Route path="products" element={<ReceiptsProducts />} />
                <Route path="customers" element={<ReceiptsCustomers />} />
                <Route path="categories" element={<ReceiptsCategories />} />
                <Route path="reports" element={<ReceiptsReports />} />
                <Route path="activity" element={<ReceiptsActivity />} />
                <Route path="settings" element={<ReceiptsSettings />} />
                <Route path="settings/logo-check" element={<LogoPdfCheck />} />
              </Route>
              <Route path="/guide" element={<Guide />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </HostRedirect>
          </CartProvider>
          </LineCustomerProvider>
          </GuestProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
