import { describe, it, expect } from "vitest";
import {
  buildBillRows,
  itemIdFromIdempotencyKey,
  movementsByItemId,
  type BillDocument,
  type BillItem,
  type DocStockMovement,
} from "../useBillSales";
import { stockMatches } from "../BillSalesPanel";

const doc = (id: string, saleType: string): BillDocument => ({
  id,
  document_no: `RC-${id}`,
  document_type: "receipt",
  document_date: "2026-07-20",
  created_at: "2026-07-20T03:00:00Z",
  customer_name: "ลูกค้า A",
  status: "issued",
  grand_total: 200,
  store_id: "s1",
  internal_sale_type: saleType,
});
const item = (id: string, document_id: string, quantity: number): BillItem => ({
  id, document_id, name: `p-${id}`, description: null, unit: "ชิ้น",
  quantity, price: 10, line_total: null, item_order: 1,
});
const move = (docId: string, itemId: string, before: number, after: number): DocStockMovement => ({
  idempotency_key: `rdsdoc:${docId}:${itemId}`,
  before_qty: before,
  after_qty: after,
  qty: before - after,
});

describe("real goods stock audit", () => {
  it("parses the item id out of the idempotency key", () => {
    expect(itemIdFromIdempotencyKey("rdsdoc:d1:i1")).toBe("i1");
    expect(itemIdFromIdempotencyKey("pos:d1:i1")).toBeNull();
    expect(itemIdFromIdempotencyKey(null)).toBeNull();
  });

  it("maps each movement onto its document item line", () => {
    const m = movementsByItemId([move("d1", "i1", 10, 8), move("d1", "i2", 5, 4)]);
    expect(m.get("i1")?.before_qty).toBe(10);
    expect(m.get("i2")?.after_qty).toBe(4);
    expect(m.get("i3")).toBeUndefined();
  });

  it("attaches before/after stock to real-goods rows and flags un-deducted lines", () => {
    const rows = buildBillRows(
      [doc("d1", "real_goods")],
      [item("i1", "d1", 2), item("i2", "d1", 1)],
      "real_goods",
      movementsByItemId([move("d1", "i1", 10, 8)]),
    );
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.itemId === "i1")!;
    expect(a.documentId).toBe("d1");
    expect(a.applied).toBe(true);
    expect(a.stockBefore).toBe(10);
    expect(a.stockAfter).toBe(8);
    expect(stockMatches(a)).toBe(true);

    const b = rows.find((r) => r.itemId === "i2")!;
    expect(b.applied).toBe(false);
    expect(b.stockBefore).toBeNull();
    expect(b.stockAfter).toBeNull();
  });

  it("flags a mismatch when after != before - qty", () => {
    const rows = buildBillRows(
      [doc("d2", "real_goods")],
      [item("i9", "d2", 3)],
      "real_goods",
      movementsByItemId([move("d2", "i9", 10, 8)]),
    );
    expect(stockMatches(rows[0])).toBe(false);
  });

  it("bill-only rows never carry stock data", () => {
    const rows = buildBillRows([doc("d3", "bill_only")], [item("i5", "d3", 4)], "bill_only");
    expect(rows[0].applied).toBe(false);
    expect(rows[0].stockBefore).toBeNull();
  });
});
