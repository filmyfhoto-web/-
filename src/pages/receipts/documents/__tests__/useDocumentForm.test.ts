import { describe, it, expect } from "vitest";
import { computeTotals, emptyItem, validateItems, type DocFormState } from "../useDocumentForm";

function makeState(overrides: Partial<DocFormState> = {}): DocFormState {
  return {
    document_type: "receipt",
    paper_size: "A4",
    document_date: "2026-01-01",
    show_document_date: true,
    vat_mode: "none",
    vat_rate: 0,
    price_type: "no_vat",
    withholding_tax_enabled: false,
    withholding_tax_rate: 3,
    discount_amount: 0,
    customer_id: null,
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    customer_tax_id: "",
    customer_branch: "",
    payment_method: "cash",
    notes: "",
    items: [{ ...emptyItem(), name: "A", price: 100, quantity: 2 }],
    ...overrides,
  };
}

describe("computeTotals", () => {
  it("no VAT: subtotal equals grand_total", () => {
    const t = computeTotals(makeState());
    expect(t.subtotal).toBe(200);
    expect(t.grand_total).toBe(200);
    expect(t.vat_amount).toBe(0);
  });

  it("exclusive 7% adds VAT on top", () => {
    const t = computeTotals(makeState({ vat_mode: "exclusive", vat_rate: 7 }));
    expect(t.amount_before_vat).toBe(200);
    expect(t.vat_amount).toBeCloseTo(14, 2);
    expect(t.grand_total).toBeCloseTo(214, 2);
  });

  it("inclusive 7% extracts VAT from price", () => {
    const t = computeTotals(makeState({ vat_mode: "inclusive", vat_rate: 7 }));
    expect(t.grand_total).toBe(200);
    expect(t.amount_before_vat).toBeCloseTo(186.92, 2);
    expect(t.vat_amount).toBeCloseTo(13.08, 2);
  });

  it("withholding tax reduces net_total", () => {
    const t = computeTotals(makeState({ vat_mode: "exclusive", vat_rate: 7, withholding_tax_enabled: true, withholding_tax_rate: 3 }));
    expect(t.withholding_tax_amount).toBeCloseTo(6, 2);
    expect(t.net_total).toBeCloseTo(208, 2);
  });

  it("bill-level discount applies before VAT", () => {
    const t = computeTotals(makeState({ discount_amount: 50, vat_mode: "exclusive", vat_rate: 7 }));
    expect(t.amount_before_vat).toBe(150);
    expect(t.grand_total).toBeCloseTo(160.5, 2);
  });
});

describe("validateItems", () => {
  it("ignores fully empty rows", () => {
    const v = validateItems([emptyItem(), { ...emptyItem(), name: "A", price: 10, quantity: 1 }]);
    expect(v.valid).toBe(true);
    expect(v.issues).toHaveLength(0);
    expect(v.nonEmpty).toBe(1);
  });

  it("flags row with name but quantity 0", () => {
    const v = validateItems([{ ...emptyItem(), name: "A", price: 10, quantity: 0 }]);
    expect(v.valid).toBe(false);
    expect(v.issues[0].fields).toContain("quantity");
  });

  it("flags row with price NaN", () => {
    const v = validateItems([{ ...emptyItem(), name: "A", price: NaN as any, quantity: 1 }]);
    expect(v.valid).toBe(false);
    expect(v.issues[0].fields).toContain("price");
  });

  it("flags row with price but no name", () => {
    const v = validateItems([{ ...emptyItem(), name: "", price: 100, quantity: 1 }]);
    expect(v.valid).toBe(false);
    expect(v.issues[0].fields).toContain("name");
  });

  it("returns nonEmpty=0 when no rows have any data", () => {
    const v = validateItems([emptyItem(), emptyItem()]);
    expect(v.valid).toBe(false);
    expect(v.nonEmpty).toBe(0);
    expect(v.issues).toHaveLength(0);
  });
});