import { test } from "@playwright/test";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Debug helper — NOT a regression test.
 *
 * Run with: `DOC_DEBUG=1 bunx playwright test document-debug-dump`
 * (skipped by default to keep CI fast)
 *
 * Renders DocumentPreview off-screen and dumps:
 *  - screenshots of #doc-print, each .doc-page, the items <table>, header,
 *    and the "ผู้ออกเอกสาร" section
 *  - a JSON layout report with bounding rects, computed styles, and overflow
 *    diagnostics for the same elements
 *
 * Output → tests/e2e/__debug__/<timestamp>/
 * Use this when a snapshot test fails and you need to see WHY quickly.
 */

const RUN = !!process.env.DOC_DEBUG;

const DOC_TYPES = ["receipt", "delivery", "tax_invoice"] as const;

test.describe("Document layout debug dump", () => {
  test.skip(!RUN, "Set DOC_DEBUG=1 to enable this debug helper");

  for (const docType of DOC_TYPES) {
  test(`dump ${docType} — element screenshots + layout metrics`, async ({ page }, testInfo) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.resolve(
      testInfo.project.testDir,
      "__debug__",
      `${stamp}-${docType}`,
    );
    fs.mkdirSync(outDir, { recursive: true });

    await page.goto("/login", { waitUntil: "domcontentloaded" });

    // Mount DocumentPreview off-screen with a realistic multi-page state for this doc type.
    await page.evaluate(async ({ dt }) => {
      const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
      const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react")).then((m: any) => m.default ?? m);
      const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client")).then((m: any) => m.default ?? m);

      const store = {
        id: "s1", slug: "colorlab",
        name: "นัฐภรณ์ คัลเลอร์แล็ป",
        tax_id: "0105556789012", phone: "0812345678",
        address: "123/45 ถนนทดสอบ แขวงทดลอง เขตทดสอบ กรุงเทพ 10110",
        logo_url: null,
        brand_color: "221 83% 45%",
        default_vat_rate: dt === "tax_invoice" ? 7 : 0,
        vat_enabled: dt === "tax_invoice",
      };
      const items = Array.from({ length: 8 }, (_, i) => ({
        key: `k${i}`,
        product_id: null,
        name: i === 0
          ? "สินค้าชื่อยาวมากเพื่อทดสอบการตัดคำในเซลล์ตาราง ABC1234567890"
          : `รายการสินค้าที่ ${i + 1}`,
        description: i === 0 ? "รายละเอียดยาวเพิ่มเติม" : "",
        price: i === 1 ? 9999999 : 100 + i,
        quantity: 1,
        unit: "ชิ้น",
        discount_percent: 0,
        discount_amount: 0,
      }));
      const state = {
        document_type: dt, paper_size: "A4", template: "modern",
        document_date: "2026-06-24", show_document_date: true,
        vat_mode: dt === "tax_invoice" ? "exclusive" : "none",
        vat_rate: dt === "tax_invoice" ? 7 : 0,
        price_type: dt === "tax_invoice" ? "exclude_vat" : "no_vat",
        withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
        customer_id: null, customer_name: "ลูกค้าทดสอบ",
        customer_phone: "", customer_address: "", customer_tax_id: "", customer_branch: "",
        payment_method: "cash", notes: "", items,
        show_payment_date: true, show_payment_method: true, show_footer_document_date: true,
      };
      const totals = {
        subtotal: 12345678, discount_total: 0, amount_before_vat: 12345678,
        vat_amount: 0, grand_total: 12345678, withholding_tax_amount: 0, net_total: 12345678,
      };

      const host = document.createElement("div");
      host.id = "debug-host";
      host.style.position = "fixed";
      host.style.left = "0";
      host.style.top = "0";
      host.style.background = "#fff";
      host.style.zIndex = "99999";
      document.body.appendChild(host);
      const root = (RDS as any).createRoot(host);
      root.render((React as any).createElement((previewMod as any).default, {
        store, state, totals, docNo: `DBG-${dt}`,
      }));

      // Wait for stable layout.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !host.querySelector("#doc-print")) {
        await new Promise((r) => setTimeout(r, 16));
      }
      if ((document as any).fonts?.ready) await (document as any).fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }, { dt: docType });

    // ---- Layout metrics ----
    const metrics = await page.evaluate(() => {
      const root = document.querySelector("#debug-host") as HTMLElement;
      const printEl = root.querySelector("#doc-print") as HTMLElement;

      const describe = (el: Element | null, label: string) => {
        if (!el) return { label, found: false };
        const e = el as HTMLElement;
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return {
          label,
          found: true,
          tag: e.tagName.toLowerCase(),
          id: e.id || null,
          class: e.className || null,
          rect: {
            x: r.x, y: r.y, width: r.width, height: r.height,
            right: r.right, bottom: r.bottom,
          },
          scrollWidth: e.scrollWidth,
          scrollHeight: e.scrollHeight,
          clientWidth: e.clientWidth,
          clientHeight: e.clientHeight,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          textAlign: cs.textAlign,
          fontSize: cs.fontSize,
          fontFamily: cs.fontFamily,
          padding: cs.padding,
          margin: cs.margin,
          horizontalOverflow: e.scrollWidth > e.clientWidth + 1,
        };
      };

      const pages = Array.from(printEl.querySelectorAll(".doc-page"));
      const tables = Array.from(printEl.querySelectorAll("table"));
      const issuerLabel = Array.from(printEl.querySelectorAll("p")).find(
        (p) => p.textContent?.trim().startsWith("ผู้ออกเอกสาร"),
      );
      const issuerSection = (issuerLabel?.parentElement as HTMLElement) ?? null;

      // Per-cell overflow inside the first table.
      const firstTable = tables[0] as HTMLTableElement | undefined;
      const cellOverflow = firstTable
        ? Array.from(firstTable.querySelectorAll("td,th")).map((c, i) => {
            const e = c as HTMLElement;
            const r = e.getBoundingClientRect();
            const tr = firstTable.getBoundingClientRect();
            return {
              i, tag: e.tagName.toLowerCase(),
              text: e.textContent?.trim().slice(0, 40) ?? "",
              right: r.right, tableRight: tr.right,
              overflowsRight: r.right > tr.right + 1,
              clipped: e.scrollWidth > e.clientWidth + 1,
            };
          })
        : [];

      const headerBlock = printEl.querySelector(".doc-page > div") ?? null;

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
        userAgent: navigator.userAgent,
        docPrint: describe(printEl, "#doc-print"),
        pages: pages.map((p, i) => describe(p, `.doc-page[${i}]`)),
        tables: tables.map((t, i) => describe(t, `table[${i}]`)),
        firstHeader: describe(headerBlock, "header (first .doc-page child)"),
        issuer: describe(issuerSection, "ผู้ออกเอกสาร section"),
        cellOverflow,
      };
    });

    fs.writeFileSync(
      path.join(outDir, "layout.json"),
      JSON.stringify(metrics, null, 2),
      "utf8",
    );

    // ---- Screenshots of key elements ----
    const shots: Array<[string, string]> = [
      ["doc-print", "#debug-host #doc-print"],
      ["page-1", "#debug-host .doc-page:nth-of-type(1)"],
      ["page-2", "#debug-host .doc-page:nth-of-type(2)"],
      ["table-1", "#debug-host .doc-page:nth-of-type(1) table"],
      ["header-1", "#debug-host .doc-page:nth-of-type(1) > div:first-child"],
    ];
    for (const [name, selector] of shots) {
      const loc = page.locator(selector).first();
      if ((await loc.count()) === 0) continue;
      try {
        await loc.screenshot({ path: path.join(outDir, `${name}.png`), animations: "disabled", caret: "hide" });
      } catch {
        /* element not visible — skip */
      }
    }

    // The issuer section needs a JS-resolved locator (text-based).
    const issuerHandle = await page.evaluateHandle(() => {
      const printEl = document.querySelector("#debug-host #doc-print");
      if (!printEl) return null;
      const label = Array.from(printEl.querySelectorAll("p")).find(
        (p) => p.textContent?.trim().startsWith("ผู้ออกเอกสาร"),
      );
      return (label?.parentElement as HTMLElement | null) ?? null;
    });
    const issuerEl = issuerHandle.asElement();
    if (issuerEl) {
      try {
        await (issuerEl as any).screenshot({ path: path.join(outDir, "issuer-section.png") });
      } catch {
        /* skip if not screenshot-able */
      }
    }

    // Attach everything to the test report for inline inspection.
    for (const file of fs.readdirSync(outDir)) {
      const full = path.join(outDir, file);
      await testInfo.attach(file, {
        path: full,
        contentType: file.endsWith(".json") ? "application/json" : "image/png",
      });
    }

    // eslint-disable-next-line no-console
    console.log(`[doc-debug] wrote ${outDir}`);
  });

  test(`baseline diff ${docType} — preview vs baseline (screen + print)`, async ({ page }) => {
    // Mount the same fixture as the dump test, then run a baseline screenshot
    // comparison in BOTH screen and print media. First run with
    // `--update-snapshots` creates baselines under tests/e2e/__screenshots__/.
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.setViewportSize({ width: 1280, height: 1800 });

    await page.evaluate(async ({ dt }) => {
      const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
      const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react")).then((m: any) => m.default ?? m);
      const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client")).then((m: any) => m.default ?? m);

      const store = {
        id: "s1", slug: "colorlab",
        name: "นัฐภรณ์ คัลเลอร์แล็ป",
        tax_id: "0105556789012", phone: "0812345678",
        address: "123/45 ถนนทดสอบ", logo_url: null,
        brand_color: "221 83% 45%",
        default_vat_rate: dt === "tax_invoice" ? 7 : 0,
        vat_enabled: dt === "tax_invoice",
      };
      const items = Array.from({ length: 5 }, (_, i) => ({
        key: `k${i}`, product_id: null,
        name: `รายการที่ ${i + 1}`, description: "",
        price: 100 + i * 25, quantity: 1 + (i % 3),
        unit: "ชิ้น", discount_percent: 0, discount_amount: 0,
      }));
      const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const vat = dt === "tax_invoice" ? subtotal * 0.07 : 0;
      const state = {
        document_type: dt, paper_size: "A4", template: "modern",
        document_date: "2026-06-24", show_document_date: true,
        vat_mode: dt === "tax_invoice" ? "exclusive" : "none",
        vat_rate: dt === "tax_invoice" ? 7 : 0,
        price_type: dt === "tax_invoice" ? "exclude_vat" : "no_vat",
        withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
        customer_id: null, customer_name: "ลูกค้าทดสอบ",
        customer_phone: "", customer_address: "", customer_tax_id: "", customer_branch: "",
        payment_method: "cash", notes: "", items,
        show_payment_date: true, show_payment_method: true, show_footer_document_date: true,
      };
      const totals = {
        subtotal, discount_total: 0, amount_before_vat: subtotal,
        vat_amount: vat, grand_total: subtotal + vat,
        withholding_tax_amount: 0, net_total: subtotal + vat,
      };

      const host = document.createElement("div");
      host.id = "baseline-host";
      host.style.cssText = "position:fixed;left:0;top:0;background:#fff;z-index:99999;";
      document.body.appendChild(host);
      const root = (RDS as any).createRoot(host);
      root.render((React as any).createElement((previewMod as any).default, {
        store, state, totals, docNo: `BASE-${dt}`,
      }));
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !host.querySelector("#doc-print")) {
        await new Promise((r) => setTimeout(r, 16));
      }
      if ((document as any).fonts?.ready) await (document as any).fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }, { dt: docType });

    const firstPage = page.locator("#baseline-host .doc-page").first();
    await expect(firstPage).toBeVisible();

    // Screen media baseline.
    await page.emulateMedia({ media: "screen" });
    await expect(firstPage).toHaveScreenshot(`baseline-${docType}-screen.png`);

    // Print media baseline — captures the @media print rules.
    await page.emulateMedia({ media: "print" });
    await expect(firstPage).toHaveScreenshot(`baseline-${docType}-print.png`);
  });
  }
});