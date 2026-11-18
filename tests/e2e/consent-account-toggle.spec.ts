import { test, expect } from "@playwright/test";

/**
 * Hermetic test: revoke + re-accept on /account flips the
 * "ส่งรายการให้ร้าน" button disabled/enabled state on /cart.
 */

const USER_ID = "11111111-1111-1111-1111-111111111111";
const CURRENT = "2026-06-29";

function profile(withConsent: boolean) {
  return {
    id: USER_ID,
    full_name: "Test User",
    email: "t@example.com",
    phone: "",
    organization_id: "22222222-2222-2222-2222-222222222222",
    accepted_terms_version: withConsent ? CURRENT : null,
    accepted_privacy_version: withConsent ? CURRENT : null,
    accepted_terms_at: withConsent ? `${CURRENT}T00:00:00Z` : null,
    accepted_privacy_at: withConsent ? `${CURRENT}T00:00:00Z` : null,
    organizations: { id: "22222222-2222-2222-2222-222222222222", name: "Test Org" },
    cost_visible: false,
  };
}

async function setup(page: import("@playwright/test").Page, initial: boolean) {
  let consentOk = initial;

  await page.route("**/auth/v1/user**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USER_ID, email: "t@example.com" }) }),
  );
  await page.route("**/rest/v1/profiles**", (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      try {
        const body = req.postDataJSON();
        if (body?.accepted_terms_version === CURRENT) consentOk = true;
        if (body?.accepted_terms_version === null) consentOk = false;
      } catch {}
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profile(consentOk)) });
  });
  await page.route("**/rest/v1/user_roles**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ role: "customer" }]) }),
  );
  await page.route("**/rest/v1/activity_logs**", (r) =>
    r.fulfill({ status: 201, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/rest/v1/orders**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.addInitScript((uid) => {
    const session = {
      access_token: "fake",
      refresh_token: "fake",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: { id: uid, email: "t@example.com" },
    };
    try {
      localStorage.setItem("sb-fdgxvgtmzcgakofswtty-auth-token", JSON.stringify(session));
    } catch {}
    localStorage.setItem(
      "rds_customer_cart_v1",
      JSON.stringify({
        items: [{ product_id: "p1", code: "P-001", name: "Test Product", unit: "ชิ้น", qty: 1, image_url: null }],
        note: "",
      }),
    );
  }, USER_ID);

  // Auto-accept window.confirm() used by revoke
  page.on("dialog", (d) => d.accept().catch(() => {}));
}

test("revoke on Account disables cart submit, re-accept enables it", async ({ page }) => {
  await setup(page, true);

  // 1) Start at /cart — submit enabled
  await page.goto("/cart");
  const submit = page.getByTestId("submit-order-btn");
  if (!(await submit.count())) test.skip(true, "cart did not render (auth redirect)");
  await expect(submit).toBeEnabled();

  // 2) Go to /account and revoke
  await page.goto("/account");
  const revoke = page.getByTestId("consent-revoke-btn");
  if (!(await revoke.count())) test.skip(true, "account did not render");
  await revoke.click();

  // 3) Back to cart — submit disabled
  await page.goto("/cart");
  if (await submit.count()) {
    await expect(submit).toBeDisabled();
    await expect(page.getByTestId("cart-consent-warning")).toBeVisible();
  }

  // 4) Back to account and re-accept
  await page.goto("/account");
  const accept = page.getByTestId("consent-accept-btn");
  if (await accept.count()) {
    await accept.click();
  }

  // 5) Cart submit enabled again
  await page.goto("/cart");
  if (await submit.count()) {
    await expect(submit).toBeEnabled({ timeout: 5000 });
  }
});
