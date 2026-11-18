import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end verification of the sequential print queue:
 *
 * 1) Copy 1 dispatches synchronously (inside the user gesture).
 * 2) Copy 2 must NOT dispatch until the browser fires `afterprint`
 *    for copy 1 (no overlap, no drops).
 * 3) Copy 3 waits for copy 2's `afterprint` and so on.
 * 4) The hidden `#rds-direct-print-host` stays mounted until the last
 *    copy finishes, then is cleaned up.
 *
 * We mount <DocumentPreview> hermetically, stub `window.print` to count
 * calls without opening the OS dialog, and invoke
 * `printViaCurrentDocument` directly with copies:3.
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

async function mountAndStubPrint(page: Page, itemCount = 1) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ itemCount }) => {
    (window as any).__printCalls = 0;
    (window as any).__pageLockSnapshots = [];
    (window as any).__origPrint = window.print;
    window.print = () => {
      (window as any).__printCalls++;
      const pages = Array.from(document.querySelectorAll("#rds-direct-print-host .doc-page")) as HTMLElement[];
      (window as any).__pageLockSnapshots.push(pages.map((el) => ({
        idx: el.getAttribute("data-print-page-idx"),
        total: el.getAttribute("data-print-page-total"),
        width: el.style.getPropertyValue("width"),
        height: el.style.getPropertyValue("height"),
        minHeight: el.style.getPropertyValue("min-height"),
        maxHeight: el.style.getPropertyValue("max-height"),
        paddingTop: el.style.getPropertyValue("padding-top"),
        paddingRight: el.style.getPropertyValue("padding-right"),
        paddingBottom: el.style.getPropertyValue("padding-bottom"),
        paddingLeft: el.style.getPropertyValue("padding-left"),
        marginTop: el.style.getPropertyValue("margin-top"),
        transform: el.style.getPropertyValue("transform"),
        zoom: el.style.getPropertyValue("zoom"),
        breakBefore: el.style.getPropertyValue("break-before"),
      })));
    };

    const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
    const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react"));
    const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client"));
    const ReactApi = (React as any).default ?? React;
    const RDSApi = (RDS as any).default ?? RDS;

    const store = { id: "s1", slug: "printing", name: "ร้านทดสอบ",
      tax_id: "0", phone: "0", address: "-", logo_url: null,
      brand_color: "221 83% 45%", default_vat_rate: 0, vat_enabled: false };
    const items = Array.from({ length: itemCount }, (_, i) => ({
      key: `a${i}`, product_id: null, name: `สินค้า ${i + 1}`, description: "",
      price: 100, quantity: 2, unit: "ชิ้น", discount_percent: 0, discount_amount: 0,
    }));
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const state = {
      document_type: "receipt", paper_size: "A4", template: "modern",
      document_date: "2026-07-14", show_document_date: true,
      vat_mode: "none", vat_rate: 0, price_type: "no_vat",
      withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
      customer_id: null, customer_name: "ทดสอบ",
      customer_phone: "", customer_address: "", customer_tax_id: "", customer_branch: "",
      payment_method: "cash", notes: "", items,
      show_payment_date: true, show_payment_method: true, show_footer_document_date: true,
    };
    const totals = { subtotal, discount_total: 0, amount_before_vat: subtotal,
      vat_amount: 0, grand_total: subtotal,
      withholding_tax_amount: 0, net_total: subtotal };

    const host = document.createElement("div");
    host.id = "queue-mount-host";
    document.body.appendChild(host);
    RDSApi.createRoot(host).render(
      ReactApi.createElement(previewMod.default, { store, state, totals, docNo: "RC-Q" }),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await (document as any).fonts?.ready; } catch { /* noop */ }
  }, { itemCount });
}

test("printViaCurrentDocument with copies:3 dispatches sequentially, one per afterprint", async ({ page }) => {
  await mountAndStubPrint(page);

  // Fire the print in the background — it resolves once cleanup finishes.
  await page.evaluate(async () => {
    const mod = await import("/src/pages/receipts/lib/printWindow.ts");
    const source = document.getElementById("queue-mount-host")!
      .querySelector("#doc-print") as HTMLElement;
    (window as any).__printPromise = mod.printViaCurrentDocument({
      bodyHtml: "", sourceEl: source, paperSize: "A4", orient: "portrait", copies: 3,
    });
  });

  // Copy 1 must have dispatched synchronously.
  await expect
    .poll(() => page.evaluate(() => (window as any).__printCalls), { timeout: 3_000 })
    .toBe(1);
  await expect(page.locator("#rds-direct-print-host")).toHaveCount(1);

  // Without an afterprint event, no further copies fire — even after a long wait.
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => (window as any).__printCalls)).toBe(1);

  // Fire afterprint → queue advances to copy 2.
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect
    .poll(() => page.evaluate(() => (window as any).__printCalls), { timeout: 3_000 })
    .toBe(2);
  await expect(page.locator("#rds-direct-print-host")).toHaveCount(1); // still mounted

  // Copy 3 needs another afterprint.
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect
    .poll(() => page.evaluate(() => (window as any).__printCalls), { timeout: 3_000 })
    .toBe(3);

  // Final afterprint → host cleaned up.
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("#rds-direct-print-host")).toHaveCount(0);
});

test("multi-page current-document print keeps page 2 locked across consecutive copies", async ({ page }) => {
  await mountAndStubPrint(page, 40);

  await page.evaluate(async () => {
    const mod = await import("/src/pages/receipts/lib/printWindow.ts");
    const source = document.getElementById("queue-mount-host")!
      .querySelector("#doc-print") as HTMLElement;
    (window as any).__printPromise = mod.printViaCurrentDocument({
      bodyHtml: "", sourceEl: source, paperSize: "210mm 297mm", orient: "portrait", copies: 2,
      margins: { top: 10, right: 10, bottom: 17, left: 10 },
    });
  });

  await expect
    .poll(() => page.evaluate(() => (window as any).__printCalls), { timeout: 3_000 })
    .toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect
    .poll(() => page.evaluate(() => (window as any).__printCalls), { timeout: 3_000 })
    .toBe(2);

  const snapshots = await page.evaluate(() => (window as any).__pageLockSnapshots);
  expect(snapshots).toHaveLength(2);
  for (const copy of snapshots) {
    expect(copy.length).toBeGreaterThan(1);
    const page2 = copy[1];
    expect(page2.idx).toBe("2");
    expect(page2.total).toBe(String(copy.length));
    expect(page2.width).toBe("210mm");
    expect(page2.height).toBe("297mm");
    expect(page2.minHeight).toBe("297mm");
    expect(page2.maxHeight).toBe("297mm");
    expect(page2.paddingTop).toBe("10mm");
    expect(page2.paddingRight).toBe("10mm");
    expect(page2.paddingBottom).toBe("17mm");
    expect(page2.paddingLeft).toBe("10mm");
    expect(page2.marginTop).toBe("0mm");
    expect(page2.transform).toBe("none");
    expect(page2.zoom).toBe("1");
    expect(page2.breakBefore).toBe("page");
  }
  expect(snapshots[1][1]).toEqual(snapshots[0][1]);
});

test("multi-file current-document print keeps all files and all copies in one sequential queue", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    (window as any).__printCalls = 0;
    (window as any).__multiFileSnapshots = [];
    window.print = () => {
      (window as any).__printCalls++;
      const host = document.querySelector("#rds-direct-print-host") as HTMLElement;
      (window as any).__multiFileSnapshots.push({
        docs: Array.from(host.querySelectorAll(".doc-print-document")).map((el) => (el as HTMLElement).dataset.docId),
        pages: Array.from(host.querySelectorAll(".doc-page")).map((el) => {
          const page = el as HTMLElement;
          return {
            doc: page.closest<HTMLElement>(".doc-print-document")?.dataset.docId,
            idx: page.getAttribute("data-print-page-idx"),
            total: page.getAttribute("data-print-page-total"),
            width: page.style.getPropertyValue("width"),
            height: page.style.getPropertyValue("height"),
            paddingTop: page.style.getPropertyValue("padding-top"),
            paddingRight: page.style.getPropertyValue("padding-right"),
            paddingBottom: page.style.getPropertyValue("padding-bottom"),
            paddingLeft: page.style.getPropertyValue("padding-left"),
            marginTop: page.style.getPropertyValue("margin-top"),
            transform: page.style.getPropertyValue("transform"),
            zoom: page.style.getPropertyValue("zoom"),
            breakBefore: page.style.getPropertyValue("break-before"),
          };
        }),
        text: host.textContent,
      });
    };

    const source = document.createElement("div");
    source.id = "documents-print-area";
    source.innerHTML = `
      <div class="doc-print-document" data-doc-id="doc-a" data-doc-print="true">
        <div id="doc-print" data-doc-print="true">
          <section class="doc-page"><h1>เอกสาร A หน้า 1</h1><p>ข้อความทดสอบไฟล์แรกหน้าหนึ่ง</p></section>
          <div class="doc-page-divider no-print">— หน้า 2 —</div>
          <section class="doc-page" style="margin-top:24mm"><h1>เอกสาร A หน้า 2</h1><p>ข้อความทดสอบไฟล์แรกหน้าสอง</p></section>
        </div>
      </div>
      <div class="doc-print-document" data-doc-id="doc-b" data-doc-print="true">
        <div id="doc-print" data-doc-print="true">
          <section class="doc-page"><h1>เอกสาร B หน้า 1</h1><p>ข้อความทดสอบไฟล์สองหน้าหนึ่ง</p></section>
          <div class="doc-page-divider no-print">— หน้า 2 —</div>
          <section class="doc-page" style="margin-top:24mm"><h1>เอกสาร B หน้า 2</h1><p>ข้อความทดสอบไฟล์สองหน้าสอง</p></section>
        </div>
      </div>`;
    document.body.appendChild(source);
    const mod = await import("/src/pages/receipts/lib/printWindow.ts");
    (window as any).__printPromise = mod.printViaCurrentDocument({
      bodyHtml: "", sourceEl: source, paperSize: "A4", orient: "portrait", copies: 2,
      margins: { top: 10, right: 10, bottom: 17, left: 10 },
    });
  });

  await expect
    .poll(() => page.evaluate(() => (window as any).__printCalls), { timeout: 3_000 })
    .toBe(1);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__printCalls)).toBe(1);

  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect
    .poll(() => page.evaluate(() => (window as any).__printCalls), { timeout: 3_000 })
    .toBe(2);

  const snapshots = await page.evaluate(() => (window as any).__multiFileSnapshots);
  expect(snapshots).toHaveLength(2);
  for (const snapshot of snapshots) {
    expect(snapshot.docs).toEqual(["doc-a", "doc-b"]);
    expect(snapshot.text).toContain("เอกสาร A หน้า 2");
    expect(snapshot.text).toContain("เอกสาร B หน้า 2");
    expect(snapshot.pages).toHaveLength(4);
    for (const printedPage of snapshot.pages) {
      expect(printedPage.width).toBe("210mm");
      expect(printedPage.height).toBe("297mm");
      expect(printedPage.paddingTop).toBe("10mm");
      expect(printedPage.paddingRight).toBe("10mm");
      expect(printedPage.paddingBottom).toBe("17mm");
      expect(printedPage.paddingLeft).toBe("10mm");
      expect(printedPage.marginTop).toBe("0mm");
      expect(printedPage.transform).toBe("none");
      expect(printedPage.zoom).toBe("1");
    }
  }
  expect(snapshots[1]).toEqual(snapshots[0]);

  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("#rds-direct-print-host")).toHaveCount(0);
});
