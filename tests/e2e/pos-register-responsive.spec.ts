import { test, expect } from "@playwright/test";
import { openRegister, noHorizontalOverflow } from "./posRegisterFixture";

/**
 * Real-geometry cover for the touch register: the portrait phone fallback must
 * be a usable checkout (cart + sticky action bar + numpad sheet), never a long
 * rail hanging under the cart, and the desktop rail must survive on big
 * screens without horizontal clipping. Everything is asserted on actual
 * bounding boxes / scrollWidth, not class strings.
 */

for (const vp of [
  { name: "iphone-390", width: 390, height: 844 },
  { name: "ipad-768", width: 768, height: 1024 },
]) {
  test(`POS register @ ${vp.name}: cart + sticky checkout bar, no desktop rail`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openRegister(page);

    await expect(page.getByTestId("pos-cart-scroll")).toBeVisible();
    await expect(page.getByTestId("pos-numpad-panel")).toBeHidden();

    const bar = page.getByTestId("pos-mobile-actions");
    await expect(bar).toBeVisible();
    const barRect = await bar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { bottom: r.bottom, width: r.width };
    });
    expect(barRect.bottom).toBeLessThanOrEqual(vp.height + 1);
    expect(barRect.width).toBeLessThanOrEqual(vp.width + 1);

    const checkout = page.getByTestId("pos-mobile-checkout");
    const cbox = (await checkout.boundingBox())!;
    expect(cbox.height).toBeGreaterThanOrEqual(44);

    // numpad sheet: body scrolls, confirm button stays inside the viewport
    await page.getByTestId("pos-mobile-pad-open").click();
    const done = page.getByTestId("pos-mobile-pad-done");
    await expect(done).toBeVisible();
    // wait out the radix slide-in so the rect is the settled position
    await page.locator('[data-testid="pos-mobile-pad"][data-state="open"]').waitFor();
    await page.waitForTimeout(600);
    // viewport-relative rect: the confirm button must sit inside the screen
    const drect = await done.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    expect(drect.top).toBeGreaterThanOrEqual(0);
    expect(drect.bottom).toBeLessThanOrEqual(vp.height + 1);
    await noHorizontalOverflow(page, vp.width);
    await page.keyboard.press("Escape");

    // (payment dialog geometry is covered by the unit-level dialog contract;
    //  the harness cart is empty so checkout stays disabled here)
  });
}

for (const vp of [
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "laptop-1366", width: 1366, height: 768 },
  { name: "desktop-1920", width: 1920, height: 1080 },
]) {
  test(`POS register @ ${vp.name}: desktop rail visible, no clipping`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openRegister(page);

    const rail = page.getByTestId("pos-numpad-panel");
    await expect(rail).toBeVisible();
    const rbox = (await rail.boundingBox())!;
    expect(rbox.x + rbox.width).toBeLessThanOrEqual(vp.width + 1);
    await expect(page.getByTestId("pos-checkout")).toBeVisible();
    await expect(page.getByTestId("pos-mobile-actions")).toBeHidden();
    await noHorizontalOverflow(page, vp.width);
  });
}

test("signed-out POS launch keeps the pos manifest through the staff login", async ({ page }) => {
  await page.goto("/launch?app=pos");
  await page.waitForURL(/\/staff\?/, { timeout: 15_000 });
  expect(page.url()).toContain("app=pos");
  expect(decodeURIComponent(page.url())).toContain("next=/pos/register");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toContain("manifest-pos.webmanifest");
});

test("short phone (390x667): toolbar never crushes the cart or overlaps the action bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await openRegister(page);

  // The quick-command tiles scroll horizontally instead of stacking, so the
  // cart keeps a usable height and the sticky bar stays clear of the search row.
  const rects = await page.evaluate(() => {
    const box = (id: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`)!;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    return { cart: box("pos-cart-scroll"), bar: box("pos-mobile-actions"), search: box("pos-scan-input") };
  });
  expect(rects.cart.height).toBeGreaterThan(80);
  expect(rects.search.bottom).toBeLessThanOrEqual(rects.cart.top + 1);
  expect(rects.cart.bottom).toBeLessThanOrEqual(rects.bar.top + 1);
  expect(rects.bar.bottom).toBeLessThanOrEqual(667 + 1);
  await noHorizontalOverflow(page, 390);
});

/**
 * v2 look: the register must render the new light convenience-store layout
 * (blue header, green command panel, blue numpad rail, red total, navy
 * footer) with the running version visible — not the old dark/orange skin.
 */
test("POS v2 visual contract on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRegister(page);

  await expect(page.locator('[data-pos-ui="v2"]')).toHaveCount(1);
  const bg = (sel: string) =>
    page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);

  expect(await bg('[data-testid="pos-topbar"]')).toBe("rgb(29, 78, 216)"); // blue-700
  expect(await bg('[data-testid="pos-command-panel"]')).toBe("rgb(5, 150, 105)"); // emerald-600
  expect(await bg('[data-testid="pos-numpad-panel"]')).toBe("rgb(30, 64, 175)"); // blue-800
  expect(await bg('[data-testid="pos-checkout"]')).toBe("rgb(220, 38, 38)"); // red-600
  expect(await bg('[data-testid="pos-footer"]')).toBe("rgb(23, 37, 84)"); // blue-950
  await expect(page.getByTestId("pos-table-head")).toBeVisible();
  await expect(page.getByTestId("pos-function-bar")).toBeVisible();
  await expect(page.getByTestId("pos-version")).toHaveText(/POS v\d+\.\d+\.\d+/);
  await expect(page.getByTestId("pos-checkout")).toContainText("รวมยอด");
});

for (const vp of [
  { name: "ipad-portrait", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
]) {
  test(`POS v2 version badge visible @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openRegister(page);
    await expect(page.getByTestId("pos-version")).toHaveText(/v\d+\.\d+\.\d+/);
    await noHorizontalOverflow(page, vp.width);
  });
}
