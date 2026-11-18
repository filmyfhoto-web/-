/**
 * `/sitemap` — แผนผังเว็บ: รวมทุกหน้าในแอปไว้ที่เดียว ค้นหาและกดเข้าได้ทันที
 * เป็นหน้าสำหรับดู/นำทางเท่านั้น ไม่แตะ business logic ใด ๆ
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type Entry = { to: string; label: string; note?: string };
type Group = { id: string; title: string; desc: string; items: Entry[] };

const GROUPS: Group[] = [
  {
    id: "customer",
    title: "ลูกค้า",
    desc: "หน้าที่ลูกค้าทั่วไปใช้งาน",
    items: [
      { to: "/", label: "หน้าแรก" },
      { to: "/welcome", label: "หน้าต้อนรับ" },
      { to: "/shop", label: "สินค้า" },
      { to: "/promotions", label: "โปรโมชัน" },
      { to: "/deals", label: "ดีลพิเศษ" },
      { to: "/categories", label: "หมวดหมู่สินค้า" },
      { to: "/cart", label: "ตะกร้า / สั่งซื้อ - ขอใบเสนอราคา" },
      { to: "/my-orders", label: "คำสั่งซื้อของฉัน" },
      { to: "/notifications", label: "การแจ้งเตือน" },
      { to: "/my-account", label: "บัญชีของฉัน" },
      { to: "/guide", label: "คู่มือการใช้งาน" },
      { to: "/launch", label: "หน้าเปิดตัว" },
    ],
  },
  {
    id: "account",
    title: "บัญชีลูกค้า",
    desc: "เมนูย่อยในบัญชีของลูกค้า",
    items: [
      { to: "/account", label: "ตั้งค่าบัญชี" },
      { to: "/account/line", label: "เชื่อมต่อ LINE" },
      { to: "/account/orders/pending", label: "งานที่รอดำเนินการ" },
      { to: "/account/orders/history", label: "ประวัติคำสั่งซื้อ" },
      { to: "/account/orders/status", label: "สถานะคำสั่งซื้อ" },
      { to: "/account/documents", label: "เอกสารของฉัน" },
      { to: "/account/coupons", label: "คูปอง" },
      { to: "/account/addresses", label: "ที่อยู่จัดส่ง" },
      { to: "/account/upload", label: "อัปโหลดไฟล์งาน" },
      { to: "/account/shop", label: "สั่งซื้อจากบัญชี" },
      { to: "/account/contact", label: "ติดต่อร้าน" },
      { to: "/account/excel", label: "นำเข้ารายการจาก Excel" },
      { to: "/account/history", label: "ประวัติทั้งหมด" },
    ],
  },
  {
    id: "auth",
    title: "เข้าสู่ระบบและข้อกำหนด",
    desc: "การยืนยันตัวตนและหน้านโยบาย",
    items: [
      { to: "/customer/login", label: "ลูกค้าเข้าสู่ระบบ" },
      { to: "/login", label: "เข้าสู่ระบบ" },
      { to: "/signup", label: "สมัครสมาชิก" },
      { to: "/forgot-password", label: "ลืมรหัสผ่าน" },
      { to: "/reset-password", label: "ตั้งรหัสผ่านใหม่" },
      { to: "/staff/login", label: "พนักงานเข้าสู่ระบบ" },
      { to: "/admin/login", label: "แอดมินเข้าสู่ระบบ" },
      { to: "/join-store", label: "เข้าร่วมร้าน" },
      { to: "/privacy", label: "นโยบายความเป็นส่วนตัว" },
      { to: "/terms", label: "ข้อกำหนดการใช้งาน" },
    ],
  },
  {
    id: "line",
    title: "LINE",
    desc: "การเชื่อมต่อและตรวจสอบสถานะ LINE",
    items: [
      { to: "/l/link", label: "เชื่อมบัญชีผ่าน LIFF" },
      { to: "/verify-line", label: "ยืนยันบัญชี LINE" },
      { to: "/me/line-status", label: "สถานะ LINE ของฉัน" },
      { to: "/account/line-debug", label: "ตรวจสอบข้อมูล LINE" },
    ],
  },
  {
    id: "admin-core",
    title: "แอดมิน — งานหลัก",
    desc: "ศูนย์กลางการจัดการงานประจำวัน",
    items: [
      { to: "/admin/home", label: "แดชบอร์ด NATTA GROUP" },
      { to: "/admin/today", label: "งานวันนี้" },
      { to: "/admin/work-docs", label: "งานและเอกสาร (รวมทุกงาน)" },
      { to: "/admin/customer-purchase-orders", label: "ใบสั่งซื้อจากลูกค้า" },
      { to: "/admin/customers", label: "ลูกค้า" },
      { to: "/admin/customer-360", label: "Customer 360" },
      { to: "/admin/link-requests", label: "คำขอเชื่อมบัญชี" },
      { to: "/receipts", label: "ออกเอกสาร" },
      { to: "/pos/register", label: "POS จอสัมผัส" },
    ],
  },
  {
    id: "admin-stock",
    title: "แอดมิน — สินค้าและสต๊อก",
    desc: "สินค้า ราคา จัดซื้อ และสต๊อกคงเหลือ",
    items: [
      { to: "/admin/products", label: "สินค้า" },
      { to: "/admin/product-stock", label: "สต๊อกคงเหลือ" },
      { to: "/admin/prices", label: "ราคา" },
      { to: "/admin/price-groups", label: "กลุ่มราคา" },
      { to: "/admin/purchases", label: "จัดซื้อ" },
      { to: "/admin/suppliers", label: "ผู้จำหน่าย" },
      { to: "/admin/stock", label: "ประวัติสต๊อก" },
      { to: "/admin/imports", label: "นำเข้าข้อมูลสินค้า" },
    ],
  },
  {
    id: "admin-report",
    title: "แอดมิน — รายงานและการเงิน",
    desc: "ยอดขาย สรุปงาน และเอกสารผู้บริหาร",
    items: [
      { to: "/admin/reports", label: "รายงาน" },
      { to: "/admin/credit-bills", label: "บิลเครดิต" },
      { to: "/admin/boss", label: "หน้าผู้บริหาร" },
      { to: "/admin/boss-docs", label: "เอกสารผู้บริหาร" },
      { to: "/admin/review", label: "รีวิวจากลูกค้า" },
      { to: "/admin/product-views", label: "สถิติการดูสินค้า" },
      { to: "/admin/tutorial-views", label: "สถิติการดูคู่มือ" },
    ],
  },
  {
    id: "admin-line",
    title: "แอดมิน — ระบบ LINE",
    desc: "กลุ่มแจ้งเตือนและสิทธิ์ผ่าน LINE",
    items: [
      { to: "/admin/line-groups", label: "ระบบกลุ่มบอท" },
      { to: "/admin/line-notify-status", label: "สถานะแจ้งเตือนกลุ่ม" },
      { to: "/admin/line-group-roles", label: "สิทธิ์ในกลุ่ม LINE" },
      { to: "/admin/staff-line", label: "พนักงานผูก LINE" },
      { to: "/admin/liff-check", label: "ตรวจสอบ LIFF" },
    ],
  },
  {
    id: "admin-settings",
    title: "แอดมิน — ตั้งค่าและเครื่องมือ",
    desc: "ตั้งค่าระบบ ความปลอดภัย และเครื่องมือภายใน",
    items: [
      { to: "/admin/settings", label: "ตั้งค่า" },
      { to: "/admin/settings/store", label: "ตั้งค่าร้าน" },
      { to: "/admin/notification-settings", label: "ตั้งค่าการแจ้งเตือน" },
      { to: "/admin/alert-rules", label: "กติกาแจ้งเตือน" },
      { to: "/admin/tools", label: "เครื่องมือระบบ" },
      { to: "/admin/control-room", label: "ห้องควบคุม" },
      { to: "/admin/site-editor", label: "แก้ไขหน้าเว็บ" },
      { to: "/admin/shop-home", label: "จัดหน้าร้านออนไลน์" },
      { to: "/admin/pos-store", label: "ตั้งค่าร้าน POS" },
      { to: "/admin/app-links", label: "ลิงก์เว็บแอป" },
      { to: "/admin/staff", label: "พนักงานและสิทธิ์" },
      { to: "/admin/profile", label: "โปรไฟล์ของฉัน" },
      { to: "/admin/security", label: "ความปลอดภัย" },
      { to: "/admin/security-audit", label: "บันทึกตรวจสอบความปลอดภัย" },
      { to: "/admin/env-secrets", label: "คีย์และค่าลับ (เจ้าของร้าน)" },
      { to: "/admin/fs-share-links", label: "ลิงก์แชร์ Film Shop" },
    ],
  },
  {
    id: "staff",
    title: "พนักงาน",
    desc: "หน้างานสำหรับพนักงานสต๊อกและถ่ายภาพ",
    items: [
      { to: "/staff", label: "หน้าแรกพนักงาน" },
      { to: "/portal", label: "พอร์ทัลพนักงาน" },
      { to: "/staff/dashboard", label: "แดชบอร์ดพนักงาน" },
      { to: "/staff/products/new", label: "เพิ่มสินค้าใหม่" },
      { to: "/staff/photos", label: "งานถ่ายภาพ" },
      { to: "/staff/stock", label: "งานสต๊อก" },
      { to: "/staff/low-stock", label: "สินค้าใกล้หมด" },
      { to: "/staff/pending", label: "งานค้าง" },
      { to: "/staff/history", label: "ประวัติงาน" },
      { to: "/staff/scan-history", label: "ประวัติการสแกน" },
      { to: "/staff/inbox", label: "กล่องข้อความ" },
      { to: "/staff/profile", label: "โปรไฟล์พนักงาน" },
    ],
  },
  {
    id: "pos",
    title: "POS หน้าร้าน",
    desc: "ขายหน้าร้านและงานหลังบ้านของ POS",
    items: [
      { to: "/pos/register", label: "หน้าขาย" },
      { to: "/pos/dashboard", label: "แดชบอร์ด POS" },
      { to: "/pos/stock", label: "สต๊อก POS" },
      { to: "/pos/customers", label: "ลูกค้า POS" },
      { to: "/pos/purchase-orders", label: "ใบสั่งซื้อ" },
      { to: "/pos/suppliers", label: "ผู้จำหน่าย" },
      { to: "/pos/history", label: "ประวัติการขาย" },
      { to: "/pos/reports", label: "รายงาน POS" },
      { to: "/pos/pricing", label: "ราคาขาย" },
      { to: "/pos/movements", label: "ความเคลื่อนไหวสต๊อก" },
      { to: "/pos/delivery", label: "งานจัดส่ง" },
      { to: "/pos/settings", label: "ตั้งค่า POS" },
      { to: "/pos/tools", label: "เครื่องมือ POS" },
      { to: "/pos/scan-history", label: "ประวัติสแกน" },
      { to: "/pos/staff", label: "พนักงาน POS" },
    ],
  },
  {
    id: "receipts",
    title: "ออกเอกสาร (ต่อร้าน)",
    desc: "ใช้ /receipts เพื่อเลือกร้านก่อน แล้วเข้าหน้าย่อยเหล่านี้",
    items: [
      { to: "/receipts", label: "เลือกร้านออกเอกสาร" },
      { to: "/receipts", label: "แดชบอร์ดร้าน", note: "/receipts/:ร้าน/dashboard" },
      { to: "/receipts", label: "รายการเอกสาร", note: "/receipts/:ร้าน/documents" },
      { to: "/receipts", label: "สร้างเอกสารใหม่", note: "/receipts/:ร้าน/documents/new" },
      { to: "/receipts", label: "สินค้า", note: "/receipts/:ร้าน/products" },
      { to: "/receipts", label: "ลูกค้า", note: "/receipts/:ร้าน/customers" },
      { to: "/receipts", label: "หมวดหมู่", note: "/receipts/:ร้าน/categories" },
      { to: "/receipts", label: "รายงาน", note: "/receipts/:ร้าน/reports" },
      { to: "/receipts", label: "บันทึกกิจกรรม", note: "/receipts/:ร้าน/activity" },
      { to: "/receipts", label: "ตั้งค่าเอกสาร", note: "/receipts/:ร้าน/settings" },
    ],
  },
  {
    id: "film",
    title: "Film Shop",
    desc: "ระบบร้านฟิล์มแยกทางเข้า",
    items: [
      { to: "/film-shop", label: "หน้าแรก Film Shop" },
      { to: "/film-shop/app", label: "แอป Film Shop" },
      { to: "/film-intake", label: "แบบฟอร์มรับงานฟิล์ม" },
      { to: "/film-intake-preview", label: "ตัวอย่างไฟล์รับงาน" },
    ],
  },
  {
    id: "system",
    title: "ระบบและวินิจฉัย",
    desc: "หน้าช่วยตรวจสอบและติดตั้งแอป",
    items: [
      { to: "/sitemap", label: "แผนผังเว็บ (หน้านี้)" },
      { to: "/diagnostics", label: "วินิจฉัยระบบ" },
      { to: "/diagnostics/routes", label: "ตรวจเมนูและเส้นทาง" },
      { to: "/domain-status", label: "สถานะโดเมน" },
      { to: "/install/admin", label: "ติดตั้งแอปแอดมิน" },
      { to: "/no-access", label: "ไม่มีสิทธิ์เข้าถึง" },
    ],
  },
];

export default function Sitemap() {
  const [q, setQ] = useState("");
  const total = useMemo(() => GROUPS.reduce((n, g) => n + g.items.length, 0), []);
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          i.label.toLowerCase().includes(term) ||
          i.to.toLowerCase().includes(term) ||
          (i.note ?? "").toLowerCase().includes(term),
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 pb-24">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">แผนผังเว็บ</h1>
        <p className="text-sm text-muted-foreground">
          รวมทุกหน้าในแอปไว้ที่เดียว · แสดง {shown} จาก {total} รายการ
        </p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อหน้า หรือ URL เช่น สต๊อก, /admin"
          aria-label="ค้นหาหน้าในแอป"
          className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </header>

      {groups.length === 0 && (
        <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
          ไม่พบหน้าที่ตรงกับคำค้นหา
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <section key={g.id} className="rounded-2xl border bg-card p-4">
            <h2 className="font-bold">{g.title}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{g.desc}</p>
            <ul className="space-y-1">
              {g.items.map((i) => (
                <li key={`${g.id}-${i.label}-${i.to}`}>
                  <Link
                    to={i.to}
                    className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{i.label}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {i.note ?? i.to}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
