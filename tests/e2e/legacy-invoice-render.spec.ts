import { test, expect } from "@playwright/test";

/**
 * Regression coverage: ใบแจ้งหนี้ (invoice) is no longer in the create
 * flow, but historical rows can still carry document_type="invoice".
 * Every page that renders document rows or aggregates must remain stable
 * when such rows are present — no runtime errors, no missing-label
 * crashes, no broken theme lookups.
 */
test.describe("legacy invoice rows do not break any page", () => {
  for (const path of [
    "/receipts/printing/documents",
    "/receipts/printing/dashboard",
    "/receipts/printing/reports",
  ]) {
    test(`renders ${path} without pageerror`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);

      expect(errors, `no runtime errors on ${path}`).toEqual([]);
    });
  }
});