import { describe, it, expect } from "vitest";
import { paginateMainDocument, fitFontScaleToOnePage } from "../paginate";

const base = {
  paperSize: "A4" as const,
  orient: "portrait" as const,
  marginsMm: { top: 12, right: 12, bottom: 12, left: 12 },
  trailerMm: 40,
};

const items = (n: number) => Array.from({ length: n }, () => ({ descLines: 0, nameLen: 12 }));

describe("paginator reserves the full (unscaled) header height", () => {
  it("does not gain capacity from the header when the font shrinks", () => {
    // The header is pinned to --doc-font-scale: 1 in print CSS, so shrinking
    // the font must not free up header space in the capacity model.
    const at1 = paginateMainDocument({ ...base, fontScale: 1, items: items(20) });
    const at05 = paginateMainDocument({ ...base, fontScale: 0.5, items: items(20) });
    expect(at1.length).toBeGreaterThanOrEqual(1);
    expect(at05.length).toBeLessThanOrEqual(at1.length);

    // Capacity gain must come only from row/trailer shrink, never the header:
    // 20 rows at scale 1 vs the same rows re-measured with a fixed header.
    const contentH = 297 - 24;
    const capacity = contentH - 62 - 9 * 0.5 - 40 * 0.5 - 4;
    const rowsThatFit = Math.floor(capacity / (8 * 0.5));
    expect(rowsThatFit).toBeGreaterThan(0);
    const fitting = paginateMainDocument({ ...base, fontScale: 0.5, items: items(rowsThatFit) });
    expect(fitting).toHaveLength(1);
    const overflowing = paginateMainDocument({ ...base, fontScale: 0.5, items: items(rowsThatFit + 4) });
    expect(overflowing.length).toBeGreaterThan(1);
  });

  it("fitFontScaleToOnePage never reports a fit that the paginator rejects", () => {
    for (const n of [10, 25, 45, 80, 150]) {
      const res = fitFontScaleToOnePage({ ...base, items: items(n) }, { min: 0.5 });
      const pages = paginateMainDocument({ ...base, fontScale: res.fontScale, items: items(n) });
      if (res.fits) expect(pages).toHaveLength(1);
    }
  });
});
