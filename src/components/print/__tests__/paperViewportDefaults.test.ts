import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MIN_VIEWPORT_SCALE, PAPER_SIZES, mmToPx, computeViewportFitScale } from "@/lib/printScale";

const SOURCE = readFileSync(resolve(process.cwd(), "src/components/print/PaperViewport.tsx"), "utf8");

describe("PaperViewport defaults (regression: A4 ต้อง fit มือถือ 390px)", () => {
  it("default minScale ใช้ MIN_VIEWPORT_SCALE ไม่ใช่ 1", () => {
    expect(SOURCE).toMatch(/minScale = MIN_VIEWPORT_SCALE/);
    expect(SOURCE).not.toMatch(/minScale = 1\b/);
  });

  it("import MIN_VIEWPORT_SCALE จาก shared helper", () => {
    expect(SOURCE).toMatch(/MIN_VIEWPORT_SCALE.*from "@\/lib\/printScale"/s);
  });

  it("comment ไม่บอกว่า default = 1 / no shrink อีกต่อไป", () => {
    expect(SOURCE).not.toMatch(/Default 1 = no shrink/);
    expect(SOURCE).toMatch(/MIN_VIEWPORT_SCALE`?, ~0\.15\), NOT 1/);
  });

  it("floor เริ่มต้นเล็กพอให้ A4 ย่อลงพอดีจอ 390px (fit ได้จริง)", () => {
    const a4 = mmToPx(PAPER_SIZES.A4.widthMm);
    const scale = computeViewportFitScale(a4, 358, MIN_VIEWPORT_SCALE);
    expect(scale).toBeLessThan(0.6);
    expect(a4 * scale).toBeLessThanOrEqual(359);
  });
});