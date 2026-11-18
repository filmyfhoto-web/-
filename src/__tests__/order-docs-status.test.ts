import { describe, expect, it } from "vitest";
import {
  docMenuLabel,
  docTypeLabel,
  groupDocsByOrder,
  orderDocStatus,
} from "@/lib/orderDocsStatus";
import { buildOrderAlertsDeepLink, buildCpoDeepLink, parseOrderExport } from "@/lib/orderDeepLink";

const rows = [
  { id: "1", order_id: "o1", doc_type: "delivery_note", doc_no: "DN-1", url: null, created_at: "2026-07-01T00:00:00Z" },
  { id: "2", order_id: "o1", doc_type: "quotation", doc_no: "QT-1", url: "https://x/y.pdf", created_at: "2026-07-05T00:00:00Z" },
  { id: "3", order_id: "o2", doc_type: "receipt", doc_no: null, url: null, created_at: "2026-07-02T00:00:00Z" },
];

describe("order document status", () => {
  it("จัดกลุ่มตามออเดอร์ ใหม่สุดก่อน", () => {
    const g = groupDocsByOrder(rows);
    expect(g.o1.map((d) => d.id)).toEqual(["2", "1"]);
    expect(g.o2).toHaveLength(1);
  });

  it("บอกสถานะว่ามีเอกสารแล้วหรือยัง", () => {
    expect(orderDocStatus([]).hasDocs).toBe(false);
    expect(orderDocStatus([]).label).toContain("ยังไม่มีเอกสาร");
    expect(orderDocStatus(groupDocsByOrder(rows).o1).downloadable).toBe(1);
    expect(orderDocStatus(groupDocsByOrder(rows).o2).label).toContain("ยังไม่มีไฟล์");
  });

  it("ป้ายชื่อเอกสารเป็นภาษาไทย", () => {
    expect(docTypeLabel("delivery_note")).toBe("ใบส่งของ");
    expect(docMenuLabel(rows[1] as any)).toBe("ใบเสนอราคา · QT-1");
  });
});

describe("ลิงก์จากไลน์เข้าออเดอร์ลูกค้า", () => {
  const id = "dd7eac80-bf95-4645-b666-fa1de8c6e80d";

  it("ลิงก์ใหม่ /admin/orders/:id เปิดหน้าออเดอร์ลูกค้าแบบโฟกัสใบเดียว", () => {
    expect(buildOrderAlertsDeepLink(id)).toBe(`/admin/orders/${id}?focus=1`);
    expect(buildOrderAlertsDeepLink(id, "xlsx")).toContain("export=xlsx");
  });

  it("ลิงก์เก่า ?order= / ?focus= ยังพาไปใบเดิม", () => {
    expect(buildCpoDeepLink(id)).toContain(`focus=${id}`);
    expect(parseOrderExport("?export=csv")).toBe("csv");
    expect(parseOrderExport("?export=zip")).toBeNull();
  });
});
