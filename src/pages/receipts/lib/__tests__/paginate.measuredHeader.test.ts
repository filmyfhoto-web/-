import { describe, it, expect, beforeEach } from "vitest";
import {
  paginateMainDocument,
  fitFontScaleToOnePage,
  setMeasuredHeaderMm,
  getMeasuredHeaderMm,
  clearMeasuredHeaderMm,
  HEADER_FULL_MM,
} from "../paginate";

const base = {
  paperSize: "A4" as const,
  orient: "portrait" as const,
  marginsMm: { top: 12, right: 12, bottom: 12, left: 12 },
  trailerMm: 40,
};
const items = (n: number) => Array.from({ length: n }, () => ({ descLines: 0, nameLen: 12 }));

describe("paginator uses the real measured header height", () => {
  beforeEach(() => clearMeasuredHeaderMm());

  it("a taller real header reduces the number of rows that fit on page 1", () => {
    const withFallback = paginateMainDocument({ ...base, fontScale: 1, items: items(20) });
    const withTallHeader = paginateMainDocument({
      ...base,
      fontScale: 1,
      items: items(20),
      headerFullMm: HEADER_FULL_MM + 40,
    });
    expect(withTallHeader[0].count).toBeLessThan(withFallback[0].count);
  });

  it("ignores nonsense measurements and falls back to the tuned constant", () => {
    const fallback = paginateMainDocument({ ...base, fontScale: 1, items: items(20) });
    const bogus = paginateMainDocument({ ...base, fontScale: 1, items: items(20), headerFullMm: 0 });
    expect(bogus[0].count).toBe(fallback[0].count);
  });

  it("auto-fit never reports one page when the real header is bigger", () => {
    const input = { ...base, items: items(28), headerFullMm: HEADER_FULL_MM + 30 };
    const res = fitFontScaleToOnePage(input, { min: 0.8 });
    if (res.fits) {
      expect(paginateMainDocument({ ...input, fontScale: res.fontScale })).toHaveLength(1);
    }
    expect(res.fontScale).toBeGreaterThanOrEqual(0.8);
  });

  it("stores and clears published measurements", () => {
    setMeasuredHeaderMm({ full: 71.4, compact: 20.2 });
    expect(getMeasuredHeaderMm()).toEqual({ full: 71.4, compact: 20.2 });
    setMeasuredHeaderMm({ full: 1 }); // rejected as noise, keeps last good value
    expect(getMeasuredHeaderMm().full).toBe(71.4);
    setMeasuredHeaderMm({ compact: null });
    expect(getMeasuredHeaderMm()).toEqual({ full: 71.4, compact: null });
    clearMeasuredHeaderMm();
    expect(getMeasuredHeaderMm()).toEqual({ full: null, compact: null });
  });
});
