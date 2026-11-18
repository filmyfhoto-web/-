import { test, expect } from "@playwright/test";

const SHOP_PRODUCTS = [
  { id: "p-bound", code: "FY-LINE", name: "สินค้าทดสอบหลังผูก LINE", unit: "ชิ้น", standard_price: 99, stock: 3, low_stock_threshold: 0, barcode: null, category_id: null, image_url: null, active: true },
];

async function mockShopData(page: any) {
  await page.route(/\/rest\/v1\/products_public\b.*/, (route: any) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SHOP_PRODUCTS) }),
  );
  await page.route(/\/rest\/v1\/categories\b.*/, (route: any) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route(/\/rest\/v1\/shop_promos\b.*/, (route: any) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route(/\/rest\/v1\/rpc\/get_public_settings\b.*/, (route: any) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ store_name: "ร้านนัฐภรณ์", phone: "0000000000" }]) }),
  );
}

/**
 * Verified LINE onboarding gate — protects customer routes from being
 * unlocked by client-side storage forgery. Only public/anonymous behaviour
 * is exercised here; staff bypass is covered by unit tests since it
 * requires a Supabase auth session.
 */

test("unauthenticated /shop shows the LINE onboarding gate", async ({ page }) => {
  await page.goto("/shop");
  await expect(
    page.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i }),
  ).toBeVisible();
  await expect(page.getByText("SECRET_SHOP_CONTENT")).toHaveCount(0);
});

test("primary CTA starts the server-side LINE OAuth flow", async ({ page }) => {
  await page.goto("/shop");
  const cta = page.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i });
  await cta.click();
  // The gate now uses the server-owned OAuth 2.1 flow (state + nonce + PKCE
  // minted by line-oauth-start), not the LIFF page.
  await expect(page).toHaveURL(/access\.line\.me/, { timeout: 15000 });
  const url = page.url();
  expect(url).toContain("line-oauth-callback");
  expect(url).toMatch(/code_challenge/);
  expect(url).toMatch(/state/);
});

test("forged sessionStorage.line_binding cannot unlock the shop", async ({ page }) => {
  await page.goto("/shop");
  // Inject a forged binding — the gate must still block because
  // server verification (line-link-lookup) does not confirm it.
  await page.evaluate(() => {
    sessionStorage.setItem(
      "line_binding",
      JSON.stringify({ line_user_id: "Uforged", status: "linked" }),
    );
  });
  await page.goto("/shop");
  await expect(
    page.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE|ตรวจสอบสิทธิ์ไม่สำเร็จ/i }),
  ).toBeVisible({ timeout: 8000 });
});

test("cart and my-orders are also gated", async ({ page }) => {
  for (const path of ["/cart", "/my-orders"]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i }),
    ).toBeVisible();
  }
});

test("verified LINE binding can still open /shop when OA friendship check is unavailable", async ({ page }) => {
  await mockShopData(page);
  let lookupCalls = 0;
  await page.route("**/functions/v1/line-link-lookup", (route) => {
    lookupCalls += 1;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ bound: true, friend_confirmed: false, friend_status: "config_missing" }),
    });
  });
  await page.addInitScript(() => {
    sessionStorage.setItem("line_id_token", "stub.verified.id-token");
  });

  await page.goto("/shop");

  await expect(page.getByText("สินค้าทดสอบหลังผูก LINE").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /เข้าสู่ระบบด้วย LINE/i })).toHaveCount(0);
  expect(lookupCalls).toBeGreaterThanOrEqual(1);
});