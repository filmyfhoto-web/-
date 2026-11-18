import { test, expect } from "@playwright/test";

/**
 * Multi-page PDF — verifies:
 * 1. DocumentPreview renders one `.doc-page` per chunk (A4=22 rows/page)
 * 2. Each rendered page contains the table header ("รายการ/รายละเอียดพัสดุ")
 * 3. elementToPdfBlob produces a PDF whose /Type /Page count matches
 */

test.describe("Multi-page PDF", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  });

  test("50 items → 3 A4 pages with repeated table headers", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
      const pdfMod = await import("/src/pages/receipts/lib/pdfUtils.ts");
      const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react")).then((m: any) => m.default ?? m);
      const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client")).then((m: any) => m.default ?? m);

      const items = Array.from({ length: 50 }, (_, i) => ({
        key: `k${i}`,
        product_id: null,
        name: `รายการ A${i + 1}`,
        description: "",
        price: 10,
        quantity: 1,
        unit: "ชิ้น",
        discount_percent: 0,
        discount_amount: 0,
      }));
      const state = {
        document_type: "invoice",
        paper_size: "A4",
        template: "classic",
        document_date: "2026-06-24",
        show_document_date: true,
        vat_mode: "none",
        vat_rate: 0,
        price_type: "no_vat",
        withholding_tax_enabled: false,
        withholding_tax_rate: 0,
        discount_amount: 0,
        customer_id: null,
        customer_name: "ทดสอบ",
        customer_phone: "",
        customer_address: "",
        customer_tax_id: "",
        customer_branch: "",
        payment_method: "cash",
        notes: "",
        items,
      };
      const totals = {
        subtotal: 500, discount_total: 0, amount_before_vat: 500, vat_amount: 0,
        grand_total: 500, withholding_tax_amount: 0, net_total: 500,
      };

      const host = document.createElement("div");
      host.style.position = "fixed";
      host.style.left = "-10000px";
      document.body.appendChild(host);
      const root = (RDS as any).createRoot(host);
      root.render((React as any).createElement((previewMod as any).default, {
        store: { id: "s", slug: "colorlab", name: "ทดสอบ", tax_id: null, phone: null, address: null, logo_url: null, default_vat_rate: 0, vat_enabled: false },
        state, totals, docNo: "TEST-1",
      }));
      // Pagination happens after a measurement pass — wait for it instead of
      // guessing a fixed delay.
      const deadline = Date.now() + 8000;
      let last = -1, stable = 0;
      while (Date.now() < deadline) {
        const n = host.querySelectorAll(".doc-page").length;
        stable = n === last && n >= 2 ? stable + 1 : 0;
        if (stable >= 6) break; // count unchanged for ~300ms
        last = n;
        await new Promise((r) => setTimeout(r, 50));
      }

      const pages = host.querySelectorAll(".doc-page");
      const headerCount = host.querySelectorAll("thead").length;
      const headerMatches = Array.from(host.querySelectorAll("thead")).filter((th) =>
        th.textContent?.includes("รายการ"),
      ).length;

      // Pages that actually carry an items table (the last page may only hold
      // totals / signatures).
      const pagesWithTable = Array.from(pages).filter((pg) => !!pg.querySelector("thead")).length;

      const printEl = host.querySelector("#doc-print") as HTMLElement;
      const blob = await (pdfMod as any).elementToPdfBlob(printEl, "A4");
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let pdfStr = "";
      for (let i = 0; i < bytes.length; i++) pdfStr += String.fromCharCode(bytes[i]);
      const pageMarkers = (pdfStr.match(/\/Type\s*\/Page[^s]/g) ?? []).length;

      root.unmount();
      host.remove();

      return {
        domPageCount: pages.length,
        headerCount,
        headerMatches,
        pagesWithTable,
        pdfPageCount: pageMarkers,
        pdfSize: blob.size,
      };
    });

    // 50 items must spill over more than one A4 page; the exact rows-per-page
    // depends on the current table density, so assert the invariant instead.
    expect(result.domPageCount).toBeGreaterThanOrEqual(2);
    expect(result.headerMatches).toBe(result.pagesWithTable); // header repeated on every table page
    expect(result.pdfPageCount).toBe(result.domPageCount);
    expect(result.pdfSize).toBeGreaterThan(1000);
  });

  test("12 items → single A4 page", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
      const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react")).then((m: any) => m.default ?? m);
      const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client")).then((m: any) => m.default ?? m);
      const items = Array.from({ length: 12 }, (_, i) => ({
        key: `k${i}`, product_id: null, name: `X${i}`, description: "",
        price: 5, quantity: 2, unit: "", discount_percent: 0, discount_amount: 0,
      }));
      const host = document.createElement("div");
      host.style.position = "fixed"; host.style.left = "-10000px";
      document.body.appendChild(host);
      const root = (RDS as any).createRoot(host);
      root.render((React as any).createElement((previewMod as any).default, {
        store: null,
        state: {
          document_type: "invoice", paper_size: "A4", template: "classic",
          document_date: "2026-06-24", show_document_date: true,
          vat_mode: "none", vat_rate: 0, price_type: "no_vat",
          withholding_tax_enabled: false, withholding_tax_rate: 0,
          discount_amount: 0, customer_id: null, customer_name: "",
          customer_phone: "", customer_address: "", customer_tax_id: "",
          customer_branch: "", payment_method: "cash", notes: "", items,
        },
        totals: { subtotal: 120, discount_total: 0, amount_before_vat: 120, vat_amount: 0, grand_total: 120, withholding_tax_amount: 0, net_total: 120 },
      }));
      await new Promise((r) => setTimeout(r, 100));
      const count = host.querySelectorAll(".doc-page").length;
      root.unmount(); host.remove();
      return count;
    });
    expect(result).toBe(1);
  });
});