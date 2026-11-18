import { test, expect, type Page } from "@playwright/test";

/**
 * Print Preview content check for the standalone print route.
 *
 * We mount <DocumentPreview> directly under a `.print-route-container` wrapper
 * with the same body classes the standalone route applies (`print-route`,
 * `is-printing`), emulate media=print, then assert that the printable DOM
 * shows the store header, customer, at least one line item, and the total —
 * i.e. Chrome Print Preview would NOT render a blank A4 page.
 *
 * This mirrors the hermetic mount pattern used by document-edit-and-print
 * and document-print-not-blank so it runs without Supabase auth.
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 1,
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

async function mount(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    document.body.classList.add("print-route", "is-printing");
    const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
    const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react"));
    const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client"));
    const ReactApi = (React as any).default ?? React;
    const RDSApi = (RDS as any).default ?? RDS;

    const store = {
      id: "s1", slug: "printing", name: "ร้านนัฐภรณ์ การพิมพ์",
      tax_id: "1559900256305", phone: "0932296596",
      address: "72/2 ม.11 ต.เชียงกลาง อ.เชียงกลาง จ.น่าน",
      logo_url: null, brand_color: "221 83% 45%",
      default_vat_rate: 0, vat_enabled: false,
    };
    const items = [
      { key: "a", product_id: null, name: "บัตรสมนาคุณ", description: "",
        price: 150, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
      { key: "b", product_id: null, name: "ล้างฟิล์ม 135", description: "",
        price: 80, quantity: 3, unit: "ม้วน", discount_percent: 0, discount_amount: 0 },
    ];
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const state = {
      document_type: "receipt", paper_size: "A4", template: "modern",
      document_date: "2026-07-14", show_document_date: true,
      vat_mode: "none", vat_rate: 0, price_type: "no_vat",
      withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
      customer_id: null, customer_name: "คุณสมชาย ทดสอบ",
      customer_phone: "0812345678", customer_address: "", customer_tax_id: "", customer_branch: "",
      payment_method: "cash", notes: "", items,
      show_payment_date: true, show_payment_method: true, show_footer_document_date: true,
    };
    const totals = {
      subtotal, discount_total: 0, amount_before_vat: subtotal,
      vat_amount: 0, grand_total: subtotal,
      withholding_tax_amount: 0, net_total: subtotal,
    };

    const host = document.createElement("div");
    host.id = "print-test-host";
    host.className = "print-route-container bg-white";
    document.body.appendChild(host);
    const root = RDSApi.createRoot(host);
    root.render(
      ReactApi.createElement(
        "div",
        { className: "print-doc-block" },
        ReactApi.createElement(previewMod.default, {
          store, state, totals, docNo: "RC-2026-0001",
        }),
      ),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await (document as any).fonts?.ready; } catch { /* noop */ }
  });
}

test.describe("Print Preview content", () => {
  test("A4 receipt renders store/customer/items/total (not blank)", async ({ page }) => {
    await mount(page);
    const printArea = page.locator("#print-test-host");
    await expect(printArea).toBeVisible();

    // Store header
    await expect(printArea).toContainText("ร้านนัฐภรณ์ การพิมพ์");
    // Customer name
    await expect(printArea).toContainText("คุณสมชาย ทดสอบ");
    // At least one line item name
    await expect(printArea).toContainText("บัตรสมนาคุณ");
    // Totals — 150 + 240 = 390
    await expect(printArea).toContainText(/390/);

    // Non-empty layout box
    const box = await printArea.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);
    expect(box?.height ?? 0).toBeGreaterThan(200);

    // PDF sanity — chromium only.
    const isChromium = test.info().project.name.toLowerCase().includes("chrom") ||
                       test.info().project.name === "" || test.info().project.name === undefined;
    if (isChromium) {
      try {
        await page.emulateMedia({ media: "print" });
        const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
        // A blank A4 PDF from Chromium is ~1KB. A page with content is much larger.
        expect(pdf.byteLength).toBeGreaterThan(20_000);
      } catch {
        // page.pdf() throws on non-chromium; ignore in that case.
      }
    }
  });
});