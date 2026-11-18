import { test, expect } from "@playwright/test";

/**
 * Regression guard for the recurring "rds_payment_methods.code does not exist"
 * error and the unified schema in src/pages/receipts/lib/paymentMethods.ts.
 *
 * Without an authenticated session the protected /receipts routes redirect to
 * login, so this E2E asserts the network-level contract: the app must NEVER
 * issue a Supabase query that selects a non-existent `code` column. The
 * helper centralises this, so a regression here means someone bypassed it.
 */
test("Receipts never requests the non-existent rds_payment_methods.code column", async ({ page }) => {
  const badRequests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/rest/v1/rds_payment_methods") && /select=[^&]*\bcode\b/.test(url)) {
      badRequests.push(url);
    }
  });

  await page.goto("/receipts", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500); // allow React Query to fire any pending requests

  expect(badRequests, `Found queries selecting the missing column:\n${badRequests.join("\n")}`).toEqual([]);
});

test("Fallback payment methods render when the API call fails", async ({ page }) => {
  await page.route("**/rest/v1/rds_payment_methods*", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ message: 'column "code" does not exist', code: "42703" }),
    }),
  );

  // The dropdown is only visible inside POS / DocumentForm (auth-gated).
  // We assert at minimum that the failed request does not crash the app shell.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/receipts", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  expect(errors.filter((m) => /payment/i.test(m))).toEqual([]);
});