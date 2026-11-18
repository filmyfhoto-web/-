import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { MODULE_CARDS } from "@/lib/adminNav";

const home = fs.readFileSync("src/pages/admin/AdminDashboardHome.tsx", "utf8");

describe("ทางเข้า จัดการลูกค้าและออเดอร์", () => {
  it("ไม่อยู่ในการ์ดทางลัดแล้ว (ย้ายไปหน้างานและเอกสาร)", () => {
    expect(MODULE_CARDS.some((m) => m.to === "/admin/customer-hub")).toBe(false);
    expect(MODULE_CARDS.some((m) => m.to === "/admin/reports")).toBe(true);
  });

  it("ไม่มีแถบทางเข้าซ้ำท้ายหน้าหลัก", () => {
    expect(home).not.toContain("ng-customer-hub-entry");
  });
});

describe("สร้างลูกค้าใหม่ + เชื่อม LINE ในคลิกเดียว", () => {
  it("ใช้ RPC เดียวกันทั้งหน้าลูกค้าและแผงแจ้งเตือน", () => {
    const dialog = fs.readFileSync("src/components/admin/hub/QuickLineCustomerDialog.tsx", "utf8");
    expect(dialog).toContain("admin_create_line_customer");
    for (const f of ["src/components/admin/hub/CustomersTab.tsx", "src/components/admin/hub/LineLinkPanel.tsx"]) {
      expect(fs.readFileSync(f, "utf8")).toContain("QuickLineCustomerDialog");
    }
  });
});
