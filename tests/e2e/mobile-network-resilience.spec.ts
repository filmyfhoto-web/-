import { test, expect, devices, type Page, type Route } from "@playwright/test";

/**
 * Mobile autosave / no-double-submit / no-data-loss under adverse network.
 *
 * Targets the user-facing write paths on /shop (cart add + qty edits), which
 * share the same `useFormGuard`-style debouncing and localStorage persistence
 * primitives as the admin product autosave form. Conditions exercised:
 *
 *   1. Slow network: every REST roundtrip delayed ~1.5s. Rapid taps must not
 *      double-fire the underlying write or duplicate cart lines.
 *   2. Offline → online toggle: cart mutations made while offline must persist
 *      to localStorage and survive a refresh after coming back online.
 *   3. Refresh during slow load: cart restored from localStorage, server data
 *      not lost.
 */

test.use({ ...devices["iPhone 14"], locale: "th-TH", timezoneId: "Asia/Bangkok" });

const PRODUCTS = [
  { id: "p1", code: "A001", name: "กระดาษ A4", unit: "รีม", standard_price: 120, stock: 10, low_stock_threshold: 0, barcode: "8850001", category_id: null, image_url: null, active: true },
];

function jsonOk(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID  = "22222222-2222-2222-2222-222222222222";
const SB_KEY  = "sb-fdgxvgtmzcgakofswtty-auth-token";

async function seedAuth(page: Page) {
  await page.route("**/auth/v1/user**", (r: Route) =>
    r.fulfill(jsonOk({ id: USER_ID, email: "t@example.com" })),
  );
  await page.route(/\/rest\/v1\/profiles\b.*/, (r: Route) =>
    r.fulfill(jsonOk({
      id: USER_ID, full_name: "T", email: "t@example.com", phone: "",
      organization_id: ORG_ID,
      accepted_terms_version: "2026-06-29", accepted_privacy_version: "2026-06-29",
      accepted_terms_at: "2026-06-29T00:00:00Z", accepted_privacy_at: "2026-06-29T00:00:00Z",
      organizations: { id: ORG_ID, name: "Test Org", approved: true },
      cost_visible: false,
    })),
  );
  await page.route(/\/rest\/v1\/user_roles\b.*/, (r: Route) => r.fulfill(jsonOk([{ role: "customer" }])));
  await page.route(/\/rest\/v1\/orders\b.*/,        (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/product_costs\b.*/, (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/group_prices\b.*/,  (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/customer_prices\b.*/,(r: Route) => r.fulfill(jsonOk([])));
  await page.addInitScript(({ uid, key }) => {
    const session = {
      access_token: "fake", refresh_token: "fake",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer", user: { id: uid, email: "t@example.com" },
    };
    try { localStorage.setItem(key, JSON.stringify(session)); } catch {}
  }, { uid: USER_ID, key: SB_KEY });
}

async function seedProducts(page: Page, latencyMs = 0) {
  await page.route(/\/rest\/v1\/products_public\b.*/, async (r: Route) => {
    if (latencyMs) await new Promise(res => setTimeout(res, latencyMs));
    return r.fulfill(jsonOk(PRODUCTS));
  });
  await page.route(/\/rest\/v1\/categories\b.*/, (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/rpc\/get_public_settings\b.*/, (r: Route) =>
    r.fulfill(jsonOk([{ store_name: "ร้านนัฐภรณ์" }])),
  );
}

test.beforeEach(async ({ page }) => {
  await seedAuth(page);
});

test("slow network: repeated rapid taps on add-to-cart never duplicate the line", async ({ page }) => {
  await seedProducts(page, 1500);
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible({ timeout: 15_000 });

  const addBtn = page.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).first();
  // Five rapid taps within ~120ms.
  await Promise.all([addBtn.click(), addBtn.click(), addBtn.click(), addBtn.click(), addBtn.click()]);

  await page.getByRole("button", { name: /ตะกร้า/ }).first().click();
  // Each click adds exactly 1, never doubles. Expect 5, never 10.
  await expect(page.locator("text=/^5$/").first()).toBeVisible({ timeout: 5_000 });

  // Refresh under slow network — cart restored from localStorage.
  await page.reload();
  await expect(page.getByText("กระดาษ A4")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /ตะกร้า/ }).first().click();
  await expect(page.locator("text=/^5$/").first()).toBeVisible();
});

test("offline → online: cart mutations persist locally and survive refresh", async ({ page, context }) => {
  await seedProducts(page);
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();

  // Go offline mid-session, then mutate the cart.
  await context.setOffline(true);
  const addBtn = page.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).first();
  await addBtn.click();
  await addBtn.click();
  await addBtn.click();

  // Verify count in the bottom-sheet while still offline — pure client state.
  await page.getByRole("button", { name: /ตะกร้า/ }).first().click();
  await expect(page.locator("text=/^3$/").first()).toBeVisible();

  // Back online, refresh — server fetch returns, cart must still be exactly 3.
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText("กระดาษ A4")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /ตะกร้า/ }).first().click();
  await expect(page.locator("text=/^3$/").first()).toBeVisible();
});

test("refresh during slow products fetch: cart survives, no duplicate writes", async ({ page }) => {
  await seedProducts(page, 2_000);
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4").first()).toBeVisible({ timeout: 15_000 });

  const addBtn = page.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).first();
  await addBtn.click();
  await addBtn.click();

  // Trigger a reload — products refetch is intentionally slow.
  await page.reload();
  await expect(page.getByText("กระดาษ A4").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /ตะกร้า/ }).first().click();
  // 2 in, 2 out — never 4, never 0. On mobile, the cart button navigates to
  // /cart (full page) rather than opening a sheet, so we assert on the qty
  // spinbutton inside the cart row.
  await page.waitForURL(/\/cart$/, { timeout: 10_000 });
  const qty = page.getByRole("spinbutton").first();
  await expect(qty).toBeVisible({ timeout: 10_000 });
  await expect(qty).toHaveValue("2");
});