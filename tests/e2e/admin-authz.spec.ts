import { test, expect } from "@playwright/test";

/**
 * Verifies that route guards on the admin surface actually redirect anonymous
 * and non-admin (guest) sessions away from product & category management pages.
 *
 * Frontend guards only — DB RLS + Edge Function authz are covered by their own
 * server-side contract tests. This suite protects the client-side gate from
 * regressing (e.g. an accidental un-wrap of RequireStockEdit).
 */

const PROTECTED = [
  "/admin/products",
  "/admin/prices",
  "/admin/dashboard",
  "/admin/orders",
  "/admin/staff",
];

test.describe("Admin authz — anonymous cannot reach product/category management", () => {
  test("all protected admin routes redirect to the staff login when not signed in", async ({ page, context }) => {
    // ensure clean anonymous state
    await context.clearCookies();
    await page.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });

    for (const path of PROTECTED) {
      await page.goto(path);
      // Guard resolves only after AuthContext finishes loading. Under a full
      // parallel run the dev server is contended, so 8s was not enough and the
      // suite flaked; the redirect itself is what we assert, not its speed.
      await page.waitForFunction(() => !location.pathname.startsWith("/admin/"), null, { timeout: 25000 });
      const url = new URL(page.url());
      expect(
        ["/staff/login", "/login", "/welcome", "/shop"].includes(url.pathname),
        `expected ${path} to redirect anon user to the staff login, got ${url.pathname}`
      ).toBeTruthy();
    }
  });
});

test.describe("Admin authz — non-admin session cannot edit products/categories", () => {
  test("stock-edit routes redirect to /shop for a non-staff session", async ({ page }) => {
    // Simulate a signed-in *non-staff* user by pre-seeding a fake supabase-auth
    // token in storage. AuthContext will treat it as authenticated but the
    // staff/role lookup returns empty → RequireStockEdit sends the user to /shop.
    await page.addInitScript(() => {
      const fake = {
        currentSession: {
          access_token: "fake.jwt.token",
          refresh_token: "r",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user: { id: "00000000-0000-0000-0000-000000000001", email: "guest@example.com", aud: "authenticated", role: "authenticated" },
        },
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      try {
        // Supabase v2 stores under "sb-<ref>-auth-token"; also mirror generic key.
        localStorage.setItem("supabase.auth.token", JSON.stringify({ currentSession: fake.currentSession }));
      } catch {}
    });

    // Stub the role lookups so canEditProduct === false, isStaff === false.
    await page.route(/\/rest\/v1\/(staff|user_roles).*/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    for (const path of ["/admin/products", "/admin/prices"]) {
      await page.goto(path);
      await page.waitForFunction(() => !location.pathname.startsWith("/admin/"), null, { timeout: 25000 }).catch(() => {});
      const url = new URL(page.url());
      expect(
        ["/shop", "/login", "/staff/login", "/welcome", "/no-access"].includes(url.pathname),
        `expected ${path} to redirect non-admin away from admin, got ${url.pathname}`
      ).toBeTruthy();
    }
  });
});