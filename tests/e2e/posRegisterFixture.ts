import { expect, type Page, type Route } from "@playwright/test";

/**
 * Shared session/backend mocks for the guarded touch register. Specs drive the
 * REAL `/pos/register` route through `RequireStaffPerm` — there is deliberately
 * no auth-bypass harness in the app.
 */

const REF = "fdgxvgtmzcgakofswtty";
const UID = "11111111-1111-4111-8111-111111111111";

const PRODUCTS = [
  { id: "pen", name: "ปากกา (ด้าม)", code: "PEN", barcode: "8850101", standard_price: 20, stock: 18, unit: "ด้าม", image_url: null, active: true, deleted_at: null, has_variants: false },
];

/** supabase-js decodes the JWT locally, so the fake token must be well formed. */
function fakeJwt(exp: number) {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, role: "authenticated", aud: "authenticated", exp, iat: Math.floor(Date.now() / 1000), session_id: "e2e" })}.e2e`;
}

function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: fakeJwt(exp),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "e2e-refresh",
    user: { id: UID, aud: "authenticated", role: "authenticated", email: "cashier@e2e.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
}

export async function mockBackend(page: Page) {
  const json = (r: Route, body: unknown) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  // Playwright matches the LAST registered route first, so the catch-alls go first.
  await page.route(/\/functions\/v1\/.*/, (r) => json(r, {}));
  await page.route(/\/rest\/v1\/.*/, (r) => json(r, []));
  await page.route(/\/rest\/v1\/product_unit_links.*/, (r) => json(r, []));
  await page.route(/\/rest\/v1\/product_variants.*/, (r) => json(r, []));
  await page.route(/\/rest\/v1\/products\b.*/, (r) => json(r, PRODUCTS));
  // no staff_permissions row → canonical defaults (pos/stock on) apply
  await page.route(/\/rest\/v1\/staff_permissions.*/, (r) => json(r, []));
  await page.route(/\/rest\/v1\/profiles.*/, (r) => json(r, { id: UID, staff_active: true, organizations: null }));
  await page.route(/\/rest\/v1\/user_roles.*/, (r) => json(r, [{ role: "owner" }]));
  await page.route(/\/auth\/v1\/.*/, (r) => json(r, session()));
  // supabase-js re-validates the restored session against /auth/v1/user
  await page.route(/\/auth\/v1\/user.*/, (r) => json(r, session().user));
}

export async function openRegister(page: Page) {
  await mockBackend(page);
  // Seed the session before any app script runs (localhost-only origin), so
  // there is no signed-out first paint that could redirect to the storefront.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`sb-${REF}-auth-token`, JSON.stringify(session())] as const,
  );
  await page.goto("/pos/register?app=pos");
  // real guard: RequireStaffPerm module="pos" must let this owner through
  await expect(page.getByTestId("pos-register")).toBeVisible({ timeout: 20_000 });
}

export async function noHorizontalOverflow(page: Page, width: number) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(width + 1);
}

/** Scan a known product so the cart has a line and checkout is enabled. */
export async function scanOneItem(page: Page) {
  const input = page.getByTestId("pos-scan-input");
  await input.click();
  await input.fill("8850101");
  await input.press("Enter");
  await expect(page.getByTestId("pos-cart-row").first()).toBeVisible({ timeout: 10_000 });
}
