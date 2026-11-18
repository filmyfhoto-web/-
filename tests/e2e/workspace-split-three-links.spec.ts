import { test, expect } from "@playwright/test";

/**
 * Three separate web apps from one codebase:
 *   - customer  → /shop (order, cart, own orders)
 *   - staff     → /pos  (POS / stock / PO only, no /admin/*)
 *   - admin     → /admin/dashboard (everything)
 *
 * On preview/localhost the workspace is selected with `?mode=` which
 * hostMode.ts persists in localStorage, mirroring the production hostname
 * split (www / staff. / admin.).
 */

async function reset(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext) {
  await context.clearCookies();
  await page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
}

test.describe("workspace split — 3 links", () => {
  test("root path lands on the right home per workspace", async ({ page, context }) => {
    await reset(page, context);

    // Signed out, the landing router (`Index` + resolveRoleHome) always shows
    // the three-choice welcome screen in every workspace — exactly one hop, no
    // gated page for an anonymous visitor. Role homes are unit-tested.
    for (const mode of ["customer", "staff", "admin"]) {
      await page.goto(`/?mode=${mode}`);
      await page.waitForFunction(() => location.pathname !== "/", null, { timeout: 10000 });
      expect(new URL(page.url()).pathname, `mode=${mode}`).toBe("/welcome");
    }
  });

  test("staff workspace never renders admin-only paths", async ({ page, context }) => {
    await reset(page, context);
    await page.goto("/?mode=staff");
    await page.waitForFunction(() => location.pathname !== "/", null, { timeout: 10000 });

    for (const path of ["/admin/dashboard", "/admin/staff", "/admin-login"]) {
      await page.goto(`${path}?mode=staff`);
      await page.waitForFunction(
        () => !location.pathname.startsWith("/admin"),
        null,
        { timeout: 10000 },
      );
      const p = new URL(page.url()).pathname;
      expect(p.startsWith("/admin"), `staff workspace must not serve ${path} (got ${p})`).toBeFalsy();
    }
  });

  test("staff workspace bounces customer shopping paths back to POS", async ({ page, context }) => {
    await reset(page, context);
    await page.goto("/?mode=staff");
    await page.waitForFunction(() => location.pathname !== "/", null, { timeout: 10000 });

    for (const path of ["/shop", "/cart", "/my-orders"]) {
      await page.goto(`${path}?mode=staff`);
      await page.waitForFunction((p) => location.pathname !== p, path, { timeout: 10000 });
      const p = new URL(page.url()).pathname;
      expect(["/shop", "/cart", "/my-orders"].includes(p), `expected bounce off ${path}, got ${p}`).toBeFalsy();
    }
  });

  test("customer workspace keeps staff/admin paths gated by auth, not rendered", async ({ page, context }) => {
    await reset(page, context);
    await page.goto("/?mode=customer");
    await page.waitForFunction(() => location.pathname !== "/", null, { timeout: 10000 });

    for (const path of ["/pos", "/admin/dashboard"]) {
      await page.goto(`${path}?mode=customer`);
      await page.waitForFunction(
        (p) => location.pathname !== p,
        path,
        { timeout: 10000 },
      );
      const p = new URL(page.url()).pathname;
      expect(
        ["/login", "/auth", "/shop", "/staff", "/admin-login"].some((x) => p.startsWith(x)),
        `anonymous ${path} should be sent to a login/customer page, got ${p}`,
      ).toBeTruthy();
    }
  });
});
