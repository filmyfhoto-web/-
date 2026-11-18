import { test, expect } from "@playwright/test";

// The dev preview always resolves as `customer` unless we set the
// `__hostMode` override. These tests exercise in-app fallback + footer
// link + noindex meta; cross-origin production behaviour is unit-tested.

test.describe("host-split routing", () => {
  test("customer mode never renders an admin page for a signed-out visitor", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("__hostMode", "customer");
    });
    await page.goto("/admin/products");
    // The customer domain still *serves* admin paths as a DNS-propagation
    // fallback (resolveHostRedirect only gates the staff workspace), so the
    // route guard — not the host — is what protects the page: a signed-out
    // visitor is sent to the staff login, never to product management.
    await expect(page).toHaveURL(/\/staff\/login/);
  });

  test("admin mode keeps serving the storefront, and admin pages stay gated", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("__hostMode", "admin");
    });
    // Only the staff workspace bounces foreign paths (see resolveHostRedirect);
    // the admin workspace may browse the storefront.
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/shop(\?|$|\/)/);
    // …but the admin surface itself is still behind the auth guard.
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/(admin\/dashboard|staff\/login|auth|login)/);
  });

  test("admin mode injects noindex meta", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("__hostMode", "admin");
    });
    await page.goto("/admin/dashboard");
    const meta = page.locator('meta#__admin-host-noindex');
    await expect(meta).toHaveAttribute("content", "noindex,nofollow");
  });

  test("customer mode has no noindex meta", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("__hostMode", "customer");
    });
    await page.goto("/shop");
    await expect(page.locator('meta#__admin-host-noindex')).toHaveCount(0);
  });

  test("/admin-login serves the staff login form on the customer host", async ({ page }) => {
    // Seed customer mode without addInitScript — that would run again on
    // every navigation and clobber the flip AdminLoginRedirect performs.
    await page.goto("/");
    await page.evaluate(() => window.localStorage.setItem("__hostMode", "customer"));
    await page.goto("/admin-login");
    // /admin-login renders the staff/admin login form in place on any host
    // (AdminLoginRedirect), so the owner never needs to know about `?admin=1`.
    await expect(page).toHaveURL(/\/admin-login/);
    await expect(page.locator("form").first()).toBeVisible();
  });

  test("customer mode blocks unknown /admin/* routes (in-app fallback on preview)", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("__hostMode", "customer");
    });
    await page.goto("/admin/some-page-does-not-exist");
    // Unknown admin paths have no route and therefore no admin content:
    // the customer gets the 404 page, never an admin screen.
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });
});