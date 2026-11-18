import { test, expect, type Page } from "@playwright/test";

/**
 * Pre-print display options (show_payment_method / show_payment_date /
 * show_footer_document_date) must be honored by every template when the
 * document is printed. We mount DocumentPreview directly with each
 * template + flag combination and read the printable copy.
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 1,
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

type Flags = {
  show_payment_method?: boolean;
  show_payment_date?: boolean;
  show_footer_document_date?: boolean;
};

async function mount(page: Page, template: string, flags: Flags) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ template, flags }) => {
    const prev = document.getElementById("flags-host");
    if (prev) prev.remove();
    const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
    const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react"));
    const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client"));
    const ReactApi = (React as any).default ?? React;
    const RDSApi = (RDS as any).default ?? RDS;
    const store = {
      id: "s1", slug: "colorlab", name: "ร้านทดสอบ",
      tax_id: "", phone: "0800000000", address: "", logo_url: null,
      brand_color: "160 72% 38%", default_vat_rate: 0, vat_enabled: false,
    };
    const state = {
      document_type: "receipt", paper_size: "A4", template,
      document_date: "2026-06-24", show_document_date: true,
      vat_mode: "none", vat_rate: 0, price_type: "no_vat",
      withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
      customer_id: null, customer_name: "ลูกค้าทดสอบ",
      customer_phone: "", customer_address: "", customer_tax_id: "", customer_branch: "",
      payment_method: "cash", notes: "",
      show_payment_method: true,
      show_payment_date: true,
      show_footer_document_date: true,
      ...flags,
      items: [{
        key: "k1", product_id: null, name: "สินค้า A", description: "",
        price: 100, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0,
      }],
    };
    const totals = {
      subtotal: 100, discount_total: 0, amount_before_vat: 100,
      vat_amount: 0, grand_total: 100, withholding_tax_amount: 0, net_total: 100,
    };
    const host = document.createElement("div");
    host.id = "flags-host";
    host.style.cssText = "position:fixed;left:0;top:0;background:#fff;z-index:99999;";
    document.body.appendChild(host);
    const root = (RDSApi as any).createRoot(host);
    root.render((ReactApi as any).createElement((previewMod as any).default, {
      store, state, totals, docNo: "FL-001",
    }));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !host.querySelector("#doc-print")) {
      await new Promise((r) => setTimeout(r, 16));
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, { template, flags });
}

async function printedText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.querySelector("#flags-host #doc-print") as HTMLElement;
    return (root?.innerText || "").replace(/\s+/g, " ");
  });
}

const TEMPLATES = ["modern", "classic", "compact", "formal"] as const;

for (const tpl of TEMPLATES) {
  test(`[${tpl}] all flags ON renders วิธีจ่ายเงิน + วันที่จ่ายเงิน in print`, async ({ page }) => {
    await mount(page, tpl, {});
    await page.emulateMedia({ media: "print" });
    const t = await printedText(page);
    expect(t).toContain("วิธีจ่ายเงิน");
    expect(t).toContain("วันที่จ่ายเงิน");
  });

  test(`[${tpl}] show_payment_method=false hides วิธีจ่ายเงิน in print`, async ({ page }) => {
    await mount(page, tpl, { show_payment_method: false });
    await page.emulateMedia({ media: "print" });
    expect(await printedText(page)).not.toContain("วิธีจ่ายเงิน");
  });

  test(`[${tpl}] show_payment_date=false hides วันที่จ่ายเงิน in print`, async ({ page }) => {
    await mount(page, tpl, { show_payment_date: false });
    await page.emulateMedia({ media: "print" });
    expect(await printedText(page)).not.toContain("วันที่จ่ายเงิน");
  });

  test(`[${tpl}] all flags OFF still prints core content (สินค้า + docNo)`, async ({ page }) => {
    await mount(page, tpl, {
      show_payment_method: false,
      show_payment_date: false,
      show_footer_document_date: false,
    });
    await page.emulateMedia({ media: "print" });
    const t = await printedText(page);
    expect(t).toContain("สินค้า A");
    expect(t).toContain("FL-001");
    expect(t).not.toContain("วิธีจ่ายเงิน");
    expect(t).not.toContain("วันที่จ่ายเงิน");
  });
}
