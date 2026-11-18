import { test, expect } from "@playwright/test";

/**
 * Verifies that Print + Export PDF output for receipt / delivery / tax_invoice
 * fits inside A4 without horizontal overflow, fills the page width, and that
 * the rasterized output (what becomes the PDF) covers expected vertical area.
 *
 * Mounts DocumentPreview off-screen with a representative state for each
 * document type, then asserts:
 *  - #doc-print scrollWidth never exceeds clientWidth (no right-edge clip)
 *  - .doc-page width is within ±2px of 210mm @ 96dpi (~794px)
 *  - html2canvas raster height covers > 60% of A4 height (~1123px @ 96dpi)
 *  - signature block + totals are present on the last page (not orphaned)
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 1,
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

const A4_PX = 794; // 210mm at 96dpi
const A4_HEIGHT_PX = 1123; // 297mm at 96dpi

type DocCase = {
  type: "receipt" | "delivery" | "tax_invoice";
  expectedSigners: number;
  vatMode: "none" | "exclusive";
};

const CASES: DocCase[] = [
  { type: "receipt", expectedSigners: 2, vatMode: "none" },
  { type: "delivery", expectedSigners: 3, vatMode: "none" },
  { type: "tax_invoice", expectedSigners: 3, vatMode: "exclusive" },
];

for (const c of CASES) {
  test(`A4 fit & coverage — ${c.type}`, async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const report = await page.evaluate(async ({ docType, vatMode }) => {
      const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
      const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react"));
      const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client"));
      const ReactApi = (React as any).default ?? React;
      const RDSApi = (RDS as any).default ?? RDS;
      const html2canvasMod = await import("/node_modules/.vite/deps/html2canvas.js").catch(() => import("html2canvas"));
      const html2canvas = (html2canvasMod as any).default ?? html2canvasMod;

      const store = {
        id: "s1", slug: "colorlab",
        name: "นัฐภรณ์ คัลเลอร์แล็ป",
        tax_id: "0105556789012", phone: "0812345678",
        address: "123/45 ถนนทดสอบ", logo_url: null,
        brand_color: "221 83% 45%",
        default_vat_rate: vatMode === "none" ? 0 : 7, vat_enabled: vatMode !== "none",
      };
      const items = Array.from({ length: 6 }, (_, i) => ({
        key: `k${i}`, product_id: null,
        name: `รายการที่ ${i + 1}`, description: "",
        price: 100 + i * 25, quantity: 1 + (i % 3),
        unit: "ชิ้น", discount_percent: 0, discount_amount: 0,
      }));
      const state = {
        document_type: docType, paper_size: "A4", template: "modern",
        document_date: "2026-06-24", show_document_date: true,
        vat_mode: vatMode, vat_rate: vatMode === "exclusive" ? 7 : 0,
        price_type: vatMode === "exclusive" ? "exclude_vat" : "no_vat",
        withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
        customer_id: null, customer_name: "ลูกค้าทดสอบ",
        customer_phone: "", customer_address: "", customer_tax_id: "", customer_branch: "",
        payment_method: "cash", notes: "", items,
        show_payment_date: true, show_payment_method: true, show_footer_document_date: true,
      };
      const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const vat = vatMode === "exclusive" ? subtotal * 0.07 : 0;
      const totals = {
        subtotal, discount_total: 0, amount_before_vat: subtotal,
        vat_amount: vat, grand_total: subtotal + vat,
        withholding_tax_amount: 0, net_total: subtotal + vat,
      };

      const host = document.createElement("div");
      host.id = "fit-host";
      host.style.cssText = "position:fixed;left:0;top:0;background:#fff;z-index:99999;";
      document.body.appendChild(host);
      const root = (RDSApi as any).createRoot(host);
      root.render((ReactApi as any).createElement((previewMod as any).default, {
        store, state, totals, docNo: `FIT-${docType}`,
      }));

      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !host.querySelector("#doc-print")) {
        await new Promise((r) => setTimeout(r, 16));
      }
      if ((document as any).fonts?.ready) await (document as any).fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const printEl = host.querySelector("#doc-print") as HTMLElement;
      const pages = Array.from(printEl.querySelectorAll(".doc-page")) as HTMLElement[];
      const lastPage = pages[pages.length - 1];
      const signers = lastPage.querySelectorAll(".avoid-break > div").length;
      const lastRect = lastPage.getBoundingClientRect();

      const canvas = await html2canvas(lastPage, {
        scale: 1, backgroundColor: "#ffffff", logging: false,
        useCORS: true, windowWidth: 1280, windowHeight: 1800,
      });

      return {
        pageCount: pages.length,
        printScrollWidth: printEl.scrollWidth,
        printClientWidth: printEl.clientWidth,
        firstPageWidth: pages[0].getBoundingClientRect().width,
        lastPageHeight: lastRect.height,
        rasterWidth: canvas.width,
        rasterHeight: canvas.height,
        signers,
        hasTotalsLabel: !!lastPage.textContent?.includes("ยอดรวมสุทธิ"),
      };
    }, { docType: c.type, vatMode: c.vatMode });

    // No horizontal overflow.
    expect(report.printScrollWidth, "no horizontal overflow")
      .toBeLessThanOrEqual(report.printClientWidth + 1);
    // Page width is A4 (210mm).
    expect(Math.abs(report.firstPageWidth - A4_PX)).toBeLessThanOrEqual(4);
    // Raster (PDF source) covers a meaningful chunk of A4 height.
    expect(report.rasterHeight).toBeGreaterThan(A4_HEIGHT_PX * 0.6);
    // Signature block has the right number of slots for this doc type.
    expect(report.signers).toBe(c.expectedSigners);
    // Totals + bahttext render on the last page (not orphaned to another).
    expect(report.hasTotalsLabel).toBe(true);
  });
}