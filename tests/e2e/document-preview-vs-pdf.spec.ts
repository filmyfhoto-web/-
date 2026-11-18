import { test, expect } from "@playwright/test";

/**
 * Visual regression — DocumentPreview vs html2canvas raster (the same DOM
 * that becomes the PDF). Heavily deterministic to avoid environment drift:
 *
 *  - Fixed viewport + DPR=1 (raster size is stable)
 *  - Fixed locale/timezone (th-TH / Asia/Bangkok)
 *  - Date.now / Math.random replaced via addInitScript
 *  - All animations & transitions disabled via addStyleTag
 *  - Waits for document.fonts.ready + 2 rAF frames + image decode
 *  - Snapshots are stored per-OS (see playwright.config snapshotPathTemplate)
 *
 * Run with `--update-snapshots` once to create baselines.
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 1,
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

const FIXED_EPOCH_MS = new Date("2026-06-24T00:00:00+07:00").getTime();

const DETERMINISTIC_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  html, body {
    -webkit-font-smoothing: antialiased !important;
    text-rendering: geometricPrecision !important;
  }
`;

test.describe("DocumentPreview vs PDF — visual parity", () => {
  test.beforeEach(async ({ page }) => {
    // Seed Date.now / Math.random BEFORE any page script runs.
    await page.addInitScript(({ fixedEpoch }) => {
      const RealDate = Date;
      const fixed = fixedEpoch;
      // Lock Date.now to a fixed instant.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Date as any).now = () => fixed;
      // new Date() with no args → fixed instant
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Patched: any = function (this: unknown, ...args: unknown[]) {
        if (args.length === 0) return new RealDate(fixed);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new (RealDate as any)(...args);
      };
      Patched.now = () => fixed;
      Patched.parse = RealDate.parse;
      Patched.UTC = RealDate.UTC;
      Patched.prototype = RealDate.prototype;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).Date = Patched;

      // Deterministic PRNG (LCG) — replaces Math.random.
      let seed = 1;
      Math.random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    }, { fixedEpoch: FIXED_EPOCH_MS });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: DETERMINISTIC_CSS });
  });

  test("preview screenshot and html2canvas raster match baseline (A4)", async ({ page }) => {
    // Render off-screen, then expose for snapshot.
    const { pdfRaster } = await page.evaluate(async () => {
      const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
      const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react")).then((m: any) => m.default ?? m);
      const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client")).then((m: any) => m.default ?? m);
      const html2canvas = (await import("html2canvas")).default;

      const store = {
        id: "s1", slug: "colorlab",
        name: "นัฐภรณ์ คัลเลอร์แล็ป",
        tax_id: null, phone: null, address: null,
        logo_url: null,
        brand_color: "221 83% 45%",
        default_vat_rate: 0, vat_enabled: false,
      };
      const state = {
        document_type: "receipt", paper_size: "A4", template: "modern",
        document_date: "2026-06-24", show_document_date: true,
        vat_mode: "none", vat_rate: 0, price_type: "no_vat",
        withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
        customer_id: null, customer_name: "ลูกค้าทดสอบ",
        customer_phone: "", customer_address: "", customer_tax_id: "", customer_branch: "",
        payment_method: "cash", notes: "",
        items: [
          { key: "k1", product_id: null, name: "สินค้า A", description: "",
            price: 100, quantity: 2, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
          { key: "k2", product_id: null, name: "สินค้า B", description: "",
            price: 250, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
        ],
      };
      const totals = {
        subtotal: 450, discount_total: 0, amount_before_vat: 450,
        vat_amount: 0, grand_total: 450, withholding_tax_amount: 0, net_total: 450,
      };

      const host = document.createElement("div");
      host.id = "snapshot-host";
      host.style.position = "fixed";
      host.style.left = "0";
      host.style.top = "0";
      host.style.background = "#fff";
      host.style.zIndex = "99999";
      document.body.appendChild(host);
      const root = (RDS as any).createRoot(host);
      root.render((React as any).createElement((previewMod as any).default, {
        store, state, totals, docNo: "SNAP-1",
      }));

      // Wait until the render is visually stable:
      //   1) React has committed (#doc-print exists)
      //   2) All <img> are decoded (or none present)
      //   3) Fonts are ready
      //   4) 2 animation frames have passed (let layout settle)
      const waitForStable = async () => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const printEl = host.querySelector("#doc-print");
          if (printEl) break;
          await new Promise((r) => setTimeout(r, 16));
        }
        const imgs = Array.from(host.querySelectorAll("img"));
        await Promise.all(
          imgs.map((img) =>
            (img as HTMLImageElement).decode?.().catch(() => undefined),
          ),
        );
        if ((document as any).fonts?.ready) {
          await (document as any).fonts.ready;
        }
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      };
      await waitForStable();

      const printEl = host.querySelector("#doc-print") as HTMLElement;
      const firstPage = printEl.querySelector(".doc-page") as HTMLElement;
      const canvas = await html2canvas(firstPage, {
        scale: 1,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        // Pin the snapshot window so html2canvas captures a fixed region.
        windowWidth: 1280,
        windowHeight: 1800,
      });
      const pdfRaster = canvas.toDataURL("image/png");
      return { pdfRaster };
    });

    // 1) Snapshot the html2canvas raster (what becomes the PDF page).
    const pdfPngBuf = Buffer.from(
      pdfRaster.replace(/^data:image\/png;base64,/, ""),
      "base64",
    );
    expect(pdfPngBuf).toMatchSnapshot("modern-A4-pdf-raster.png", {
      maxDiffPixelRatio: 0.03,
      threshold: 0.2,
    });

    // 2) Snapshot the live DOM preview of the same .doc-page.
    //    toHaveScreenshot honors defaults from playwright.config (animations:
    //    disabled, caret: hide, scale: css).
    const previewLocator = page.locator("#snapshot-host .doc-page").first();
    await expect(previewLocator).toBeVisible();
    await expect(previewLocator).toHaveScreenshot("modern-A4-preview.png");
  });
});