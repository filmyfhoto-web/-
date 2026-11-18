import { test, expect } from "@playwright/test";
import { openRegister, scanOneItem, noHorizontalOverflow } from "./posRegisterFixture";

/**
 * The cart grid must fit every device the shop uses (phone, tablet, laptop,
 * desktop): one scanned line, no sideways scroll, row never wider than the
 * cart viewport, and the camera-scan entry point always reachable.
 */
for (const vp of [
  { name: "iphone-390", width: 390, height: 844 },
  { name: "ipad-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
]) {
  test(`cart row fits @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openRegister(page);
    await scanOneItem(page);

    await noHorizontalOverflow(page, vp.width);

    const geo = await page.evaluate(() => {
      const scroll = document.querySelector('[data-testid="pos-cart-scroll"]')!;
      const row = document.querySelector('[data-testid="pos-cart-row"]')!;
      return {
        sideways: scroll.scrollWidth > scroll.clientWidth + 1,
        rowRight: row.getBoundingClientRect().right,
        scrollRight: scroll.getBoundingClientRect().right,
      };
    });
    expect(geo.sideways).toBe(false);
    expect(geo.rowRight).toBeLessThanOrEqual(geo.scrollRight + 1);

    // product name + total stay readable on every width
    await expect(page.getByTestId("pos-cart-row").first()).toContainText("ปากกา");
    // camera scan button is reachable and inside the viewport
    const cam = page.getByTestId("pos-cam-scan-btn");
    await expect(cam).toBeVisible();
    const box = (await cam.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box.height).toBeGreaterThanOrEqual(40);
  });
}
