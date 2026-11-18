import { test, expect } from "@playwright/test";
import { installStagingBackend, newState, seedStaffSession } from "./fixtures/stagingBackend";

// Edit these slugs to match your seeded stores
const STORE = process.env.E2E_STORE_SLUG ?? "colorlab";

// Every page below is staff-only, so each run needs a staff session and the
// in-memory staging backend (never production data).
test.beforeEach(async ({ page }) => {
  await installStagingBackend(page, newState(), { staff: true });
  await seedStaffSession(page);
});

test.describe("smoke: main pages load", () => {
  test("admin dashboard renders", async ({ page }) => {
    await page.goto("/admin/dashboard");
    // /admin/* now funnels staff into the unified Film Shop workspace.
    await expect(page).toHaveURL(/receipts\/film/);
    await expect(page.locator("body")).toContainText(/Film Shop/);
  });

  test("receipts dashboard renders", async ({ page }) => {
    await page.goto(`/receipts/${STORE}/dashboard`);
    await expect(page.locator("body")).toContainText(/Dashboard|ภาพรวม|ยอดขาย/);
  });

  test("POS renders product grid", async ({ page }) => {
    await page.goto(`/receipts/${STORE}/pos`);
    // Per-store POS is a redirect into the central POS workspace.
    await expect(page).toHaveURL(/\/pos/);
  });

  test("document form renders header fields", async ({ page }) => {
    await page.goto(`/receipts/${STORE}/documents/new`);
    await expect(page.getByText("ออกเอกสาร").first()).toBeVisible();
  });

  test("settings renders tabs", async ({ page }) => {
    await page.goto(`/receipts/${STORE}/settings`);
    await expect(page.locator("body")).toContainText(/ตั้งค่า/);
  });
});
