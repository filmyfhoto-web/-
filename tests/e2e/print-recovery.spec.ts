import { test, expect } from "@playwright/test";

const STORE = process.env.E2E_STORE_SLUG ?? "colorlab";

test("print failure shows recovery banner and keeps form data", async ({ page }) => {
  // Force window.print to throw so we exercise the recovery flow without a real printer.
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).print = () => {
      throw new Error("simulated printer failure");
    };
  });

  await page.goto(`/receipts/${STORE}/documents/new`);
  await expect(page.getByText("ออกเอกสาร")).toBeVisible();

  const sentinel = `print-recovery-${Date.now()}`;
  await page.getByLabel("ค้นหา/ชื่อลูกค้า").fill(sentinel);

  // Fill 1 row so save passes validation
  const firstNameCell = page.locator("table tbody tr").first().locator("input").first();
  await firstNameCell.fill("สินค้าทดสอบ");
  const firstPriceCell = page.locator("table tbody tr").first().locator("input[type=number]").first();
  await firstPriceCell.fill("10");

  await page.getByRole("button", { name: /บันทึก\+พิมพ์/ }).click();

  // Recovery banner must appear, and the form data must still be there.
  await expect(page.getByText(/พิมพ์ไม่สำเร็จ/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /ลองพิมพ์อีกครั้ง/ })).toBeVisible();
  await expect(page.getByLabel("ค้นหา/ชื่อลูกค้า")).toHaveValue(sentinel);
});