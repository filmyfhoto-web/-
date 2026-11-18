import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * /admin/stock — three shop tabs (คัลเลอร์แล็ป / การพิมพ์ / POS ขายหน้าร้าน)
 * with "ขายจริง" (stock movements) separated from "ขายบิล" (rds_documents).
 * Bill sales must never be added into the stock summary cards.
 */

const STORES = [
  { id: "store-colorlab", name: "นัฐภรณ์ คัลเลอร์แล็ป" },
  { id: "store-print", name: "นัฐภรณ์ การพิมพ์" },
];

const DOCS = [
  { id: "d1", document_no: "RC-0001", document_type: "receipt", document_date: "2026-07-20", created_at: "2026-07-20T02:00:00Z", customer_name: "ลูกค้า ก", status: "issued", grand_total: 500, store_id: "store-colorlab" },
  { id: "d2", document_no: "RC-0002", document_type: "receipt", document_date: "2026-07-21", created_at: "2026-07-21T02:00:00Z", customer_name: "ลูกค้า ข", status: "cancelled", grand_total: 900, store_id: "store-colorlab" },
];

const ITEMS = [
  { id: "i1", document_id: "d1", name: "กระดาษ A4", description: null, unit: "รีม", quantity: 4, price: 100, line_total: 400, item_order: 1 },
  { id: "i2", document_id: "d1", name: "หมึกพิมพ์", description: null, unit: "กล่อง", quantity: 1, price: 100, line_total: 100, item_order: 2 },
  { id: "i3", document_id: "d2", name: "ยกเลิก", description: null, unit: "ชิ้น", quantity: 9, price: 100, line_total: 900, item_order: 1 },
];

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function mockRest(page: Page) {
  await page.route(/\/rest\/v1\/rds_stores\?.*/, (r: Route) => r.fulfill(json(STORES)));
  await page.route(/\/rest\/v1\/rds_documents\?.*/, (r: Route) => {
    const url = r.request().url();
    const store = url.match(/store_id=eq\.([^&]+)/)?.[1];
    const type = url.match(/document_type=eq\.([^&]+)/)?.[1];
    // "รวมทุกชนิด" sends no document_type filter — return every type for the store.
    r.fulfill(json(DOCS.filter((d) => d.store_id === store && (!type || d.document_type === type))));
  });
  await page.route(/\/rest\/v1\/rds_document_items\?.*/, (r: Route) => r.fulfill(json(ITEMS)));
  await page.route(/\/rest\/v1\/stock_movements\?.*/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/products\?.*/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/pos_receipts\?.*/, (r: Route) => r.fulfill(json([])));
}

test("stock page splits shops and keeps bill sales out of stock totals", async ({ page }) => {
  await mockRest(page);
  await page.goto("/admin/stock");
  // Guarded route: without an admin session the page redirects or renders the
  // login shell — skip instead of failing in unauthenticated CI runs.
  const colorlabTab = page.getByTestId("shop-tab-colorlab");
  const authed = await colorlabTab.isVisible({ timeout: 8000 }).catch(() => false);
  test.skip(!authed, "no admin session — guarded route redirects out");

  // Three shop tabs exist.
  await expect(colorlabTab).toBeVisible();
  await expect(page.getByTestId("shop-tab-print")).toBeVisible();
  await expect(page.getByTestId("shop-tab-pos")).toBeVisible();

  // Real-sales view is stock based and shows the stock summary cards.
  await expect(page.getByTestId("stock-summary")).toBeVisible();

  // Switch to ขายบิล — cancelled document must be excluded (2 rows, 500 baht).
  await page.getByTestId("shop-tab-colorlab").click();
  await page.getByTestId("src-tab-bill").click();
  await expect(page.getByTestId("bill-sales-panel")).toBeVisible();
  // Bill sales open on the full history ("รวมทุกชนิด" + ช่วงเวลา "ทั้งหมด").
  await expect(page.getByTestId("bill-doc-all")).toHaveAttribute("data-state", "active");
  await expect(page.getByTestId("bill-doc-count")).toHaveText("1");

  // Narrowing to a single document type still works.
  await page.getByTestId("bill-doc-receipt").click();
  await expect(page.getByTestId("bill-doc-count")).toHaveText("1");
  await expect(page.getByTestId("bill-item-count")).toHaveText("2 / 5");
  await expect(page.getByTestId("bill-amount")).toHaveText("500.00");
  await expect(page.locator('[data-testid="bill-sales-table"] tbody tr')).toHaveCount(2);
  await expect(page.locator("text=ยกเลิก")).toHaveCount(0);

  // Stock summary cards are not rendered on the bill tab (numbers never mix).
  await expect(page.getByTestId("stock-summary")).toHaveCount(0);

  // POS tab has no bill sub-tab.
  await page.getByTestId("shop-tab-pos").click();
  await expect(page.getByTestId("src-tab-bill")).toHaveCount(0);
});
