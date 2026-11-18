import { describe, it, expect } from "vitest";
import { lineTotal, poTotals } from "../purchaseOrder";

describe("purchaseOrder totals", () => {
  it("computes line total with amount + percent discount", () => {
    expect(lineTotal({ qty: 10, unit_cost: 100, discount_amount: 50, discount_percent: 10 })).toBe(850);
  });
  it("clamps negative line to zero", () => {
    expect(lineTotal({ qty: 1, unit_cost: 10, discount_amount: 100 })).toBe(0);
  });
  it("adds VAT exclusive", () => {
    const t = poTotals({
      lines: [{ qty: 2, unit_cost: 100 }],
      vat_enabled: true, vat_rate: 7,
    });
    expect(t.subtotal).toBe(200);
    expect(t.vat).toBe(14);
    expect(t.grand).toBe(214);
  });
  it("extracts VAT inclusive", () => {
    const t = poTotals({
      lines: [{ qty: 1, unit_cost: 107 }],
      vat_enabled: true, vat_included: true, vat_rate: 7,
    });
    expect(t.vat).toBeCloseTo(7, 1);
    expect(t.grand).toBeCloseTo(107, 1);
  });
  it("includes shipping + other in taxable base", () => {
    const t = poTotals({
      lines: [{ qty: 1, unit_cost: 100 }],
      shipping_cost: 20, other_cost: 5, vat_enabled: true, vat_rate: 7,
    });
    expect(t.taxable).toBe(125);
    expect(t.grand).toBeCloseTo(133.75, 2);
  });
  it("no VAT when disabled", () => {
    const t = poTotals({ lines: [{ qty: 3, unit_cost: 50 }], vat_enabled: false });
    expect(t.vat).toBe(0);
    expect(t.grand).toBe(150);
  });
});
