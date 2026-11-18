import { describe, expect, it } from "vitest";
import {
  buildOrderDocumentPrefill,
  orderCustomerName,
  orderDocumentRoute,
} from "@/lib/orderToDocument";

const order = {
  id: "ord-1",
  order_no: "SO-0001",
  guest_name: "สมชาย",
  guest_phone: "0812345678",
  school_name: "โรงเรียนทดสอบ",
  note: "รีบ",
  organizations: { name: "หน่วยงาน ก" },
  order_items: [
    { product_name: "กระดาษ A4", qty: 3, unit: "รีม", price: 120, total: 360 },
    { product_name: "ปากกา", qty: 2, unit: "ด้าม", price: null, total: 30 },
    { product_name: "", qty: 1, unit: "ชิ้น", price: 10, total: 10 },
  ],
};

describe("orderToDocument", () => {
  it("maps items and drops nameless rows", () => {
    const p = buildOrderDocumentPrefill(order, "quotation");
    expect(p.items).toHaveLength(2);
    expect(p.items[0]).toEqual({ name: "กระดาษ A4", quantity: 3, unit: "รีม", price: 120 });
  });

  it("derives unit price from total when price missing", () => {
    const p = buildOrderDocumentPrefill(order, "quotation");
    expect(p.items[1].price).toBe(15);
  });

  it("carries customer identity and order reference", () => {
    const p = buildOrderDocumentPrefill(order, "receipt");
    expect(p.source).toBe("customer_purchase_order");
    expect(p.doc_type).toBe("receipt");
    expect(p.po_number).toBe("SO-0001");
    expect(p.customer).toEqual({
      name: "หน่วยงาน ก",
      phone: "0812345678",
      organization: "หน่วยงาน ก",
    });
    expect(p.note).toContain("อ้างอิงคำสั่งซื้อ SO-0001");
  });

  it("falls back through org → school → guest for the display name", () => {
    expect(orderCustomerName({ id: "x", school_name: "รร.ข" })).toBe("รร.ข");
    expect(orderCustomerName({ id: "x", guest_name: "ก" })).toBe("ก");
    expect(orderCustomerName({ id: "x" })).toBe("ลูกค้า");
  });

  it("builds the receipts route", () => {
    expect(orderDocumentRoute("colorlab", "quotation")).toBe(
      "/receipts/colorlab/documents/new?doc_type=quotation",
    );
  });
});