import { test, expect } from "@playwright/test";

/**
 * Smoke coverage for the DN-issue gate. The full save/block flow is
 * authenticated and lives behind a Supabase session, so we keep this spec
 * to runtime-stability checks: the new-doc form must load with no
 * pageerror at every viewport, and the create-delivery deep link must not
 * crash the bundle. The pure decision logic is exercised in
 * `src/pages/receipts/documents/__tests__/deliveryGuard.test.ts`.
 */
test.describe("delivery requires printed quotation", () => {
  test("new-delivery deep link compiles and renders without runtime errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/receipts/printing/documents/new?type=delivery");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    expect(errors, "no runtime errors on /documents/new?type=delivery").toEqual([]);
  });

  test("documents list page does not throw when filtering by delivery", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/receipts/printing/documents?type=delivery");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    expect(errors, "documents list survives ?type=delivery").toEqual([]);
  });
});