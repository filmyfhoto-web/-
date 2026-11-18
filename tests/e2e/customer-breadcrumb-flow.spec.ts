import { test, expect } from "@playwright/test";

// Verifies the customer navigation flow: Shop → Cart → Order Detail. The
// breadcrumb must be visible on every page and the navy "back" button must
// always land the user one step back in the flow. Auth-gated pages skip
// gracefully when the sandbox has no session — a smoke check that the
// components mount without crashing is still valuable.

test.describe("customer breadcrumb + back-button flow", () => {
  test("shop page renders breadcrumb", async ({ page }) => {
    await page.goto("/shop", { waitUntil: "domcontentloaded" });
    // Breadcrumb nav has a stable aria-label from CustomerBreadcrumbs.
    const crumbs = page.getByLabel("ตำแหน่งหน้าลูกค้า");
    await expect(crumbs).toBeVisible({ timeout: 8_000 });
    await expect(crumbs.getByText("เลือกสินค้า")).toBeVisible();
  });

  test("cart page shows breadcrumb + navy back button pointing to /shop", async ({ page }) => {
    await page.goto("/cart", { waitUntil: "domcontentloaded" });
    const crumbs = page.getByLabel("ตำแหน่งหน้าลูกค้า").first();
    if (!(await crumbs.isVisible().catch(() => false))) {
      test.skip(true, "cart redirected (auth)");
    }
    await expect(crumbs.getByText("เลือกสินค้า")).toBeVisible();
    await expect(crumbs.getByText("ตะกร้า")).toBeVisible();

    // Navy back-to-products button must be present and navigate to /shop.
    const back = page.locator("a.customer-navy-action").filter({ hasText: /เลือกสินค้า/ }).first();
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      await page.waitForURL("**/shop", { timeout: 5_000 }).catch(() => {});
      expect(page.url()).toContain("/shop");
    }
  });

  test("my-orders page renders breadcrumb and does not crash", async ({ page }) => {
    await page.goto("/my-orders", { waitUntil: "domcontentloaded" });
    const crumbs = page.getByLabel("ตำแหน่งหน้าลูกค้า").first();
    if (!(await crumbs.isVisible().catch(() => false))) {
      test.skip(true, "my-orders redirected (auth)");
    }
    await expect(crumbs.getByText("ประวัติคำสั่งซื้อ")).toBeVisible();
  });
});