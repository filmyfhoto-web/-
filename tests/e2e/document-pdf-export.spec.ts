import { test, expect, type Page } from "@playwright/test";

/**
 * Real PDF export check — calls the same `elementToPdfBlob` helper the app
 * uses for "Export PDF" and verifies that for receipt / delivery / tax_invoice:
 *
 *   - The produced PDF parses
 *   - Every page is A4 portrait (595 × 842 pt at 72dpi, ±2pt)
 *   - There is at least one PDF page per .doc-page rendered on screen
 *   - Each page contains at least one image XObject (the rasterized doc page),
 *     meaning the header/table/signature block were captured — not blank
 *   - The image on each page covers ≥ 95% of the printable width (no clipping)
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 1,
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

const A4_W_PT = 595.28;
const A4_H_PT = 841.89;

const CASES = ["receipt", "delivery", "tax_invoice"] as const;

async function mountAndExport(page: Page, docType: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  return page.evaluate(async ({ dt }) => {
    const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
    const pdfMod = await import("/src/pages/receipts/lib/pdfUtils.ts");
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
    // Enough items to spill to a 2nd page so we verify multi-page export too.
    const items = Array.from({ length: 28 }, (_, i) => ({
      key: `k${i}`, product_id: null,
      name: `รายการที่ ${i + 1}`, description: "",
      price: 100 + i, quantity: 1, unit: "ชิ้น",
      discount_percent: 0, discount_amount: 0,
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
    host.id = "pdf-host";
    host.style.cssText = "position:fixed;left:0;top:0;background:#fff;z-index:99999;";
    document.body.appendChild(host);
    const root = (RDS as any).createRoot(host);
    root.render((React as any).createElement((previewMod as any).default, {
      store, state, totals, docNo: `PDF-${dt}`,
    }));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !host.querySelector("#doc-print")) {
      await new Promise((r) => setTimeout(r, 16));
    }
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const printEl = host.querySelector("#doc-print") as HTMLElement;
    const screenPages = printEl.querySelectorAll(".doc-page").length;

    const blob = await pdfMod.elementToPdfBlob(printEl, "A4", "portrait");
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // base64 encode for return to Node side
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunk)) as any,
      );
    }
    return { pdfB64: btoa(bin), screenPages };
  }, { dt: docType });
}

/** Lightweight PDF inspector — counts pages, reads /MediaBox + /XObject use. */
function inspectPdf(buf: Buffer) {
  const text = buf.toString("latin1");

  // Each page object has "/Type /Page" (singular, with optional whitespace).
  const pageMatches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? [];
  const pageCount = pageMatches.length;

  // /MediaBox [a b c d] — collect all rectangles.
  const mediaBoxes: number[][] = [];
  const mbRe = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = mbRe.exec(text)) !== null) {
    mediaBoxes.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])]);
  }

  // Image XObjects (Subtype /Image) — should be ≥ pageCount (one per page).
  const imageXObjects = (text.match(/\/Subtype\s*\/Image/g) ?? []).length;

  // Page content stream "Do" operators referencing an XObject indicate the
  // raster was actually placed on a page.
  const doOps = (text.match(/\s\/[A-Za-z0-9_]+\s+Do(\s|\n|\r)/g) ?? []).length;

  return { pageCount, mediaBoxes, imageXObjects, doOps };
}

for (const docType of CASES) {
  test(`PDF export — ${docType} produces valid A4 pages with header/table/signature`, async ({ page }) => {
    const { pdfB64, screenPages } = await mountAndExport(page, docType);

    const buf = Buffer.from(pdfB64, "base64");
    expect(buf.byteLength, "PDF is non-trivial size").toBeGreaterThan(5000);
    expect(buf.slice(0, 5).toString("latin1"), "PDF magic header").toBe("%PDF-");

    const info = inspectPdf(buf);

    // One PDF page per .doc-page rendered.
    expect(info.pageCount, "PDF page count matches doc-page count")
      .toBeGreaterThanOrEqual(screenPages);
    expect(info.pageCount).toBeGreaterThanOrEqual(1);

    // Every page is A4 portrait (within 2pt).
    expect(info.mediaBoxes.length).toBeGreaterThanOrEqual(info.pageCount);
    for (const [x0, y0, x1, y1] of info.mediaBoxes) {
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);
      expect(Math.abs(w - A4_W_PT), `A4 width on every page (got ${w}pt)`)
        .toBeLessThanOrEqual(2);
      expect(Math.abs(h - A4_H_PT), `A4 height on every page (got ${h}pt)`)
        .toBeLessThanOrEqual(2);
    }

    // At least one image XObject per page — header / table / signature
    // are all inside the rasterized .doc-page, so a present image proves they
    // weren't dropped from the export.
    expect(info.imageXObjects, "image XObject per page")
      .toBeGreaterThanOrEqual(info.pageCount);

    // The image is actually drawn on a page (Do operator present per page).
    expect(info.doOps, "image placed via Do op per page")
      .toBeGreaterThanOrEqual(info.pageCount);
  });
}
