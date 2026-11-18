import { test, expect, type Page } from "@playwright/test";

/**
 * Regression guard: under @media print, #doc-print must be present in the
 * DOM with non-zero size and matching content across desktop/tablet/mobile
 * for all three document types — no more blank prints.
 */

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];

const DOC_TYPES = ["receipt", "delivery", "tax_invoice"] as const;

async function mount(page: Page, docType: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ dt }) => {
    const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
    const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react"));
    const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client"));
    const ReactApi = (React as any).default ?? React;
    const RDSApi = (RDS as any).default ?? RDS;

    const store = {
      id: "s1", slug: "colorlab",
      name: "นัฐภรณ์ คัลเลอร์แล็ป",
      tax_id: "0105556789012", phone: "0812345678",
      address: "123/45 ถนนทดสอบ", logo_url: null,
      brand_color: "221 83% 45%",
      default_vat_rate: dt === "tax_invoice" ? 7 : 0,
      vat_enabled: dt === "tax_invoice",
    };
    const items = [
      { key: "a", product_id: null, name: "ฟิล์ม 35mm", description: "",
        price: 120, quantity: 2, unit: "ม้วน", discount_percent: 0, discount_amount: 0 },
      { key: "b", product_id: null, name: "ล้างฟิล์ม", description: "",
        price: 80, quantity: 3, unit: "ม้วน", discount_percent: 0, discount_amount: 0 },
    ];
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
    host.id = "pnb-host";
    host.style.cssText = "position:fixed;left:0;top:0;background:#fff;z-index:99999;";
    document.body.appendChild(host);
    const root = (RDSApi as any).createRoot(host);
    root.render((ReactApi as any).createElement((previewMod as any).default, {
      store, state, totals, docNo: `PNB-${dt}`,
    }));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !host.querySelector("#doc-print")) {
      await new Promise((r) => setTimeout(r, 16));
    }
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, { dt: docType });
}

for (const vp of VIEWPORTS) {
  for (const dt of DOC_TYPES) {
    test(`print not blank — ${vp.name} · ${dt}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await mount(page, dt);

      await page.emulateMedia({ media: "screen" });
      const screenText = await page.evaluate(() => {
        const el = document.querySelector("#pnb-host #doc-print") as HTMLElement | null;
        return (el?.innerText ?? "").replace(/\s+/g, " ").trim();
      });
      expect(screenText.length, "preview has content").toBeGreaterThan(50);

      await page.emulateMedia({ media: "print" });
      const printInfo = await page.evaluate(() => {
        const el = document.querySelector("#pnb-host #doc-print") as HTMLElement | null;
        if (!el) return { exists: false, height: 0, text: "" };
        return {
          exists: true,
          height: el.getBoundingClientRect().height,
          text: (el.innerText ?? "").replace(/\s+/g, " ").trim(),
        };
      });

      expect(printInfo.exists, "#doc-print exists under @media print").toBe(true);
      expect(printInfo.height, "#doc-print has rendered height").toBeGreaterThan(200);
      expect(printInfo.text.length, "print copy is not blank").toBeGreaterThan(50);

      // Print must contain the same key content as preview.
      expect(printInfo.text).toContain(`PNB-${dt}`);
      expect(printInfo.text).toContain("ฟิล์ม 35mm");
      expect(printInfo.text).toContain("ล้างฟิล์ม");
      expect(printInfo.text).toContain("ลูกค้าทดสอบ");
    });
  }
}