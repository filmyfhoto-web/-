import { describe, it, expect } from "vitest";
import {
  buildDocumentPrefill,
  buildConvertRoute,
  convertTargetLabel,
  type PORow,
} from "../convert";

const basePo: PORow = {
  id: "po-1",
  po_number: "PO-202607-0001",
  customer_name: "สมชาย ใจดี",
  customer_phone: "0812345678",
  school_or_org: "รร.เชียงกลาง",
  seller_name: "หญิง",
  note: "ต้องการก่อน 20 ก.ค.",
  items: [
    { name: "กระดาษ A4", quantity: 5, unit: "รีม", price: 120 },
    { name: "ปากกา", quantity: 10, unit: "ด้าม", price: 7 },
    { name: "", quantity: 1, unit: "ชิ้น", price: 0 }, // filtered out
  ],
  subtotal: 670,
  request_quotation: true,
  request_delivery_note: false,
  status: "submitted",
  submitted_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

describe("buildDocumentPrefill", () => {
  it("keeps only named items and coerces numbers", () => {
    const p = buildDocumentPrefill(basePo, "quotation");
    expect(p.items).toHaveLength(2);
    expect(p.items[0]).toEqual({ name: "กระดาษ A4", quantity: 5, unit: "รีม", price: 120 });
    expect(p.doc_type).toBe("quotation");
  });

  it("carries customer snapshot", () => {
    const p = buildDocumentPrefill(basePo, "delivery_note");
    expect(p.customer).toEqual({
      name: "สมชาย ใจดี",
      phone: "0812345678",
      organization: "รร.เชียงกลาง",
    });
  });

  it("appends PO reference to note", () => {
    const p = buildDocumentPrefill(basePo, "quotation");
    expect(p.note).toContain("PO-202607-0001");
    expect(p.note).toContain("ต้องการก่อน");
  });

  it("handles missing/garbage items array", () => {
    const p = buildDocumentPrefill({ ...basePo, items: null } as unknown as PORow, "receipt");
    expect(p.items).toEqual([]);
  });
});

describe("buildConvertRoute", () => {
  it("URL-encodes slug and includes doc_type + from_po", () => {
    const url = buildConvertRoute("nattaporn chiang-klang", "delivery_note", "po-1");
    expect(url).toBe("/receipts/nattaporn%20chiang-klang/documents/new?from_po=po-1&doc_type=delivery_note");
  });
});

describe("convertTargetLabel", () => {
  it("returns Thai labels", () => {
    expect(convertTargetLabel("quotation")).toBe("ใบเสนอราคา");
    expect(convertTargetLabel("delivery_note")).toBe("ใบส่งของ");
    expect(convertTargetLabel("receipt")).toBe("ใบเสร็จ");
  });
});