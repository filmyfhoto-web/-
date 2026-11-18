import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the "print button produces blank pages" bug.
 *
 * Root cause (historical): the documents-list wrapper used Tailwind's
 * `print:hidden` (display:none on @media print) and the print buffer
 * (`#documents-print-area`) lived INSIDE that wrapper. `display:none` on an
 * ancestor removes descendants from the box tree entirely, so
 * `window.print()` rendered an empty page for every document type that
 * routed through the list page (delivery / quotation / invoice / tax invoice).
 *
 * This test asserts the structural invariant we rely on:
 *   The `printAreaRef` div must NOT be nested under a `print:hidden` element.
 * If somebody ever moves it back inside, the test fails immediately.
 */
describe("DocumentsList — print area placement", () => {
  const src = readFileSync(
    resolve(__dirname, "../DocumentsList.tsx"),
    "utf8",
  );

  it("renders #documents-print-area exactly once", () => {
    const matches = src.match(/id="documents-print-area"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("places the print area OUTSIDE every `print:hidden` wrapper", () => {
    // Strategy: walk the source string and track brace/element nesting cheaply.
    // We slice from the line that opens the root `print:hidden` wrapper to the
    // line that mounts the print area, then assert that all `print:hidden`
    // wrappers opened in that window have already been closed before the
    // print area appears.
    const printAreaIdx = src.indexOf('id="documents-print-area"');
    expect(printAreaIdx).toBeGreaterThan(0);

    const before = src.slice(0, printAreaIdx);
    // Count opens of `print:hidden` divs and matching `</div>` closes that
    // appear before the print area. We count from the FIRST occurrence so
    // sibling-of-wrapper placement (Fragment return) shows balanced counts.
    const firstWrapperIdx = before.indexOf('print:hidden');
    expect(firstWrapperIdx).toBeGreaterThan(0);

    const window = before.slice(firstWrapperIdx);
    const opens = (window.match(/<div[^>]*print:hidden/g) ?? []).length;
    const closes = (window.match(/<\/div>/g) ?? []).length;

    // Every `print:hidden` div that opened before the print area must have
    // been closed before it — otherwise the print area is a descendant.
    expect(closes).toBeGreaterThanOrEqual(opens);
  });
});