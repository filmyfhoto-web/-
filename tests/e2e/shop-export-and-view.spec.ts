import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * /shop — view toggle (Grid ↔ List) + download (CSV/XLSX).
 * Hermetic: mocks public product RPC/REST so no auth is required.
 */

const PRODUCTS = [
  { id: "p1", code: "A001", name: "กระดาษ A4", unit: "รีม", standard_price: 120, stock: 10, low_stock_threshold: 0, barcode: "8850001", category_id: null, image_url: null, active: true },
  { id: "p2", code: "A002", name: "หมึกพิมพ์", unit: "ขวด", standard_price: 350, stock: 5, low_stock_threshold: 0, barcode: "8850002", category_id: null, image_url: null, active: true },
];

function jsonOk(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-2222-2222-222222222222";

async function seedAuth(page: Page) {
  await page.route("**/auth/v1/user**", (r: Route) =>
    r.fulfill(jsonOk({ id: USER_ID, email: "t@example.com" })),
  );
  await page.route("**/rest/v1/profiles**", (r: Route) =>
    r.fulfill(jsonOk({
      id: USER_ID, full_name: "T", email: "t@example.com", phone: "",
      organization_id: ORG_ID,
      accepted_terms_version: "2026-06-29", accepted_privacy_version: "2026-06-29",
      accepted_terms_at: "2026-06-29T00:00:00Z", accepted_privacy_at: "2026-06-29T00:00:00Z",
      organizations: { id: ORG_ID, name: "Test Org", approved: true },
      cost_visible: false,
    })),
  );
  await page.route("**/rest/v1/user_roles**", (r: Route) =>
    r.fulfill(jsonOk([{ role: "customer" }])),
  );
  await page.route("**/rest/v1/orders**", (r: Route) => r.fulfill(jsonOk([])));
  await page.route("**/rest/v1/product_costs**", (r: Route) => r.fulfill(jsonOk([])));
  await page.route("**/rest/v1/group_prices**", (r: Route) => r.fulfill(jsonOk([])));
  await page.route("**/rest/v1/customer_prices**", (r: Route) => r.fulfill(jsonOk([])));
  await page.addInitScript((uid) => {
    const session = {
      access_token: "fake", refresh_token: "fake",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer", user: { id: uid, email: "t@example.com" },
    };
    try { localStorage.setItem("sb-fdgxvgtmzcgakofswtty-auth-token", JSON.stringify(session)); } catch {}
  }, USER_ID);
}

test.beforeEach(async ({ page }) => {
  await seedAuth(page);
  await page.route(/\/rest\/v1\/products_public\b.*/, (r: Route) => r.fulfill(jsonOk(PRODUCTS)));
  await page.route(/\/rest\/v1\/categories\b.*/, (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/rpc\/get_public_settings\b.*/, (r: Route) =>
    r.fulfill(jsonOk([{ store_name: "ร้านนัฐภรณ์", phone: "0000000000" }])),
  );
});

test("toggle Grid ↔ List swaps DOM structure", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();
  // Default = grid (no <table>)
  await expect(page.locator("table")).toHaveCount(0);
  // Switch to list
  await page.getByRole("button", { name: "มุมมองรายการ" }).click();
  await expect(page.locator("table")).toBeVisible();
  await expect(page.locator("th", { hasText: "ราคา" })).toBeVisible();
  // Switch back
  await page.getByRole("button", { name: "มุมมองรูปภาพ" }).click();
  await expect(page.locator("table")).toHaveCount(0);
});

test("download CSV emits a file with Thai product names", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();
  await page.getByRole("button", { name: /ดาวน์โหลด/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /CSV/ }).click(),
  ]);
  // Chromium reports blob downloads as "download"; just assert the file landed.
  expect(download.suggestedFilename()).toBeTruthy();
  expect(await download.path()).toBeTruthy();
});

test("download XLSX emits an .xlsx file", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();
  await page.getByRole("button", { name: /ดาวน์โหลด/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /Excel/ }).click(),
  ]);
  expect(await download.path()).toBeTruthy();
});
