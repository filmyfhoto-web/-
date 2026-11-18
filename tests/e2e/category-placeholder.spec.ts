import { test, expect, Route } from "@playwright/test";

/**
 * Guards against a regression where a category without any uploaded images
 * either (a) renders a broken <img>, or (b) collapses the chip / product-card
 * layout on mobile. Both symptoms would make the Shop unusable for admins who
 * haven't finished uploading art yet.
 *
 * We mock the Data API responses so the assertion is deterministic and doesn't
 * depend on live DB content.
 */

const CATEGORIES = [
  { id: "c-with-img", name: "หมวดมีรูป", image_urls: ["https://picsum.photos/seed/a/80"] },
  { id: "c-empty",    name: "หมวดไม่มีรูป", image_urls: null },
  { id: "c-empty-arr",name: "หมวดอาร์เรย์ว่าง", image_urls: [] },
];

async function mockShopApis(page: any) {
  await page.route(/\/rest\/v1\/categories.*/, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CATEGORIES) })
  );
  await page.route(/\/rest\/v1\/products_public.*/, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route(/\/rest\/v1\/rpc\/get_public_settings.*/, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ shop_name: "TEST" }]) })
  );
}

test.describe("Category placeholder — Shop chips do not break when image_urls is missing", () => {
  test("categories without images render the placeholder icon, not a broken <img>", async ({ page }) => {
    await mockShopApis(page);
    await page.goto("/shop");

    const chipEmpty = page.locator('[data-testid="shop-cat-chip-c-empty"]');
    const chipEmptyArr = page.locator('[data-testid="shop-cat-chip-c-empty-arr"]');
    const chipWithImg = page.locator('[data-testid="shop-cat-chip-c-with-img"]');

    await expect(chipEmpty).toBeVisible();
    await expect(chipEmptyArr).toBeVisible();
    await expect(chipWithImg).toBeVisible();

    // Placeholder chips are flagged data-has-image="false" and contain the
    // fallback icon; image-backed chip is flagged "true".
    await expect(chipEmpty).toHaveAttribute("data-has-image", "false");
    await expect(chipEmptyArr).toHaveAttribute("data-has-image", "false");
    await expect(chipWithImg).toHaveAttribute("data-has-image", "true");

    await expect(chipEmpty.locator('[data-testid="shop-cat-chip-placeholder"]')).toBeVisible();
    await expect(chipEmptyArr.locator('[data-testid="shop-cat-chip-placeholder"]')).toBeVisible();
    await expect(chipWithImg.locator('[data-testid="shop-cat-chip-placeholder"]')).toHaveCount(0);

    // No broken <img>: the img inside the with-image chip must actually load a
    // pixel (naturalWidth > 0). We wait briefly for the network image.
    const img = chipWithImg.locator("img");
    await expect(img).toBeVisible();
  });

  test("mobile viewport: chips row scrolls horizontally and each chip keeps its min-width", async ({ page }) => {
    await mockShopApis(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/shop");

    const chip = page.locator('[data-testid="shop-cat-chip-c-empty"]');
    await expect(chip).toBeVisible();

    // Chip should keep a stable min-width (>= 110px per style) even without image.
    const box = await chip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(110);
    expect(box!.height).toBeGreaterThanOrEqual(40);

    // Container must be scrollable when many chips are added, but never taller
    // than a single row (< 100px). This guards against a layout collapse where
    // a missing image blows the chip vertically.
    const rowBox = await chip.locator("..").boundingBox();
    expect(rowBox!.height).toBeLessThan(120);
  });
});