import { test, expect, devices, type Page, type Route } from "@playwright/test";

/**
 * Mobile autosave / no-double-submit / no-data-loss on /shop (public, hermetic).
 *
 * The user's concern — "กดบันทึกหลายครั้งและรีเฟรชหน้า แล้วข้อมูลไม่หายจริง" —
 * is exercised at the cart layer, which is the user-facing write path on the
 * customer side. Admin product autosave shares the same `useFormGuard` +
 * localStorage draft primitives; covering them requires authenticated fixtures
 * (see tests/e2e/product-multi-shop.spec.ts: blocked on auth).
 */

test.use({ ...devices["iPhone 14"], locale: "th-TH", timezoneId: "Asia/Bangkok" });

const PRODUCTS = [
  { id: "p1", code: "A001", name: "กระดาษ A4", unit: "รีม", standard_price: 120, stock: 10, low_stock_threshold: 0, barcode: "8850001", category_id: null, image_url: null, active: true },
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
  await page.route("**/rest/v1/user_roles**", (r: Route) => r.fulfill(jsonOk([{ role: "customer" }])));
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
    r.fulfill(jsonOk([{ store_name: "ร้านนัฐภรณ์" }])),
  );
});

test("rapid taps on add-to-cart accumulate exact qty (no double-fire)", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();
  const addBtn = page.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).first();
  // Three quick taps within ~150ms — assert exactly 3 in cart, not 6.
  await addBtn.click();
  await addBtn.click();
  await addBtn.click();
  // Open cart bottom-sheet
  await page.getByRole("button", { name: /ตะกร้า/ }).first().click();
  await expect(page.locator("text=/^3$/").first()).toBeVisible();
});

test("refresh restores cart from localStorage — data not lost", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();
  await page.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).first().click();
  await page.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).first().click();
  // Hard reload
  await page.reload();
  await expect(page.getByText("กระดาษ A4").first()).toBeVisible();
  // Cart bar still shows 2 รายการ
  await expect(page.getByText(/ตะกร้า\s*2\s*รายการ/).first()).toBeVisible();
});

test("view-mode persists across refresh (localStorage)", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();
  await page.getByRole("button", { name: "มุมมองรายการ" }).click();
  await expect(page.locator("table")).toBeVisible();
  await page.reload();
  await expect(page.locator("table")).toBeVisible();
});
