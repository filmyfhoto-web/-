import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildCpoDeepLink,
  buildOrderAlertsDeepLink,
  buildWorkDocsOrderLink,
  buildWorkDocsRequisitionLink,
  downloadableExport,
  isLikelyOrderId,
  parseOrderExport,
} from "@/lib/orderDeepLink";

const read = (p: string) => readFileSync(p, "utf8");
const ID = "11111111-2222-4333-8444-555555555555";

describe("ลิงก์ /admin/orders/:id จากไลน์", () => {
  it("อ่าน ?export ได้ทุกรูปแบบที่บอทส่งมา", () => {
    expect(parseOrderExport("?export=pdf")).toBe("pdf");
    expect(parseOrderExport("export=xlsx")).toBe("xlsx");
    expect(parseOrderExport("?export=csv&x=1")).toBe("csv");
    expect(parseOrderExport("?export=exe")).toBeNull();
    expect(parseOrderExport("")).toBeNull();
    expect(parseOrderExport(null)).toBeNull();
  });

  it("ส่งออกได้เฉพาะ csv/xlsx (pdf ไปพิมพ์จากหน้าเอกสาร)", () => {
    expect(downloadableExport("csv")).toBe("csv");
    expect(downloadableExport("xlsx")).toBe("xlsx");
    expect(downloadableExport("pdf")).toBeNull();
    expect(downloadableExport(null)).toBeNull();
  });

  it("ประกอบปลายทางโดยคง id และ export ไว้เสมอ", () => {
    expect(buildCpoDeepLink(ID)).toBe(`/admin/customer-purchase-orders?focus=${ID}`);
    expect(buildCpoDeepLink(ID, "xlsx")).toBe(`/admin/customer-purchase-orders?focus=${ID}&export=xlsx`);
    expect(buildOrderAlertsDeepLink(ID, "pdf")).toBe(`/admin/orders/${ID}?focus=1&export=pdf`);
    for (const url of [buildCpoDeepLink(ID, "pdf"), buildOrderAlertsDeepLink(ID, "csv")]) {
      expect(url).toContain(ID);
    }
  });

  it("กัน id ที่ไม่ใช่ uuid ไม่ให้ยิง query", () => {
    expect(isLikelyOrderId(ID)).toBe(true);
    expect(isLikelyOrderId("undefined")).toBe(false);
    expect(isLikelyOrderId("")).toBe(false);
    expect(isLikelyOrderId(null)).toBe(false);
  });

  it("route /admin/orders/:id เปิดหน้าตัวแก้ปลายทาง ไม่ redirect ทิ้ง id", () => {
    const app = read("src/App.tsx");
    const line = app.split("\n").find((l) => l.includes('path="/admin/orders/:id"'))!;
    expect(line).toBeTruthy();
    expect(line).toContain("AdminOrderDeepLink");
    expect(line).not.toContain("Navigate");
    expect(app).toContain('import("./pages/admin/OrderDeepLink.tsx")');
  });

  it("URL ที่ Edge Functions ส่งเข้าไลน์ยังตรงกับ route ฝั่งเว็บ", () => {
    for (const f of [
      "supabase/functions/line-notify/urls.ts",
      "supabase/functions/link-request-notify/_urls.ts",
      "supabase/functions/line-config-check/_urls.ts",
    ]) {
      const src = read(f);
      expect(src).toContain("/admin/orders/${orderId}");
      expect(src).toContain("?export=pdf");
      expect(src).toContain("?export=xlsx");
    }
  });

   it("หน้า deep link รองรับทั้งใบสั่งซื้อลูกค้า ออเดอร์ทั่วไป และใบเขียนเบิก", () => {
     const src = read("src/pages/admin/OrderDeepLink.tsx");
     expect(src).toContain("customer_purchase_orders");
     expect(src).toContain('from("orders")');
     expect(src).toContain("school_requisitions");
     expect(src).toContain("buildCpoDeepLink");
     expect(src).toContain("buildWorkDocsOrderLink");
     expect(src).toContain("buildWorkDocsRequisitionLink");
   });

  it("ไฟล์กำพร้า OrderDriveFilesCard ถูกลบแล้ว", () => {
    expect(() => read("src/pages/admin/OrderDriveFilesCard.tsx")).toThrow();
  });

   it("หน้าแจ้งเตือนออเดอร์เดิมถูกยุบเข้า “งานและเอกสาร” แล้ว", () => {
     expect(() => read("src/pages/admin/OrderAlerts.tsx")).toThrow();
     expect(buildWorkDocsOrderLink(ID)).toBe(`/admin/work-docs?filter=order&kind=web_order&id=${ID}`);
     expect(buildWorkDocsRequisitionLink(ID)).toBe(`/admin/work-docs?filter=requisition&kind=requisition&id=${ID}`);
     const app = read("src/App.tsx");
    expect(app).toContain('path="/admin/order-alerts" element={<Navigate to="/admin/work-docs?filter=order"');
  });
});
