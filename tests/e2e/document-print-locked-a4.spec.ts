import { test, expect, type Page } from "@playwright/test";

/**
 * Locks the printable page to A4 (210 × 297mm) with a 190 × 270mm content
 * frame — i.e. `padding: 10mm 10mm 17mm 10mm`. The test verifies this by
 * mounting <DocumentPreview> hermetically (same pattern as
 * `document-print-layout-positions.spec.ts`) with many items so the
 * document paginates onto multiple pages, then reads the DOM.
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
      id: "s1", slug: "printing", name: "ร้านทดสอบ",
      tax_id: "0000000000000", phone: "0000000000", address: "-",
      logo_url: null, brand_color: "221 83% 45%",
      default_vat_rate: 0, vat_enabled: false,
    };
    // 40 items → forces multi-page pagination in the receipt template.
    const items = Array.from({ length: 40 }, (_, i) => ({
      key: `k${i}`, product_id: null, name: `สินค้า ${i + 1}`, description: "",
      price: 100, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0,
    }));
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const state = {
      document_type: "receipt", paper_size: "A4", template: "modern",
      document_date: "2026-07-14", show_document_date: true,
      vat_mode: "none", vat_rate: 0, price_type: "no_vat",
      withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
      customer_id: null, customer_name: "ลูกค้าทดสอบ",
      customer_phone: "", customer_address: "", customer_tax_id: "", customer_branch: "",
      payment_method: "cash", notes: "", items,
      show_payment_date: true, show_payment_method: true, show_footer_document_date: true,
    };
    const totals = {
      subtotal, discount_total: 0, amount_before_vat: subtotal,
      vat_amount: 0, grand_total: subtotal,
      withholding_tax_amount: 0, net_total: subtotal,
    };

    const host = document.createElement("div");
    host.id = "a4-lock-host";
    host.className = "print-route-container bg-white";
    document.body.appendChild(host);
    const root = RDSApi.createRoot(host);
    root.render(
      ReactApi.createElement(previewMod.default, {
        store, state, totals, docNo: "RC-2026-A4L",
      }),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await (document as any).fonts?.ready; } catch { /* noop */ }
  });
}

test("all .doc-page nodes are locked to A4 210×297mm with 190×270mm content frame", async ({ page }) => {
  await mount(page);

  // The default resolveDocumentPageLayout must emit locked A4 sizes.
  const layout = await page.evaluate(async () => {
    const mod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
    return (mod as any).resolveDocumentPageLayout(null);
  });
  expect(layout).toMatchObject({
    widthMm: 210,
    heightMm: 297,
    contentWidthMm: 190,
    contentHeightMm: 270,
    paddingCss: "10mm 10mm 17mm 10mm",
  });

  // Every rendered page must reflect the same locked frame in px.
  const pages = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("#a4-lock-host .doc-page")) as HTMLElement[];
    return nodes.map((el) => {
      const cs = getComputedStyle(el);
      return {
        width: cs.width,
        minHeight: cs.minHeight,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
      };
    });
  });

  expect(pages.length).toBeGreaterThan(1); // multi-page
  // 210mm ≈ 793.7px @ 96 dpi (allow ±2 px for browser rounding).
  const A4_W_PX = (210 * 96) / 25.4;
  const A4_H_PX = (297 * 96) / 25.4;
  const P_TOP = (10 * 96) / 25.4;
  const P_BOT = (17 * 96) / 25.4;
  const P_LR = (10 * 96) / 25.4;
  for (const p of pages) {
    expect(parseFloat(p.width)).toBeGreaterThan(A4_W_PX - 2);
    expect(parseFloat(p.width)).toBeLessThan(A4_W_PX + 2);
    expect(parseFloat(p.minHeight)).toBeGreaterThan(A4_H_PX - 4);
    expect(parseFloat(p.paddingTop)).toBeGreaterThan(P_TOP - 1);
    expect(parseFloat(p.paddingTop)).toBeLessThan(P_TOP + 1);
    expect(parseFloat(p.paddingBottom)).toBeGreaterThan(P_BOT - 1);
    expect(parseFloat(p.paddingBottom)).toBeLessThan(P_BOT + 1);
    expect(parseFloat(p.paddingLeft)).toBeGreaterThan(P_LR - 1);
    expect(parseFloat(p.paddingRight)).toBeGreaterThan(P_LR - 1);
  }
});
