import { describe, it, expect } from "vitest";
import { parseDocBotCommand } from "../../supabase/functions/_shared/docBotCommands";
import {
  enforceQuotationFirst,
  parseSourceQuotationRef,
  isNextDocType,
  buildQuotationBlockText,
  quotationSourceReasonOf,
} from "../../supabase/functions/_shared/quotationFirst";
import { wordXmlToText, isDocxFile, isLegacyDocFile } from "../../supabase/functions/_shared/docText";
import { isAiReadableFile, isLegacyDocFile as webLegacyDoc, coerceToQuotation } from "@/pages/receipts/documents/aiDocAssist";

describe("A/B — คำสั่ง “ออกใบส่งของ” ในงานใหม่ ต้องกลายเป็นใบเสนอราคา", () => {
  it("LINE bot: coerce เป็น quotation", () => {
    const cmd = parseDocBotCommand("ออกใบส่งของ คัลเลอร์แล็ป ลูกค้า: โรงเรียน A\nปากกา 10 ด้าม 5");
    expect(cmd).toBeTruthy();
    expect(cmd!.docType).toBe("delivery_note");
    const out = enforceQuotationFirst(cmd!, null);
    expect(out.coerced).toBe(true);
    expect(out.command.docType).toBe("quotation");
    expect(out.notices.join(" ")).toContain("ใบเสนอราคา");
    // ข้อมูลรายการยังอยู่ครบ ไม่แต่งเพิ่ม
    expect(out.command.fields.items.length).toBe(cmd!.fields.items.length);
  });

  it("Web/AI: coerceToQuotation บังคับใบเสนอราคา", () => {
    const res = coerceToQuotation({ documentType: "receipt", items: [] } as never);
    expect(res.result.documentType).toBe("quotation");
    expect(res.coerced).toBe(true);
  });
});

describe("C — “พร้อม: ใบส่งของ, ใบเสร็จ” ในงานใหม่ ต้องไม่สร้าง companion", () => {
  it("ตัด companions ที่เป็นเอกสารขั้นถัดไปออก", () => {
    const cmd = parseDocBotCommand(
      "ออกใบเสนอราคา คัลเลอร์แล็ป ลูกค้า: โรงเรียน A\nปากกา 10 ด้าม 5\nพร้อม: ใบส่งของ, ใบเสร็จ",
    );
    expect(cmd).toBeTruthy();
    const out = enforceQuotationFirst(cmd!, null);
    expect(out.command.doc?.companions ?? []).toEqual([]);
    expect(out.droppedCompanions.length).toBeGreaterThan(0);
    expect(out.notices.join(" ")).toContain("QT-");
  });
});

describe("อ้างอิงใบเสนอราคาต้นทาง", () => {
  it.each([
    ["สร้างใบส่งของจาก QT-2026-0001", "QT-2026-0001"],
    ["ออกใบเสร็จจากใบเสนอราคา QT-2026-0007", "QT-2026-0007"],
    ["ออกใบกำกับภาษี อ้างอิงใบเสนอราคา qt2026-0009", "QT2026-0009"],
  ])("%s", (text, expected) => {
    expect(parseSourceQuotationRef(text)).toBe(expected);
  });

  it("งานใหม่ไม่มีการอ้างอิง → null", () => {
    expect(parseSourceQuotationRef("ออกใบส่งของ ลูกค้า: โรงเรียน A")).toBeNull();
  });

  it("มีต้นทางแล้วไม่ coerce", () => {
    const cmd = parseDocBotCommand("ออกใบส่งของ ลูกค้า: A\nปากกา 10 ด้าม 5")!;
    const out = enforceQuotationFirst(cmd, "QT-2026-0001");
    expect(out.coerced).toBe(false);
    expect(out.command.docType).toBe("delivery_note");
  });

  it("รู้จักเอกสารขั้นถัดไปครบ", () => {
    expect(isNextDocType("delivery_note")).toBe(true);
    expect(isNextDocType("receipt")).toBe(true);
    expect(isNextDocType("tax_receipt")).toBe(true);
    expect(isNextDocType("quotation")).toBe(false);
  });
});

describe("D/E/G — ข้อความปฏิเสธจาก backend", () => {
  it("map error ของฐานข้อมูลเป็นเหตุผล", () => {
    expect(quotationSourceReasonOf("quotation_required: ต้องเริ่มจากใบเสนอราคา")).toBe("quotation_required");
    expect(quotationSourceReasonOf("source_not_issued: ...")).toBe("source_not_issued");
    expect(quotationSourceReasonOf("source_store_mismatch: ...")).toBe("source_store_mismatch");
    expect(quotationSourceReasonOf("boom")).toBeNull();
  });
  it("ข้อความอธิบายชัดเจน ไม่สร้างเอกสาร", () => {
    expect(buildQuotationBlockText("quotation_required")).toContain("ใบเสนอราคา");
    expect(buildQuotationBlockText("source_not_issued", "QT-1")).toContain("ฉบับร่าง");
    expect(buildQuotationBlockText("source_store_mismatch", "QT-1")).toContain("อีกร้าน");
  });
});

describe("H — อ่านไฟล์ Word (.docx)", () => {
  it("แปลง WordprocessingML เป็นข้อความ + ตาราง", () => {
    const xml = `<w:document><w:body>
      <w:p><w:r><w:t>ลูกค้า: โรงเรียนบ้านน่าน</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>ปากกา</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>10 ด้าม</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>5</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>`;
    const text = wordXmlToText(xml);
    expect(text).toContain("ลูกค้า: โรงเรียนบ้านน่าน");
    expect(text).toContain("ปากกา");
    expect(text).toContain("10 ด้าม");
  });

  it("รู้จักชนิดไฟล์ docx และปฏิเสธ .doc รุ่นเก่าอย่างชัดเจน", () => {
    expect(isDocxFile("", "ใบสั่งซื้อ.docx")).toBe(true);
    expect(isLegacyDocFile("application/msword", "old.doc")).toBe(true);
    // ฝั่งเว็บ
    expect(isAiReadableFile({ name: "a.docx" })).toBe(true);
    expect(isAiReadableFile({ name: "a.doc", type: "application/msword" })).toBe(false);
    expect(webLegacyDoc({ name: "a.doc" })).toBe(true);
    // ชนิดเดิมยังรองรับ
    for (const n of ["a.pdf", "a.xlsx", "a.csv", "a.txt"]) expect(isAiReadableFile({ name: n })).toBe(true);
    expect(isAiReadableFile({ name: "a.png", type: "image/png" })).toBe(true);
  });
});

describe("I — ไม่แต่งข้อมูลเมื่อฟิลด์ขาด", () => {
  it("ไม่มีชื่อลูกค้า/ราคา → ขึ้นรายการที่ต้องตรวจสอบ ไม่เดาค่า", () => {
    const cmd = parseDocBotCommand("ออกใบส่งของ คัลเลอร์แล็ป\nปากกา 10 ด้าม");
    const out = enforceQuotationFirst(cmd!, null);
    expect(out.command.docType).toBe("quotation");
    expect(out.command.missing.length).toBeGreaterThan(0);
    expect(out.command.fields.customerTaxId ?? null).toBeNull();
    expect(out.command.fields.customerPhone ?? null).toBeNull();
  });
});
