import { test, expect } from "@playwright/test";

// CSV with `A001` repeated twice (different name/price) — verifies dedupe UI + commit path.
const CSV = [
  "code,name,unit,price,stock",
  "A001,สินค้าเก่า,ชิ้น,10,5",
  "A001,สินค้าใหม่,ชิ้น,12,7",
  "B001,กล่อง,กล่อง,20,3",
  "B002,ขวด,ขวด,30,2",
  "B003,ถุง,ถุง,40,1",
].join("\n");

test.describe("Admin Prices — Google Sheet import with duplicate codes", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept the Google Sheets CSV fetch and serve our fixture.
    await page.route(/docs\.google\.com\/spreadsheets\/.*output=csv|export\?format=csv/, (route) =>
      route.fulfill({ status: 200, contentType: "text/csv", body: CSV }),
    );
  });

  async function openImport(page: import("@playwright/test").Page) {
    await page.goto("/admin/prices");
    // The "นำเข้าจาก Google Sheets" entry lives in the dropdown menu; open via keyboard fallback.
    const trigger = page.getByRole("button", { name: /Google Sheets|นำเข้า/ }).first();
    if (await trigger.isVisible().catch(() => false)) await trigger.click();
    // Some builds expose the dialog directly; otherwise click the menu item.
    const menuItem = page.getByRole("menuitem", { name: /Google Sheets/ });
    if (await menuItem.isVisible().catch(() => false)) await menuItem.click();

    await expect(page.getByRole("dialog", { name: /นำเข้าสินค้าจาก Google Sheets/ })).toBeVisible();
    await page.getByPlaceholder(/docs\.google\.com/).fill("https://docs.google.com/spreadsheets/d/FAKEID/edit");
    await page.getByRole("button", { name: "ดึงข้อมูล" }).click();
    await expect(page.getByTestId("dup-panel")).toBeVisible();
  }

  test("A) duplicate codes → upsert succeeds, preview consumed", async ({ page }) => {
    await page.route(/\/rest\/v1\/products\b.*/, (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      }
      return route.continue();
    });
    await openImport(page);
    await expect(page.getByText(/พบรหัสซ้ำ 1 รายการ/)).toBeVisible();
    await page.getByRole("button", { name: /^บันทึก / }).click();
    await expect(page.getByText(/นำเข้า 4 รายการ \(รวมรหัสซ้ำ 1 แถว/)).toBeVisible();
  });

  test("B) upsert fails → preview stays, retry button re-enables", async ({ page }) => {
    let calls = 0;
    await page.route(/\/rest\/v1\/products\b.*/, (route) => {
      if (route.request().method() === "POST") {
        calls++;
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "ON CONFLICT DO UPDATE command cannot affect row a second time" }),
        });
      }
      return route.continue();
    });
    await openImport(page);
    const save = page.getByRole("button", { name: /^บันทึก / });
    await save.click();
    await expect(page.getByText(/นำเข้าไม่สำเร็จ/)).toBeVisible();
    // Preview + dedupe panel remain so the user can fix and retry.
    await expect(page.getByTestId("dup-panel")).toBeVisible();
    await expect(save).toBeEnabled();
    expect(calls).toBeGreaterThan(0);
  });

  test("C) download deduped CSV contains 4 rows", async ({ page }) => {
    await openImport(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /ดาวน์โหลด CSV/ }).click(),
    ]);
    const path = await download.path();
    const fs = await import("node:fs/promises");
    const text = (await fs.readFile(path!, "utf8")).replace(/^\uFEFF/, "");
    const lines = text.trim().split(/\r?\n/);
    expect(lines[0]).toMatch(/code,name,unit,standard_price,stock/);
    expect(lines.length).toBe(5); // header + 4 deduped rows
    // The chosen A001 row should be the latest one (สินค้าใหม่ / 12).
    expect(lines.find(l => l.startsWith("A001"))).toMatch(/สินค้าใหม่.*12/);
  });
});