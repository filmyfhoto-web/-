import { test, expect, devices } from "@playwright/test";
import { installStagingBackend, newState, seedStaffSession } from "./fixtures/stagingBackend";

/**
 * Mobile regression guard for the "แดชบอร์ดเปิดได้แต่กดอะไรไม่ได้" report:
 * the dashboard must be tappable on a touch device, nothing may cover the
 * viewport, and the update logic must never reload the page in a loop.
 */
test.use({ ...devices["iPhone 13"] });

test.beforeEach(async ({ page }) => {
  await installStagingBackend(page, newState(), { staff: true });
  await seedStaffSession(page);
});

test("dashboard has no invisible full-viewport overlay", async ({ page }) => {
  await page.goto("/receipts/film");
  await page.waitForTimeout(1500);
  const covering = await page.evaluate(() => {
    const pts: [number, number][] = [
      [innerWidth / 2, 150],
      [innerWidth / 2, innerHeight / 2],
      [innerWidth / 2, innerHeight - 40],
    ];
    return pts
      .map(([x, y]) => document.elementFromPoint(x, y))
      .filter((el): el is Element => !!el)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width >= innerWidth * 0.95 && r.height >= innerHeight * 0.95;
      })
      .map((el) => el.tagName + "." + String((el as HTMLElement).className).slice(0, 40));
  });
  expect(covering).toEqual([]);
});

test("tapping a dashboard shortcut navigates", async ({ page }) => {
  await page.goto("/receipts/film");
  const target = page.getByText(/POS หน้าร้าน|ขายหน้าร้าน/).first();
  await target.waitFor({ state: "visible" });
  await target.tap();
  await expect(page).toHaveURL(/p=pos|\/pos/);
});

test("the app never reloads itself in a loop", async ({ page }) => {
  let loads = 0;
  page.on("load", () => { loads += 1; });
  await page.goto("/receipts/film");
  await page.waitForTimeout(8000);
  expect(loads).toBeLessThanOrEqual(2);
});
