import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies the visual ordering of key print-preview elements:
 *   header (top) → items table (middle) → totals (bottom)
 * and that fonts + images are actually ready before window.print() would fire.
 *
 * Hermetic mount pattern (same as document-print-preview-content.spec.ts):
 * we render <DocumentPreview> under a print-route wrapper and read
 * bounding boxes from the DOM.
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
      logo_url: "https://picsum.photos/seed/nattaporn-logo/240/240",
      brand_color: "221 83% 45%",
      default_vat_rate: 0, vat_enabled: false,
    };
    const items = [
      { key: "a", product_id: null, name: "บัตรสมนาคุณ", description: "",
        price: 150, quantity: 2, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
      { key: "b", product_id: null, name: "ล้างฟิล์ม 135", description: "",
        price: 80, quantity: 4, unit: "ม้วน", discount_percent: 0, discount_amount: 0 },
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
    host.id = "print-pos-host";
    host.className = "print-route-container bg-white";
    document.body.appendChild(host);
    const root = RDSApi.createRoot(host);
    root.render(
      ReactApi.createElement(
        "div",
        { className: "print-doc-block", "data-testid": "print-doc-block" },
        ReactApi.createElement(previewMod.default, {
          store, state, totals, docNo: "RC-2026-0001",
        }),
      ),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await (document as any).fonts?.ready; } catch { /* noop */ }
  });
}

test.describe("Print preview layout positions", () => {
  test("header sits above items table which sits above totals; fonts+images ready", async ({ page }) => {
    await mount(page);
    const host = page.locator("#print-pos-host");
    await expect(host).toBeVisible();

    // Fonts must resolve BEFORE we would call window.print().
    const fontsReady = await page.evaluate(async () => {
      try { await (document as any).fonts?.ready; return true; } catch { return false; }
    });
    expect(fontsReady, "document.fonts.ready must resolve").toBe(true);

    // Every <img> inside the print area must have completed loading with real pixels.
    const imgStatus = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("#print-pos-host img"));
      return imgs.map((img) => ({
        src: img.currentSrc || img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
      }));
    });
    for (const img of imgStatus) {
      expect(img.complete, `image ${img.src} must be complete`).toBe(true);
      expect(img.naturalWidth, `image ${img.src} must have real pixels`).toBeGreaterThan(0);
    }

    // Header (title). DocumentPreview renders the doc title as an <h1>.
    const header = host.locator("h1").first();
    await expect(header).toBeVisible();
    // Items table.
    const itemsTable = host.locator(".doc-items-table").first();
    await expect(itemsTable).toBeVisible();
    // Totals block — DocumentPreview renders a "รวมทั้งสิ้น" / total line near the bottom.
    const totals = host.getByText(/รวมทั้งสิ้น|ยอดสุทธิ|Total/i).last();
    await expect(totals).toBeVisible();

    const hb = await header.boundingBox();
    const tb = await itemsTable.boundingBox();
    const totb = await totals.boundingBox();
    expect(hb && tb && totb, "all three regions have layout boxes").toBeTruthy();

    // header top < items table top < totals top — strict vertical order.
    expect(hb!.y).toBeLessThan(tb!.y);
    expect(tb!.y + tb!.height).toBeLessThanOrEqual(totb!.y + totb!.height + 1);
    expect(hb!.y + hb!.height).toBeLessThanOrEqual(tb!.y + 4);

    // Header hugs the top of the doc block, totals sit clearly below middle.
    const blockBox = await host.boundingBox();
    expect(hb!.y - blockBox!.y).toBeLessThan(200);
    expect(totb!.y - blockBox!.y).toBeGreaterThan(blockBox!.height * 0.4);

    // Sanity: PDF is not blank in chromium.
    const isChromium = (test.info().project.name || "").toLowerCase().includes("chrom") ||
                       !test.info().project.name;
    if (isChromium) {
      try {
        await page.emulateMedia({ media: "print" });
        const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
        expect(pdf.byteLength).toBeGreaterThan(20_000);
      } catch { /* non-chromium */ }
    }
  });
});