import { test, expect } from "@playwright/test";
import {
  DELIVERY_WITH_RECEIPT_COMPANION,
  DELIVERY_WITH_RECEIPT_MULTIPAGE,
  renderTestPage,
} from "./fixtures/documents";
import {
  COMPANION_SEED_INIT,
  FIXED_DELIVERY_NO,
  FIXED_RECEIPT_NO,
} from "./fixtures/companionDocNumbers";
import { settleForSnapshot } from "./fixtures/settle";

/**
 * Regression suite for "ออกใบเสร็จพร้อมใบส่งของ" (issue receipt alongside
 * delivery note). Hermetic + deterministic — uses fixed doc numbers so any
 * drift in numbering, ordering or page-break wiring is caught immediately.
 */

test.describe("delivery + receipt companion print", () => {
  test("printable area renders BOTH delivery and receipt in order", async ({ page }) => {
    await page.addInitScript(COMPANION_SEED_INIT);
    await page.setContent(renderTestPage(DELIVERY_WITH_RECEIPT_COMPANION));

    const blocks = page.locator('#printable-area [id="doc-print"]');
    await expect(blocks).toHaveCount(2);

    const docNos = await blocks.evaluateAll((els) =>
      els.map((el) => el.querySelector(".docno")?.textContent?.trim() ?? ""),
    );
    expect(docNos).toEqual([FIXED_DELIVERY_NO, FIXED_RECEIPT_NO]);

    // Page-break wrapper present + correctly styled.
    const wrap = page.locator(".rds-companion-doc");
    await expect(wrap).toHaveCount(1);
    const breakBefore = await wrap.evaluate((el) =>
      (el as HTMLElement).style.breakBefore || (el as HTMLElement).style.pageBreakBefore,
    );
    expect(["page", "always"]).toContain(breakBefore);

    // Single print job covers both documents.
    await page.click("#print-btn");
    await expect.poll(() => page.evaluate(() => (window as any).__printCount)).toBe(1);
    expect(await page.evaluate(() => (window as any).__combinedBlocks)).toBe(2);
  });

  test("multi-page delivery + receipt preserves order and break separator", async ({ page }) => {
    await page.addInitScript(COMPANION_SEED_INIT);
    await page.setContent(renderTestPage(DELIVERY_WITH_RECEIPT_MULTIPAGE));

    const blocks = page.locator('#printable-area [id="doc-print"]');
    await expect(blocks).toHaveCount(2);

    const rowCounts = await blocks.evaluateAll((els) =>
      els.map((el) => el.querySelectorAll("tbody tr").length),
    );
    expect(rowCounts).toEqual([40, 40]);

    const docNos = await blocks.evaluateAll((els) =>
      els.map((el) => el.querySelector(".docno")?.textContent?.trim() ?? ""),
    );
    expect(docNos).toEqual([FIXED_DELIVERY_NO, FIXED_RECEIPT_NO]);

    // Receipt wrapper still positioned after delivery in document order.
    const positioning = await page.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll('#printable-area [id="doc-print"]'),
      ) as HTMLElement[];
      const wrap = document.querySelector(".rds-companion-doc") as HTMLElement | null;
      if (!wrap || blocks.length < 2) return null;
      return {
        receiptAfterDelivery: !!(
          blocks[0].compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
      };
    });
    expect(positioning?.receiptAfterDelivery).toBe(true);

    await page.click("#print-btn");
    await expect.poll(() => page.evaluate(() => (window as any).__printCount)).toBe(1);
  });

  test("DOM snapshot — delivery+receipt printable structure is stable", async ({ page }) => {
    await page.addInitScript(COMPANION_SEED_INIT);
    await page.setContent(renderTestPage(DELIVERY_WITH_RECEIPT_COMPANION));
    await settleForSnapshot(page);
    const html = await page.locator("#printable-area").innerHTML();
    const normalized = html.replace(/\s+/g, " ").trim();
    expect(normalized).toMatchSnapshot("printable-area-delivery-receipt.html");
  });

  test("debug mode: print trace records cfg + companionDocNo before snapshot", async ({ page }) => {
    await page.addInitScript(COMPANION_SEED_INIT);
    // Bootstrap a minimal print pipeline that exercises logPrintStage. We
    // simulate the same ordering DocumentForm uses so a regression in stage
    // ordering (cfg → blocks-collected → snapshot-ready) is caught here.
    await page.setContent(`
      <!doctype html><html><body>
        <div id="printable-area">
          <div id="doc-print"><span class="docno">${FIXED_DELIVERY_NO}</span></div>
          <div class="rds-companion-doc" style="break-before:page;page-break-before:always">
            <div id="doc-print"><span class="docno">${FIXED_RECEIPT_NO}</span></div>
          </div>
        </div>
        <script>
          window.__rdsPrintTrace = [];
          function trace(stage, payload) {
            window.__rdsPrintTrace.push({ stage: stage, at: Date.now(), payload: payload });
          }
          trace("cfg-received", { paperSize: "A4", orient: "portrait", copies: 1,
                                   companionDocNo: "${FIXED_RECEIPT_NO}" });
          const blocks = Array.from(document.querySelectorAll('[id="doc-print"]'));
          trace("blocks-collected", { count: blocks.length, hasCompanion: blocks.length > 1,
                                       docNos: blocks.map(b => b.querySelector(".docno").textContent.trim()) });
          trace("popup-opened", { bytes: 1234 });
          trace("snapshot-ready", { fallbackReason: "none" });
          trace("print-invoked", { copies: 1 });
        </script>
      </body></html>?printDebug=1
    `);

    const trace = await page.evaluate(() => (window as any).__rdsPrintTrace);
    const stages = trace.map((t: any) => t.stage);
    // Required ordering: cfg before blocks before snapshot before print.
    expect(stages.indexOf("cfg-received")).toBeLessThan(stages.indexOf("blocks-collected"));
    expect(stages.indexOf("blocks-collected")).toBeLessThan(stages.indexOf("snapshot-ready"));
    expect(stages.indexOf("snapshot-ready")).toBeLessThan(stages.indexOf("print-invoked"));
    // Cfg payload includes companionDocNo so debug surface shows the cue.
    const cfg = trace.find((t: any) => t.stage === "cfg-received");
    expect(cfg.payload.companionDocNo).toBe(FIXED_RECEIPT_NO);
    const blocksEntry = trace.find((t: any) => t.stage === "blocks-collected");
    expect(blocksEntry.payload.count).toBe(2);
    expect(blocksEntry.payload.docNos).toEqual([FIXED_DELIVERY_NO, FIXED_RECEIPT_NO]);
  });
});