import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Menu / navigation regression guard.
 *
 * Runs on the desktop projects (chromium, webkit) AND the mobile/tablet
 * projects (the filename matches `customer-mobile*`), so every menu entry is
 * clicked on both form factors. This is what stops a menu item from silently
 * pointing at an old, removed page again.
 *
 * It also asserts the build stamp (version + last update) is visible on the
 * public site, so an operator can confirm the deployed version at a glance.
 */

const uid = () => `n${Math.random().toString(36).slice(2, 8)}`;

async function mockCustomerApi(page: Page, tag: string) {
  const json = (body: unknown) => ({
    status: 200, contentType: "application/json", body: JSON.stringify(body),
  });
  const categories = [{ id: `${tag}-c0`, name: `หมวด ${tag}`, image_urls: null }];
  const products = Array.from({ length: 6 }).map((_, i) => ({
    id: `${tag}-p${i}`, code: `${tag}${i}`, name: `สินค้า ${tag} ${i}`,
    unit: "ชิ้น", standard_price: 20 + i, image_url: "", category_id: `${tag}-c0`,
    stock: 5, lead_time_days: 0,
  }));
  await page.addInitScript((t: string) => {
    try { sessionStorage.setItem("line_id_token", `e2e-${t}`); } catch { /* ignore */ }
  }, tag);
  await page.route(/functions\/v1\/line-link-lookup.*/, (r: Route) =>
    r.fulfill(json({
      bound: true, friend_status: "friend", friend_confirmed: true,
      line_user_id: `U${tag}`, display_name: `ลูกค้า ${tag}`,
      customer_id: `cust-${tag}`, customer_name: `ลูกค้า ${tag}`, phone: "0812345678",
    })));
  await page.route(/\/rest\/v1\/categories.*/, (r: Route) => r.fulfill(json(categories)));
  await page.route(/\/rest\/v1\/products_public.*/, (r: Route) => r.fulfill(json(products)));
  await page.route(/\/rest\/v1\/shop_promos.*/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/get_public_settings.*/, (r: Route) =>
    r.fulfill(json([{ shop_name: "นัฐภรณ์ เชียงกลาง", phone: "0812345678", address: "เชียงกลาง" }])));
  await page.route(/\/rest\/v1\/rpc\/get_guest_orders.*/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/notifications.*/, (r: Route) => r.fulfill(json([])));
  await page.route(/functions\/v1\/my-line-orders.*/, (r: Route) => r.fulfill(json({ orders: [] })));
}

/** The five customer tabs and the route each one MUST land on. */
const TABS = [
  { label: "หน้าแรก", path: "/shop" },
  { label: "หมวดหมู่", path: "/categories" },
  { label: "คำสั่งซื้อ", path: "/my-orders" },
  { label: "แจ้งเตือน", path: "/notifications" },
  { label: "ฉัน", path: "/my-account" },
];

async function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

test.describe("เมนูลูกค้า: กดได้จริงและไปหน้าที่ถูกต้อง", () => {
  test("ทุกเมนูนำทางไปหน้าที่ถูกต้อง (มือถือใช้แถบล่าง / เดสก์ท็อปใช้ URL)", async ({ page }) => {
    await mockCustomerApi(page, uid());
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");

    const mobile = await isMobile(page);
    if (mobile) {
      const bar = page.getByTestId("customer-bottom-nav");
      await expect(bar).toBeVisible();
      for (const tab of TABS) {
        const link = page.getByTestId(`customer-tab-${tab.label}`);
        await expect(link, `tab ${tab.label} must exist`).toBeVisible();
        await expect(link).toHaveAttribute("href", tab.path);
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${tab.path}(\\?|$|/)`));
        // The tab must not land on a blank/error screen.
        await expect(page.locator("main")).toBeVisible();
      }
    } else {
      // Desktop header menu
      for (const [label, path] of [
        ["หน้าแรก", "/shop"],
        ["ประวัติคำสั่งซื้อ", "/my-orders"],
      ] as const) {
        const link = page.getByRole("link", { name: label }).first();
        await expect(link).toBeVisible();
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${path}(\\?|$|/)`));
        await expect(page.locator("main")).toBeVisible();
        await page.goto("/shop");
        await page.waitForLoadState("networkidle");
      }
      // Every tab route still resolves to a real page (no 404 / redirect loop).
      for (const tab of TABS) {
        await page.goto(tab.path);
        await expect(page).toHaveURL(new RegExp(`${tab.path}(\\?|$|/)`));
        await expect(page.locator("main")).toBeVisible();
      }
    }
  });

  test("หน้าเว็บแสดงเวอร์ชันบิลด์และวันที่อัปเดต", async ({ page }) => {
    await mockCustomerApi(page, uid());
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");

    const stamp = page.getByTestId("build-stamp").first();
    await stamp.scrollIntoViewIfNeeded();
    await expect(stamp).toBeVisible();
    await expect(page.getByTestId("build-stamp-version").first()).toContainText(/v\d+\.\d+\.\d+/);
    await expect(page.getByTestId("build-stamp-updated").first()).not.toContainText("ไม่ทราบ");
  });
});