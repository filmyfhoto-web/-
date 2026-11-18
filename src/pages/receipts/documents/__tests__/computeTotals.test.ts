import { describe, it, expect } from "vitest";
import { computeTotals, emptyItem } from "../useDocumentForm";
import type { DocFormState, DocItem } from "../useDocumentForm";

function item(over: Partial<DocItem> = {}): DocItem {
  return { ...emptyItem(), name: "x", quantity: 1, price: 0, ...over };
}

function state(over: Partial<DocFormState>): DocFormState {
  return {
    document_type: "receipt",
    paper_size: "A4",
    document_date: "2026-06-28",
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
    items: [item()],
    ...over,
  } as unknown as DocFormState;
}

describe("computeTotals", () => {
  it("vat_mode=none → vat=0 และ grand_total = subtotal - discount", () => {
    const t = computeTotals(state({ items: [item({ price: 100, quantity: 3 })], discount_amount: 50 }));
    expect(t.subtotal).toBe(300);
    expect(t.vat_amount).toBe(0);
    expect(t.amount_before_vat).toBe(250);
    expect(t.grand_total).toBe(250);
    expect(t.net_total).toBe(250);
  });

  it("vat_mode=exclusive 7% บน 300 → VAT 21.00, ยอดรวม 321.00", () => {
    const t = computeTotals(
      state({ vat_mode: "exclusive", vat_rate: 7, items: [item({ price: 100, quantity: 3 })] }),
    );
    expect(t.amount_before_vat).toBe(300);
    expect(t.vat_amount).toBe(21);
    expect(t.grand_total).toBe(321);
    expect(t.amount_before_vat + t.vat_amount).toBeCloseTo(t.grand_total, 2);
  });

  it("vat_mode=inclusive 7% บน 107 → ก่อน VAT 100.00, VAT 7.00", () => {
    const t = computeTotals(
      state({ vat_mode: "inclusive", vat_rate: 7, items: [item({ price: 107, quantity: 1 })] }),
    );
    expect(t.grand_total).toBe(107);
    expect(t.amount_before_vat).toBe(100);
    expect(t.vat_amount).toBe(7);
  });

  it("ส่วนลด bill-level + VAT 7%: ฐาน VAT คือยอดหลังหักส่วนลด", () => {
    const t = computeTotals(
      state({
        vat_mode: "exclusive",
        vat_rate: 7,
        items: [item({ price: 100, quantity: 10 })],
        discount_amount: 100,
      }),
    );
    expect(t.amount_before_vat).toBe(900);
    expect(t.vat_amount).toBe(63);
    expect(t.grand_total).toBe(963);
  });

  it("ปัดเศษ edge: 33.33 × 3 + VAT 7% → invariant ก่อน VAT + VAT = ยอดรวม", () => {
    const t = computeTotals(
      state({ vat_mode: "exclusive", vat_rate: 7, items: [item({ price: 33.33, quantity: 3 })] }),
    );
    expect(t.amount_before_vat).toBe(99.99);
    expect(t.vat_amount).toBe(7);
    expect(t.grand_total).toBe(106.99);
    expect(Math.round((t.amount_before_vat + t.vat_amount) * 100) / 100).toBe(t.grand_total);
  });

  it("หัก ณ ที่จ่าย 3%: net_total = ยอดรวม - withholding", () => {
    const t = computeTotals(
      state({
        vat_mode: "exclusive",
        vat_rate: 7,
        withholding_tax_enabled: true,
        withholding_tax_rate: 3,
        items: [item({ price: 1000, quantity: 1 })],
      }),
    );
    expect(t.amount_before_vat).toBe(1000);
    expect(t.vat_amount).toBe(70);
    expect(t.grand_total).toBe(1070);
    expect(t.withholding_tax_amount).toBe(30);
    expect(t.net_total).toBe(1040);
  });
});
