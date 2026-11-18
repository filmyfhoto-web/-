import { test, expect } from "@playwright/test";

const STORE = process.env.E2E_STORE_SLUG ?? "colorlab";

test("document form: edits survive a reload and restore silently", async ({ page }) => {
  await page.goto(`/receipts/${STORE}/documents/new`);
  // Wait for the form to be initialized (defaults + draft-load tick).
  await expect(page.getByText("ออกเอกสาร")).toBeVisible();
  await page.waitForTimeout(500);

  // Type a customer name + a unique product row so draftHasContent fires.
  const unique = `ทดสอบกู้คืน-${Date.now()}`;
  // First input with the "ค้นหา/ชื่อลูกค้า" label
  await page.getByLabel("ค้นหา/ชื่อลูกค้า").fill(unique);

  // Allow the 800ms debounce to flush.
  await page.waitForTimeout(1200);

  await page.reload();

  await expect(page.getByLabel("ค้นหา/ชื่อลูกค้า")).toHaveValue(unique, { timeout: 5000 });
  await expect(page.getByRole("button", { name: /กู้คืนร่าง|เริ่มใหม่/ })).toHaveCount(0);
});

test("POS: cart survives reload via auto-restore toast", async ({ page }) => {
  await page.goto(`/receipts/${STORE}/pos`);
  await expect(page.getByPlaceholder(/ค้นหาสินค้า/)).toBeVisible();

  // Add the first product card to the cart.
  const firstProduct = page.locator("button:has(.aspect-square)").first();
  await firstProduct.click();
  await expect(page.getByText(/ตะกร้า \(1\)/)).toBeVisible();

  await page.waitForTimeout(1200); // debounce flush
  await page.reload();

  // After reload, the cart should be restored (count === 1).
  await expect(page.getByText(/ตะกร้า \(1\)/)).toBeVisible({ timeout: 5000 });
});

test("Settings: store-info edits survive reload", async ({ page }) => {
  await page.goto(`/receipts/${STORE}/settings`);
  await page.getByRole("tab", { name: /ข้อมูลร้าน/ }).click();

  const footerLabel = page.getByLabel("ข้อความท้ายเอกสาร");
  await expect(footerLabel).toBeVisible();
  const sentinel = `auto-${Date.now()}`;
  await footerLabel.fill(sentinel);
  await page.waitForTimeout(1200);

  await page.reload();
  await page.getByRole("tab", { name: /ข้อมูลร้าน/ }).click();

  await expect(page.getByLabel("ข้อความท้ายเอกสาร")).toHaveValue(sentinel, { timeout: 5000 });
  await expect(page.getByText(/ยังไม่ได้บันทึก/)).toBeVisible();
});