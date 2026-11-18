/**
 * Declarative inventory of every menu entry the app renders, plus the routes
 * they must resolve to. `/diagnostics/routes` renders this and a unit test
 * keeps it honest against `src/App.tsx` and the layout files, so a menu can
 * never silently point back at a removed/legacy page again.
 */
export type NavSurface = "customer" | "admin" | "shared";
export type NavDevice = "desktop" | "mobile" | "both";

export interface NavEntry {
  label: string;
  /** URL the menu item links to */
  to: string;
  /** Where the router ends up after redirects (same as `to` when direct) */
  resolved: string;
  surface: NavSurface;
  device: NavDevice;
  /** Roles allowed to reach the resolved page */
  roles: string[];
  /** Page component rendered by the resolved route */
  component: string;
}

/** Routes that exist only as redirects to the current workspace. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/admin": "/admin/home",
  "/admin/dashboard": "/admin/home",
  "/admin/onboarding": "/admin/home",
  "/admin/modules": "/admin/home",
  "/admin/orders": "/admin/customer-purchase-orders",
  "/admin/customer-purchase-orders": "/admin/work-docs",
  "/admin/school-requisitions": "/admin/work-docs",
  "/admin/order-alerts": "/admin/work-docs",
  "/admin/order-desk": "/admin/work-docs",
  "/admin/requisition-desk": "/admin/work-docs",
  "/admin/guest-orders": "/admin/work-docs",
  "/admin/inbox": "/admin/home",
  "/admin/line-settings": "/admin/home",
  "/admin/notification-center": "/admin/home",
  "/admin/alert-stats": "/admin/home",
  "/admin/app-shortcuts": "/admin/shop-home",
  "/admin/shop-promos": "/admin/shop-home",
  "/quote-status": "/my-orders",
  "/admin/inventory": "/admin/products",
};

/** Pages that were retired — a menu must never link to these again. */
export const RETIRED_TARGETS = [
  "/about", "/o/:token", "/admin/orders", "/admin/guest-orders",
  "/admin/inbox", "/admin/notification-center", "/admin/alert-stats",
  "/admin/line-settings",
];

export const NAV_ENTRIES: NavEntry[] = [
  // ---- customer -----------------------------------------------------------
  { label: "หน้าแรก", to: "/shop", resolved: "/shop", surface: "customer", device: "both", roles: ["customer"], component: "Shop" },
  { label: "หมวดหมู่", to: "/categories", resolved: "/categories", surface: "customer", device: "both", roles: ["customer"], component: "Shop" },
  { label: "คำสั่งซื้อ", to: "/my-orders", resolved: "/my-orders", surface: "customer", device: "both", roles: ["customer"], component: "MyOrders" },
  { label: "แจ้งเตือน", to: "/notifications", resolved: "/notifications", surface: "customer", device: "both", roles: ["customer"], component: "CustomerNotifications" },
  { label: "ฉัน", to: "/my-account", resolved: "/my-account", surface: "customer", device: "both", roles: ["customer"], component: "MyAccount" },
  { label: "ตะกร้า", to: "/cart", resolved: "/cart", surface: "customer", device: "both", roles: ["customer"], component: "Cart" },

  // ---- admin (NATTA GROUP dashboard — 8 เมนู, 1 งาน = 1 ทางเข้า) ------------
  { label: "แดชบอร์ด", to: "/admin/home", resolved: "/admin/home", surface: "admin", device: "both", roles: ["owner", "admin", "staff"], component: "AdminDashboardHome" },
  { label: "วันนี้", to: "/admin/today", resolved: "/admin/today", surface: "admin", device: "both", roles: ["owner", "admin", "staff"], component: "AdminToday" },
  { label: "POS หน้าร้าน", to: "/pos", resolved: "/pos", surface: "admin", device: "both", roles: ["owner", "admin", "staff"], component: "CentralPOS" },
  { label: "ลูกค้า", to: "/admin/customers", resolved: "/admin/customers", surface: "admin", device: "both", roles: ["owner", "admin", "staff"], component: "AdminCustomers" },
  { label: "เอกสาร 2 ร้าน", to: "/receipts", resolved: "/receipts", surface: "admin", device: "both", roles: ["owner", "admin", "staff"], component: "StorePicker" },
  { label: "ระบบกลุ่มบอท", to: "/admin/line-groups", resolved: "/admin/line-groups", surface: "admin", device: "both", roles: ["owner", "admin", "staff"], component: "AdminLineGroups" },
  { label: "งานและเอกสาร", to: "/admin/work-docs", resolved: "/admin/work-docs", surface: "admin", device: "both", roles: ["owner", "admin", "staff"], component: "AdminWorkDocs" },
  { label: "ตั้งค่า", to: "/admin/settings", resolved: "/admin/settings", surface: "admin", device: "both", roles: ["owner", "admin", "staff"], component: "SettingsHub" },
  // แท็บภายในหน้า “สต๊อกสินค้า” (หน้าเดียวหลายแท็บ)
  { label: "สินค้า", to: "/admin/products", resolved: "/admin/products", surface: "admin", device: "both", roles: ["owner", "admin", "stock_staff"], component: "AdminProducts" },
  { label: "สต๊อก", to: "/admin/product-stock", resolved: "/admin/product-stock", surface: "admin", device: "both", roles: ["owner", "admin", "stock_staff"], component: "AdminProductStockUpdate" },
  { label: "ราคา", to: "/admin/prices", resolved: "/admin/prices", surface: "admin", device: "both", roles: ["owner", "admin", "stock_staff"], component: "AdminPrices" },
  { label: "จัดซื้อ", to: "/admin/purchases", resolved: "/admin/purchases", surface: "admin", device: "desktop", roles: ["owner", "admin", "stock_staff"], component: "AdminPurchases" },
  { label: "ผู้จำหน่าย", to: "/admin/suppliers", resolved: "/admin/suppliers", surface: "admin", device: "desktop", roles: ["owner", "admin", "stock_staff"], component: "AdminSuppliers" },
  { label: "ประวัติ", to: "/admin/stock", resolved: "/admin/stock", surface: "admin", device: "both", roles: ["owner", "admin", "stock_staff"], component: "AdminStock" },

  // ---- shared -------------------------------------------------------------
  { label: "เปิดแอปตามสิทธิ์", to: "/launch", resolved: "/launch", surface: "shared", device: "both", roles: ["ทุกคน"], component: "Launch" },
  { label: "วินิจฉัยระบบ", to: "/diagnostics", resolved: "/diagnostics", surface: "shared", device: "both", roles: ["ทุกคน"], component: "Diagnostics" },
  { label: "ตรวจเมนู/เส้นทาง", to: "/diagnostics/routes", resolved: "/diagnostics/routes", surface: "shared", device: "both", roles: ["ทุกคน"], component: "DiagnosticsRoutes" },
];

export interface NavCheck extends NavEntry {
  exists: boolean;
  legacy: boolean;
  duplicate: boolean;
  redirectLoop: boolean;
  pass: boolean;
  note: string;
}

/** เมนูบางรายการเป็น deep link (มี query) — เทียบเฉพาะส่วน path */
export const stripQuery = (path: string) => path.split(/[?#]/)[0];

/** Follows the declared redirect chain, guarding against loops. */
export function followRedirects(path: string, map = LEGACY_REDIRECTS): { target: string; loop: boolean } {
  const seen = new Set<string>();
  let cur = stripQuery(path);
  while (map[cur]) {
    if (seen.has(cur)) return { target: cur, loop: true };
    seen.add(cur);
    cur = map[cur];
  }
  return { target: cur, loop: false };
}

export function checkNavEntries(entries: NavEntry[] = NAV_ENTRIES, knownRoutes: string[] = ROUTE_PATHS): NavCheck[] {
  const seen = new Map<string, number>();
  entries.forEach((e) => seen.set(`${e.surface}|${e.to}|${e.device}`, (seen.get(`${e.surface}|${e.to}|${e.device}`) ?? 0) + 1));
  const known = new Set(knownRoutes);
  return entries.map((e) => {
    const { target, loop } = followRedirects(e.to);
    const exists = known.has(target);
    const legacy = RETIRED_TARGETS.includes(target) || target !== e.resolved;
    const duplicate = (seen.get(`${e.surface}|${e.to}|${e.device}`) ?? 0) > 1;
    const pass = exists && !legacy && !duplicate && !loop;
    const note = !exists
      ? "ไม่พบหน้าใน router"
      : loop
        ? "redirect วนซ้ำ"
        : legacy
          ? `ชี้ไปหน้าเก่า (${target})`
          : duplicate
            ? "เมนูซ้ำ"
            : "ผ่าน";
    return { ...e, exists, legacy, duplicate, redirectLoop: loop, pass, note };
  });
}

/**
 * Every path declared in `src/App.tsx`. Kept in sync by
 * `src/__tests__/route-registry.test.ts`, which parses the router source.
 */
export const ROUTE_PATHS: string[] = [
  "/shop",
  "/categories",
  "/my-orders",
  "/notifications",
  "/my-account",
  "/cart",
  "/launch",
  "/diagnostics",
  "/diagnostics/routes",
  "/receipts",
  "/admin/home",
  "/admin/today",
  "/admin/work-docs",
  "/admin/order-desk",

  "/admin/requisition-desk",
  "/admin/customer-purchase-orders",
  "/admin/school-requisitions",
  "/admin/inbox",
  "/admin/line-settings",
  "/admin/app-links",
  "/admin/products",
  "/admin/prices",
  "/admin/purchases",
  "/admin/suppliers",
  "/admin/stock",
  "/admin/order-alerts",
  "/admin/shop-home",
  "/admin/inventory",
  "/admin/product-stock",
  "/admin/customers",
  "/admin/line-groups",
  "/admin/settings",
  "/film-shop",
  "/film-shop/app",
  "/pos",
];