import { test, expect } from "@playwright/test";

/**
 * Smoke coverage for the type-change flow. The numbering/prefix invariants
 * (different prefix per type, no collisions, related_document_no link)
 * are exercised by the unit tests in `__tests__/typeChange.test.ts`. Here
 * we only assert that the public list page renders without runtime errors
 * and never exposes the deprecated "ใบแจ้งหนี้" option in its create flow.
 */
test.describe("document type change", () => {
  test("documents list renders without runtime errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/receipts/printing/documents");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    expect(errors, "no runtime errors on /documents").toEqual([]);
  });

  test("create-new dropdown HTML does not contain the deprecated invoice type", async ({ page }) => {
    await page.goto("/receipts/printing/documents");
    await page.waitForLoadState("domcontentloaded");
    // The create menu is rendered behind auth gating in some envs, so we
    // assert against the raw page HTML — the type literal `value="invoice"`
    // must not appear anywhere in the create flow.
    const html = await page.content();
    // Allow the legacy label to exist for rendering OLD rows, but reject
    // any `value="invoice"` option entry that would let users create one.
    expect(html).not.toMatch(/value="invoice"/);
  });
});