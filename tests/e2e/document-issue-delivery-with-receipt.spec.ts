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
 * E2E: pressing "ออกใบส่งของ + ใบเสร็จ" must produce TWO real documents in
 * one atomic action — delivery note + receipt — with the correct numbering
 * prefixes and a bidirectional `related_document_no` link.
 */
test.describe("ออกใบส่งของ + ใบเสร็จ — issue pair", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(COMPANION_SEED_INIT);
    await page.setContent(renderIssueAndReprintPage(DELIVERY_WITH_RECEIPT_COMPANION));
  });

  test("renders BOTH docs with DN/RC prefixes and bidirectional link", async ({ page }) => {
    // Initially empty — numbers only assigned on issue (no premature numbering).
    await expect(page.locator('#printable-area [id="doc-print"]')).toHaveCount(0);

    await page.click("#issue-btn");

    const blocks = page.locator('#printable-area [id="doc-print"]');
    await expect(blocks).toHaveCount(2);

    const docNos = await blocks.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-doc-no") ?? ""),
    );
    expect(docNos[0]).toMatch(/^DN-/);
    expect(docNos[1]).toMatch(/^RC-/);
    expect(docNos).toEqual([FIXED_DELIVERY_NO, FIXED_RECEIPT_NO]);

    // Bidirectional link: DN.related = RC, RC.related = DN.
    const related = await blocks.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-related-doc-no") ?? ""),
    );
    expect(related[0]).toBe(FIXED_RECEIPT_NO);
    expect(related[1]).toBe(FIXED_DELIVERY_NO);

    // Receipt sits AFTER delivery in document order.
    const order = await blocks.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-kind")),
    );
    expect(order).toEqual(["delivery", "receipt"]);
  });

  test("printing the issued pair sends BOTH docs in one job with page-break", async ({ page }) => {
    await page.click("#issue-btn");
    await page.click("#print-btn");

    await expect.poll(() => page.evaluate(() => (window as any).__printCount)).toBe(1);
    const printed = await page.evaluate(() => (window as any).__lastPrintedDocNos);
    expect(printed).toEqual([FIXED_DELIVERY_NO, FIXED_RECEIPT_NO]);

    const html = await page.evaluate(() => (window as any).__lastCombinedHtml as string);
    expect(html).toMatch(/break-before:\s*page/);
    expect(html).toMatch(/page-break-before:\s*always/);
    // Separator between, not before the first doc. Use data-kind anchors to
    // avoid matching the related-doc-no metadata that lives inside each block.
    const deliveryIdx = html.indexOf('data-kind="delivery"');
    const receiptIdx = html.indexOf('data-kind="receipt"');
    const sepIdx = html.search(/rds-print-break/);
    expect(deliveryIdx).toBeGreaterThan(-1);
    expect(receiptIdx).toBeGreaterThan(-1);
    expect(sepIdx).toBeGreaterThan(deliveryIdx);
    expect(sepIdx).toBeLessThan(receiptIdx);
  });
});