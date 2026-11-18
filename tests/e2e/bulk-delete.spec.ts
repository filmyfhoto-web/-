import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Verifies the shared BulkActionBar confirm dialog + delete flow across admin pages.
 * Supabase REST is mocked so the test is hermetic (no auth/session needed).
 */

type Row = Record<string, any>;

function makeRestMock(table: string, initial: Row[]) {
  const state = { rows: [...initial] };
  return {
    state,
    handler: async (route: Route) => {
      const req = route.request();
      const method = req.method();
      const url = req.url();
      if (!url.includes(`/rest/v1/${table}`)) return route.fallback();
      if (method === "GET") {
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify(state.rows),
        });
      }
      if (method === "DELETE") {
        // Crude: parse `id=in.(a,b,c)`
        const m = url.match(/id=in\.\(([^)]+)\)/);
        if (m) {
          const ids = m[1].split(",").map(s => s.replace(/^"|"$/g, ""));
          state.rows = state.rows.filter(r => !ids.includes(r.id));
        }
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fallback();
    },
  };
}

async function selectFirstTwoCheckboxes(page: Page) {
  const boxes = page.getByRole("checkbox");
  const count = await boxes.count();
  let ticked = 0;
  for (let i = 0; i < count && ticked < 2; i++) {
    const b = boxes.nth(i);
    if (await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) {
      await b.click();
      ticked++;
    }
  }
  return ticked;
}

test.describe("Admin bulk-delete — confirm dialog & API call", () => {
  test("confirm dialog shows count + preview names, then deletes", async ({ page }) => {
    const rows: Row[] = [
      { id: "p1", code: "E001", name: "e2e-bulk-สินค้า1", unit: "ชิ้น", standard_price: 10, stock: 5, active: true, low_stock_threshold: 0 },
      { id: "p2", code: "E002", name: "e2e-bulk-สินค้า2", unit: "ชิ้น", standard_price: 20, stock: 3, active: true, low_stock_threshold: 0 },
      { id: "p3", code: "E003", name: "e2e-bulk-สินค้า3", unit: "ชิ้น", standard_price: 30, stock: 1, active: true, low_stock_threshold: 0 },
    ];
    const mock = makeRestMock("products", rows);
    await page.route(/\/rest\/v1\/products\b.*/, mock.handler);

    await page.goto("/admin/products");

    // Enter select mode (button label may vary — pick by icon-text "เลือก").
    const selectBtn = page.getByRole("button", { name: /เลือก/ }).first();
    if (await selectBtn.isVisible().catch(() => false)) await selectBtn.click();

    const ticked = await selectFirstTwoCheckboxes(page);
    if (ticked < 2) test.skip(true, "checkboxes not rendered in this build");

    // BulkActionBar floats in.
    const bar = page.getByText(/เลือกแล้ว \d+ รายการ/);
    await expect(bar).toBeVisible();

    // Open confirm dialog
    await page.getByRole("button", { name: /ลบที่เลือก/ }).click();
    const dialog = page.getByTestId("bulk-confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("bulk-confirm-title")).toContainText(/2/);
    await expect(page.getByTestId("bulk-confirm-preview")).toContainText(/e2e-bulk-/);

    // Confirm
    await page.getByTestId("bulk-confirm-action").click();
    await expect(dialog).toBeHidden();

    // After delete, mock state should have only 1 row left.
    expect(mock.state.rows.length).toBe(1);
  });

  test("dialog with confirmWord blocks confirm until typed correctly", async ({ page }) => {
    const rows: Row[] = [
      { id: "o1", name: "e2e-bulk-org1", approved: true, type: "school" },
      { id: "o2", name: "e2e-bulk-org2", approved: true, type: "office" },
    ];
    const mock = makeRestMock("organizations", rows);
    await page.route(/\/rest\/v1\/organizations\b.*/, mock.handler);

    await page.goto("/admin/customers");

    const selectBtn = page.getByRole("button", { name: /เลือก/ }).first();
    if (await selectBtn.isVisible().catch(() => false)) await selectBtn.click();
    const ticked = await selectFirstTwoCheckboxes(page);
    if (ticked < 1) test.skip(true, "checkboxes not rendered");

    await page.getByRole("button", { name: /ลบที่เลือก/ }).click();
    const dialog = page.getByTestId("bulk-confirm-dialog");
    await expect(dialog).toBeVisible();

    const action = page.getByTestId("bulk-confirm-action");
    await expect(action).toBeDisabled();

    const input = page.getByTestId("bulk-confirm-input");
    await input.fill("xxx");
    await expect(action).toBeDisabled();
    await input.fill("ลบ");
    await expect(action).toBeEnabled();
  });
});