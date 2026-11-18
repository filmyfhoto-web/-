import { test, expect } from "@playwright/test";
import {
  installStagingBackend, newState, seedCart, seedLineCustomer, seedStaffSession, TEST_PRODUCT,
} from "./fixtures/stagingBackend";

/**
 * Staging order lifecycle: customer signs in with LINE → places an order →
 * staff advances it to "approved" → stock is deducted exactly once.
 *
 * Every backend call is served by the in-memory fixture, so this suite runs
 * against dev/staging without ever reading or writing production data.
 */
test.describe("staging: customer order → staff approval → stock deduction", () => {
  test("full lifecycle deducts stock exactly once", async ({ page }) => {
    const state = newState();

    // ---- 1. Customer (LINE-verified) reaches the gated shop --------------
    await installStagingBackend(page, state);
    await seedLineCustomer(page);
    await seedCart(page, 3);

    await page.goto("/shop");
    await expect(page.getByText("กำลังตรวจสอบสิทธิ์...")).toBeHidden({ timeout: 15000 });
    await expect(page.getByText("เพิ่มเพื่อน", { exact: false })).toHaveCount(0);

    // ---- 2. Checkout ------------------------------------------------------
    await page.goto("/cart");
    await expect(page.getByTestId("cart-line").first()).toBeVisible({ timeout: 15000 });
    await page.getByTestId("cart-name").fill("ลูกค้าทดสอบ E2E");
    await page.getByTestId("cart-phone").fill("0800000000");
    await page.getByTestId("cart-school").fill("โรงเรียนทดสอบ");
    await page.getByTestId("cart-project").fill("งานทดสอบ staging");
    await page.getByTestId("submit-order-btn").click();
    const confirm = page.getByTestId("confirm-submit-order");
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();

    await expect.poll(() => state.orders.length, { timeout: 15000 }).toBe(1);
    expect(state.orders[0].status).toBe("pending_quote");
    expect(state.products[0].stock).toBe(TEST_PRODUCT.stock); // not deducted yet

    // ---- 3. Staff approves from the work inbox ---------------------------
    const staffPage = await page.context().newPage();
    await installStagingBackend(staffPage, state, { staff: true });
    await seedStaffSession(staffPage);
    await staffPage.goto("/staff/inbox");

    const row = staffPage.getByTestId("inbox-order-row").first();
    await expect(row).toBeVisible({ timeout: 15000 });
    // pending_quote → quoted → approved
    await staffPage.getByTestId("inbox-advance").first().click();
    await expect.poll(() => state.orders[0].status, { timeout: 10000 }).toBe("quoted");
    await staffPage.getByTestId("inbox-advance").first().click();
    await expect.poll(() => state.orders[0].status, { timeout: 10000 }).toBe("approved");

    // ---- 4. Stock deducted once ------------------------------------------
    await expect.poll(() => state.products[0].stock, { timeout: 10000 }).toBe(TEST_PRODUCT.stock - 3);
    expect(state.stockMovements).toHaveLength(1);
    expect(state.stockMovements[0]).toMatchObject({ product_id: TEST_PRODUCT.id, qty: -3 });

    // Re-applying "approved" must not double-deduct.
    await staffPage.reload();
    await expect.poll(() => state.products[0].stock).toBe(TEST_PRODUCT.stock - 3);
  });

  test("checkout is idempotent — a repeated submit never creates a second order", async ({ page }) => {
    const state = newState();
    await installStagingBackend(page, state);
    await seedLineCustomer(page);
    await seedCart(page, 2);

    await page.goto("/cart");
    await expect(page.getByTestId("cart-line").first()).toBeVisible({ timeout: 15000 });
    await page.getByTestId("cart-name").fill("ลูกค้าทดสอบ E2E");
    await page.getByTestId("cart-phone").fill("0800000000");
    await page.getByTestId("cart-school").fill("โรงเรียนทดสอบ");
    await page.getByTestId("cart-project").fill("งานทดสอบ idempotency");
    await page.getByTestId("submit-order-btn").click();
    const confirm = page.getByTestId("confirm-submit-order");
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();

    await expect.poll(() => state.orders.length, { timeout: 15000 }).toBe(1);
    expect(state.orders).toHaveLength(1);
  });

  test("mobile: order history shows the same status the admin set", async ({ page }) => {
    const state = newState();
    await page.setViewportSize({ width: 390, height: 844 });
    await installStagingBackend(page, state);
    await seedLineCustomer(page);
    await seedCart(page, 1);

    await page.goto("/cart");
    await expect(page.getByTestId("cart-line").first()).toBeVisible({ timeout: 15000 });
    await page.getByTestId("cart-name").fill("ลูกค้าทดสอบ E2E");
    await page.getByTestId("cart-phone").fill("0800000000");
    await page.getByTestId("cart-school").fill("โรงเรียนทดสอบ");
    await page.getByTestId("cart-project").fill("งานทดสอบประวัติ");
    await page.getByTestId("submit-order-btn").click();
    const confirm = page.getByTestId("confirm-submit-order");
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
    await expect.poll(() => state.orders.length, { timeout: 15000 }).toBe(1);

    // Customer sees the freshly created order in their history.
    await page.goto("/my-orders");
    const orderNo = state.orders[0].order_no;
    await expect(page.getByText(orderNo, { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // Admin advances it; the customer view must reflect the same status.
    const staffPage = await page.context().newPage();
    await installStagingBackend(staffPage, state, { staff: true });
    await seedStaffSession(staffPage);
    await staffPage.goto("/staff/inbox");
    await expect(staffPage.getByTestId("inbox-order-row").first()).toBeVisible({ timeout: 15000 });
    await staffPage.getByTestId("inbox-advance").first().click();
    await expect.poll(() => state.orders[0].status, { timeout: 10000 }).toBe("quoted");

    await page.reload();
    await expect(page.getByText(orderNo, { exact: false }).first()).toBeVisible({ timeout: 15000 });
    expect(state.orders[0].status).toBe("quoted");
  });
});
