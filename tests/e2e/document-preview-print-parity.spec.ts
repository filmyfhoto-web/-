import { test, expect, type Page } from "@playwright/test";

/**
 * Parity check — text rendered in DocumentPreview MUST be identical between
 * screen and print media for receipt / delivery / tax_invoice.
 *
 * Catches regressions where:
 *   - an item row is hidden by @media print
 *   - duplicate item names show only once (or twice) in one of the modes
 *   - signature labels are dropped from print
 *   - header/totals strings differ
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 1,
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

const SIGNERS: Record<string, string[]> = {
  receipt: ["ผู้จัดทำ/ผู้พิมพ์", "ผู้รับเงิน"],
  delivery: ["ผู้จัดทำ/ผู้พิมพ์", "ผู้ส่งของ", "ผู้รับเงิน"],
  tax_invoice: ["ผู้จัดทำ/ผู้พิมพ์", "ผู้ส่งของ", "ผู้รับเงิน"],
};

const CASES = ["receipt", "delivery", "tax_invoice"] as const;

async function mountFixture(page: Page, docType: string) {
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
      { key: "b", product_id: null, name: "ฟิล์ม 35mm", description: "",
        price: 120, quantity: 1, unit: "ม้วน", discount_percent: 0, discount_amount: 0 },
      { key: "c", product_id: null, name: "ล้างฟิล์มสี", description: "",
        price: 80, quantity: 3, unit: "ม้วน", discount_percent: 0, discount_amount: 0 },
      { key: "d", product_id: null, name: "อัดรูป 4x6", description: "",
        price: 5, quantity: 50, unit: "ใบ", discount_percent: 0, discount_amount: 0 },
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
    host.id = "parity-host";
    host.style.cssText = "position:fixed;left:0;top:0;background:#fff;z-index:99999;";
    document.body.appendChild(host);
    const root = (RDSApi as any).createRoot(host);
    root.render((ReactApi as any).createElement((previewMod as any).default, {
      store, state, totals, docNo: `PAR-${dt}`,
    }));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !host.querySelector("#doc-print")) {
      await new Promise((r) => setTimeout(r, 16));
    }
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, { dt: docType });
}

async function collect(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector("#parity-host #doc-print") as HTMLElement;
    const cells = Array.from(root.querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td"))
        .map((td) => (td.textContent ?? "").trim().replace(/\s+/g, " "))
        .join(" | "),
    );
    const headers = Array.from(root.querySelectorAll("thead th")).map(
      (th) => (th.textContent ?? "").trim(),
    );
    const text = (root.innerText || "").replace(/\s+/g, " ").trim();
    return { cells, headers, text };
  });
}

for (const docType of CASES) {
  test(`preview ↔ print parity — ${docType}`, async ({ page }) => {
    await mountFixture(page, docType);

    await page.emulateMedia({ media: "screen" });
    const screenView = await collect(page);

    await page.emulateMedia({ media: "print" });
    const printView = await collect(page);

    // Regression guard: printable copy must remain visible under @media print.
    // (Catches the bug where a parent .print:hidden wrapper hid the child #doc-print.)
    const printHeight = await page.evaluate(() => {
      const el = document.querySelector("#parity-host #doc-print") as HTMLElement | null;
      return el ? el.getBoundingClientRect().height : 0;
    });
    expect(printHeight, "#doc-print must have non-zero height under @media print").toBeGreaterThan(200);

    // Row count + content match exactly between screen and print.
    expect(printView.cells.length).toBe(screenView.cells.length);
    expect(printView.cells).toEqual(screenView.cells);

    // Headers identical.
    expect(printView.headers).toEqual(screenView.headers);

    // No rows missing or accidentally duplicated. Fixture has TWO "ฟิล์ม 35mm".
    const nameCount = (rows: string[], name: string) =>
      rows.filter((c) => c.includes(name)).length;
    for (const view of [screenView, printView]) {
      expect(nameCount(view.cells, "ฟิล์ม 35mm")).toBe(2);
      expect(nameCount(view.cells, "ล้างฟิล์มสี")).toBe(1);
      expect(nameCount(view.cells, "อัดรูป 4x6")).toBe(1);
    }

    // Signature labels appear in both modes the same number of times.
    for (const label of SIGNERS[docType]) {
      const screenMatches = screenView.text.split(label).length - 1;
      const printMatches = printView.text.split(label).length - 1;
      expect(screenMatches, `screen contains "${label}"`).toBeGreaterThanOrEqual(1);
      expect(printMatches, `print contains "${label}"`).toBe(screenMatches);
    }
  });
}
