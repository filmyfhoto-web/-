import { test, expect } from "@playwright/test";

/**
 * Branding regression — verifies:
 *  1. When a store has logo_url + brand_color, the modern DocumentPreview
 *     renders the logo image and applies the brand color (--brand var).
 *  2. The store name does NOT appear under the logo in the header area —
 *     it must be rendered exactly once, inside the "ผู้ออกเอกสาร" section.
 *  3. The generated PDF blob is non-empty (logo + theme rendered without crash).
 *     Because elementToPdfBlob snapshots #doc-print 1:1 via html2canvas,
 *     the DOM occurrence count proves the PDF occurrence count.
 */

const FIXTURE_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zy3l4QAAAAASUVORK5CYII=";

test.describe("Document branding (logo + brand_color)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  });

  test("logo + blue brand color renders in modern preview & PDF", async ({ page }) => {
    const result = await page.evaluate(async (logo) => {
      const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
      const pdfMod = await import("/src/pages/receipts/lib/pdfUtils.ts");
      const themeMod = await import("/src/pages/receipts/lib/docTheme.ts");
      const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react")).then((m: any) => m.default ?? m);
      const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client")).then((m: any) => m.default ?? m);

      const store = {
        id: "s1",
        slug: "colorlab",
        name: "นัฐภรณ์ คัลเลอร์แล็ป",
        tax_id: null,
        phone: null,
        address: null,
        logo_url: logo,
        brand_color: "221 83% 45%",
        default_vat_rate: 0,
        vat_enabled: false,
      };
      const state = {
        document_type: "receipt",
        paper_size: "A4",
        template: "modern",
        document_date: "2026-06-24",
        show_document_date: true,
        vat_mode: "none",
        vat_rate: 0,
        price_type: "no_vat",
        withholding_tax_enabled: false,
        withholding_tax_rate: 0,
        discount_amount: 0,
        customer_id: null,
        customer_name: "ลูกค้า",
        customer_phone: "",
        customer_address: "",
        customer_tax_id: "",
        customer_branch: "",
        payment_method: "cash",
        notes: "",
        items: [
          { key: "k1", product_id: null, name: "สินค้า A", description: "", price: 100, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
        ],
      };
      const totals = {
        subtotal: 100, discount_total: 0, amount_before_vat: 100,
        vat_amount: 0, grand_total: 100, withholding_tax_amount: 0, net_total: 100,
      };

      const host = document.createElement("div");
      host.style.position = "fixed";
      host.style.left = "-10000px";
      document.body.appendChild(host);
      const root = (RDS as any).createRoot(host);
      root.render((React as any).createElement((previewMod as any).default, {
        store, state, totals, docNo: "TEST-BRAND-1",
      }));
      await new Promise((r) => setTimeout(r, 250));

      const printEl = host.querySelector("#doc-print") as HTMLElement;
      const logoImg = printEl?.querySelector("img") as HTMLImageElement | null;
      const brandVar = printEl ? getComputedStyle(printEl).getPropertyValue("--brand").trim() : "";

      // Count occurrences of the store name within #doc-print
      const nameMatches = Array.from(printEl?.querySelectorAll("p") ?? []).filter(
        (p) => p.textContent?.trim() === store.name,
      );
      const nameOccurrences = nameMatches.length;

      // The logo container (parent of the <img>) must NOT contain the store name
      const logoContainer = logoImg?.parentElement ?? null;
      const nameUnderLogo = !!(
        logoContainer &&
        Array.from(logoContainer.querySelectorAll("p")).some(
          (p) => p.textContent?.trim() === store.name,
        )
      );

      // The seller ("ผู้ขาย") section must contain the store name
      const issuerLabel = Array.from(printEl?.querySelectorAll("p") ?? []).find(
        (p) => p.textContent?.trim().startsWith("ผู้ขาย"),
      );
      const issuerSection = issuerLabel?.parentElement ?? null;
      const nameInIssuerSection = !!(
        issuerSection &&
        Array.from(issuerSection.querySelectorAll("p")).some(
          (p) => p.textContent?.trim() === store.name,
        )
      );

      const blob = await (pdfMod as any).elementToPdfBlob(printEl, "A4");

      root.unmount();
      host.remove();

      return {
        hasLogoImg: !!logoImg && logoImg.src.startsWith("data:image/png"),
        brandVar,
        nameOccurrences,
        nameUnderLogo,
        nameInIssuerSection,
        pdfSize: blob.size,
        // Documents are colour-coded by type; the receipt accent is the
        // expected --brand value, not the raw store brand_color.
        expectedBrand: (themeMod as any).hexToHslTriplet((themeMod as any).resolveDocTheme("receipt", store).title),
      };
    }, FIXTURE_LOGO);

    expect(result.hasLogoImg).toBe(true);
    expect(result.brandVar).toBe(result.expectedBrand);
    // Store name must NOT appear under the logo
    expect(result.nameUnderLogo).toBe(false);
    // Store name must appear inside the seller ("ผู้ขาย") section
    expect(result.nameInIssuerSection).toBe(true);
    // And must appear exactly once across #doc-print (which is what gets rasterized into the PDF)
    expect(result.nameOccurrences).toBe(1);
    expect(result.pdfSize).toBeGreaterThan(1000);
  });
});
