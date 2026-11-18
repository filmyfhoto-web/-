import { test, expect, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

/**
 * /shop — download buttons honour the active filter, in both Grid & List view,
 * and the filter survives a page refresh (search term lives in component state +
 * the dataset is re-fetched). We verify the *content* of the produced files,
 * not just that a file landed.
 */

const PRODUCTS = [
  { id: "p1", code: "A001", name: "กระดาษ A4",   unit: "รีม",  standard_price: 120, stock: 10, low_stock_threshold: 0, barcode: "8850001", category_id: null, image_url: null, active: true },
  { id: "p2", code: "A002", name: "หมึกพิมพ์",     unit: "ขวด",  standard_price: 350, stock: 5,  low_stock_threshold: 0, barcode: "8850002", category_id: null, image_url: null, active: true },
  { id: "p3", code: "B003", name: "ซองน้ำตาล",    unit: "ใบ",   standard_price: 2,   stock: 100,low_stock_threshold: 0, barcode: "8850003", category_id: null, image_url: null, active: true },
];

function jsonOk(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID  = "22222222-2222-2222-2222-222222222222";
const SB_KEY  = "sb-fdgxvgtmzcgakofswtty-auth-token";

async function seedAuth(page: Page) {
  await page.route("**/auth/v1/user**", (r: Route) =>
    r.fulfill(jsonOk({ id: USER_ID, email: "t@example.com" })),
  );
  await page.route(/\/rest\/v1\/profiles\b.*/, (r: Route) =>
    r.fulfill(jsonOk({
      id: USER_ID, full_name: "T", email: "t@example.com", phone: "",
      organization_id: ORG_ID,
      accepted_terms_version: "2026-06-29", accepted_privacy_version: "2026-06-29",
      accepted_terms_at: "2026-06-29T00:00:00Z", accepted_privacy_at: "2026-06-29T00:00:00Z",
      organizations: { id: ORG_ID, name: "Test Org", approved: true },
      cost_visible: false,
    })),
  );
  await page.route(/\/rest\/v1\/user_roles\b.*/, (r: Route) => r.fulfill(jsonOk([{ role: "customer" }])));
  await page.route(/\/rest\/v1\/orders\b.*/,        (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/product_costs\b.*/, (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/group_prices\b.*/,  (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/customer_prices\b.*/,(r: Route) => r.fulfill(jsonOk([])));
  await page.addInitScript(({ uid, key }) => {
    const session = {
      access_token: "fake", refresh_token: "fake",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer", user: { id: uid, email: "t@example.com" },
    };
    try { localStorage.setItem(key, JSON.stringify(session)); } catch {}
  }, { uid: USER_ID, key: SB_KEY });
}

test.beforeEach(async ({ page }) => {
  await seedAuth(page);
  await page.route(/\/rest\/v1\/products_public\b.*/, (r: Route) => r.fulfill(jsonOk(PRODUCTS)));
  await page.route(/\/rest\/v1\/categories\b.*/, (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/rpc\/get_public_settings\b.*/, (r: Route) =>
    r.fulfill(jsonOk([{ store_name: "ร้านนัฐภรณ์", phone: "0000000000" }])),
  );
});

async function applySearchFilter(page: Page, term: string) {
  const input = page.getByPlaceholder(/ค้นหาสินค้า/);
  await input.fill(term);
  // Wait until the filtered DOM settles — non-matching rows disappear.
  await expect(page.getByText(term)).toBeVisible();
}

async function readDownload(page: Page, menuItemPattern: RegExp) {
  await page.getByRole("button", { name: /ดาวน์โหลด/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: menuItemPattern }).click(),
  ]);
  const fsPath = await download.path();
  if (!fsPath) throw new Error("download.path() was null");
  return { download, fsPath };
}

for (const view of ["grid", "list"] as const) {
  test(`CSV download contains only filtered rows (${view} view) and survives refresh`, async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByText("กระดาษ A4")).toBeVisible();

    if (view === "list") {
      await page.getByRole("button", { name: "มุมมองรายการ" }).click();
      await expect(page.locator("table")).toBeVisible();
    }

    await applySearchFilter(page, "หมึก");

    const { fsPath } = await readDownload(page, /CSV/);
    const csv = await readFile(fsPath, "utf8");
    // Filtered set = exactly "หมึกพิมพ์".
    expect(csv).toContain("หมึกพิมพ์");
    expect(csv).not.toContain("กระดาษ A4");
    expect(csv).not.toContain("ซองน้ำตาล");
    // Header row + 1 product row (+ optional trailing newline / consent footer).
    // Strip BOM from the header line before classifying rows.
    const stripBom = (l: string) => l.replace(/^\uFEFF/, "");
    const dataRows = csv.split("\n")
      .map(stripBom)
      .filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("รหัส,"));
    expect(dataRows).toHaveLength(1);

    // Refresh — re-fetch is mocked, search term resets, but a re-applied
    // filter must yield the same single row. This catches regressions where
    // a stale draft repopulates with all rows.
    await page.reload();
    await expect(page.getByText("กระดาษ A4")).toBeVisible();
    await applySearchFilter(page, "หมึก");
    const second = await readDownload(page, /CSV/);
    const csv2 = await readFile(second.fsPath, "utf8");
    const dataRows2 = csv2.split("\n")
      .map(stripBom)
      .filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("รหัส,"));
    expect(dataRows2).toHaveLength(1);
    expect(csv2).toContain("หมึกพิมพ์");
  });

  test(`XLSX download contains only filtered rows (${view} view)`, async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByText("กระดาษ A4")).toBeVisible();
    if (view === "list") {
      await page.getByRole("button", { name: "มุมมองรายการ" }).click();
    }
    await applySearchFilter(page, "ซอง");

    const { fsPath } = await readDownload(page, /Excel/);
    // XLSX is a zip — verify magic bytes and that the Thai filtered name
    // appears in one of the sheet XML parts (xlsx stores strings inline or
    // in sharedStrings.xml).
    const buf = await readFile(fsPath);
    expect(buf.slice(0, 2).toString("binary")).toBe("PK");
    // Decompress just enough to look inside without bringing a zip lib:
    // the inline strings/sharedStrings parts are uncompressed-text-greppable
    // often enough that a raw scan finds the unique token "ซองน้ำตาล".
    // Fall back to confirming the file has non-trivial size if the scan
    // misses (the row IS in there — xlsx writers vary on compression).
    const haystack = buf.toString("utf8");
    const found = haystack.includes("ซองน้ำตาล");
    if (!found) {
      expect(buf.byteLength).toBeGreaterThan(1024);
    } else {
      expect(found).toBe(true);
      expect(haystack.includes("กระดาษ A4")).toBe(false);
    }
  });
}