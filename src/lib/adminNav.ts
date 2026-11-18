/**
 * NATTA GROUP — เมนูหลักของระบบหลังร้าน (หลักการ “1 งาน = 1 ทางเข้า”)
 * ใช้ร่วมกันระหว่าง Dashboard shell และ workspace shell
 * เพื่อไม่ให้มีเมนูซ้ำหลายชุดอีกต่อไป
 */
import {
  LayoutDashboard, ShoppingCart, Users, Boxes, Receipt, Settings,
  BarChart3, Wrench, CalendarCheck, FolderOpen, Bell, FileText,
} from "lucide-react";


export const APP_NAME = "NATTA GROUP";
export const APP_SUBTITLE = "ระบบบริหารธุรกิจครบวงจร";

export type AdminNavItem = { to: string; label: string; icon: typeof Users };

/** เมนูหลักหลังร้าน — ชุดเดิมตามที่ใช้งานอยู่ */
export const DASHBOARD_NAV: AdminNavItem[] = [
  { to: "/admin/home", label: "หน้าหลัก", icon: LayoutDashboard },
  { to: "/receipts", label: "ออกเอกสาร", icon: Receipt },
  { to: "/pos/register", label: "POS จอสัมผัส", icon: ShoppingCart },
  { to: "/admin/work-docs", label: "งานและเอกสาร", icon: FileText },
  { to: "/admin/products", label: "สินค้า & สต๊อก", icon: Boxes },
  { to: "/admin/customers", label: "ลูกค้า", icon: Users },
  { to: "/admin/reports", label: "รายงาน", icon: BarChart3 },
  { to: "/admin/tools", label: "เครื่องมือ", icon: Wrench },
  { to: "/admin/settings", label: "ตั้งค่า", icon: Settings },
];

/** ทางเข้าโมดูลอื่นทั้งหมด */
export const WORKSPACE_NAV: AdminNavItem[] = [
  { to: "/receipts", label: "ออกเอกสาร", icon: Receipt },
  { to: "/pos/register", label: "POS จอสัมผัส", icon: ShoppingCart },
  { to: "/admin/products", label: "สินค้า & สต๊อก", icon: Boxes },
  { to: "/admin/customers", label: "ลูกค้า", icon: Users },
  { to: "/admin/tools", label: "เครื่องมือ", icon: Wrench },
];


/** โมดูลเด่น 6 ใบบนหน้าแดชบอร์ด — ใช้ปลายทางเดียวกับเมนูหลัก (ไม่มีทางเข้าซ้ำ) */
export const MODULE_CARDS: (AdminNavItem & { desc: string })[] = [
  { to: "/receipts", label: "ออกเอกสาร", icon: Receipt, desc: "ใบเสนอราคา ใบส่งของ ใบเสร็จ ของทั้ง 2 ร้าน" },
  { to: "/pos/register", label: "POS จอสัมผัส", icon: ShoppingCart, desc: "ขายหน้าร้านแบบสัมผัส ตัดสต๊อกอัตโนมัติ" },
  { to: "/admin/products", label: "สินค้า & สต๊อก", icon: Boxes, desc: "อัปเดตสินค้า ราคา จัดซื้อ และสต๊อกคงเหลือ" },
  { to: "/admin/customers", label: "ลูกค้า", icon: Users, desc: "ข้อมูลลูกค้า กลุ่มราคา และประวัติการซื้อ" },

  { to: "/admin/reports", label: "รายงาน", icon: BarChart3, desc: "ยอดขาย สรุปงาน และรายงานย้อนหลัง" },
];

/** เมนูสำหรับพนักงานสต๊อก (ไม่มีสิทธิ์เข้าแดชบอร์ดรวม) */
export const STOCK_STAFF_HOME = "/admin/products";

/**
 * “สต๊อกสินค้า” = หน้าเดียวหลายแท็บ — แต่ละแท็บคือ route เดิมที่ใช้งานอยู่จริง
 * (ไม่เขียน stock engine ใหม่ ไม่ฝังหน้าเดิมซ้อนกัน)
 */
export const STOCK_TABS: { to: string; label: string }[] = [
  { to: "/admin/products", label: "สินค้า" },
  { to: "/admin/product-stock", label: "สต๊อก" },
  { to: "/admin/prices", label: "ราคา" },
  { to: "/admin/purchases", label: "จัดซื้อ" },
  { to: "/admin/suppliers", label: "ผู้จำหน่าย" },
  { to: "/admin/stock", label: "ประวัติ" },
];

export const isStockRoute = (pathname: string) =>
  STOCK_TABS.some((t) => pathname === t.to || pathname.startsWith(`${t.to}/`));

/** ชื่อหน้าที่แสดงบน header ของ workspace (prefix match — ยาวสุดชนะ) */
const TITLES: [string, string][] = [
  ["/admin/products", "สต๊อกสินค้า"],
  ["/admin/product-stock", "สต๊อกสินค้า"],
  ["/admin/prices", "สต๊อกสินค้า"],
  ["/admin/price-groups", "กลุ่มราคา"],
  ["/admin/purchases", "สต๊อกสินค้า"],
  ["/admin/suppliers", "สต๊อกสินค้า"],
  ["/admin/stock", "สต๊อกสินค้า"],
  ["/admin/customers", "ลูกค้า"],
  ["/admin/customer-hub", "ลูกค้า & LINE"],
  ["/admin/home", "แดชบอร์ด"],
  ["/admin/today", "วันนี้"],
  ["/admin/work-docs", "งานและเอกสาร"],

  ["/admin/customer-360", "Customer 360"],
  ["/admin/customer-purchase-orders", "งานและเอกสาร"],
  ["/admin/line-groups", "ระบบกลุ่มบอท"],
  ["/admin/line-notify-status", "สถานะแจ้งเตือนกลุ่ม LINE"],
  ["/admin/settings", "ตั้งค่า"],
  ["/admin/tools", "เครื่องมือระบบ"],
  ["/admin/staff", "พนักงานและสิทธิ์"],
  ["/admin/reports", "รายงาน"],
  ["/admin/security", "ความปลอดภัย"],
  ["/admin/app-links", "ลิงก์เว็บแอป"],
  ["/admin/profile", "โปรไฟล์ของฉัน"],
];

export function workspaceTitle(pathname: string): string {
  let best = "";
  let label = "หลังร้าน NATTA GROUP";
  for (const [p, t] of TITLES) {
    if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > best.length) {
      best = p;
      label = t;
    }
  }
  return label;
}
