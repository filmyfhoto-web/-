import { describe, it, expect } from "vitest";
import {
  PAPER_SIZES,
  getPaperSizeMm,
  mmToPx,
  computeFitScale,
  computeAutoFitScale,
  MIN_AUTO_FIT_SCALE,
  MIN_VIEWPORT_SCALE,
  computeViewportFitScale,
  computeWrapperHeightPx,
} from "@/lib/printScale";

describe("PAPER_SIZES", () => {
  it("matches locked A4 mm values", () => {
    expect(PAPER_SIZES.A4).toEqual({ widthMm: 210, heightMm: 297 });
  });

  it("has all required paper keys", () => {
    for (const key of ["A4", "A5", "80mm", "100x70", "100x75"] as const) {
      expect(PAPER_SIZES[key].widthMm).toBeGreaterThan(0);
      expect(PAPER_SIZES[key].heightMm).toBeGreaterThan(0);
    }
  });

  it("swaps width/height for landscape", () => {
    expect(getPaperSizeMm("A5", "landscape")).toEqual({ widthMm: 210, heightMm: 148 });
    expect(getPaperSizeMm("A5", "portrait")).toEqual({ widthMm: 148, heightMm: 210 });
  });
});

describe("mmToPx", () => {
  it("converts using 96dpi CSS reference", () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 5);
    expect(mmToPx(210)).toBeCloseTo(793.7, 1);
  });
});

describe("computeFitScale", () => {
  it("never upscales past maxScale", () => {
    const scale = computeFitScale({ width: 100, height: 100 }, { width: 1000, height: 1000 });
    expect(scale).toBe(1);
  });

  it("shrinks to fit a narrower container", () => {
    const scale = computeFitScale({ width: 800, height: 1000 }, { width: 400, height: 1000 }, { minScale: 0 });
    expect(scale).toBeCloseTo(0.5, 5);
  });

  it("clamps to minScale so text never disappears", () => {
    const scale = computeFitScale(
      { width: 800, height: 1000 },
      { width: 100, height: 100 },
      { minScale: 0.75 },
    );
    expect(scale).toBe(0.75);
  });

  it("returns maxScale when container has no measured size yet", () => {
    expect(computeFitScale({ width: 800, height: 1000 }, { width: 0, height: 0 })).toBe(1);
  });
});

describe("computeAutoFitScale (พอดีกระดาษอัตโนมัติ)", () => {
  it("leaves small content untouched at scale 1", () => {
    const scale = computeAutoFitScale({ width: 500, height: 500 }, { width: 800, height: 1000 });
    expect(scale).toBe(1);
  });

  it("shrinks only when content overflows the printable area", () => {
    const scale = computeAutoFitScale({ width: 800, height: 2000 }, { width: 800, height: 1000 });
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(MIN_AUTO_FIT_SCALE);
  });

  it("never shrinks below the minimum readable scale", () => {
    const scale = computeAutoFitScale({ width: 800, height: 20000 }, { width: 800, height: 1000 });
    expect(scale).toBe(MIN_AUTO_FIT_SCALE);
  });
});

describe("computeViewportFitScale (สเกลพรีวิวบนหน้าจอ — สูตรเดียวของทั้งระบบ)", () => {
  const a4Px = mmToPx(PAPER_SIZES.A4.widthMm); // ~793.7px @96dpi

  it("A4 ในคอนเทนเนอร์ 350px ย่อประมาณ 0.44", () => {
    const scale = computeViewportFitScale(a4Px, 350);
    expect(scale).toBeCloseTo(350 / a4Px, 5);
    expect(scale).toBeGreaterThan(0.3);
    expect(scale).toBeLessThan(0.6);
  });

  it("มือถือ 390px (หัก padding ~358px) A4 ยังไม่ล้นแนวนอน", () => {
    const container = 358;
    const scale = computeViewportFitScale(a4Px, container);
    expect(a4Px * scale).toBeLessThanOrEqual(container + 1);
  });

  it("ไม่ขยายเกิน 1 แม้คอนเทนเนอร์กว้างมาก", () => {
    expect(computeViewportFitScale(a4Px, 4000)).toBe(1);
    expect(computeViewportFitScale(mmToPx(80), 1200)).toBe(1);
  });

  it("กระดาษเล็กทุกขนาดพอดีจอ 390 โดยไม่ต้องย่อถึงพื้น", () => {
    for (const key of ["A5", "80mm", "100x70", "100x75"] as const) {
      const scale = computeViewportFitScale(mmToPx(PAPER_SIZES[key].widthMm), 358);
      expect(scale).toBeGreaterThan(MIN_VIEWPORT_SCALE);
      expect(scale).toBeLessThanOrEqual(1);
    }
  });

  it("floor ทำงานเฉพาะกรณีจอแคบสุดขั้ว", () => {
    expect(computeViewportFitScale(a4Px, 40)).toBe(MIN_VIEWPORT_SCALE);
    expect(computeViewportFitScale(a4Px, 200)).toBeGreaterThan(MIN_VIEWPORT_SCALE);
  });

  it("ยังไม่ได้วัดคอนเทนเนอร์ = 1 (กัน NaN กระพริบ)", () => {
    expect(computeViewportFitScale(a4Px, 0)).toBe(1);
    expect(computeViewportFitScale(0, 300)).toBe(1);
  });
});

describe("computeWrapperHeightPx (จองพื้นที่ตามความสูงจริงที่เรนเดอร์)", () => {
  const a4H = mmToPx(PAPER_SIZES.A4.heightMm);

  it("เอกสารยาวหลายหน้า จองตามความสูงจริงที่ถูกย่อแล้ว", () => {
    const content = a4H * 3.2;
    expect(computeWrapperHeightPx(a4H, content, 0.44)).toBeCloseTo(content * 0.44, 5);
  });

  it("เอกสารสั้นกว่ากระดาษ ยังจองเต็มแผ่น", () => {
    expect(computeWrapperHeightPx(a4H, 100, 0.5)).toBeCloseTo(a4H * 0.5, 5);
  });

  it("ยังไม่ได้วัดเนื้อหา ไม่คืน NaN", () => {
    expect(computeWrapperHeightPx(a4H, 0, 1)).toBeCloseTo(a4H, 5);
    expect(Number.isNaN(computeWrapperHeightPx(0, 0, 0))).toBe(false);
  });
});
