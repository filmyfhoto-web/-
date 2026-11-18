import { test, expect, type Route } from "@playwright/test";

/**
 * When an admin uploads an image for a previously-blank category, the
 * "ยังไม่มีรูปหมวดหมู่" placeholder chip must flip to the image-backed
 * variant on the very next Shop render. We simulate this by returning a
 * different `categories` payload on the second navigation.
 */

const CAT_ID = "cat-flip";

async function mockShop(page: any, withImage: boolean) {
  await page.unroute(/\/rest\/v1\/categories.*/).catch(() => {});
  await page.route(/\/rest\/v1\/categories.*/, (r: Route) =>
    r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([{
        id: CAT_ID, name: "หมวดทดลอง",
        image_urls: withImage ? ["https://picsum.photos/seed/z/80"] : null,
      }]),
    }));
  await page.route(/\/rest\/v1\/products_public.*/, (r: Route) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(/\/rest\/v1\/rpc\/get_public_settings.*/, (r: Route) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ shop_name: "TEST" }]) }));
}

test("category placeholder disappears once image_urls is populated", async ({ page }) => {
  // 1. First load: category has no image → placeholder icon must render.
  await mockShop(page, false);
  await page.goto("/shop");
  const chip = page.locator(`[data-testid="shop-cat-chip-${CAT_ID}"]`);
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("data-has-image", "false");
  await expect(chip.locator('[data-testid="shop-cat-chip-placeholder"]')).toBeVisible();

  // 2. Admin uploads an image (simulated by re-mocking + reload).
  await mockShop(page, true);
  await page.reload();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("data-has-image", "true");
  await expect(chip.locator('[data-testid="shop-cat-chip-placeholder"]')).toHaveCount(0);
  await expect(chip.locator("img")).toBeVisible();
});
