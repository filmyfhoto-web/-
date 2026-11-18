import { test, expect, type Page } from "@playwright/test";

/**
 * Edit-and-print regression: after the user changes item rows in the form,
 * the printable copy MUST reflect the latest values (not a stale snapshot).
 *
 * We mount DocumentPreview directly with two state snapshots (before / after
 * edit) and assert the rendered DOM tracks the edits. This is faster + more
 * reliable than driving the live Supabase-backed form, and it pins the
 * preview-as-source-of-truth contract that the print path depends on.
 */

test.use({
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 1,
  locale: "th-TH",
  timezoneId: "Asia/Bangkok",
});

async function mount(page: Page, items: any[], docNo: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ items, docNo }) => {
    const prev = document.getElementById("edit-host");
    if (prev) prev.remove();
    const previewMod = await import("/src/pages/receipts/documents/DocumentPreview.tsx");
    const React = await import("/node_modules/.vite/deps/react.js").catch(() => import("react"));
    const RDS = await import("/node_modules/.vite/deps/react-dom_client.js").catch(() => import("react-dom/client"));
    const ReactApi = (React as any).default ?? React;
    const RDSApi = (RDS as any).default ?? RDS;
    const store = {
      id: "s1", slug: "printing", name: "ร้านพิมพ์ทดสอบ",
      tax_id: "", phone: "0800000000", address: "", logo_url: null,
      brand_color: "160 72% 38%", default_vat_rate: 0, vat_enabled: false,
    };
    const subtotal = items.reduce((s: number, it: any) => s + it.price * it.quantity, 0);
    const state = {
      document_type: "delivery", paper_size: "A4", template: "modern",
      document_date: "2026-06-24", show_document_date: true,
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
    host.id = "edit-host";
    host.style.cssText = "position:fixed;left:0;top:0;background:#fff;z-index:99999;";
    document.body.appendChild(host);
    const root = (RDSApi as any).createRoot(host);
    root.render((ReactApi as any).createElement((previewMod as any).default, {
      store, state, totals, docNo,
    }));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !host.querySelector("#doc-print")) {
      await new Promise((r) => setTimeout(r, 16));
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, { items, docNo });
}

async function readPrint(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector("#edit-host #doc-print") as HTMLElement;
    const itemTable = root.querySelector(".doc-page table tbody") as HTMLElement;
    const cells = Array.from(itemTable.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td"))
        .map((td) => (td.textContent ?? "").trim().replace(/\s+/g, " "))
        .join(" | "),
    );
    return { cells, text: (root.innerText || "").replace(/\s+/g, " ").trim() };
  });
}

test("editing items is reflected in the printable doc + signers are correct (delivery)", async ({ page }) => {
  const initial = [
    { key: "a", product_id: null, name: "สินค้า A", description: "",
      price: 10, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
  ];
  await mount(page, initial, "DO-EDIT-001");
  await page.emulateMedia({ media: "print" });
  let view = await readPrint(page);
  expect(view.cells.length).toBe(1);
  expect(view.text).toContain("DO-EDIT-001");
  expect(view.text).toContain("สินค้า A");

  // Simulate the user editing item A's price to 25 and appending item B (50 x 2).
  const edited = [
    { key: "a", product_id: null, name: "สินค้า A (แก้)", description: "",
      price: 25, quantity: 1, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
    { key: "b", product_id: null, name: "สินค้า B", description: "",
      price: 50, quantity: 2, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
  ];
  await mount(page, edited, "DO-EDIT-001");
  await page.emulateMedia({ media: "print" });
  view = await readPrint(page);

  expect(view.cells.length).toBe(2);
  expect(view.cells[0]).toContain("สินค้า A (แก้)");
  expect(view.cells[0]).toContain("25");
  expect(view.cells[1]).toContain("สินค้า B");
  expect(view.cells[1]).toContain("100"); // 50 × 2
  expect(view.text).toContain("ผู้จัดทำ/ผู้พิมพ์");
  expect(view.text).toContain("ผู้ส่งของ");
  expect(view.text).toContain("ผู้รับเงิน");
  expect(view.text).not.toContain("ผู้รับของ");
});
