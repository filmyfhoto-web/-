import { describe, it, expect } from "vitest";
import fs from "node:fs";

const page = fs.readFileSync("src/pages/admin/ShopHomeDesign.tsx", "utf8");

describe("จัดการหน้าแอพ (unified admin page)", () => {
  it("is a single scrolling page, not tabs", () => {
    expect(page).not.toMatch(/TabsTrigger/);
    expect(page).toContain("จัดการหน้าแอพ");
  });

  it("contains all five management cards", () => {
    expect(page).toContain("admin-app-layout");      // โครงหน้าหลัก + ข้อมูลร้าน + การแสดงผล
    expect(page).toContain("เมนูบริการ");
    expect(page).toContain("Promotions & Campaigns");
    expect(page).toContain("PromoManager");
  });

  it("hides advanced theme settings behind เพิ่มเติม", () => {
    expect(page).toContain("admin-app-advanced-toggle");
    expect(page).toMatch(/showAdvanced && <div/);
  });

  it("has a sticky footer with preview + save-all that clears iOS safe area", () => {
    expect(page).toContain("admin-app-sticky-footer");
    expect(page).toContain("admin-app-preview");
    expect(page).toContain("admin-app-save-all");
    expect(page).toContain("env(safe-area-inset-bottom");
    expect(page).toMatch(/pb-28/); // content not covered by the footer
  });

  it("promo manager is reusable and does not nest AdminLayout", () => {
    const promo = fs.readFileSync("src/components/admin/PromoManager.tsx", "utf8");
    expect(promo).not.toMatch(/AdminLayout/);
    // หน้าเก่า /admin/shop-promos ถูกลบแล้ว — เหลือ redirect ไป /admin/shop-home
    expect(fs.existsSync("src/pages/admin/ShopPromos.tsx")).toBe(false);
  });

});
