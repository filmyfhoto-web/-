import { test, expect } from "@playwright/test";

/**
 * Regression: bulk-printing multiple receipts must keep the receipt-only
 * "อัตโนมัติ 19×27 ซม." paper preset (190mm × 270mm) across:
 *   - every document in the selection
 *   - every page inside each document
 *   - every copy in the multi-copies queue
 * …without dropping any doc or copy from the sequential print queue.
 *
 * We drive `printViaCurrentDocument` directly against a hand-built print
 * host that mimics `<PrintPreview>`'s `#documents-print-area` structure
 * for a 3-receipt selection with copies:2, and assert every printed page
 * locked to 190mm × 270mm exactly like a solo receipt print would.
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

test("bulk-receipt print keeps 190x270mm on every doc/page/copy", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  await page.evaluate(async () => {
    (window as any).__printCalls = 0;
    (window as any).__receiptSnapshots = [];
    window.print = () => {
      (window as any).__printCalls++;
      const host = document.querySelector("#rds-direct-print-host") as HTMLElement;
      (window as any).__receiptSnapshots.push({
        docs: Array.from(host.querySelectorAll(".doc-print-document"))
          .map((el) => (el as HTMLElement).dataset.docId),
        pages: Array.from(host.querySelectorAll(".doc-page")).map((el) => {
          const p = el as HTMLElement;
          return {
            doc: p.closest<HTMLElement>(".doc-print-document")?.dataset.docId,
            width: p.style.getPropertyValue("width"),
            height: p.style.getPropertyValue("height"),
            paddingTop: p.style.getPropertyValue("padding-top"),
          };
        }),
      });
    };

    const source = document.createElement("div");
    source.id = "documents-print-area";
    // 3 receipts, 1 page each, mirroring how PrintPreview mounts bulk docs.
    source.innerHTML = ["rc-a", "rc-b", "rc-c"]
      .map(
        (docId, i) => `
        <div class="doc-print-document" data-doc-id="${docId}" data-doc-print="true">
          <div id="doc-print" data-doc-print="true">
            <section class="doc-page"><h1>ใบเสร็จ ${i + 1}</h1><p>ข้อความทดสอบใบเสร็จ</p></section>
          </div>
        </div>`,
      )
      .join("");
    document.body.appendChild(source);

    const mod = await import("/src/pages/receipts/lib/printWindow.ts");
    (window as any).__printPromise = mod.printViaCurrentDocument({
      bodyHtml: "",
      sourceEl: source,
      // "auto-receipt" resolves to 190mm × 270mm in getPaperCssSize.
      paperSize: "190mm 270mm",
      orient: "portrait",
      copies: 2,
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
    });
  });

  // Copy 1 dispatches synchronously.
  await expect
    .poll(() => page.evaluate(() => (window as any).__printCalls), { timeout: 3_000 })
    .toBe(1);

  // No copy 2 without afterprint.
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).__printCalls)).toBe(1);

  // Advance the queue.
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect
    .poll(() => page.evaluate(() => (window as any).__printCalls), { timeout: 3_000 })
    .toBe(2);

  const snapshots: any[] = await page.evaluate(() => (window as any).__receiptSnapshots);
  expect(snapshots).toHaveLength(2);
  for (const snap of snapshots) {
    expect(snap.docs).toEqual(["rc-a", "rc-b", "rc-c"]);
    expect(snap.pages).toHaveLength(3);
    for (const p of snap.pages) {
      expect(p.width).toBe("190mm");
      expect(p.height).toBe("270mm");
      expect(p.paddingTop).toBe("10mm");
    }
  }
  // Copy 2 must be byte-identical to copy 1 — no docs skipped, no size drift.
  expect(snapshots[1]).toEqual(snapshots[0]);

  // Final afterprint → host cleanup.
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("#rds-direct-print-host")).toHaveCount(0);
});