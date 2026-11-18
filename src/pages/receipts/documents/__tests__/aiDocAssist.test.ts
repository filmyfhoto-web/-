import { describe, it, expect } from "vitest";
import { coerceToQuotation, isAiReadableFile, mapAiResultToForm } from "../aiDocAssist";
import { emptyResult, type BossResult } from "@/lib/bossDocument";

const colorlab = {
  id: "s1", slug: "colorlab", name: "นัฐภรณ์ คัลเลอร์แล็ป",
  vat_enabled: true, default_vat_rate: 7,
} as any;
const printing = {
  id: "s2", slug: "printing", name: "นัฐภรณ์ การพิมพ์",
  vat_enabled: false, default_vat_rate: 0,
} as any;
const current = { paper_size: "A4", template: "modern", document_date: "2026-08-13" } as any;

const base = (o: Partial<BossResult> = {}) => emptyResult(o);

describe("AI ผู้ช่วยออกเอกสาร", () => {
  it("กรณี A: สั่งออกใบส่งของ → บังคับเป็นใบเสนอราคา", () => {
    const r = base({
      documentType: "delivery",
      items: [{ description: "ปากกา", quantity: 10, unit: "ด้าม", unitPrice: 5, amount: 50 }],
      customer: { name: "โรงเรียน A", organization: "", taxId: "", address: "", phone: "" },
    });
    const c = coerceToQuotation(r);
    expect(c.coerced).toBe(true);
    expect(c.result.documentType).toBe("quotation");
    const m = mapAiResultToForm(r, colorlab, current);
    expect(m.patch.document_type).toBe("quotation");
    expect(m.patch.status_workflow).toBe("draft");
    expect(m.notices.some((n) => n.includes("ใบเสนอราคา"))).toBe(true);
  });

  it("กรณี B: รายการจากไฟล์ถูกแปลงเป็นแถวในฟอร์ม", () => {
    const m = mapAiResultToForm(
      base({
        items: [
          { description: "กระดาษ A4", quantity: 20, unit: "รีม", unitPrice: 120, amount: 2400 },
          { description: "", quantity: 1, unit: "", unitPrice: 0, amount: 0 },
        ],
      }),
      colorlab,
      current,
    );
    expect(m.items).toHaveLength(1);
    expect(m.items[0]).toMatchObject({ name: "กระดาษ A4", quantity: 20, unit: "รีม", price: 120 });
  });

  it("กรณี C: ข้อมูลที่ไม่พบต้องขึ้นว่าต้องตรวจสอบ และไม่แต่งข้อมูล", () => {
    const m = mapAiResultToForm(
      base({ items: [{ description: "งานพิมพ์", quantity: 1, unit: "งาน", unitPrice: 500, amount: 500, needsReview: true }] }),
      colorlab,
      current,
    );
    expect(m.patch.customer_name).toBeUndefined();
    expect(m.patch.customer_tax_id).toBeUndefined();
    expect(m.missing).toContain("เลขประจำตัวผู้เสียภาษี");
    expect(m.needsReviewCount).toBe(1);
  });

  it("เลขผู้เสียภาษีที่ไม่ครบ 13 หลักถือว่าไม่พบ", () => {
    const m = mapAiResultToForm(
      base({ customer: { name: "ร้าน B", organization: "", taxId: "123", address: "", phone: "" } }),
      colorlab,
      current,
    );
    expect(m.patch.customer_tax_id).toBeUndefined();
  });

  it("กรณี D/E: ใช้ค่า VAT ของร้านที่เปิดอยู่เท่านั้น", () => {
    const r = base({ vatMode: "inclusive", vatRate: 10 });
    expect(mapAiResultToForm(r, colorlab, current).patch).toMatchObject({ vat_mode: "exclusive", vat_rate: 7 });
    expect(mapAiResultToForm(r, printing, current).patch).toMatchObject({ vat_mode: "none", vat_rate: 0 });
  });

  it("ไฟล์ที่รองรับ/ไม่รองรับ", () => {
    expect(isAiReadableFile({ name: "a.pdf", type: "application/pdf" })).toBe(true);
    expect(isAiReadableFile({ name: "a.xlsx", type: "" })).toBe(true);
    expect(isAiReadableFile({ name: "a.jpg", type: "image/jpeg" })).toBe(true);
    expect(isAiReadableFile({ name: "a.zip", type: "application/zip" })).toBe(false);
    expect(isAiReadableFile({ name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).toBe(true);
    expect(isAiReadableFile({ name: "a.doc", type: "application/msword" })).toBe(false);
  });
});
