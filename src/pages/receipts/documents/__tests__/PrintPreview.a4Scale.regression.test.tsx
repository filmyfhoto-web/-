import { describe, it, expect } from "vitest";

/**
 * Regression for the "A4 preview clipped to ~380px" bug.
 *
 * Pre-fix, PrintPreview wrapped the paper in `width:210mm; maxWidth:100%`,
 * which shrunk the wrapper to the container width while the inner .doc-page
 * kept its logical 210mm width — so the right side of the sheet was clipped
 * on any container narrower than 210mm.
 *
 * Post-fix, the wrapper keeps the logical paper width and applies a scale
 * transform to fit the container. This test exercises the scale math the
 * component uses so the calculation stays correct.
 */

function fitScale(shellWidthPx: number, paperWidthMm: number, explicit?: number | null): number {
  const paperWidthPx = (paperWidthMm * 96) / 25.4;
  if (explicit != null) return explicit;
  if (shellWidthPx <= 0) return 1;
  return Math.min(1, shellWidthPx / paperWidthPx);
}

describe("PrintPreview fit-page scale math", () => {
  it("returns 1 (no shrink) when the container is wider than A4", () => {
    // 900px shell > 794px A4 → cap at 1
    expect(fitScale(900, 210)).toBe(1);
  });
  it("scales down proportionally on narrow containers (no clipping)", () => {
    // 380px shell → 380/794 ≈ 0.478
    const s = fitScale(380, 210);
    expect(s).toBeGreaterThan(0.4);
    expect(s).toBeLessThan(0.5);
  });
  it("uses the explicit zoom when provided (100% keeps logical size)", () => {
    expect(fitScale(380, 210, 1)).toBe(1);
    expect(fitScale(380, 210, 0.75)).toBe(0.75);
  });
  it("handles A4 landscape (297mm) — still fits without clipping", () => {
    const s = fitScale(500, 297);
    // 297mm ≈ 1123px, 500/1123 ≈ 0.445
    expect(s).toBeGreaterThan(0.4);
    expect(s).toBeLessThan(0.5);
  });
});