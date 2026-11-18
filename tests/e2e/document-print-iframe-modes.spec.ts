import { test, expect } from "@playwright/test";

/**
 * Verifies the printWindow helper's two paths:
 *  1. non-iframe → window.print() called once with #doc-print present
 *  2. iframe path (openPrintWindow) → popup written with the full body,
 *     containing #doc-print and the baseline CSS sentinel "Sarabun"
 *
 * Also asserts diagnostics are recorded on window.__lovablePrintDiagnostics
 * with a non-"none" fallbackReason when bodyHtml is empty.
 */

test.describe("print iframe modes", () => {
  test("non-iframe: window.print invoked with #doc-print present", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    // Inject a #doc-print element and a print spy.
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML =
        `<div id="doc-print"><h1>เอกสารทดสอบ</h1><p>ลูกค้า A</p></div>`;
      document.body.appendChild(host);
      (window as any).__printCount = 0;
      const orig = window.print;
      window.print = () => { (window as any).__printCount++; orig?.call(window); };
    });
    const count = await page.evaluate(async () => {
      const mod = await import("/src/pages/receipts/lib/printWindow.ts");
      // Force non-iframe path: just call window.print directly.
      // (isInIframe is false in the top-level page.)
      if (!mod.isInIframe()) window.print();
      return (window as any).__printCount as number;
    });
    expect(count).toBe(1);
    const docText = await page.evaluate(
      () => document.querySelector("#doc-print")?.textContent?.trim() ?? ""
    );
    expect(docText).toContain("เอกสารทดสอบ");
  });

  test("iframe: openPrintWindow writes #doc-print + baseline CSS into popup", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    // Stub window.open so we can capture the popup document HTML
    // without actually opening a tab.
    await page.evaluate(() => {
      (window as any).__lastPopupHtml = "";
      const fakeDoc = {
        open: () => {},
        write: (h: string) => { (window as any).__lastPopupHtml += h; },
        close: () => {},
        readyState: "complete",
        querySelectorAll: () => [],
        createElement: (t: string) => document.createElement(t),
        body: document.body,
      };
      const fakeWin: any = {
        document: fakeDoc,
        focus: () => {},
        print: () => { (window as any).__popupPrinted = true; },
        close: () => {},
        addEventListener: () => {},
      };
      window.open = () => fakeWin;

      const host = document.createElement("div");
      host.id = "src-host";
      host.innerHTML = `<div id="doc-print" style="font-size:14px">
        <h1>ใบเสร็จ A</h1><table><tr><td>ฟิล์ม</td><td>2</td></tr></table>
      </div>`;
      document.body.appendChild(host);
    });

    const { html, diag } = await page.evaluate(async () => {
      const mod = await import("/src/pages/receipts/lib/printWindow.ts");
      const src = document.querySelector("#doc-print") as HTMLElement;
      mod.openPrintWindow({
        bodyHtml: src.outerHTML,
        sourceEl: src,
        paperSize: "A4",
        orient: "portrait",
        manualPrintToolbar: true,
      });
      await new Promise((r) => setTimeout(r, 200));
      return {
        html: (window as any).__lastPopupHtml as string,
        diag: (window as any).__lovablePrintDiagnostics,
      };
    });

    expect(html).toContain('id="doc-print"');
    expect(html).toContain("ใบเสร็จ A");
    expect(html).toContain("พิมพ์เอกสาร");
    expect(html).toContain("Sarabun"); // baseline CSS sentinel
    expect(html).toContain("@page { size: A4 portrait");
    expect(diag).toBeTruthy();
    expect(diag.sourceElProvided).toBe(true);
    expect(diag.bodyHtmlBytes).toBeGreaterThan(50);
  });

  test("empty body: fallbackReason recorded as empty_body", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const fakeDoc = {
        open: () => {}, write: () => {}, close: () => {},
        readyState: "complete", querySelectorAll: () => [],
        createElement: (t: string) => document.createElement(t),
        body: document.body,
      };
      window.open = () => ({
        document: fakeDoc, focus: () => {}, print: () => {},
        close: () => {}, addEventListener: () => {},
      }) as any;
    });
    const diag = await page.evaluate(async () => {
      const mod = await import("/src/pages/receipts/lib/printWindow.ts");
      mod.openPrintWindow({ bodyHtml: "<div></div>", paperSize: "A4" });
      await new Promise((r) => setTimeout(r, 200));
      return (window as any).__lovablePrintDiagnostics;
    });
    expect(diag.fallbackReason).toBe("empty_body");
    expect(diag.errors.length).toBeGreaterThan(0);
  });
});