import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DASHBOARD_NAV, MODULE_CARDS, WORKSPACE_NAV } from "@/lib/adminNav";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const app = read("src/App.tsx");
const home = read("src/pages/admin/AdminDashboardHome.tsx");
const today = read("src/pages/admin/AdminToday.tsx");

/** route ที่ App.tsx ประกาศไว้จริง (ตัด query ออกก่อนเทียบ) */
const declared = new Set(
  [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1].replace(/\/\*$/, "")),
);
const routeExists = (to: string) => {
  const path = to.split("?")[0];
  return declared.has(path) || [...declared].some((d) => d !== "*" && path.startsWith(`${d}/`));
};

describe("ทางลัดบนแดชบอร์ด — ปลายทางต้องมีจริง", () => {
  it("เมนูหลักและการ์ดโมดูลชี้ route ที่มีอยู่จริง", () => {
    for (const item of [...DASHBOARD_NAV, ...WORKSPACE_NAV, ...MODULE_CARDS]) {
      expect(routeExists(item.to), `ไม่พบ route ${item.to}`).toBe(true);
    }
  });

  it("แยกแดชบอร์ดแอดมินออกจาก FILM SHOP", () => {
    // แดชบอร์ดแอดมินเป็นหน้าแรกเสมอ ส่วน FILM SHOP เป็นแค่ “ทางเข้า” หนึ่งเมนู
    expect(DASHBOARD_NAV[0].to).toBe("/admin/home");
    expect(WORKSPACE_NAV[0].to).toBe("/receipts");
    expect(MODULE_CARDS.some((i) => i.to === "/admin/home")).toBe(false);
    expect(MODULE_CARDS.some((i) => i.to === "/admin/work-docs")).toBe(false);
    // FILM SHOP ถูกแยกเป็นคนละโมดูล — ไม่มีในเมนูหลัก/เมนูพื้นที่ทำงาน/การ์ดโมดูลอีกแล้ว
    expect(DASHBOARD_NAV.some((i) => i.to.startsWith("/film-shop"))).toBe(false);
    expect(WORKSPACE_NAV.some((i) => i.to.startsWith("/film-shop"))).toBe(false);
    expect(MODULE_CARDS.some((i) => i.to.startsWith("/film-shop"))).toBe(false);
    expect(app).toContain('<Route path="/admin/home" element={<RequireStaff><AdminDashboardHome /></RequireStaff>} />');
    expect(app).toContain('<Route path="/admin/today" element={<RequireStaff><AdminToday /></RequireStaff>} />');
    expect(app).toContain('<Route path="/admin" element={<Navigate to="/admin/home" replace />} />');
  });


  it("ลิงก์ด่วนทุกอันใน /admin/home และ /admin/today มีปลายทางจริง", () => {
    const links = [
      ...[...home.matchAll(/to="(\/[^"]*)"/g)].map((m) => m[1]),
      ...[...home.matchAll(/to:\s*"(\/[^"]*)"/g)].map((m) => m[1]),
      ...[...today.matchAll(/to=\{?"(\/[^"]*)"\}?/g)].map((m) => m[1]),
    ];
    expect(links.length).toBeGreaterThan(12);
    for (const to of links) expect(routeExists(to), `ไม่พบ route ${to}`).toBe(true);
  });

  it("ลิงก์สินค้าใกล้หมดส่ง status=low และหน้าสินค้าอ่านค่านั้น", () => {
    expect(home).toContain("/admin/products?status=low");
    const products = read("src/pages/admin/Products.tsx");
    expect(products).toContain('get("status")');
    expect(products).toContain('"low"');
  });

  it("แดชบอร์ดหลักไม่โชว์งานของ FILM SHOP — เหลือปุ่มทางเข้าเดียว", () => {
    // ไม่มีแผง "แจ้งการรับงาน" / ไม่ดึง film_orders มาโชว์ปนกับ NATTA GROUP
    expect(home).not.toContain("film_orders");
    expect(home).not.toContain("NgFilmIntakeList");
    expect(home).not.toContain("แจ้งการรับงาน");
    expect(home).not.toContain("/film-shop/app?p=orders");
    // ทางเข้าเดียวคือปุ่มใน hero
    expect(home).toContain('data-testid="ng-hero-filmshop"');
    expect(home).toContain('to="/film-shop"');
    // deep link canonical ยังอยู่ครบในพื้นที่ทำงาน FILM SHOP เอง
    const filmApp = read("src/film-shop/FilmShopApp.tsx");
    expect(filmApp).toContain("group-queue");
    expect(filmApp).toContain("orders");
  });

  it("ลิงก์เปลี่ยนรูปโชว์อยู่ในโซนแอดมิน ไม่เด้งเข้า FILM SHOP", () => {
    expect(home).toContain('to="/admin/site-editor"');
    expect(app).toContain('<Route path="/admin/site-editor" element={<RequireStaff><AdminSiteEditor /></RequireStaff>} />');
  });

  it("ตัวกรองแดชบอร์ดไม่มีสถานะงานรับเข้าของ FILM SHOP แล้ว", () => {
    const filters = read("src/components/dashboard/ng/NgDashboardFilters.tsx");
    expect(filters).not.toContain("filmStatus");
    expect(filters).toContain("ng-filter-po-status");
    expect(read("src/lib/dashboardInbox.ts")).not.toContain("filterFilmRows");
  });

  it("FILM SHOP มีทางกลับแดชบอร์ดแอดมิน", () => {
    const sidebar = read("src/film-shop/components/layout/Sidebar.tsx");
    expect(sidebar).toContain("fs-back-admin");
    expect(sidebar).toContain("/admin/home");
  });
});
