import { test, expect } from "@playwright/test";

/**
 * Layout regression for the items table in the modern DocumentPreview:
 * - No cell overflows the table horizontally.
 * - <th> headers don't overlap each other.
 * - Numeric columns are right-aligned.
 * - PDF generates without crashing across multiple pages.
 */

test.describe("Document items table — layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  });

  test("table doesn't overflow and header columns don't overlap (multi-page)", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
      const pdfMod = await import("/src/pages/receipts/lib/pdfUtils.ts");
      const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react")).then((m: any) => m.default ?? m);
      const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client")).then((m: any) => m.default ?? m);

      const store = {
        id: "s1", slug: "colorlab",
        name: "นัฐภรณ์ คัลเลอร์แล็ป",
        tax_id: "0105556789012", phone: "0812345678",
        address: "123/45 ถนนทดสอบ แขวงทดลอง เขตทดสอบ กรุงเทพ 10110",
        logo_url: null,
        brand_color: "221 83% 45%",
        default_vat_rate: 7, vat_enabled: true,
      };

      const items = Array.from({ length: 25 }, (_, i) => ({
        key: `k${i}`,
        product_id: null,
        name: i === 0
          ? "สินค้าชื่อยาวมากเพื่อทดสอบการตัดคำในเซลล์ตารางว่าไม่ทำให้คอลัมน์อื่นล้นกรอบขวาของตาราง ABC1234567890"
          : `รายการสินค้าที่ ${i + 1}`,
        description: i === 0
          ? "รายละเอียดยาวเพิ่มเติมเพื่อตรวจสอบการ wrap ของบรรทัดล่างใต้ชื่อสินค้า"
          : "",
        price: i === 1 ? 9999999 : 100 + i,
        quantity: i === 2 ? 99999 : 1,
        unit: "ชิ้น",
        discount_percent: 0,
        discount_amount: 0,
      }));

      const state = {
        document_type: "receipt", paper_size: "A4", template: "modern",
        document_date: "2026-06-24", show_document_date: true,
        vat_mode: "none", vat_rate: 0, price_type: "no_vat",
        withholding_tax_enabled: false, withholding_tax_rate: 0, discount_amount: 0,
        customer_id: null, customer_name: "ลูกค้า",
        customer_phone: "", customer_address: "", customer_tax_id: "", customer_branch: "",
        payment_method: "cash", notes: "", items,
      };
      const totals = {
        subtotal: 12345678, discount_total: 0, amount_before_vat: 12345678,
        vat_amount: 0, grand_total: 12345678, withholding_tax_amount: 0, net_total: 12345678,
      };

      const host = document.createElement("div");
      host.style.position = "fixed";
      host.style.left = "-10000px";
      host.style.top = "0";
      document.body.appendChild(host);
      const root = (RDS as any).createRoot(host);
      root.render((React as any).createElement((previewMod as any).default, {
        store, state, totals, docNo: "TBL-1",
      }));
      await new Promise((r) => setTimeout(r, 300));

      const printEl = host.querySelector("#doc-print") as HTMLElement;
      const pages = Array.from(printEl.querySelectorAll(".doc-page")) as HTMLElement[];

      const issues: string[] = [];
      const numericRightAlign: boolean[] = [];

      for (const pg of pages) {
        const table = pg.querySelector("table") as HTMLTableElement | null;
        if (!table) continue;
        const tRect = table.getBoundingClientRect();

        // 1) No cell extends past the table's right edge.
        const cells = Array.from(table.querySelectorAll("td,th")) as HTMLElement[];
        for (const c of cells) {
          const r = c.getBoundingClientRect();
          if (r.right > tRect.right + 1) {
            issues.push(`cell overflow right by ${(r.right - tRect.right).toFixed(2)}px`);
          }
        }

        // 2) Table itself doesn't horizontally scroll.
        if (table.scrollWidth > table.clientWidth + 1) {
          issues.push(`table scrollWidth(${table.scrollWidth}) > clientWidth(${table.clientWidth})`);
        }

        // 3) Header cells are sequential, no overlap.
        const ths = Array.from(table.querySelectorAll("thead th")) as HTMLElement[];
        for (let i = 1; i < ths.length; i++) {
          const a = ths[i - 1].getBoundingClientRect();
          const b = ths[i].getBoundingClientRect();
          if (a.right > b.left + 1) {
            issues.push(`thead[${i - 1}].right(${a.right}) overlaps thead[${i}].left(${b.left})`);
          }
        }

        // 4) Header text not clipped within its cell.
        for (const th of ths) {
          if (th.scrollWidth > th.clientWidth + 1) {
            issues.push(`th "${th.textContent?.trim()}" clipped: ${th.scrollWidth}>${th.clientWidth}`);
          }
        }

        // 5) Numeric columns (last two) are right-aligned.
        const firstRow = table.querySelector("tbody tr") as HTMLTableRowElement | null;
        if (firstRow) {
          const tds = Array.from(firstRow.querySelectorAll("td")) as HTMLElement[];
          // Modern columns: [seq, name, qty, unit, price, total]
          numericRightAlign.push(getComputedStyle(tds[tds.length - 2]).textAlign === "right");
          numericRightAlign.push(getComputedStyle(tds[tds.length - 1]).textAlign === "right");
        }
      }

      const blob = await (pdfMod as any).elementToPdfBlob(printEl, "A4");
      const pdfSize = blob.size;
      const pageCount = pages.length;

      root.unmount();
      host.remove();

      return { issues, numericRightAlign, pageCount, pdfSize };
    });

    expect(result.issues, result.issues.join("\n")).toEqual([]);
    expect(result.numericRightAlign.every(Boolean)).toBe(true);
    expect(result.pageCount).toBeGreaterThanOrEqual(2);
    expect(result.pdfSize).toBeGreaterThan(5000);
  });
});