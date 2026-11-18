import { describe, it, expect } from "vitest";
import {
  buildBillRows, sumBillRows, rollupBillRows, isCountableDocument, lineTotal,
  BILL_DOC_TYPES, BILL_DOC_LABEL,
  type BillDocument, type BillItem,
} from "../useBillSales";

const doc = (id: string, status: string): BillDocument => ({
  id, document_no: `RC-${id}`, document_type: "receipt", document_date: "2026-07-01",
  created_at: "2026-07-01T00:00:00Z", customer_name: `cust-${id}`, status, grand_total: 100, store_id: "s1",
});
const item = (id: string, document_id: string, quantity: number, price: number, line_total: number | null = null): BillItem => ({
  id, document_id, name: `p-${id}`, description: null, unit: "ชิ้น", quantity, price, line_total, item_order: 1,
});

describe("bill sales aggregation", () => {
  it("excludes cancelled and draft documents", () => {
    expect(isCountableDocument({ status: "issued" })).toBe(true);
    expect(isCountableDocument({ status: "cancelled" })).toBe(false);
    expect(isCountableDocument({ status: "draft" })).toBe(false);
  });

  it("computes qty x price when line_total is absent", () => {
    expect(lineTotal({ quantity: 3, price: 25, line_total: null })).toBe(75);
    expect(lineTotal({ quantity: 3, price: 25, line_total: 70 })).toBe(70);
  });

  it("flattens only countable documents into item rows", () => {
    const rows = buildBillRows(
      [doc("a", "issued"), doc("b", "cancelled")],
      [item("1", "a", 2, 50), item("2", "b", 5, 10)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ documentNo: "RC-a", customer: "cust-a", qty: 2, price: 50, total: 100, unit: "ชิ้น" });
  });

  it("sums qty/amount and counts distinct documents", () => {
    const rows = buildBillRows([doc("a", "issued"), doc("b", "issued")], [item("1", "a", 2, 50), item("2", "a", 1, 10), item("3", "b", 4, 5)]);
    expect(sumBillRows(rows)).toEqual({ documents: 2, items: 3, qty: 7, amount: 130 });
  });

  it("rolls up per product+unit", () => {
    const rows = buildBillRows([doc("a", "issued")], [item("1", "a", 2, 50), item("1", "a", 3, 50)]);
    const r = rollupBillRows(rows);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ qty: 5, amount: 250 });
  });
});

describe("bill doc types", () => {
  it("exposes an all-types option first", () => {
    expect(BILL_DOC_TYPES[0]).toBe("all");
    expect(BILL_DOC_LABEL.all).toBe("รวมทุกชนิด");
  });
});

describe("internal_sale_type gate", () => {
  it("counts only documents ticked as ซื้อบิล (bill_only)", () => {
    expect(isCountableDocument({ status: "issued", internal_sale_type: "bill_only" })).toBe(true);
    expect(isCountableDocument({ status: "issued", internal_sale_type: "real_goods" })).toBe(false);
    // legacy rows without the flag stay in the bill ledger
    expect(isCountableDocument({ status: "issued", internal_sale_type: null })).toBe(true);
  });
});
