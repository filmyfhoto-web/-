import { describe, it, expect } from "vitest";
import { computeTotals, lineAmount, normalizeResult, round2, verifyResult, emptyResult } from "../bossDocument";

const it1 = { description: "อัดรูป 4x6", quantity: 3, unit: "ใบ", unitPrice: 10.1, amount: 30.3 };
const it2 = { description: "เคลือบ", quantity: 2, unit: "แผ่น", unitPrice: 25.5, amount: 51 };

describe("boss calculator", () => {
  it("quantity × unitPrice", () => {
    expect(lineAmount({ quantity: 3, unitPrice: 10.1 })).toBe(30.3);
    expect(lineAmount({ quantity: 7, unitPrice: 0.1 })).toBe(0.7);
  });

  it("subtotal หลายรายการ", () => {
    expect(computeTotals([it1, it2], "none", 7).subtotal).toBe(81.3);
  });

  it("VAT 7% แบบบวกทีหลัง", () => {
    const t = computeTotals([{ ...it1, quantity: 10, unitPrice: 100, amount: 1000 }], "exclusive", 7);
    expect(t.vatBase).toBe(1000);
    expect(t.vatAmount).toBe(70);
    expect(t.grandTotal).toBe(1070);
  });

  it("VAT inclusive ถอด VAT ถูกต้อง", () => {
    const t = computeTotals([{ ...it1, quantity: 1, unitPrice: 107, amount: 107 }], "inclusive", 7);
    expect(t.grandTotal).toBe(107);
    expect(t.vatBase).toBe(100);
    expect(t.vatAmount).toBe(7);
    expect(t.subtotal).toBe(100);
  });

  it("VAT inclusive: subtotal = grand - vat หลายรายการ", () => {
    const t = computeTotals(
      [
        { ...it1, quantity: 2, unitPrice: 53.5, amount: 107 },
        { ...it2, quantity: 1, unitPrice: 100, amount: 100 },
      ],
      "inclusive",
      7,
    );
    expect(t.grandTotal).toBe(207);
    expect(t.vatAmount).toBe(13.54);
    expect(t.subtotal).toBe(193.46);
  });

  it("rounding 2 decimals", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(lineAmount({ quantity: 3, unitPrice: 0.335 })).toBe(1.01);
    expect(computeTotals([{ ...it1, quantity: 3, unitPrice: 33.33, amount: 0 }], "exclusive", 7).vatAmount).toBe(7);
  });

  it("mismatch detection ทำให้สร้างเอกสารไม่ได้", () => {
    const bad = emptyResult({ vatMode: "none", items: [it1], subtotal: 999, grandTotal: 999 });
    const v = verifyResult(bad);
    expect(v.ok).toBe(false);
    expect(v.subtotalMatches).toBe(false);
    expect(v.issues.length).toBeGreaterThan(0);
  });

  it("AI result ที่เลขผิดต้องถูก local calculator override และเตือน", () => {
    const r = normalizeResult(
      emptyResult({ vatMode: "exclusive", vatRate: 7, items: [{ ...it1, amount: 99 }], subtotal: 99, vatAmount: 1, grandTotal: 100 }),
    );
    expect(r.items[0].amount).toBe(30.3);
    expect(r.items[0].needsReview).toBe(true);
    expect(r.subtotal).toBe(30.3);
    expect(r.vatAmount).toBe(2.12);
    expect(r.grandTotal).toBe(32.42);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.arithmeticVerified).toBe(true);
  });
});
