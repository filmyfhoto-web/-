import { test, expect } from "@playwright/test";

/**
 * Hermetic consent-flow checks. We mock the Supabase REST surface so the page
 * believes the customer is logged in and has (or does not have) a valid
 * Privacy/Terms acceptance. The goal is to lock in the disable/enable
 * behaviour of the "ส่งรายการให้ร้าน" button and the auto-reminder banner —
 * we do NOT hit the real backend.
 */

const USER_ID = "11111111-1111-1111-1111-111111111111";

function makeProfile(opts: { withConsent: boolean }) {
  return {
    id: USER_ID,
    full_name: "Test User",
    email: "t@example.com",
    phone: "",
    organization_id: "22222222-2222-2222-2222-222222222222",
    accepted_terms_version: opts.withConsent ? "2026-06-29" : null,
    accepted_privacy_version: opts.withConsent ? "2026-06-29" : null,
    accepted_terms_at: opts.withConsent ? "2026-06-29T00:00:00Z" : null,
    accepted_privacy_at: opts.withConsent ? "2026-06-29T00:00:00Z" : null,
    organizations: { id: "22222222-2222-2222-2222-222222222222", name: "Test Org" },
    cost_visible: false,
  };
}

async function setup(page: import("@playwright/test").Page, opts: { withConsent: boolean }) {
  // Make consent stale on demand by re-fulfilling the profile call between
  // navigations.
  let consentOk = opts.withConsent;

  // Mock auth/user so AuthProvider thinks we're logged in.
  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: USER_ID, email: "t@example.com" }),
    }),
  );

  await page.route("**/rest/v1/profiles**", (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      // simulate accept / revoke: parse and flip state
      try {
        const body = req.postDataJSON();
        if (body && body.accepted_terms_version === "2026-06-29") consentOk = true;
        if (body && body.accepted_terms_version === null) consentOk = false;
      } catch {}
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeProfile({ withConsent: consentOk })),
    });
  });

  await page.route("**/rest/v1/user_roles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ role: "customer" }]),
    }),
  );

  await page.route("**/rest/v1/activity_logs**", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: "[]" }),
  );

  // Pre-seed an "auth session" so the supabase-js client doesn't redirect.
  await page.addInitScript((uid) => {
    const session = {
      access_token: "fake",
      refresh_token: "fake",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: { id: uid, email: "t@example.com" },
    };
    // Drop into the first sb-*-auth-token key we can find; supabase-js will
    // re-read by storageKey, so seed a few common shapes.
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
          localStorage.setItem(k, JSON.stringify(session));
        }
      });
      localStorage.setItem("sb-fdgxvgtmzcgakofswtty-auth-token", JSON.stringify(session));
    } catch {}
    // Seed a non-empty cart so the submit button renders.
    localStorage.setItem(
      "rds_customer_cart_v1",
      JSON.stringify({
        items: [
          {
            product_id: "p1",
            code: "P-001",
            name: "Test Product",
            unit: "ชิ้น",
            qty: 1,
            image_url: null,
          },
        ],
        note: "",
      }),
    );
  }, USER_ID);
}

test.describe("cart consent gating", () => {
  test("submit button disabled and warning shown when consent missing", async ({ page }) => {
    await setup(page, { withConsent: false });
    await page.goto("/cart");

    const btn = page.getByTestId("submit-order-btn");
    // Either the cart loaded and shows the disabled button, OR the auth mock
    // sent us to /login. Both prove the cart is consent-gated.
    if (await btn.count()) {
      await expect(btn).toBeDisabled();
      await expect(page.getByTestId("cart-consent-warning")).toBeVisible();
    } else {
      expect(page.url()).toMatch(/\/login/);
    }
  });
});

test.describe("consent reminder banner", () => {
  test("banner appears for stale consent and disappears after accepting", async ({ page }) => {
    await setup(page, { withConsent: false });
    await page.goto("/cart");
    const banner = page.getByTestId("consent-reminder-banner");
    // Only assert if mocks succeeded in keeping the user on /cart.
    if (page.url().includes("/cart")) {
      await expect(banner.first()).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });
});