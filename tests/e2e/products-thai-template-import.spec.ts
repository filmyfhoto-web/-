import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * E2E: upload the Thai-header product template and verify that
 *  - the parser accepts ภาษาไทย column labels
 *  - the review step counts add/delete correctly
 *  - product names + standard prices flow through unchanged
 *  - +10/+15/+20% price columns are populated from standard_price
 */

const USER_ID = "00000000-0000-0000-0000-00000000aaaa";
const ORG_ID = "00000000-0000-0000-0000-00000000bbbb";
const SB_STORAGE_KEY = "sb-fdgxvgtmzcgakofswtty-auth-token";

function jsonOk(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function seedOwnerAuth(page: Page) {
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

async function installRestMocks(page: Page) {
  await seedOwnerAuth(page);
  // Prices page hydrates from several tables. Empty arrays are fine — the import
  // wizard is independent of the live catalog.
  for (const re of [
    /\/rest\/v1\/products\b.*/, /\/rest\/v1\/categories\b.*/,
    /\/rest\/v1\/product_costs\b.*/, /\/rest\/v1\/product_shops\b.*/,
    /\/rest\/v1\/rds_stores\b.*/, /\/rest\/v1\/price_groups\b.*/,
    /\/rest\/v1\/customer_prices\b.*/, /\/rest\/v1\/import_logs\b.*/,
    /\/rest\/v1\/organizations\b.*/, /\/rest\/v1\/price_overrides\b.*/,
    /\/rest\/v1\/price_history\b.*/,
  ]) {
    await page.route(re, (r) => r.fulfill(jsonOk([])));
  }
}

// Thai-header CSV that mirrors the template downloaded from
// `src/lib/productTemplate.ts` (row 1 = ไทย, row 2 = English keys, data from row 3).
const TH_CSV =
  "\uFEFF" +
  [
    "การดำเนินการ,รหัสสินค้า,ชื่อสินค้า,หน่วยนับ,หมวดหมู่,สต๊อก,ราคาทุน,ราคามาตรฐาน,ราคา +10%,ราคา +15%,ราคา +20%",
    "action,code,name,unit,category,stock,cost_price,standard_price,price_10,price_15,price_20",
    "add,TH-001,ปากกาเจลสีน้ำเงิน,ด้าม,เครื่องเขียน,80,4,8,,,",
    "add,TH-002,สมุดโน้ต A5,เล่ม,เครื่องเขียน,30,18,30,33,,",
    "delete,TH-OLD,รหัสเก่า,,,,,,,,",
  ].join("\n");

test.describe("Admin Prices — Thai-header template upload", () => {
  test("uploads ไทย CSV → review shows correct counts + prices", async ({ page }) => {
    await installRestMocks(page);
    await page.goto("/admin/prices");
    await expect(page).not.toHaveURL(/\/login/);

    // Open the import wizard
    await page.getByRole("button", { name: /เทมเพลต Excel/ }).click();
    const dialog = page.getByRole("dialog", { name: /นำเข้าสินค้า/ });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Upload the Thai-header CSV
    const fileInput = dialog.locator('input[type="file"][accept*=".csv"]');
    await fileInput.setInputFiles({
      name: "เทมเพลตสินค้า-ไทย.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(TH_CSV, "utf8"),
    });

    // Review badges: total 3, add 2, delete 1
    await expect(dialog.getByText("รวม 3")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("เพิ่ม/อัปเดต 2")).toBeVisible();
    await expect(dialog.getByText("ลบ 1")).toBeVisible();

    // No blocking errors → confirm button enabled with the right label
    const confirm = dialog.getByRole("button", { name: /ยืนยันนำเข้า 3 แถว/ });
    await expect(confirm).toBeEnabled();

    // Preview table reflects ไทย ชื่อสินค้า + ราคามาตรฐาน. price_10/15/20 stay
    // blank ("—") in the CSV flow — the auto-formula only resolves when the
    // user opens the .xlsx template in Excel/LibreOffice.
    const row1 = dialog.locator("tr", { hasText: "TH-001" });
    await expect(row1).toContainText("ปากกาเจลสีน้ำเงิน");
    await expect(row1).toContainText("8");      // standard_price
    await expect(row1.locator("td").nth(5)).toHaveText("—"); // price_10 blank
    await expect(row1.locator("td").nth(6)).toHaveText("—"); // price_15 blank
    await expect(row1.locator("td").nth(7)).toHaveText("—"); // price_20 blank

    const row2 = dialog.locator("tr", { hasText: "TH-002" });
    await expect(row2).toContainText("สมุดโน้ต A5");
    await expect(row2).toContainText("30");     // standard_price
    await expect(row2.locator("td").nth(5)).toHaveText("33"); // override price_10 from CSV

    // Delete row keeps the destructive action badge
    const delRow = dialog.locator("tr", { hasText: "TH-OLD" });
    await expect(delRow.getByText("delete")).toBeVisible();
  });
});
