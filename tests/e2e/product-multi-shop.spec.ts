import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * E2E: 1 product ↔ multiple shops (product_shops mapping)
 *
 * Verifies on /admin/products:
 *  - opening the dialog defaults to "both shops" checked
 *  - filter dropdown narrows the list by store
 *  - badges render per row showing which store carries the product
 *  - submitting with zero shops shows a guarding toast and does not call the RPC
 *
 * Supabase REST + RPC + Auth are all mocked end-to-end. The previous version
 * of this file failed in staging because the page is guarded by
 * `RequireStockEdit`, which redirected anonymous visits to /login. We now
 * seed an `sb-*-auth-token` in localStorage and mock `auth/v1/user`,
 * `profiles`, and `user_roles` so the auth context resolves to an owner.
 */

type Row = Record<string, any>;

const STORES = [
  { id: "store-colorlab", name: "นัฐภรณ์ คัลเลอร์แล็ป" },
  { id: "store-print", name: "นัฐภรณ์ การพิมพ์" },
];

const PRODUCTS: Row[] = [
  { id: "p-both", code: "B001", name: "กระดาษ A4 (สองร้าน)", unit: "รีม", standard_price: 120, stock: 10, active: true, low_stock_threshold: 0, barcode: "8850001", categories: null },
  { id: "p-color", code: "C001", name: "ฟิล์มสไลด์ (เฉพาะคัลเลอร์แล็ป)", unit: "ม้วน", standard_price: 350, stock: 4, active: true, low_stock_threshold: 0, barcode: "8850002", categories: null },
  { id: "p-print", code: "P001", name: "หมึก CMYK (เฉพาะการพิมพ์)", unit: "ขวด", standard_price: 590, stock: 6, active: true, low_stock_threshold: 0, barcode: "8850003", categories: null },
];

const PRODUCT_SHOPS: Row[] = [
  { product_id: "p-both", store_id: "store-colorlab" },
  { product_id: "p-both", store_id: "store-print" },
  { product_id: "p-color", store_id: "store-colorlab" },
  { product_id: "p-print", store_id: "store-print" },
];

const USER_ID = "00000000-0000-0000-0000-00000000aaaa";
const ORG_ID = "00000000-0000-0000-0000-00000000bbbb";
// Matches VITE_SUPABASE_PROJECT_ID — the storage key the Supabase JS client reads.
const SB_STORAGE_KEY = "sb-fdgxvgtmzcgakofswtty-auth-token";

function jsonOk(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function seedOwnerAuth(page: Page) {
  // Mock Supabase Auth: the client calls /auth/v1/user when it sees a stored session.
  await page.route("**/auth/v1/user**", (r: Route) =>
    r.fulfill(jsonOk({ id: USER_ID, email: "owner@example.com", aud: "authenticated", role: "authenticated" })),
  );
  await page.route("**/auth/v1/token**", (r: Route) =>
    r.fulfill(jsonOk({
      access_token: "fake", refresh_token: "fake",
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer", user: { id: USER_ID, email: "owner@example.com" },
    })),
  );
  // AuthContext.loadExtras → profiles + user_roles.
  await page.route(/\/rest\/v1\/profiles\b.*/, (r: Route) =>
    r.fulfill(jsonOk({
      id: USER_ID, full_name: "Owner", email: "owner@example.com", phone: "",
      organization_id: ORG_ID, cost_visible: true,
      accepted_terms_version: "2026-06-29", accepted_privacy_version: "2026-06-29",
      accepted_terms_at: "2026-06-29T00:00:00Z", accepted_privacy_at: "2026-06-29T00:00:00Z",
      organizations: { id: ORG_ID, name: "HQ", approved: true },
    })),
  );
  await page.route(/\/rest\/v1\/user_roles\b.*/, (r: Route) =>
    r.fulfill(jsonOk([{ role: "owner" }])),
  );
  // Pre-seed the Supabase auth token so `supabase.auth.getSession()` returns
  // a session synchronously on first paint. Without this, RequireStockEdit
  // sees `user=null` and redirects to /login before our REST mocks fire.
  await page.addInitScript(({ uid, storageKey }) => {
    const session = {
      access_token: "fake", refresh_token: "fake",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600, token_type: "bearer",
      user: { id: uid, email: "owner@example.com", aud: "authenticated", role: "authenticated" },
    };
    try { localStorage.setItem(storageKey, JSON.stringify(session)); } catch { /* ignore */ }
  }, { uid: USER_ID, storageKey: SB_STORAGE_KEY });
}

async function installRestMocks(page: Page, rpcSpy: { calls: any[] }) {
  await seedOwnerAuth(page);
  await page.route(/\/rest\/v1\/products\b.*/, (route: Route) => route.fulfill(jsonOk(PRODUCTS)));
  await page.route(/\/rest\/v1\/categories\b.*/, (route: Route) => route.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/product_costs\b.*/, (route: Route) => route.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/product_shops\b.*/, (route: Route) => route.fulfill(jsonOk(PRODUCT_SHOPS)));
  await page.route(/\/rest\/v1\/rds_stores\b.*/, (route: Route) => route.fulfill(jsonOk(STORES)));
  await page.route(/\/rest\/v1\/rpc\/admin_set_product_shops\b.*/, async (route: Route) => {
    const body = route.request().postDataJSON?.() ?? null;
    rpcSpy.calls.push(body);
    return route.fulfill({ status: 204, body: "" });
  });
}

test.describe("Admin Products — multi-shop relationship", () => {
  test("rows show shop badges; filter narrows the list", async ({ page }) => {
    const spy = { calls: [] as any[] };
    await installRestMocks(page, spy);
    await page.goto("/admin/products");
    // Guard: never get bounced to /login. If we do, auth seeding regressed.
    await expect(page).not.toHaveURL(/\/login/);

    // Each row carries badges for assigned stores. Admin Products fans out a
    // handful of REST calls in parallel; allow up to 15s for the table to
    // hydrate before we start asserting.
    const bothRow = page.locator("tr", { hasText: "กระดาษ A4 (สองร้าน)" });
    await expect(bothRow).toBeVisible({ timeout: 15_000 });
    await expect(bothRow.getByText("นัฐภรณ์ คัลเลอร์แล็ป")).toBeVisible();
    await expect(bothRow.getByText("นัฐภรณ์ การพิมพ์")).toBeVisible();

    // Apply filter — only colorlab products should remain
    await page.getByRole("combobox").filter({ hasText: /ทุกร้าน|กรองร้าน/ }).first().click();
    await page.getByRole("option", { name: "นัฐภรณ์ คัลเลอร์แล็ป" }).click();

    await expect(page.locator("tr", { hasText: "กระดาษ A4 (สองร้าน)" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "ฟิล์มสไลด์ (เฉพาะคัลเลอร์แล็ป)" })).toBeVisible();
    await expect(page.getByText("หมึก CMYK (เฉพาะการพิมพ์)")).toHaveCount(0);
  });

  test("guards against saving with zero shops selected", async ({ page }) => {
    const spy = { calls: [] as any[] };
    await installRestMocks(page, spy);
    await page.goto("/admin/products");
    await expect(page).not.toHaveURL(/\/login/);

    await page.getByRole("button", { name: /เพิ่มสินค้า/ }).first().click();
    // Default = both shops; uncheck both
    for (const s of STORES) {
      const cb = page.getByRole("checkbox", { name: s.name }).first()
        .or(page.locator("label", { hasText: s.name }).getByRole("checkbox"));
      if (await cb.isVisible().catch(() => false)) await cb.click();
    }
    await page.getByRole("button", { name: /^บันทึก$/ }).click();
    // Guard: toast warning shown (not the static helper text in the dialog),
    // RPC never called. The toast prefix "กรุณา..." disambiguates it from the
    // permanent helper text "เลือกอย่างน้อย 1 ร้านก่อนบันทึก" inside the form.
    await expect(page.getByText(/กรุณาเลือกอย่างน้อย 1 ร้าน/)).toBeVisible();
    expect(spy.calls.length).toBe(0);
  });

  test("opening the new-product dialog defaults both shops to checked", async ({ page }) => {
    const spy = { calls: [] as any[] };
    await installRestMocks(page, spy);
    await page.goto("/admin/products");
    await expect(page).not.toHaveURL(/\/login/);
    await page.getByRole("button", { name: /เพิ่มสินค้า/ }).first().click();
    for (const s of STORES) {
      const cb = page.getByRole("checkbox", { name: s.name }).first()
        .or(page.locator("label", { hasText: s.name }).getByRole("checkbox"));
      await expect(cb).toBeChecked();
    }
  });

  test("badges reflect product_shops mapping for single-shop products", async ({ page }) => {
    const spy = { calls: [] as any[] };
    await installRestMocks(page, spy);
    await page.goto("/admin/products");
    await expect(page).not.toHaveURL(/\/login/);
    const colorRow = page.locator("tr", { hasText: "ฟิล์มสไลด์ (เฉพาะคัลเลอร์แล็ป)" });
    await expect(colorRow).toBeVisible({ timeout: 15_000 });
    await expect(colorRow.getByText("นัฐภรณ์ คัลเลอร์แล็ป")).toBeVisible();
    await expect(colorRow.getByText("นัฐภรณ์ การพิมพ์")).toHaveCount(0);
    const printRow = page.locator("tr", { hasText: "หมึก CMYK (เฉพาะการพิมพ์)" });
    await expect(printRow.getByText("นัฐภรณ์ การพิมพ์")).toBeVisible();
    await expect(printRow.getByText("นัฐภรณ์ คัลเลอร์แล็ป")).toHaveCount(0);
  });
});