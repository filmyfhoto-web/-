import { test, expect, type Route } from "@playwright/test";
import { stubLineGate } from "./fixtures/stagingBackend";

/**
 * Guards against layout regressions on the public Shop at the two viewport
 * sizes users hit most often on the road: iPhone SE (375) and iPad portrait
 * (768). We assert (a) no horizontal page-scroll (body wider than viewport),
 * and (b) each rendered category chip fits the row without collapsing.
 */

const CATEGORIES = [
  { id: "c1", name: "หมวดที่มีรูป", image_urls: ["https://picsum.photos/seed/x/80"] },
  { id: "c2", name: "หมวดยาวๆ ทดสอบตัดคำ ไม่มีรูป", image_urls: null },
  { id: "c3", name: "หมวดสั้น", image_urls: [] },
  { id: "c4", name: "อีกหมวด", image_urls: null },
];

const PRODUCTS = Array.from({ length: 6 }).map((_, i) => ({
  id: `p${i}`, code: `FY0000${i}`, name: `สินค้าทดสอบ ${i}`,
  unit: "ชิ้น", standard_price: 100 + i, image_url: "", category_id: "c1",
}));

async function mockShop(page: any) {
  await page.route(/\/rest\/v1\/categories.*/, (r: Route) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CATEGORIES) }));
  await page.route(/\/rest\/v1\/products_public.*/, (r: Route) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PRODUCTS) }));
  await page.route(/\/rest\/v1\/rpc\/get_public_settings.*/, (r: Route) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ shop_name: "TEST" }]) }));
}

for (const vp of [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
]) {
  test(`Shop @ ${vp.name}: no horizontal overflow and category chips render inline`, async ({ page }) => {
    await stubLineGate(page);
    await mockShop(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/shop");

    // No horizontal overflow on <body>.
    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      html: document.documentElement.scrollWidth,
      vw: window.innerWidth,
    }));
    expect(overflow.body, `body scrollWidth (${overflow.body}) must not exceed viewport (${overflow.vw}) + small tolerance`).toBeLessThanOrEqual(overflow.vw + 4);
    expect(overflow.html).toBeLessThanOrEqual(overflow.vw + 4);

    // Every chip is visible and within the viewport width bound (or reachable via
    // its own horizontal scroll container — but not by expanding the page).
    for (const c of CATEGORIES) {
      const chip = page.locator(`[data-testid="shop-cat-chip-${c.id}"]`);
      await expect(chip).toBeVisible();
      const box = await chip.boundingBox();
      expect(box, `chip ${c.id} must render a box`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(32);
      expect(box!.height).toBeLessThan(120); // no vertical blow-up on missing image
    }
  });
}
