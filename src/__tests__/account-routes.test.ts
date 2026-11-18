import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

const app = readFileSync("src/App.tsx", "utf8");
const account = readFileSync("src/pages/MyAccount.tsx", "utf8");

describe("customer account routes", () => {
  it("ทุกเส้นทางในเมนูบัญชีมี <Route> จริงใน App.tsx", () => {
    for (const path of Object.values(ACCOUNT_ROUTES)) {
      expect(app, `missing route ${path}`).toContain(`path="${path}"`);
    }
  });

  it("ติดตามงานรองรับพารามิเตอร์ orderId", () => {
    expect(app).toContain('path="/account/tracking/:orderId"');
  });

  it("ไม่มีลิงก์เก่าที่เด้งไปหน้าสินค้าเหลืออยู่ในเมนูบัญชี", () => {
    expect(account).not.toContain('to: "/cart#pickup"');
    expect(account).not.toContain('to: "/cart#attachments"');
    expect(account).not.toContain('to: "/my-orders?bucket=issued"');
  });

  it("ลูกค้าไม่มีเมนูจัดการเทมเพลตเอกสาร", () => {
    expect(account).not.toContain("เทมเพลตเอกสารของฉัน");
    expect(account).not.toContain("จัดการเทมเพลต");
  });
});

describe("ประวัติคำสั่งซื้อรวมอยู่ในหน้า \"ฉัน\"", () => {
  const orders = readFileSync("src/pages/MyOrders.tsx", "utf8");
  const panel = readFileSync("src/components/account/MyOrdersPanel.tsx", "utf8");

  it("ลิงก์เก่าจาก LINE /account/orders?order=... มี route จริงและส่งต่อ query", () => {
    expect(app).toContain('path="/account/orders"');
    expect(orders).toContain("/my-account${search}${hash}");
    expect(orders).toContain("replace");
  });

  it("/my-orders เด้งเข้าหน้าฉัน แต่หน้ารายละเอียดยังอยู่", () => {
    expect(app).toContain('path="/my-orders"');
    expect(app).toContain('path="/my-orders/:id"');
  });

  it("แผงประวัติเลื่อนไปหาออเดอร์ที่ระบุใน ?order=", () => {
    expect(panel).toContain('searchParams.get("order")');
    expect(panel).toContain("scrollIntoView");
    expect(panel).toContain("order-card-${o.id}");
  });

  it("ไม่มีกล่อง 'รายการล่าสุดของฉัน' ซ้ำในหน้าฉันแล้ว", () => {
    const action = readFileSync("src/components/account/AccountActionPanel.tsx", "utf8");
    expect(action).not.toContain("รายการล่าสุดของฉัน");
    expect(action).toContain("account-action-shop");
  });
});
