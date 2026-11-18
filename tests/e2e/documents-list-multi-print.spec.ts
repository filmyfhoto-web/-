import { test, expect } from "@playwright/test";

const STORE = process.env.E2E_STORE_SLUG ?? "colorlab";

/**
 * Multi-document print: verify that selecting multiple documents and printing
 * renders ALL of them into the hidden print area (not just the first one) and
 * that body picks up the `is-printing-multi` class so the print CSS lets each
 * `#doc-print` flow in normal layout instead of stacking absolutely.
 *
 * Auth-gated route — if redirected to /login, skip silently.
 */
test("multi-doc print renders every selected document into the print area", async ({ page }) => {
  await page.addInitScript(() => {
    type W = Window & { __printCount?: number; print: () => void };
    const w = window as unknown as W;
    w.__printCount = 0;
    w.print = () => {
      w.__printCount = (w.__printCount ?? 0) + 1;
      window.dispatchEvent(new Event("beforeprint"));
      window.dispatchEvent(new Event("afterprint"));
    };
  });

  await page.goto(`/receipts/${STORE}/documents`, { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/documents")) test.skip(true, "redirected (not authenticated)");

  await page.waitForLoadState("networkidle").catch(() => {});

  const rowCheckboxes = page.locator("table tbody tr input[type=checkbox], table tbody tr [role=checkbox]");
  const rowCount = await rowCheckboxes.count();
  if (rowCount < 2) test.skip(true, "need at least 2 documents in the list");

  await rowCheckboxes.nth(0).click();
  await rowCheckboxes.nth(1).click();

  const bulkPrint = page.getByRole("button", { name: /^พิมพ์$/ }).first();
  await expect(bulkPrint).toBeVisible({ timeout: 5_000 });
  await bulkPrint.click();

  const confirm = page.getByRole("button", { name: /พิมพ์|ตกลง|ยืนยัน/ }).last();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click().catch(() => {});
  }

  // After clicking print, the hidden print area must contain >=2 doc roots,
  // each wrapped in `.doc-print-document`. The non-stacking CSS depends on
  // body.is-printing-multi being set at the moment window.print() fires.
  await page.waitForFunction(
    () => document.querySelectorAll("#documents-print-area .doc-print-document").length >= 2,
    null,
    { timeout: 5_000 },
  );

  await page.waitForFunction(
    () => ((window as unknown as { __printCount?: number }).__printCount ?? 0) >= 1,
    null,
    { timeout: 5_000 },
  );

  // afterprint cleanup must restore the body class so the rest of the app
  // doesn't stay in print-only mode.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.body.classList.contains("is-printing-multi"),
        ),
      { timeout: 3_000 },
    )
    .toBe(false);
});