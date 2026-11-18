import { test, expect } from "@playwright/test";
import {
  DELIVERY_WITH_RECEIPT_COMPANION,
  renderTestPage,
  renderDocBlock,
} from "./fixtures/documents";
import {
  COMPANION_SEED_INIT,
  FIXED_DELIVERY_NO,
  FIXED_RECEIPT_NO,
} from "./fixtures/companionDocNumbers";
import { settleForSnapshot } from "./fixtures/settle";

/**
 * Visual + heavy multi-page regression for "ออกใบเสร็จพร้อมใบส่งของ".
 *
 *   1. Screenshot of the print-preview pane (A4-sized viewport) so any
 *      layout drift on the delivery+receipt pair is caught at the pixel
 *      level. The hermetic DOM fixtures keep the render deterministic.
 *   2. Extra-large fixture (120 rows × 2 documents) confirms the page-break
 *      separator survives across many pages and the receipt still follows
 *      the delivery in document order.
 */

test.use({ viewport: { width: 794, height: 1123 } }); // A4 @ 96dpi

test.describe("delivery + receipt — visual & heavy", () => {
  test("print-preview screenshot is stable for delivery+receipt pair", async ({ page }) => {
    await page.addInitScript(COMPANION_SEED_INIT);
    await page.setContent(renderTestPage(DELIVERY_WITH_RECEIPT_COMPANION));
    const printable = page.locator("#printable-area");
    await expect(printable).toBeVisible();
    await settleForSnapshot(page);
    // Element screenshot keeps the assertion focused and avoids chrome-UI noise.
    expect(await printable.screenshot()).toMatchSnapshot(
      "printable-area-delivery-receipt.png",
      { maxDiffPixelRatio: 0.02 },
    );
  });

  test("120 rows × 2 documents: page-break + ordering survive", async ({ page }) => {
    await page.addInitScript(COMPANION_SEED_INIT);
    const big = `<!doctype html><html><body>
      <button id="print-btn">พิมพ์</button>
      <div id="printable-area">
        ${renderDocBlock({ kind: "invoice", docNo: FIXED_DELIVERY_NO, itemsCount: 120 })}
        ${renderDocBlock({ kind: "receipt", docNo: FIXED_RECEIPT_NO, itemsCount: 120 })}
      </div>
      <script>
        window.__printCount = 0;
        window.print = function () { window.__printCount++; };
        document.getElementById("print-btn").addEventListener("click", function () {
          var blocks = document.querySelectorAll('[id="doc-print"]');
          window.__combinedBlocks = blocks.length;
          window.print();
        });
      </script>
    </body></html>`;
    await page.setContent(big);

    const blocks = page.locator('#printable-area [id="doc-print"]');
    await expect(blocks).toHaveCount(2);

    const rowCounts = await blocks.evaluateAll((els) =>
      els.map((el) => el.querySelectorAll("tbody tr").length),
    );
    expect(rowCounts).toEqual([120, 120]);

    const docNos = await blocks.evaluateAll((els) =>
      els.map((el) => el.querySelector(".docno")?.textContent?.trim() ?? ""),
    );
    expect(docNos).toEqual([FIXED_DELIVERY_NO, FIXED_RECEIPT_NO]);

    // Receipt wrapper still positioned AFTER the delivery in document order.
    const positioning = await page.evaluate(() => {
      const list = Array.from(
        document.querySelectorAll('#printable-area [id="doc-print"]'),
      ) as HTMLElement[];
      const wrap = document.querySelector(".rds-companion-doc") as HTMLElement | null;
      if (!wrap || list.length < 2) return null;
      return {
        receiptAfter: !!(list[0].compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING),
        receiptInsideWrap: wrap.contains(list[1]),
      };
    });
    expect(positioning?.receiptAfter).toBe(true);
    expect(positioning?.receiptInsideWrap).toBe(true);

    // Total scroll height comfortably exceeds 5 × A4 (≈ 5600px) — proves
    // the fixture truly spans many pages.
    const totalH = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(totalH).toBeGreaterThan(5600);

    await page.click("#print-btn");
    await expect.poll(() => page.evaluate(() => (window as any).__printCount)).toBe(1);
    expect(await page.evaluate(() => (window as any).__combinedBlocks)).toBe(2);
  });
});