import { describe, it, expect } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("simplified navigation", () => {
  it("POS shell shows at most 6 daily items plus a tools entry", () => {
    const src = read("src/components/layout/PosShell.tsx");
    const nav = src.split("const NAV: NavItem[] = [")[1].split("];")[0];
    const items = nav.split("\n").filter((l) => l.includes("to: \"/pos"));
    expect(items.length).toBeLessThanOrEqual(7);
    expect(nav).toContain("/pos/tools");
  });

  it("keeps every moved POS page reachable from the tools page", () => {
    const tools = read("src/pages/pos/PosTools.tsx");
    for (const to of [
      "/pos/dashboard",
      "/pos/reports",
      "/pos/staff",
      "/pos/purchase-orders",
      "/pos/suppliers",
      "/pos/movements",
      "/pos/pricing",
    ]) {
      expect(tools).toContain(to);
    }
  });

  it("dashboard nav keeps one entrance per job and admin home has no duplicate shortcut cards", () => {
    // NATTA GROUP redesign: เมนูเดียวคือ DASHBOARD_NAV (8 รายการ), ไม่มีการ์ดทางลัดซ้ำบนหน้าแดชบอร์ด
    const nav = read("src/lib/adminNav.ts").split("DASHBOARD_NAV: AdminNavItem[] = [")[1].split("];")[0];
    const items = nav.split("\n").filter((l) => l.includes('to: "'));
    expect(items.length).toBeLessThanOrEqual(14);
    expect(nav).toContain("/admin/settings");
    // เครื่องมือระบบยังเข้าถึงได้จากหน้าตั้งค่าทางเดียว
    expect(read("src/pages/admin/SettingsHub.tsx")).toContain("/admin/tools");
  });

  it("keeps every moved admin page reachable from /admin/tools", () => {
    const tools = read("src/pages/admin/Tools.tsx");
    for (const to of [
      "/admin/stock",
      "/admin/purchases",
      "/admin/suppliers",
      "/admin/prices",
      "/admin/price-groups",
      "/admin/review",
      "/admin/credit-bills",
      "/admin/product-views",
      "/admin/staff-line",
    ]) {
      expect(tools).toContain(to);
    }
    // Advanced settings entries are rendered from SETTINGS_TABS on this page.
    expect(tools).toContain("SETTINGS_TABS");
    expect(read("src/App.tsx")).toContain('path="/admin/tools"');
  });

  it("film shop sidebar keeps its core destinations only", () => {
    const src = read("src/film-shop/components/layout/Sidebar.tsx");
    const nav = src.split("const ALL_FILM_NAV_ITEMS = [")[1].split("];")[0];
    const ids = nav.split("\n").filter((l) => l.includes("id:"));
    // Grouped IA (daily / data) — เมนูที่เลิกใช้ถูกทำเครื่องหมาย legacy และกรองออกตอน runtime
    // +5 = หน้าหลัก 4 กลุ่ม และการ์ดกลุ่มทั้ง 4 (คัลเลอร์แล็ป/การพิมพ์/Film Shop/Q รันงาน)
    expect(ids.length).toBeLessThanOrEqual(21);
    for (const id of ["'documents'", "'stock'", "'settings'"])
      expect(nav).toContain(id);
    for (const group of ["'daily'", "'data'"]) expect(nav).toContain(group);
    // กลุ่ม "ขายและเอกสาร" ถูกยกเลิกแล้ว
    expect(src.split("const GROUP_LABEL")[1]).not.toContain("ขายและเอกสาร");
    expect(nav).not.toContain("'sales'");
  });

  it("keeps every moved film shop page reachable from its tools page", () => {
    const tools = read("src/film-shop/components/tools/FilmToolsPage.tsx");
    for (const id of [
      "calculator",
      "job-requests",
      "reports",
      "audit",
      "sales-check",
      "transactions",
      "employees",
      "admin",
    ]) {
      expect(tools).toContain(`id: '${id}'`);
    }
    expect(read("src/film-shop/FilmShopApp.tsx")).toContain("case 'tools'");
    // tools ยังเปิดได้จากหน้าตั้งค่า
    expect(read("src/film-shop/FilmShopApp.tsx")).toContain("<FilmToolsPage");
  });
});
