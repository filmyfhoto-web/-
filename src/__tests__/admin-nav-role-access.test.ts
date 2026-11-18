import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV, STOCK_TABS } from "@/lib/adminNav";
import { ADMIN_HOME, CUSTOMER_HOME, STAFF_HOME, resolveRoleHome } from "@/lib/roleHome";

const app = readFileSync("src/App.tsx", "utf8");

/** อ่าน guard component ของ route หนึ่ง ๆ จาก App.tsx */
function guardOf(path: string): string | null {
  const re = new RegExp(`<Route path="${path.replace(/[/]/g, "\\/")}" element=\\{<(\\w+)`);
  return app.match(re)?.[1] ?? null;
}

describe("เมนูหลัก 5 รายการ — role-based routing", () => {
  const expected: Record<string, string> = {
    "/admin/today": "RequireStaff",
    "/admin/work-docs": "RequireStaff",
    "/pos/register": "RequireStaffPerm",
    "/admin/home": "RequireStaff",
    "/admin/customers": "RequireStaff",
    "/admin/customer-360": "RequireStaff", // Customer 360 — ลูกค้าคนเดียว ประวัติเดียว
    "/admin/products": "RequireStockEdit", // สต๊อกสินค้า (canonical; /admin/inventory redirect เดิมยังอยู่)
    "/receipts": "RequireStaffAny",
    "/admin/reports": "RequireStaff",
    "/admin/tools": "RequireStaff",
    "/admin/settings": "RequireStaff",
  };

  it("มีครบทุกรายการตามลำดับที่กำหนด", () => {
    expect(DASHBOARD_NAV.map((n) => n.label)).toEqual([
      "หน้าหลัก", "ออกเอกสาร", "POS จอสัมผัส",
      "งานและเอกสาร", "สินค้า & สต๊อก", "ลูกค้า",
      "รายงาน", "เครื่องมือ", "ตั้งค่า",
    ]);
  });


  it("ทุกปลายทางมี route จริงและมี guard ตามบทบาทที่ถูกต้อง", () => {
    for (const item of DASHBOARD_NAV) {
      const path = item.to.split("?")[0];
      expect(guardOf(path), `route ${path} หายไปจาก App.tsx`).toBe(expected[path]);
    }
  });

  it("ทางเข้าสต๊อกทุกแท็บใช้ guard เดียวกัน (RequireStockEdit)", () => {
    for (const tab of STOCK_TABS) expect(guardOf(tab.to)).toBe("RequireStockEdit");
  });

  it("ไม่มีเมนูใดชี้ไปหน้าที่ไม่มีสิทธิ์เข้าถึงเลย (ไม่มี guard = ห้าม)", () => {
    for (const item of DASHBOARD_NAV) expect(guardOf(item.to.split("?")[0])).not.toBeNull();
  });
});

describe("ปลายทางหลังล็อกอินตามบทบาท", () => {
  it("owner/admin → แดชบอร์ด NATTA GROUP", () => {
    expect(ADMIN_HOME).toBe("/admin/home");
    expect(resolveRoleHome({ signedIn: true, isOwner: true })).toBe("/admin/home");
    expect(resolveRoleHome({ signedIn: true, isAdmin: true })).toBe("/admin/home");
  });

  it("พนักงานสต๊อก/ถ่ายภาพ → หน้างานประจำวัน ไม่ใช่แดชบอร์ดรวม", () => {
    expect(resolveRoleHome({ signedIn: true, isStaffAny: true })).toBe(STAFF_HOME);
    expect(STAFF_HOME.startsWith("/")).toBe(true);
  });

  it("ลูกค้า → หน้าบัญชีลูกค้า", () => {
    expect(resolveRoleHome({ signedIn: true, isCustomer: true })).toBe(CUSTOMER_HOME);
  });
});
