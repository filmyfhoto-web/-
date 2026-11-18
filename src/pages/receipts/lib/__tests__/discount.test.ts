import { describe, it, expect } from "vitest";
import { parseDiscountInput, checkDiscount, afterDiscount, round2 } from "../discount";
import { computeTotals, emptyItem, type DocFormState } from "../../documents/useDocumentForm";

describe("parseDiscountInput", () => {
  it("ค่าว่าง/null → 0", () => {
    expect(parseDiscountInput("")).toBe(0);
    expect(parseDiscountInput("   ")).toBe(0);
    expect(parseDiscountInput(null)).toBe(0);
    expect(parseDiscountInput(undefined)).toBe(0);
  });

  it("ตัวเลขทศนิยมและมี comma / ฿ / ช่องว่าง", () => {
    expect(parseDiscountInput("1,234.56")).toBe(1234.56);
    expect(parseDiscountInput(" ฿ 250.50 ")).toBe(250.5);
    expect(parseDiscountInput(".5")).toBe(0.5);
    expect(parseDiscountInput("100.")).toBe(100);
  });

  it("ตัวเลขไทย", () => {
    expect(parseDiscountInput("๑๒๓.๕๐")).toBe(123.5);
  });

  it("รูปแบบผิด → NaN", () => {
    expect(Number.isNaN(parseDiscountInput("abc"))).toBe(true);
    expect(Number.isNaN(parseDiscountInput("1.2.3"))).toBe(true);
    expect(Number.isNaN(parseDiscountInput("50%"))).toBe(true);
    expect(Number.isNaN(parseDiscountInput(NaN))).toBe(true);
    expect(Number.isNaN(parseDiscountInput(Infinity))).toBe(true);
  });

  it("ค่าติดลบยังคงอ่านได้ (ไปตรวจต่อที่ checkDiscount)", () => {
    expect(parseDiscountInput("-20")).toBe(-20);
  });
});

describe("checkDiscount", () => {
  it("ค่าปกติผ่าน", () => {
    const c = checkDiscount("150.25", 1000);
    expect(c.problem).toBeNull();
    expect(c.effective).toBe(150.25);
    expect(c.message).toBeNull();
  });

  it("รูปแบบผิด → 0 พร้อมข้อความเตือน", () => {
    const c = checkDiscount("ห้าสิบ", 1000);
    expect(c.problem).toBe("invalid");
    expect(c.effective).toBe(0);
    expect(c.message).toBeTruthy();
  });

  it("ติดลบ → 0", () => {
    const c = checkDiscount(-99, 1000);
    expect(c.problem).toBe("negative");
    expect(c.effective).toBe(0);
  });

  it("เกินยอดก่อนหัก → จำกัดที่ยอดก่อนหัก", () => {
    const c = checkDiscount(1500, 1000);
    expect(c.problem).toBe("exceeds");
    expect(c.effective).toBe(1000);
  });

  it("เท่ากับยอดพอดี (รวมเศษปัด) ไม่ถือว่าเกิน", () => {
    expect(checkDiscount(99.99, 99.99).problem).toBeNull();
    expect(checkDiscount(100.001, 100).problem).toBeNull();
  });

  it("subtotal ผิดรูปแบบ → ถือเป็น 0", () => {
    const c = checkDiscount(50, NaN);
    expect(c.effective).toBe(0);
    expect(c.problem).toBe("exceeds");
  });
});

describe("afterDiscount", () => {
  it("ไม่ติดลบไม่ว่ากรอกอะไร", () => {
    expect(afterDiscount(500, 200)).toBe(300);
    expect(afterDiscount(500, 9999)).toBe(0);
    expect(afterDiscount(500, "abc")).toBe(500);
    expect(afterDiscount(500, -50)).toBe(500);
  });

  it("ทศนิยมปัด 2 ตำแหน่ง", () => {
    expect(afterDiscount(100.1, "0.05")).toBe(100.05);
    expect(round2(33.335)).toBe(33.34);
  });
});

function state(over: Partial<DocFormState>): DocFormState {
  return {
    document_type: "receipt",
    paper_size: "A4",
    document_date: "2026-08-25",
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
    items: [{ ...emptyItem(), name: "A", price: 100, quantity: 1 }],
    ...over,
  } as unknown as DocFormState;
}

describe("computeTotals กับส่วนลดที่ผ่าน checkDiscount แล้ว", () => {
  it("ส่วนลดเกินยอดถูกจำกัด → ยอดรวมเป็น 0 ไม่ติดลบ", () => {
    const sub = computeTotals(state({ discount_amount: 0 })).subtotal;
    const eff = checkDiscount(5000, sub).effective;
    const t = computeTotals(state({ discount_amount: eff }));
    expect(t.grand_total).toBe(0);
    expect(t.net_total).toBeGreaterThanOrEqual(0);
  });

  it("ส่วนลดทศนิยมกับ VAT 7% ยังคง invariant ก่อน VAT + VAT = ยอดรวม", () => {
    const items = [{ ...emptyItem(), name: "A", price: 33.33, quantity: 3 }];
    const sub = computeTotals(state({ items, discount_amount: 0 })).subtotal;
    const eff = checkDiscount("9.99", sub).effective;
    const t = computeTotals(state({ items, discount_amount: eff, vat_mode: "exclusive", vat_rate: 7 }));
    expect(t.amount_before_vat).toBe(90);
    expect(round2(t.amount_before_vat + t.vat_amount)).toBe(t.grand_total);
  });
});
