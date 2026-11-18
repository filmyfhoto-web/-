import { test, expect } from "@playwright/test";
import {
  DELIVERY_WITH_RECEIPT_COMPANION,
  renderIssueAndReprintPage,
} from "./fixtures/documents";
import {
  COMPANION_SEED_INIT,
  FIXED_DELIVERY_NO,
  FIXED_RECEIPT_NO,
} from "./fixtures/companionDocNumbers";

/**
 * Print-scope selector must let the user print:
 *   - "both"      → DN + RC (with page-break separator)
 *   - "main"      → DN only
 *   - "companion" → RC only
 * regardless of how many times the user toggles between scopes.
 */
test.describe("ขอบเขตการพิมพ์ (print scope)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(COMPANION_SEED_INIT);
    await page.setContent(renderIssueAndReprintPage(DELIVERY_WITH_RECEIPT_COMPANION));
    await page.click("#issue-btn");
  });

  test("both: prints DN and RC with separator", async ({ page }) => {
    await page.selectOption("#scope", "both");
    await page.click("#print-btn");
    const printed = await page.evaluate(() => (window as any).__lastPrintedDocNos);
    expect(printed).toEqual([FIXED_DELIVERY_NO, FIXED_RECEIPT_NO]);
    const html = await page.evaluate(() => (window as any).__lastCombinedHtml as string);
    expect(html).toMatch(/break-before:\s*page/);
  });

  test("main: prints DN only, no separator", async ({ page }) => {
    await page.selectOption("#scope", "main");
    await page.click("#print-btn");
    const printed = await page.evaluate(() => (window as any).__lastPrintedDocNos);
    expect(printed).toEqual([FIXED_DELIVERY_NO]);
    const html = await page.evaluate(() => (window as any).__lastCombinedHtml as string);
    expect(html).not.toMatch(/rds-print-break/);
    // Only the delivery block — receipt block must not be emitted.
    expect(html).toMatch(/data-kind="delivery"/);
    expect(html).not.toMatch(/data-kind="receipt"/);
  });

  test("companion: prints RC only, no separator", async ({ page }) => {
    await page.selectOption("#scope", "companion");
    await page.click("#print-btn");
    const printed = await page.evaluate(() => (window as any).__lastPrintedDocNos);
    expect(printed).toEqual([FIXED_RECEIPT_NO]);
    const html = await page.evaluate(() => (window as any).__lastCombinedHtml as string);
    expect(html).not.toMatch(/rds-print-break/);
    expect(html).toMatch(/data-kind="receipt"/);
    expect(html).not.toMatch(/data-kind="delivery"/);
  });

  test("toggling scope between prints picks up the new scope each time", async ({ page }) => {
    await page.selectOption("#scope", "main");
    await page.click("#print-btn");
    expect(await page.evaluate(() => (window as any).__lastPrintedDocNos)).toEqual([FIXED_DELIVERY_NO]);

    await page.selectOption("#scope", "companion");
    await page.click("#print-btn");
    expect(await page.evaluate(() => (window as any).__lastPrintedDocNos)).toEqual([FIXED_RECEIPT_NO]);

    await page.selectOption("#scope", "both");
    await page.click("#print-btn");
    expect(await page.evaluate(() => (window as any).__lastPrintedDocNos)).toEqual([
      FIXED_DELIVERY_NO,
      FIXED_RECEIPT_NO,
    ]);

    expect(await page.evaluate(() => (window as any).__printCount)).toBe(3);
    // Numbers never changed across all 3 prints.
    const issued = await page.evaluate(() => (window as any).__issuedDocNos);
    expect(issued).toEqual({ delivery: FIXED_DELIVERY_NO, receipt: FIXED_RECEIPT_NO });
  });
});