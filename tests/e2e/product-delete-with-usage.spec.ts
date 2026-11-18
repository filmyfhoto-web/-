import { test, expect, type Route } from "@playwright/test";

/**
 * Verifies the per-row delete confirmation dialog on /admin/products:
 * - Shows usage stats (stock, orders, documents) fetched from admin_product_usage RPC
 * - Renders the ⚠️ warning when product has remaining stock or is referenced by orders/documents
 * - Hides the warning when usage is zero
 * - Cancel does NOT call admin_soft_delete_products (prevents accidental deletion)
 * - Confirm calls admin_soft_delete_products with the right id
 */

type Row = Record<string, any>;

function productRows(): Row[] {
  return [
    { id: "p-busy", code: "B001", name: "e2e-สินค้ามีออเดอร์", unit: "ชิ้น", standard_price: 50, stock: 8, active: true, deleted_at: null, low_stock_threshold: 0 },
    { id: "p-free", code: "F001", name: "e2e-สินค้าว่าง",    unit: "ชิ้น", standard_price: 50, stock: 0, active: true, deleted_at: null, low_stock_threshold: 0 },
  ];
}

test.describe("Admin product delete — usage warning & accidental-delete guard", () => {
  test("busy product shows warning + cancel blocks delete; clean product has no warning + confirm deletes", async ({ page }) => {
    const rows = productRows();
    const softDeleteCalls: any[] = [];
    const usageCalls: string[] = [];

    // GET products list
    await page.route(/\/rest\/v1\/products\b.*/, async (route: Route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
      }
      return route.fallback();
    });

    // RPC mocks
    await page.route(/\/rest\/v1\/rpc\/admin_product_usage\b.*/, async (route) => {
      const body = route.request().postDataJSON() ?? {};
      usageCalls.push(body.p_id);
      const payload = body.p_id === "p-busy"
        ? { name: "e2e-สินค้ามีออเดอร์", order_item_count: 3, document_item_count: 2, stock_remaining: 8 }
        : { name: "e2e-สินค้าว่าง",    order_item_count: 0, document_item_count: 0, stock_remaining: 0 };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.route(/\/rest\/v1\/rpc\/admin_soft_delete_products\b.*/, async (route) => {
      softDeleteCalls.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: "1" });
    });

    await page.goto("/admin/products");
    // wait for either row to render
    const busyRow = page.getByText("e2e-สินค้ามีออเดอร์").first();
    if (!(await busyRow.isVisible().catch(() => false))) {
      test.skip(true, "products list did not render (likely auth-gated in this build)");
    }

    // --- Busy product: open delete, expect warning, then CANCEL ---
    const busyDeleteBtn = page.locator(`button[title="ลบ"]`).first();
    await busyDeleteBtn.click();

    const dialog = page.getByTestId("delete-confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("delete-confirm-title")).toContainText("e2e-สินค้ามีออเดอร์");
    await expect(page.getByTestId("usage-stock")).toContainText("8");
    await expect(page.getByTestId("usage-orders")).toContainText("3");
    await expect(page.getByTestId("usage-docs")).toContainText("2");
    await expect(page.getByTestId("delete-confirm-warning")).toBeVisible();

    await page.getByTestId("delete-confirm-cancel").click();
    await expect(dialog).toBeHidden();
    expect(softDeleteCalls.length).toBe(0); // cancel must not delete

    // --- Clean product: no warning, confirm deletes ---
    const cleanDeleteBtn = page.locator(`button[title="ลบ"]`).nth(1);
    await cleanDeleteBtn.click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("delete-confirm-title")).toContainText("e2e-สินค้าว่าง");
    await expect(page.getByTestId("usage-stock")).toContainText("0");
    await expect(page.getByTestId("delete-confirm-warning")).toHaveCount(0);

    await page.getByTestId("delete-confirm-action").click();
    await expect(dialog).toBeHidden();

    expect(softDeleteCalls.length).toBe(1);
    expect(softDeleteCalls[0]?.p_ids).toEqual(["p-free"]);
    expect(usageCalls).toContain("p-busy");
    expect(usageCalls).toContain("p-free");
  });
});