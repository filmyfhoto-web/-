import { describe, it, expect } from "vitest";
import { computePdfSlices } from "@/lib/pdfSlices";

describe("computePdfSlices", () => {
  it("เอกสารสั้นกว่าหนึ่งหน้า = ชิ้นเดียว", () => {
    expect(computePdfSlices(500, 1000)).toEqual([{ sourceY: 0, heightPx: 500, index: 0 }]);
  });

  it("เอกสารยาวเกิน 2 หน้า ตัดเป็นหลายชิ้นและชิ้นสุดท้ายสูงเท่าเศษจริง", () => {
    const slices = computePdfSlices(2500, 1000);
    expect(slices.length).toBe(3);
    expect(slices.map((s) => s.sourceY)).toEqual([0, 1000, 2000]);
    expect(slices.map((s) => s.heightPx)).toEqual([1000, 1000, 500]);
    expect(slices.at(-1)!.heightPx).toBe(500);
  });

  it("ไม่มีเศษหาย — ผลรวมทุกชิ้นเท่าความสูงทั้งหมดเสมอ", () => {
    for (const [h, p] of [[2500, 1000], [3001, 700], [9999, 333], [1200, 400]]) {
      const slices = computePdfSlices(h, p);
      expect(slices.reduce((s, x) => s + x.heightPx, 0)).toBe(h);
      // ชิ้นต่อกันสนิท ไม่ทับ ไม่ข้าม
      slices.forEach((s, i) => expect(s.sourceY).toBe(i === 0 ? 0 : slices[i - 1].sourceY + slices[i - 1].heightPx));
      expect(slices.every((s) => s.heightPx <= p)).toBe(true);
    }
  });

  it("หารลงตัวพอดี ไม่สร้างหน้าเปล่าเกินมา", () => {
    const slices = computePdfSlices(3000, 1000);
    expect(slices.length).toBe(3);
    expect(slices.at(-1)!.heightPx).toBe(1000);
  });

  it("ค่าขอบ: ความสูง 0 หรือ page ไม่ถูกต้อง", () => {
    expect(computePdfSlices(0, 1000)).toEqual([]);
    expect(computePdfSlices(800, 0)).toEqual([{ sourceY: 0, heightPx: 800, index: 0 }]);
    expect(computePdfSlices(800, -5)).toEqual([{ sourceY: 0, heightPx: 800, index: 0 }]);
  });
});