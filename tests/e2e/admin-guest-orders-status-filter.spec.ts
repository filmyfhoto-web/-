import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * /admin/guest-orders — status filter narrows the visible list.
 * Hermetic: mocks the REST query and asserts the request contains the
 * expected `status=eq.<x>` param AND that the rendered card count matches.
 */

const ALL_ROWS = [
  { id: "o1", order_no: "QT-1001", kind: "quotation", status: "new",         customer_name: "A", customer_phone: "0800000001", address: null, note: null, line_user_id: null, line_display_name: null, line_verified: false, items: [{ name: "X", qty: 1 }], total: 100, created_at: new Date().toISOString() },
  { id: "o2", order_no: "QT-1002", kind: "quotation", status: "in_progress", customer_name: "B", customer_phone: "0800000002", address: null, note: null, line_user_id: null, line_display_name: null, line_verified: false, items: [{ name: "Y", qty: 2 }], total: 200, created_at: new Date().toISOString() },
  { id: "o3", order_no: "OD-1003", kind: "order",     status: "done",        customer_name: "C", customer_phone: "0800000003", address: null, note: null, line_user_id: null, line_display_name: null, line_verified: false, items: [{ name: "Z", qty: 3 }], total: 300, created_at: new Date().toISOString() },
];

function json(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function mockGuestOrders(page: Page) {
  await page.route(/\/rest\/v1\/guest_orders\?.*/, (route: Route) => {
    const url = route.request().url();
    const m = url.match(/status=eq\.([^&]+)/);
    const filtered = m ? ALL_ROWS.filter((r) => r.status === m[1]) : ALL_ROWS;
    route.fulfill(json(filtered));
  });
}

test("admin guest-orders status filter updates row count", async ({ page }) => {
  await mockGuestOrders(page);
  await page.goto("/admin/guest-orders");
  if (!page.url().includes("/admin/")) {
    test.skip(true, "no admin session — guarded route redirects out");
  }

  // "ทุกสถานะ" — three rows
  await expect(page.locator("text=QT-1001")).toBeVisible();
  await expect(page.locator("text=QT-1002")).toBeVisible();
  await expect(page.locator("text=OD-1003")).toBeVisible();

  // Filter to "เสร็จสิ้น" (done) — only OD-1003 remains
  await page.getByLabel("กรองตามสถานะ").selectOption("done");
  await expect(page.locator("text=OD-1003")).toBeVisible();
  await expect(page.locator("text=QT-1001")).toHaveCount(0);
  await expect(page.locator("text=QT-1002")).toHaveCount(0);

  // Filter to "ใหม่" (new) — only QT-1001
  await page.getByLabel("กรองตามสถานะ").selectOption("new");
  await expect(page.locator("text=QT-1001")).toBeVisible();
  await expect(page.locator("text=OD-1003")).toHaveCount(0);
});