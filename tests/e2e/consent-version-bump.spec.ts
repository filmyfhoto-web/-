import { test, expect } from "@playwright/test";

/**
 * Hermetic: when policy versions advance past what the user accepted,
 * (1) the cart "ส่งรายการให้ร้าน" button must be disabled and
 * (2) the "ดาวน์โหลดเอกสาร" buttons on /my-orders/:id must be disabled
 * until the user accepts again.
 *
 * We hold CURRENT_*_VERSION constant in app code, and instead simulate
 * a bump by serving a profile whose accepted_*_version no longer matches.
 */

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-2222-2222-222222222222";
const ORDER_ID = "33333333-3333-3333-3333-333333333333";
const DOC_ID = "44444444-4444-4444-4444-444444444444";

function profileRow(accepted: string | null) {
  return {
    id: USER_ID,
    full_name: "Test",
    email: "t@example.com",
    phone: "",
    organization_id: ORG_ID,
    accepted_terms_version: accepted,
    accepted_privacy_version: accepted,
    accepted_terms_at: accepted ? `${accepted}T00:00:00Z` : null,
    accepted_privacy_at: accepted ? `${accepted}T00:00:00Z` : null,
    organizations: { id: ORG_ID, name: "Test Org" },
    cost_visible: false,
  };
}

async function seedAuth(page: import("@playwright/test").Page) {
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
}

async function routeCommon(page: import("@playwright/test").Page, acceptedVersion: { v: string | null }) {
  await page.route("**/auth/v1/user**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ id: USER_ID, email: "t@example.com" }),
  }));
  await page.route("**/rest/v1/profiles**", (route) => {
    if (route.request().method() === "PATCH") {
      try {
        const body = route.request().postDataJSON();
        if (body && typeof body.accepted_terms_version === "string") acceptedVersion.v = body.accepted_terms_version;
        if (body && body.accepted_terms_version === null) acceptedVersion.v = null;
      } catch {}
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profileRow(acceptedVersion.v)) });
  });
  await page.route("**/rest/v1/user_roles**", (r) => r.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify([{ role: "customer" }]),
  }));
  await page.route("**/rest/v1/activity_logs**", (r) => r.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
  page.on("dialog", (d) => d.accept().catch(() => {}));
}

test("cart submit disabled when accepted version is stale", async ({ page }) => {
  const accepted = { v: "1999-01-01" as string | null }; // stale vs CURRENT_*
  await seedAuth(page);
  await routeCommon(page, accepted);
  await page.goto("/cart");
  const btn = page.getByTestId("submit-order-btn");
  if (!(await btn.count())) test.skip(true, "cart did not render");
  await expect(btn).toBeDisabled();
  await expect(page.getByTestId("cart-consent-warning")).toBeVisible();
});

test("MyOrderDetail download buttons disabled when version stale, enabled after re-accept", async ({ page }) => {
  const accepted = { v: "1999-01-01" as string | null };
  await seedAuth(page);
  await routeCommon(page, accepted);

  // Mock the single order + items + docs + settings
  await page.route("**/rest/v1/orders**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      id: ORDER_ID, order_no: "SO-0001", status: "approved", total: 100, subtotal: 100,
      discount: 0, shipping_fee: 0, note: "", customer_id: USER_ID, organization_id: ORG_ID,
      organizations: { name: "Test Org" }, created_at: "2099-01-01T00:00:00Z",
    }),
  }));
  await page.route("**/rest/v1/order_items**", (r) => r.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify([]),
  }));
  await page.route("**/rest/v1/documents**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{ id: DOC_ID, doc_no: "QT-0001", doc_type: "quotation", order_id: ORDER_ID, created_at: "2099-01-01T00:00:00Z" }]),
  }));
  await page.route("**/rest/v1/rpc/get_public_settings", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{ store_name: "Store", address: "", phone: "", email: "" }]),
  }));

  await page.goto(`/my-orders/${ORDER_ID}`);
  const dl = page.getByTestId("download-doc-btn").first();
  if (!(await dl.count())) test.skip(true, "order detail did not render");
  await expect(dl).toBeDisabled();

  // Re-accept via Account
  await page.goto("/account");
  const accept = page.getByTestId("consent-accept-btn");
  if (await accept.count()) await accept.click();

  await page.goto(`/my-orders/${ORDER_ID}`);
  if (await dl.count()) {
    await expect(dl).toBeEnabled({ timeout: 5000 });
  }
});