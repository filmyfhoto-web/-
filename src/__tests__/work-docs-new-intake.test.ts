import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { INTAKE_METHODS, itemsTotal } from "@/lib/workIntake";
import { DASHBOARD_NAV } from "@/lib/adminNav";

const read = (p: string) => readFileSync(p, "utf8");

describe("ระยะ 1 — รับงานใหม่ในหน้า งานและเอกสาร", () => {
  it("มี 3 ทางรับงาน และเลือกบันทึกเป็นคำสั่งซื้อหรือใบเบิกได้", () => {
    expect(INTAKE_METHODS.map((m) => m.key)).toEqual(["manual", "files", "line"]);
    const lib = read("src/lib/workIntake.ts");
    expect(lib).toContain('NewWorkKind = "order" | "requisition"');
    expect(lib).toContain("saveDeskRequisition");
  });

  it("รวมยอดจากรายการจริง", () => {
    expect(itemsTotal([
      { id: "1", code: "", name: "a", unit: "ชิ้น", price: 10, qty: 2, source: "manual" },
      { id: "2", code: "", name: "b", unit: "ชิ้น", price: 5, qty: 3, source: "manual" },
    ])).toBe(35);
  });

   it("เขียนลงตารางคำสั่งซื้อและใบเขียนเบิก โดยใช้ตัวอ่านไฟล์กลาง", () => {
     const lib = read("src/lib/workIntake.ts");
     expect(lib).toContain("customer_purchase_orders");
     expect(read("src/lib/requisitionDesk.ts")).toContain("school_requisitions");
     expect(lib).toContain("saveDeskRequisition");
     expect(read("src/components/admin/work-docs/CustomerFilesPicker.tsx")).toContain("@/lib/workDesk");
   });

  it("ปุ่มรับงานใหม่อยู่บนหน้า work-docs", () => {
    const page = read("src/pages/admin/WorkDocs.tsx");
    expect(page).toContain('data-testid="work-new"');
    expect(page).toContain("NewWorkDialog");
  });

  it("เส้นทางใบเบิกเดิม redirect เข้า work-docs และไม่อยู่ในเมนูแล้ว", () => {
    const app = read("src/App.tsx");
    for (const p of ["/admin/school-requisitions", "/admin/requisition-desk/legacy"]) {
      const line = app.split("\n").find((l) => l.includes(`path="${p}"`))!;
      expect(line).toContain("Navigate");
      expect(line).toContain("/admin/work-docs");
    }
    expect(DASHBOARD_NAV.some((n) => n.to.startsWith("/admin/school-requisitions"))).toBe(false);
  });

  it("แท็บคำสั่งซื้อ/ใบเขียนเบิกเดิมถูกลบออกจาก hub แล้ว", () => {
    for (const f of ["src/components/admin/hub/OrdersTab.tsx", "src/components/admin/hub/RequisitionsTab.tsx", "src/components/admin/hub/TodayTab.tsx"]) {
      expect(existsSync(f)).toBe(false);
    }
  });
});
