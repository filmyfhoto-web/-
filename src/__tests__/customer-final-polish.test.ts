import { describe, it, expect } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("ปรับรอบสุดท้ายฝั่งลูกค้า", () => {
  it("หน้าแรก: มีเฉพาะไอคอนตะกร้า+แชท ไม่มีแถบแก้ไขตะกร้า", () => {
    const src = read("src/pages/Shop.tsx");
    expect(src).toContain('data-testid="shop-cart-icon"');
    expect(src).toContain('data-testid="shop-notifications-entry"');
    expect(src).not.toContain("แก้ไขตะกร้า");
    expect(src).not.toContain("ในตะกร้า {count} รายการ");
  });

  it("การ์ดร้านแสดงสถิติ 4 ช่องจากข้อมูลจริง", () => {
    const row = read("src/components/shop/home/EntitlementRow.tsx");
    expect(row).toContain("grid-cols-4");
    for (const id of ["entitlement-orders", "entitlement-coupon", "entitlement-jobs", "entitlement-promo"]) {
      expect(row).toContain(id);
    }
    expect(read("src/pages/Shop.tsx")).toContain("orderCount={stats.pending + stats.done}");
  });

  it("เมนูบริการเป็นกริด 5 คอลัมน์ 10 รายการ และปุ่มแตะได้ 44px", () => {
    const svc = read("src/components/shop/home/ServiceShortcuts.tsx");
    expect(svc).toContain("grid-cols-5");
    expect(svc).toContain("min-h-11");
    const cfg = read("src/lib/shopHomeConfig.ts");
    expect((cfg.match(/key:/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it("หน้าฉัน: ไอคอนหัวมีเฉพาะ ตั้งค่า / ตะกร้า / แชท", () => {
    const src = read("src/pages/MyAccount.tsx");
    for (const id of ["account-edit-profile", "account-header-cart", "account-header-bell"]) {
      expect(src).toContain(id);
    }
    expect((src.match(/<HeaderIcon /g) ?? []).length).toBe(3);
    expect(src).not.toContain("VIP");
  });

  it("หน้าฉัน: แผงกระชับ 3 ปุ่มหลัก + รายการล่าสุด", () => {
    const src = read("src/pages/MyAccount.tsx");
    expect(src).toContain("AccountActionPanel");
    const panel = read("src/components/account/AccountActionPanel.tsx");
    expect(panel).toContain("รายการล่าสุดของฉัน");
    expect(panel).toContain("ดูประวัติทั้งหมด");
  });


  it("bottom navigation 4 เมนูเดียวกันทุกหน้า (รวมงานของฉันเข้ากับหน้าฉัน)", () => {
    const src = read("src/components/layout/CustomerLayout.tsx");
    expect(src).toContain("grid-cols-4");
    for (const label of ["หน้าแรก", "สินค้า", "แจ้งเตือน", "ฉัน"]) {
      expect(src).toContain(label);
    }
    // เนื้อหาไม่ถูกแถบล่างบัง
    expect(src).toMatch(/pb-28|pb-24/);
  });

  it("ใช้ fluid typography และจำกัดความกว้างเนื้อหา", () => {
    expect(read("src/index.css")).toMatch(/clamp\(/);
    expect(read("src/pages/MyAccount.tsx")).toContain("max-w-[840px]");
  });
});
