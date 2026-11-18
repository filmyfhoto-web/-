import { test, expect, devices } from "@playwright/test";

/**
 * Responsive checks for DocumentPreview:
 * - Desktop: items table is wide, issuer block is on the right column.
 * - Mobile: items table + issuer block render correctly (A4 paper is fixed
 *   width, so we only assert structural correctness, not viewport-fit).
 */

const STORE = {
  id: "s1", slug: "colorlab",
  name: "นัฐภรณ์ คัลเลอร์แล็ป",
  tax_id: null, phone: null, address: null,
  logo_url: null,
  brand_color: "221 83% 45%",
  default_vat_rate: 0, vat_enabled: false,
};
const STATE = {
  document_type: "receipt", paper_size: "A4", template: "modern",
  document_date: "2026-06-24", show_document_date: true,
  vat_mode: "none", vat_rate: 0, price_type: "no_vat",
  withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
  customer_id: null, customer_name: "ลูกค้า",
  customer_phone: "", customer_address: "", customer_tax_id: "", customer_branch: "",
  payment_method: "cash", notes: "",
  items: [
    { key: "k1", product_id: null, name: "สินค้า A", description: "",
      price: 100, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
  ],
};
const TOTALS = {
  subtotal: 100, discount_total: 0, amount_before_vat: 100,
  vat_amount: 0, grand_total: 100, withholding_tax_amount: 0, net_total: 100,
};

async function renderAndProbe(page: import("@playwright/test").Page) {
  return await page.evaluate(async ({ store, state, totals }) => {
    const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
    const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react")).then((m: any) => m.default ?? m);
    const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client")).then((m: any) => m.default ?? m);

    const host = document.createElement("div");
    host.id = "rs-host";
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.width = "100vw";
    host.style.overflow = "auto";
    host.style.background = "#fff";
    document.body.appendChild(host);
    const root = (RDS as any).createRoot(host);
    root.render((React as any).createElement((previewMod as any).default, {
      store, state, totals, docNo: "RS-1",
    }));
    await new Promise((r) => setTimeout(r, 300));

    const printEl = host.querySelector("#doc-print") as HTMLElement;
    const table = printEl.querySelector("table") as HTMLTableElement;
    const ths = Array.from(table.querySelectorAll("thead th")) as HTMLElement[];

    const issuerLabel = Array.from(printEl.querySelectorAll("p")).find(
      (p) => p.textContent?.trim().startsWith("ผู้ออกเอกสาร"),
    );
    const issuerSection = (issuerLabel?.parentElement as HTMLElement) ?? null;
    const customerLabel = Array.from(printEl.querySelectorAll("p")).find(
      (p) => p.textContent?.trim().startsWith("ข้อมูลลูกค้า"),
    );
    const customerSection = (customerLabel?.parentElement as HTMLElement) ?? null;

    return {
      tableWidth: table.getBoundingClientRect().width,
      thsAllVisible: ths.every((th) => th.offsetWidth > 0),
      issuerHasStoreName: !!issuerSection &&
        Array.from(issuerSection.querySelectorAll("p")).some(
          (p) => p.textContent?.trim() === store.name,
        ),
      issuerLeft: issuerSection?.getBoundingClientRect().left ?? null,
      customerLeft: customerSection?.getBoundingClientRect().left ?? null,
      customerWidth: customerSection?.getBoundingClientRect().width ?? null,
    };
  }, { store: STORE, state: STATE, totals: TOTALS });
}

test.describe("Desktop viewport (1280x900)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("table is wide, issuer column is on the right", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const r = await renderAndProbe(page);
    expect(r.tableWidth).toBeGreaterThan(600);
    expect(r.thsAllVisible).toBe(true);
    expect(r.issuerHasStoreName).toBe(true);
    // grid-cols-2 → issuer is to the right of (customer left + half its width)
    expect(r.issuerLeft).not.toBeNull();
    expect(r.customerLeft).not.toBeNull();
    expect(r.issuerLeft!).toBeGreaterThan(r.customerLeft! + (r.customerWidth! / 2));
  });
});

test.describe("Mobile viewport (iPhone 14)", () => {
  test.use({ ...devices["iPhone 14"] });

  test("issuer section + items table render correctly on small screen", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const r = await renderAndProbe(page);
    // A4 paper is fixed-width (210mm) — table itself stays wide regardless.
    expect(r.tableWidth).toBeGreaterThan(400);
    expect(r.thsAllVisible).toBe(true);
    // The "ผู้ออกเอกสาร" section MUST still render and contain the store name.
    expect(r.issuerHasStoreName).toBe(true);
  });
});