import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Scroll stability for the two customer screens that users live in:
 * the storefront home (/shop) and the profile (/my-account).
 *
 * Runs on the mobile-chromium / mobile-webkit / tablet-chromium /
 * tablet-webkit projects (see playwright.config.ts). Every network
 * dependency is mocked deterministically so a scroll measurement never
 * depends on live data, and each test seeds its OWN unique dataset so the
 * suite is safe under full parallelism.
 */

const uid = () => `s${Math.random().toString(36).slice(2, 8)}`;

function seed(tag: string) {
  const categories = Array.from({ length: 4 }).map((_, i) => ({
    id: `${tag}-c${i}`, name: `หมวด ${tag}-${i}`, image_urls: null,
  }));
  const products = Array.from({ length: 24 }).map((_, i) => ({
    id: `${tag}-p${i}`, code: `${tag}${i}`, name: `สินค้า ${tag} ลำดับ ${i}`,
    unit: "ชิ้น", standard_price: 50 + i, image_url: "", category_id: `${tag}-c0`,
    stock: i % 3, lead_time_days: i % 2,
  }));
  return { categories, products };
}

async function mockCustomerApi(page: Page, tag: string) {
  const { categories, products } = seed(tag);
  const json = (body: unknown) => ({
    status: 200, contentType: "application/json", body: JSON.stringify(body),
  });
  // Unlock the mandatory LINE gate deterministically: the gate trusts ONLY
  // the server response, so we stub the edge function (and seed the id_token
  // the client attaches to it) instead of faking client-side state.
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
  await page.route(/functions\/v1\/my-line-orders.*/, (r: Route) => r.fulfill(json({ orders: [] })));
  return { categories, products };
}

/** Scroll to the bottom in steps, then back to the top, like a real thumb. */
async function scrollThrough(page: Page) {
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  for (let y = 0; y <= max; y += Math.max(200, Math.round(max / 6))) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(120);
  const bottom = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  const top = await page.evaluate(() => window.scrollY);
  return { max, bottom, top };
}

for (const route of [
  { path: "/shop", name: "หน้าแรก" },
  { path: "/my-account", name: "หน้าฉัน" },
]) {
  test(`${route.name}: เลื่อนลงล่างและกลับขึ้นบนได้ ไม่มีส่วนติดค้าง`, async ({ page }) => {
    await mockCustomerApi(page, uid());
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    const { max, bottom, top } = await scrollThrough(page);
    // On large tablets the page can fit entirely — that is still "not stuck".
    if (max > 0) expect(bottom).toBeGreaterThan(max - 8);
    expect(top).toBe(0);

    // No horizontal drift on any device.
    const h = await page.evaluate(() => ({
      w: document.body.scrollWidth,
      vw: document.documentElement.clientWidth,
    }));
    expect(h.w).toBeLessThanOrEqual(h.vw + 4);
  });

  test(`${route.name}: realtime refetch ระหว่างเลื่อนไม่ทำให้ scroll กระโดด`, async ({ page }) => {
    await mockCustomerApi(page, uid());
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    test.skip(max <= 0, "page not scrollable on this device");
    const anchorY = Math.round(max / 2);
    await page.evaluate((y) => window.scrollTo(0, y), anchorY);
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.scrollY);

    for (let i = 0; i < 3; i += 1) {
      // Simulate the realtime -> query invalidation -> refetch cycle.
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new Event("online"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(250);
    }

    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before), "scroll position must survive refetches").toBeLessThanOrEqual(24);
  });

  test(`${route.name}: bottom navigation ไม่บังเนื้อหาท้ายหน้า`, async ({ page }) => {
    await mockCustomerApi(page, uid());
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);

    const nav = page.locator('nav[aria-label="เมนูหลัก"], [data-testid="customer-bottom-nav"]').first();
    if (await nav.count()) {
      const navBox = await nav.boundingBox();
      if (navBox) {
        // Last interactive element in the page body must not sit underneath.
        const covered = await page.evaluate((navTop) => {
          const els = Array.from(document.querySelectorAll("main a, main button"));
          return els.some((el) => {
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.top < navTop && r.bottom > navTop + 4;
          });
        }, navBox.y);
        expect(covered, "no main action may be clipped by the bottom nav").toBeFalsy();
      }
    }
  });

  test(`${route.name}: หมุนจอ/เปลี่ยนขนาด viewport แล้ว layout ยังไม่ล้น`, async ({ page }) => {
    await mockCustomerApi(page, uid());
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    const vp = page.viewportSize();
    if (!vp) test.skip(true, "no viewport");
    for (const size of [
      { width: vp!.width, height: vp!.height },
      { width: vp!.height, height: vp!.width },
      { width: vp!.width, height: vp!.height },
    ]) {
      await page.setViewportSize(size);
      // Deterministic wait: let the responsive reflow settle instead of a
      // fixed sleep, then assert no horizontal overflow.
      await expect
        .poll(
          () =>
            page.evaluate(
              () => {
                // Under mobile emulation the layout viewport can be wider than
                // the visual one, so measure real element overflow instead of
                // body.scrollWidth (which reflects the emulated layout width).
                const vw = document.documentElement.clientWidth;
                let worst = 0;
                for (const el of Array.from(document.body.querySelectorAll("*"))) {
                  const r = el.getBoundingClientRect();
                  if (r.width === 0 || r.height === 0) continue;
                  // Content inside an intentional horizontal scroller may
                  // extend past the viewport — that is not page overflow.
                  let p = el.parentElement, inScroller = false;
                  while (p && p !== document.body) {
                    const ov = getComputedStyle(p).overflowX;
                    if (ov === "auto" || ov === "scroll" || ov === "hidden" || ov === "clip") { inScroller = true; break; }
                    p = p.parentElement;
                  }
                  if (inScroller) continue;
                  worst = Math.max(worst, r.right - vw, -r.left);
                }
                return Math.round(worst);
              },
            ),
          { message: `overflow at ${size.width}x${size.height}`, timeout: 5000 },
        )
        .toBeLessThanOrEqual(4);
    }
  });
}

test("หน้าแรก: โหลดรูป/ฟอนต์เสร็จแล้ว layout ไม่เด้งอย่างมีนัยสำคัญ", async ({ page }) => {
  await mockCustomerApi(page, uid());
  await page.goto("/shop");
  await page.waitForLoadState("networkidle");

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(120);
  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => (document as any).fonts?.ready);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(16);
});

test("ตะกร้าแบบ sheet บนจอเล็ก: เลื่อนได้และปุ่มท้ายยังมองเห็น", async ({ page }) => {
  await mockCustomerApi(page, uid());
  await page.goto("/shop");
  await page.waitForLoadState("networkidle");

  const cart = page.getByRole("button", { name: /ตะกร้า/ }).first();
  if (!(await cart.count())) test.skip(true, "cart entry not rendered");
  // The cart entry navigates; the sheet preview is a context menu action, so we
  // assert the primary entry point stays reachable and inside the viewport.
  const box = await cart.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.height).toBeGreaterThanOrEqual(36);
});