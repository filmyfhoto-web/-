import { test, expect, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";

/**
 * Regression: /shop CSV download must open in Excel / Google Sheets without
 * mojibake. That means:
 *   1. UTF-8 BOM (\uFEFF) — Excel needs this to detect Thai as UTF-8.
 *   2. Thai product names round-trip losslessly.
 *   3. Values containing commas or quotes are RFC-4180 quoted so columns
 *      don't split apart when a spreadsheet re-parses them.
 */

const TRICKY = [
  { id: "p1", code: "A001", name: 'กระดาษ A4 "พิเศษ"', unit: "รีม",  standard_price: 120, stock: 10, low_stock_threshold: 0, barcode: "8850001", category_id: null, image_url: null, active: true },
  { id: "p2", code: "A002", name: "หมึกพิมพ์, สีดำ",   unit: "ขวด", standard_price: 350, stock: 5,  low_stock_threshold: 0, barcode: "8850002", category_id: null, image_url: null, active: true },
];

const jsonOk = (b: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID  = "22222222-2222-2222-2222-222222222222";

async function seed(page: Page) {
  await page.route("**/auth/v1/user**", (r: Route) => r.fulfill(jsonOk({ id: USER_ID, email: "t@example.com" })));
  await page.route("**/rest/v1/profiles**", (r: Route) => r.fulfill(jsonOk({
    id: USER_ID, full_name: "T", email: "t@example.com", phone: "",
    organization_id: ORG_ID,
    accepted_terms_version: "2026-06-29", accepted_privacy_version: "2026-06-29",
    accepted_terms_at: "2026-06-29T00:00:00Z", accepted_privacy_at: "2026-06-29T00:00:00Z",
    organizations: { id: ORG_ID, name: "Test Org", approved: true },
    cost_visible: false,
  })));
  await page.route("**/rest/v1/user_roles**", (r: Route) => r.fulfill(jsonOk([{ role: "customer" }])));
  await page.route("**/rest/v1/orders**", (r: Route) => r.fulfill(jsonOk([])));
  await page.route("**/rest/v1/product_costs**", (r: Route) => r.fulfill(jsonOk([])));
  await page.route("**/rest/v1/group_prices**", (r: Route) => r.fulfill(jsonOk([])));
  await page.route("**/rest/v1/customer_prices**", (r: Route) => r.fulfill(jsonOk([])));
  await page.addInitScript((uid) => {
    const session = { access_token: "fake", refresh_token: "fake", expires_at: Math.floor(Date.now()/1000)+3600, token_type: "bearer", user: { id: uid, email: "t@example.com" } };
    try { localStorage.setItem("sb-fdgxvgtmzcgakofswtty-auth-token", JSON.stringify(session)); } catch {}
  }, USER_ID);
  await page.route(/\/rest\/v1\/products_public\b.*/, (r: Route) => r.fulfill(jsonOk(TRICKY)));
  await page.route(/\/rest\/v1\/categories\b.*/,      (r: Route) => r.fulfill(jsonOk([])));
  await page.route(/\/rest\/v1\/rpc\/get_public_settings\b.*/, (r: Route) =>
    r.fulfill(jsonOk([{ store_name: "ร้านนัฐภรณ์", phone: "0000000000" }])));
}

test("CSV export is UTF-8 BOM'd, RFC-4180 escaped, and re-parses to the original Thai rows", async ({ page }) => {
  await seed(page);
  await page.goto("/shop");
  await expect(page.getByText('กระดาษ A4 "พิเศษ"')).toBeVisible();

  await page.getByRole("button", { name: /ดาวน์โหลด/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /CSV/ }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const buf = await readFile(path!);

  // (1) BOM present — Excel needs it to auto-detect UTF-8
  expect(buf[0]).toBe(0xEF);
  expect(buf[1]).toBe(0xBB);
  expect(buf[2]).toBe(0xBF);

  // (2) Round-trip parse with XLSX (same engine Google Sheets / LibreOffice use)
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const wb = XLSX.read(text, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });

  const names = rows.map((r) => Object.values(r).join(" "));
  expect(names.join(" | ")).toContain('กระดาษ A4 "พิเศษ"');
  expect(names.join(" | ")).toContain("หมึกพิมพ์, สีดำ");

  // (3) The literal comma inside "หมึกพิมพ์, สีดำ" must be quoted, otherwise
  // Sheets would split it into an extra column. Count fields on that row.
  const inkLine = text.split(/\r?\n/).find((l) => l.includes("หมึกพิมพ์")) ?? "";
  expect(inkLine).toMatch(/"หมึกพิมพ์, สีดำ"/);
});