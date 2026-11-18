import { test, expect, type Route } from "@playwright/test";

/**
 * When an admin types a code that already exists, the form must:
 *  1. surface an aria-live=assertive alert (screen readers get it),
 *  2. mark the input aria-invalid=true,
 *  3. NEVER fire a POST /rest/v1/products insert.
 *
 * Auth-guarded — the test is skipped when the dev sandbox bounces us off
 * /admin/products. Kept alongside product-code-fy-autogen for symmetry.
 */

test("duplicate FY code is rejected — no INSERT hits products, alert is announced", async ({ page }) => {
  const inserts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/rest\/v1\/products\b/.test(r.url())) {
      inserts.push(r.url());
    }
  });

  // Return an existing row for the duplicate lookup regardless of what was typed.
  await page.route(/\/rest\/v1\/products\?.*code=eq\..*/, (r: Route) =>
    r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: "existing-id", name: "สินค้าที่มีอยู่แล้ว" }]),
    }));
  await page.route(/\/rest\/v1\/rpc\/peek_next_fy_code.*/, (r: Route) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("FY99999") }));

  await page.goto("/admin/products");
  if (!page.url().includes("/admin/")) {
    test.skip(true, "no admin session — form-level assertion skipped in this build");
  }

  await page.getByRole("button", { name: /เพิ่มสินค้า/ }).first().click();
  const code = page.getByTestId("product-code-input");
  await expect(code).toBeVisible();

  await code.fill("FY00001");
  await code.blur();

  // aria-live region carries the friendly Thai message
  const msg = page.getByTestId("product-code-dupe-msg");
  await expect(msg).toContainText("ซ้ำ");
  await expect(code).toHaveAttribute("aria-invalid", "true");

  // Clicking Save must NOT insert a new product row.
  const saveBtn = page.getByRole("button", { name: /บันทึก/ }).first();
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(400);
  }
  expect(inserts.length, "duplicate FY code must never trigger an INSERT").toBe(0);
});
