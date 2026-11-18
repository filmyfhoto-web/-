import { describe, it, expect } from "vitest";

/**
 * Guard the math that DocumentsList uses to detect listQ/countQ drift.
 * For every page in a range, the number of rows returned by listQ MUST equal
 * `min(pageSize, totalCount - page * pageSize)` — otherwise rows are missing
 * or duplicated between pages.
 */
function expectedRowsForPage(totalCount: number, page: number, pageSize: number) {
  return Math.max(0, Math.min(pageSize, totalCount - page * pageSize));
}

describe("DocumentsList pagination expectations", () => {
  const cases: Array<{ total: number; pageSize: number }> = [
    { total: 0, pageSize: 50 },
    { total: 1, pageSize: 50 },
    { total: 50, pageSize: 50 },
    { total: 226, pageSize: 50 },
    { total: 226, pageSize: 100 },
    { total: 226, pageSize: 200 },
    { total: 1000, pageSize: 200 },
  ];

  for (const { total, pageSize } of cases) {
    it(`sums to total for total=${total}, pageSize=${pageSize}`, () => {
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      let sum = 0;
      for (let p = 0; p < pageCount; p++) {
        const n = expectedRowsForPage(total, p, pageSize);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(pageSize);
        sum += n;
      }
      expect(sum).toBe(total);
    });
  }

  it("returns 0 for pages past the end", () => {
    expect(expectedRowsForPage(100, 5, 50)).toBe(0);
  });
});