import { describe, it, expect } from "vitest";
import { cpoTotals, itemTotal, bucketOf, canIssueDocument } from "../customerPoTotals";

const items = [
  { key: "a", name: "กระดาษ A4 80 แกรม", quantity: 5, unit: "รีม", price: 120 },
  { key: "b", name: "แฟ้มสันกว้าง", quantity: 10, unit: "เล่ม", price: 75 },
];

describe("customer PO totals", () => {
  it("line total subtracts line discount and clamps at zero", () => {
    expect(itemTotal({ key: "x", name: "y", quantity: 2, unit: "ชิ้น", price: 50, discount: 20 })).toBe(80);
    expect(itemTotal({ key: "x", name: "y", quantity: 1, unit: "ชิ้น", price: 10, discount: 99 })).toBe(0);
  });

  it("computes subtotal, discount and VAT like the mockup", () => {
    const t = cpoTotals({ items, discount: 50, vat_enabled: true, vat_rate: 7 });
    expect(t.subtotal).toBe(1350);
    expect(t.base).toBe(1300);
    expect(t.vat).toBe(91);
    expect(t.net).toBe(1391);
  });

  it("applies withholding tax on the pre-VAT base", () => {
    const t = cpoTotals({ items, discount: 50, vat_enabled: true, vat_rate: 7, wht_enabled: true, wht_rate: 3 });
    expect(t.wht).toBe(39);
    expect(t.net).toBe(1352);
  });

  it("no VAT when disabled", () => {
    const t = cpoTotals({ items });
    expect(t.vat).toBe(0);
    expect(t.net).toBe(1350);
  });

  it("maps review status to list buckets", () => {
    expect(bucketOf("not_sent")).toBe("new");
    expect(bucketOf("awaiting_customer")).toBe("working");
    expect(bucketOf("revision_requested")).toBe("working");
    expect(bucketOf("confirmed")).toBe("working");
    expect(bucketOf("documented")).toBe("done");
  });

  it("locks document issuing until the customer confirms", () => {
    expect(canIssueDocument("awaiting_customer")).toBe(false);
    expect(canIssueDocument("revision_requested")).toBe(false);
    expect(canIssueDocument("confirmed")).toBe(true);
  });
});