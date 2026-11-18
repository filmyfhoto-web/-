import { describe, it, expect } from "vitest";
import { paginateMainDocument, PAPER_MM_BASE } from "../paginate";

function items(n: number) {
  return Array.from({ length: n }).map(() => ({ descLines: 0, nameLen: 20 }));
}

describe("paginate paper size support", () => {
  it("A4 portrait returns 210mm × 297mm pages", () => {
    const pages = paginateMainDocument({
      paperSize: "A4",
      orient: "portrait",
      marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
      fontScale: 1,
      items: items(5),
      trailerMm: 72,
    });
    expect(pages[0].widthMm).toBe(210);
    expect(pages[0].heightMm).toBe(297);
  });

  it("Letter portrait returns 216mm × 279mm pages", () => {
    const pages = paginateMainDocument({
      paperSize: "Letter",
      orient: "portrait",
      marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
      fontScale: 1,
      items: items(5),
      trailerMm: 72,
    });
    expect(pages[0].widthMm).toBe(216);
    expect(pages[0].heightMm).toBe(279);
  });

  it("Letter (shorter than A4) never fits fewer items per page than A4", () => {
    const common = {
      orient: "portrait" as const,
      marginsMm: { top: 14, right: 12, bottom: 14, left: 12 },
      fontScale: 1,
      items: items(60),
      trailerMm: 72,
    };
    const a4 = paginateMainDocument({ paperSize: "A4", ...common });
    const letter = paginateMainDocument({ paperSize: "Letter", ...common });
    // Letter is ~18mm shorter than A4 → same item count needs at least as many pages.
    expect(letter.length).toBeGreaterThanOrEqual(a4.length);
  });

  it("PAPER_MM_BASE exposes A4 and Letter constants", () => {
    expect(PAPER_MM_BASE.A4).toEqual({ w: 210, h: 297 });
    expect(PAPER_MM_BASE.Letter).toEqual({ w: 216, h: 279 });
  });
});