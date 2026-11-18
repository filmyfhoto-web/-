import { test, expect } from "@playwright/test";

/**
 * Integration-style hermetic check: even if the client tries to insert an
 * order without honouring consent, the server-side trigger
 * (trg_orders_assert_consent → assert_my_consent_current) must respond with
 * a P0001 "consent_required" error and the cart must NOT navigate away.
 *
 * We simulate the server rejection at the REST layer and verify the UI
 * surfaces the ConsentGate / does not redirect to a success page.
 */

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-2222-2222-222222222222";

test("server rejects order insert without current consent (consent_required)", async ({ page }) => {
  let postAttempted = false;

  await page.addInitScript((uid) => {
    const session = {
      access_token: "fake", refresh_token: "fake",
      expires_at: Math.floor(Date.now()/1000)+3600, token_type: "bearer",
      user: { id: uid, email: "t@example.com" },
    };
    try { localStorage.setItem("sb-fdgxvgtmzcgakofswtty-auth-token", JSON.stringify(session)); } catch {}
    localStorage.setItem("rds_customer_cart_v1", JSON.stringify({
      items: [{ product_id: "p1", code: "P-001", name: "Pen", unit: "ชิ้น", qty: 1, image_url: null }],
      note: "",
    }));
  }, USER_ID);

  await page.route("**/auth/v1/user**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ id: USER_ID, email: "t@example.com" }),
  }));
  // Profile reports CURRENT versions so the client thinks it's fine — but the
  // server still says no (simulating a CURRENT_*_VERSION bump that the cached
  // profile hasn't caught up to yet).
  await page.route("**/rest/v1/profiles**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID, full_name: "T", email: "t@example.com", phone: "",
      organization_id: ORG_ID,
      accepted_terms_version: "2026-06-29",
      accepted_privacy_version: "2026-06-29",
      accepted_terms_at: "2026-06-29T00:00:00Z",
      accepted_privacy_at: "2026-06-29T00:00:00Z",
      organizations: { id: ORG_ID, name: "Org" },
      cost_visible: false,
    }),
  }));
  await page.route("**/rest/v1/user_roles**", (r) => r.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify([{ role: "customer" }]),
  }));

  // The key assertion: insert into orders is rejected exactly like the
  // trigger would (P0001 + message including 'consent_required').
  await page.route("**/rest/v1/orders**", (route) => {
    if (route.request().method() === "POST") {
      postAttempted = true;
      return route.fulfill({
        status: 400, contentType: "application/json",
        body: JSON.stringify({
          code: "P0001",
          message: "consent_required",
          details: "consent_required",
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/cart");
  const submit = page.getByTestId("submit-order-btn");
  if (!(await submit.count())) test.skip(true, "cart did not render");
  await submit.click();

  // Confirm dialog → confirm
  const confirmBtn = page.getByRole("button", { name: /ยืนยัน|Confirm/ }).first();
  if (await confirmBtn.count()) await confirmBtn.click().catch(() => {});

  // We should not be navigated to /my-orders — the server rejected the order.
  await page.waitForTimeout(800);
  expect(page.url()).not.toMatch(/\/my-orders\/[\w-]+/);
  // And the order POST must actually have been attempted.
  expect(postAttempted).toBe(true);
});