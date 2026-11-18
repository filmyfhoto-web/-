import { test, expect, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

/**
 * /shop — the PDF download MUST embed the brand watermark
 * "Nattapron Color Lab & Printing" and a download timestamp on every
 * generated file, even when the user re-downloads or refreshes the page.
 *
 * jsPDF writes literal strings into the content stream uncompressed (it
 * does not enable FlateDecode by default), so a raw byte scan of the PDF
 * is a reliable assertion target.
 */

const PRODUCTS = [
  { id: "p1", code: "A001", name: "กระดาษ A4",  unit: "รีม", standard_price: 120, stock: 10, low_stock_threshold: 0, barcode: "8850001", category_id: null, image_url: null, active: true },
  { id: "p2", code: "A002", name: "หมึกพิมพ์",   unit: "ขวด", standard_price: 350, stock: 5,  low_stock_threshold: 0, barcode: "8850002", category_id: null, image_url: null, active: true },
];

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID  = "22222222-2222-2222-2222-222222222222";
const SB_KEY  = "sb-fdgxvgtmzcgakofswtty-auth-token";

const jsonOk = (body: unknown) =>
  ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function seedAuth(page: Page) {
  await page.route("**/auth/v1/user**", (r: Route) =>
    r.fulfill(jsonOk({ id: USER_ID, email: "t@example.com" })));
  await page.route(/\/rest\/v1\/profiles\b.*/, (r: Route) =>
    r.fulfill(jsonOk({
      id: USER_ID, full_name: "T", email: "t@example.com", phone: "",
      organization_id: ORG_ID,
      accepted_terms_version: "2026-06-29", accepted_privacy_version: "2026-06-29",
      accepted_terms_at: "2026-06-29T00:00:00Z", accepted_privacy_at: "2026-06-29T00:00:00Z",
      organizations: { id: ORG_ID, name: "Test Org", approved: true },
      cost_visible: false,
    })));
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
    r.fulfill(jsonOk([{ store_name: "ร้านนัฐภรณ์", phone: "0000000000" }])));
});

async function downloadPdf(page: Page): Promise<Buffer> {
  await page.getByRole("button", { name: /ดาวน์โหลด/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /PDF/i }).click(),
  ]);
  const fsPath = await download.path();
  if (!fsPath) throw new Error("download.path() was null");
  return readFile(fsPath);
}

function assertPdfHasBranding(buf: Buffer) {
  // PDF magic bytes
  expect(buf.slice(0, 4).toString("binary")).toBe("%PDF");
  const haystack = buf.toString("latin1");
  // Brand watermark + footer + metadata MUST all be present
  expect(haystack.includes("Nattapron Color Lab & Printing")).toBe(true);
  // Download timestamp marker
  expect(/Downloaded:\s/.test(haystack)).toBe(true);
  // ISO date YYYY-MM-DD on download line confirms a fresh stamp each run
  expect(/Downloaded:\s+\d{4}-\d{2}-\d{2}T/.test(haystack)).toBe(true);
}

test("PDF download embeds brand watermark + timestamp", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();
  const buf = await downloadPdf(page);
  assertPdfHasBranding(buf);
});

test("Repeated PDF download keeps watermark + fresh timestamp", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();

  const first = await downloadPdf(page);
  assertPdfHasBranding(first);

  // Pause so the second download MUST carry a different timestamp marker
  await page.waitForTimeout(1100);
  const second = await downloadPdf(page);
  assertPdfHasBranding(second);

  const firstStamp  = first.toString("latin1").match(/Downloaded:\s+([^)]+)\)/)?.[1];
  const secondStamp = second.toString("latin1").match(/Downloaded:\s+([^)]+)\)/)?.[1];
  expect(firstStamp).toBeTruthy();
  expect(secondStamp).toBeTruthy();
  expect(secondStamp).not.toBe(firstStamp);
});

test("PDF watermark survives a full page refresh", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("กระดาษ A4")).toBeVisible();
  await downloadPdf(page);

  await page.reload();
  await expect(page.getByText("กระดาษ A4")).toBeVisible();
  const buf = await downloadPdf(page);
  assertPdfHasBranding(buf);
});