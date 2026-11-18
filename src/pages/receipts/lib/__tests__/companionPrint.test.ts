import { describe, it, expect } from "vitest";
import { combinePrintBlocks } from "../printWindow";

/**
 * Regression guard for "ออกใบเสร็จคู่พิมพ์พร้อมกัน" (issue companion receipt
 * and print together). When DocumentForm renders both the main document and
 * a companion receipt into the hidden print area, the print job MUST:
 *   1. Include BOTH `#doc-print` blocks in the order they were rendered.
 *   2. Separate them with a forced page break so they start on fresh pages.
 *   3. Render only the main block when no companion is issued.
 *
 * Breaking any of these silently produces a print job that omits the
 * companion receipt — the exact bug we want to prevent regressing.
 */

function makeBlock(label: string): HTMLElement {
  const el = document.createElement("div");
  el.id = "doc-print";
  el.dataset.label = label;
  el.textContent = label;
  return el;
}

describe("combinePrintBlocks (companion receipt regression)", () => {
  it("returns just the single block when no companion is present", () => {
    const main = makeBlock("INV-001");
    const html = combinePrintBlocks([main]);
    expect(html).toContain('id="doc-print"');
    expect(html).toContain("INV-001");
    // No page-break separator when only one block.
    expect(html).not.toMatch(/break-before:\s*page/);
  });

  it("combines main + companion receipt with a forced page break, in order", () => {
    const main = makeBlock("INV-001");
    const companion = makeBlock("R-001");
    const html = combinePrintBlocks([main, companion]);

    // Both documents must be present.
    expect(html).toContain("INV-001");
    expect(html).toContain("R-001");

    // Main appears before companion.
    expect(html.indexOf("INV-001")).toBeLessThan(html.indexOf("R-001"));

    // A page-break separator sits between them — covers modern + legacy CSS.
    expect(html).toMatch(/break-before:\s*page/);
    expect(html).toMatch(/page-break-before:\s*always/);

    // Exactly two doc-print blocks rendered.
    const matches = html.match(/id="doc-print"/g) ?? [];
    expect(matches).toHaveLength(2);

    // The separator must sit BETWEEN the two blocks, not before the first.
    const sepIdx = html.search(/rds-print-break|break-before:\s*page/);
    expect(sepIdx).toBeGreaterThan(html.indexOf("INV-001"));
    expect(sepIdx).toBeLessThan(html.indexOf("R-001"));
  });

  it("handles 3+ blocks (bulk print) with a break between every pair", () => {
    const a = makeBlock("A");
    const b = makeBlock("B");
    const c = makeBlock("C");
    const html = combinePrintBlocks([a, b, c]);
    const breaks = html.match(/break-before:\s*page/g) ?? [];
    expect(breaks).toHaveLength(2);
    expect(html.indexOf("A")).toBeLessThan(html.indexOf("B"));
    expect(html.indexOf("B")).toBeLessThan(html.indexOf("C"));
  });

  it("returns an empty string when given no blocks (defensive)", () => {
    expect(combinePrintBlocks([])).toBe("");
  });
});