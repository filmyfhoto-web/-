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
 * Contract: "สร้างเอกสารครั้งเดียว แล้วพิมพ์ซ้ำได้ ไม่ใช่กดพิมพ์แล้วสร้างเลขใหม่"
 * — issuing once must lock DN/RC numbers; re-printing must NEVER mint new
 * numbers or re-call the issue path.
 */
test.describe("พิมพ์ซ้ำต้องไม่รันเลขใหม่", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(COMPANION_SEED_INIT);
    await page.setContent(renderIssueAndReprintPage(DELIVERY_WITH_RECEIPT_COMPANION));
  });

  test("re-pressing print reuses the issued DN/RC numbers", async ({ page }) => {
    await page.click("#issue-btn");
    const issuedAfterFirst = await page.evaluate(() => (window as any).__issuedDocNos);
    expect(issuedAfterFirst).toEqual({ delivery: FIXED_DELIVERY_NO, receipt: FIXED_RECEIPT_NO });

    // Print 3 times.
    for (let i = 0; i < 3; i++) await page.click("#print-btn");

    await expect.poll(() => page.evaluate(() => (window as any).__printCount)).toBe(3);
    const printed = await page.evaluate(() => (window as any).__lastPrintedDocNos);
    expect(printed).toEqual([FIXED_DELIVERY_NO, FIXED_RECEIPT_NO]);

    // Issue counter must NOT have incremented on print clicks.
    const issueCount = await page.evaluate(() => (window as any).__issueCount);
    expect(issueCount).toBe(1);
  });

  test("pressing issue again does NOT re-mint numbers when pair already exists", async ({ page }) => {
    await page.click("#issue-btn");
    await page.click("#issue-btn");
    await page.click("#issue-btn");

    const issued = await page.evaluate(() => (window as any).__issuedDocNos);
    expect(issued).toEqual({ delivery: FIXED_DELIVERY_NO, receipt: FIXED_RECEIPT_NO });

    const docNos = await page
      .locator('#printable-area [id="doc-print"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-doc-no")));
    expect(docNos).toEqual([FIXED_DELIVERY_NO, FIXED_RECEIPT_NO]);
  });
});