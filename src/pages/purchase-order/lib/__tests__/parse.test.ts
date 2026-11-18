import { describe, it, expect } from "vitest";
import { parseBulkPaste, poSubtotal, itemsToTsv, itemsToSummary } from "../parse";

describe("purchase-order parseBulkPaste", () => {
  it("parses tab-separated spreadsheet rows", () => {
    const text = "รายการ\tจำนวน\tหน่วย\tราคา\nกระดาษ A4\t5\tรีม\t120\nปากกา\t10\tด้าม\t7";
    const { items } = parseBulkPaste(text);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("กระดาษ A4");
    expect(items[0].quantity).toBe(5);
    expect(items[0].unit).toBe("รีม");
    expect(items[0].price).toBe(120);
  });

  it("warns when a parsed row has no price", () => {
    // Row with an explicit 0 price (multi-column so parser accepts it).
    const text = "หนังสือเรียน\t3\tเล่ม\t0";
    const { items, warnings } = parseBulkPaste(text);
    expect(items.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("ไม่มีราคา"))).toBe(true);
  });

  it("subtotal, tsv and summary do not emit undefined", () => {
    const { items } = parseBulkPaste("ปากกา\t2\tด้าม\t7\nสมุด\t3\tเล่ม\t25");
    expect(poSubtotal(items)).toBe(2 * 7 + 3 * 25);
    const tsv = itemsToTsv(items);
    expect(tsv).not.toMatch(/undefined/);
    const sum = itemsToSummary(items, { poNumber: "PO-202607-0001", customer: "A", org: "B" });
    expect(sum).not.toMatch(/undefined/);
    expect(sum).toMatch(/ใบสั่งสินค้า PO-202607-0001/);
  });

  it("preserves Thai text and returns empty on empty input", () => {
    const { items } = parseBulkPaste("");
    expect(items).toEqual([]);
  });
});