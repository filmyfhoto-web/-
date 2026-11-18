import { describe, it, expect } from "vitest";
import { buildPrintHtml } from "../printWindow";
import { PAPER_SIZES, PaperKey } from "@/lib/printScale";

const KEYS = Object.keys(PAPER_SIZES) as PaperKey[];

function pageRule(paper: string, orient: "portrait" | "landscape" = "portrait") {
  const html = buildPrintHtml({ bodyHtml: "<div id='doc-print'>เนื้อหาทดสอบพิมพ์</div>", paperSize: paper, orient });
  return html.match(/@page \{ size: ([^;]+);/)?.[1]?.trim() ?? "";
}

describe("@page mapping — preset ที่ระบบรองรับต้องลงไปในผลลัพธ์พิมพ์จริง", () => {
  it("A4/A5 ใช้ชื่อกระดาษมาตรฐาน + orientation", () => {
    expect(pageRule("A4")).toBe("A4 portrait");
    expect(pageRule("A5", "landscape")).toBe("A5 landscape");
  });

  it("80mm และ label presets ใช้ค่ามิลลิเมตรจาก PAPER_SIZES (ไม่ fallback เป็น A4)", () => {
    for (const key of ["80mm", "100x70", "100x75"] as const) {
      const { widthMm, heightMm } = PAPER_SIZES[key];
      expect(pageRule(key)).toBe(`${widthMm}mm ${heightMm}mm`);
      expect(pageRule(key, "landscape")).toBe(`${heightMm}mm ${widthMm}mm`);
      expect(pageRule(key)).not.toMatch(/A4/i);
    }
  });

  it("ทุก preset ใน PAPER_SIZES ผลิต @page ได้และไม่ว่าง", () => {
    for (const key of KEYS) {
      expect(pageRule(key).length).toBeGreaterThan(2);
    }
  });

  it("ค่ามิลลิเมตรตรง ๆ ถูกส่งผ่านเหมือนเดิม และค่าที่ไม่รู้จักถอยกลับ A4", () => {
    expect(pageRule("210mm 297mm")).toBe("210mm 297mm");
    expect(pageRule("weird-paper")).toBe("A4 portrait");
  });
});