import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DASHBOARD_NAV, MODULE_CARDS } from "@/lib/adminNav";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

const read = (p: string) => readFileSync(p, "utf8");
const app = read("src/App.tsx");
const account = read("src/pages/MyAccount.tsx");
const menu = read("src/components/layout/CustomerAccountMenu.tsx");
const index = read("src/pages/Index.tsx");
const gate = read("src/components/AppUpdateGate.tsx");

describe("ทางเข้า Customer 360 / Excel / ประวัติรวม", () => {
  it("Customer 360 ถูกซ่อนจากเมนู/การ์ด แต่ route ยังใช้งานได้", () => {
    expect(DASHBOARD_NAV.some((i) => i.to === "/admin/customer-360")).toBe(false);
    expect(MODULE_CARDS.some((i) => i.to === "/admin/customer-360")).toBe(false);
    expect(app).toContain('<Route path="/admin/customer-360"');
  });

  it("หน้าบัญชีมีทางลัดส่ง Excel และประวัติรวมแบบเห็นชัด", () => {
    // แผงกระชับ: ทางลัดอยู่ในแผงหลักของหน้าบัญชี
    const panel = read("src/components/account/AccountActionPanel.tsx");
    expect(account).toContain("AccountActionPanel");
    expect(panel).toContain("ACCOUNT_ROUTES.excel");
    expect(panel).toContain("ACCOUNT_ROUTES.allHistory");

    expect(ACCOUNT_ROUTES.excel).toBe("/account/excel");
    expect(ACCOUNT_ROUTES.allHistory).toBe("/account/history");
  });


  it("เมนูบัญชีมุมขวาบนมีประวัติรวมและส่งไฟล์ Excel", () => {
    expect(menu).toContain("ACCOUNT_ROUTES.allHistory");
    expect(menu).toContain("ACCOUNT_ROUTES.excel");
  });

  it("หน้าแรกไม่มีแบนเนอร์ประกาศ Customer 360 แล้ว และมีแผงลูกค้า/แถบสถานะแทน", () => {
    expect(index).not.toContain("NewFeaturesBanner");
    expect(account).not.toContain("NewFeaturesBanner");

    const welcome = read("src/pages/Welcome.tsx");
    expect(welcome).toContain("CustomerHomePanel");
    // แถบสถานะย้ายออกมาอยู่นอกการ์ด เพื่อให้ยาวเต็มความกว้าง
    expect(welcome).toContain("OrderStatusStrip");

    const panel = read("src/components/home/CustomerHomePanel.tsx");
    expect(panel).not.toContain("home-shortcut-");
    expect(panel).toContain("home-customer-code");


    const strip = read("src/components/home/OrderStatusStrip.tsx");
    expect(strip).toContain("home-all-history");
    expect(strip).toContain("countBuckets");
  });

  it("ป้ายเวอร์ชัน + ปุ่มโหลดใหม่แสดงกับหน้าลูกค้าด้วย และตรวจเวอร์ชันถี่ขึ้น", () => {
    expect(gate).not.toContain('appLabel(pathname) !== "ลูกค้า"');
    expect(gate).toContain("useBuildUpdate(20 * 1000)");
    expect(gate).toContain("global-refresh-assets");
  });
});
