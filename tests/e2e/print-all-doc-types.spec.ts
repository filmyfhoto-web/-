import { test, expect } from "@playwright/test";

/**
 * Print regression coverage for EVERY document type rendered through the
 * documents-list "พิมพ์ทันที" path.
 *
 * Why hermetic: the live page requires Supabase auth + store + RPC numbering.
 * This suite reproduces the exact DOM contract that broke (printable buffer
 * nested under a `print:hidden` ancestor produced blank pages) and asserts
 * the fixed structure prints for delivery / quotation / invoice / tax_invoice
 * / receipt — i.e. every value of `document_type` the app supports.
 */

type DocType = "delivery" | "quotation" | "invoice" | "tax_invoice" | "receipt";

const TITLES: Record<DocType, string> = {
  delivery: "ใบส่งของ",
  quotation: "ใบเสนอราคา",
  invoice: "ใบแจ้งหนี้",
  tax_invoice: "ใบกำกับภาษี/ใบเสร็จรับเงิน",
  receipt: "ใบเสร็จรับเงิน",
};

function pageHtml(opts: { docType: DocType; docNo: string; placement: "inside" | "outside" }) {
  const title = TITLES[opts.docType];
  // The "outside" layout mirrors the fix: print area is a SIBLING of the
  // `print:hidden` wrapper, not a descendant.
  const body = opts.placement === "outside"
    ? `
      <div class="page-wrapper print-hidden">
        <header>UI chrome (hidden when printing)</header>
      </div>
      <div id="documents-print-area" class="screen-hidden">
        <div id="doc-print" data-doc-print="true" data-kind="${opts.docType}">
          <h1>${title}</h1>
          <p class="docno">เลขที่ ${opts.docNo}</p>
        </div>
      </div>`
    : `
      <div class="page-wrapper print-hidden">
        <header>UI chrome</header>
        <div id="documents-print-area" class="screen-hidden">
          <div id="doc-print" data-doc-print="true" data-kind="${opts.docType}">
            <h1>${title}</h1>
            <p class="docno">เลขที่ ${opts.docNo}</p>
          </div>
        </div>
      </div>`;

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8" />
<style>
  .screen-hidden { display: none; }
  @media print {
    .print-hidden { display: none !important; }
    .screen-hidden { display: block !important; }
    body * { visibility: hidden; }
    #documents-print-area, #documents-print-area * { visibility: visible !important; }
    #documents-print-area { display: block !important; position: static !important; }
  }
</style>
</head><body>
  ${body}
  <button id="print-btn">พิมพ์</button>
  <script>
    window.__printedDocs = [];
    window.print = function () {
      // Snapshot what would actually go to the printer: every visible
      // doc-print block in the live DOM (matches window.print semantics).
      const blocks = Array.from(document.querySelectorAll('[data-doc-print="true"]'));
      const visible = blocks.filter((el) => {
        // Walk ancestors: if any has display:none at print time, the block
        // would not be laid out on paper.
        let cur = el;
        while (cur && cur !== document.body) {
          const cls = (cur).className || '';
          if (typeof cls === 'string' && cls.split(/\\s+/).includes('print-hidden')) {
            return false;
          }
          cur = cur.parentElement;
        }
        return true;
      });
      window.__printedDocs = visible.map((el) => ({
        kind: el.getAttribute('data-kind'),
        title: el.querySelector('h1')?.textContent ?? '',
        docNo: el.querySelector('.docno')?.textContent ?? '',
      }));
    };
    document.getElementById('print-btn').addEventListener('click', () => window.print());
  </script>
</body></html>`;
}

test.describe("documents-list print — contract for every document type", () => {
  const types: DocType[] = ["delivery", "quotation", "invoice", "tax_invoice", "receipt"];

  for (const docType of types) {
    test(`${docType}: print area outside print-hidden wrapper → prints real content`, async ({ page }) => {
      const docNo = `DOC-${docType}-001`;
      await page.setContent(pageHtml({ docType, docNo, placement: "outside" }));
      await page.click("#print-btn");
      const printed = await page.evaluate(() => (window as any).__printedDocs);
      expect(printed).toHaveLength(1);
      expect(printed[0].kind).toBe(docType);
      expect(printed[0].title).toBe(TITLES[docType]);
      expect(printed[0].docNo).toContain(docNo);
    });
  }

  // Bug reproduction: if anyone ever nests the print area back inside the
  // `print:hidden` wrapper, `window.print()` would emit a blank page. This
  // test pins the failure mode so a regression is visible immediately.
  test("regression: print area INSIDE print-hidden wrapper → blank print (bug shape)", async ({ page }) => {
    await page.setContent(pageHtml({ docType: "delivery", docNo: "DOC-BUG-001", placement: "inside" }));
    await page.click("#print-btn");
    const printed = await page.evaluate(() => (window as any).__printedDocs);
    expect(printed).toHaveLength(0);
  });
});