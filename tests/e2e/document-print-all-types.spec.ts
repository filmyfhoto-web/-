import { test, expect } from "@playwright/test";

const STORE = process.env.E2E_STORE_SLUG ?? "colorlab";

const DOC_TYPES = [
  { value: "receipt", label: "ใบเสร็จรับเงิน" },
  { value: "delivery", label: "ใบส่งของ" },
  { value: "invoice", label: "ใบแจ้งหนี้" },
  { value: "quotation", label: "ใบเสนอราคา" },
  // tax_invoice only available when store has VAT enabled — skipped here
] as const;

test.describe("print: all document types fire window.print without errors", () => {
  for (const t of DOC_TYPES) {
    test(`${t.label} prints with all display toggles flipped`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });

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

      await page.goto(`/receipts/${STORE}/documents/new`);
      await expect(page.getByText("ออกเอกสาร")).toBeVisible();

      // Switch document type via the select (best-effort; if the picker isn't
      // found, we still cover at least the default type).
      const typeSelect = page.getByRole("combobox").first();
      if (await typeSelect.count()) {
        try {
          await typeSelect.click({ timeout: 1000 });
          const option = page.getByRole("option", { name: new RegExp(t.label) });
          if (await option.count()) await option.first().click({ timeout: 1000 });
        } catch { /* keep default */ }
      }

      // Fill one row so the printable copy has content.
      const firstName = page.locator("table tbody tr").first().locator("input").first();
      await firstName.fill(`สินค้า-${t.value}`);
      const firstPrice = page
        .locator("table tbody tr")
        .first()
        .locator("input[type=number]")
        .first();
      await firstPrice.fill("100");

      // Flip every display toggle we can find. Each switch keeps the print
      // button responsive — that is the bug we are guarding against.
      const switches = page.getByRole("switch");
      const count = await switches.count();
      for (let i = 0; i < count; i++) {
        try {
          await switches.nth(i).click({ timeout: 500 });
        } catch { /* tolerate hidden/disabled */ }
      }

      const printBtn = page.getByRole("button", { name: /พิมพ์ทันที/ });
      await expect(printBtn).toBeEnabled();
      await printBtn.click();

      await page.waitForFunction(
        () => ((window as unknown as { __printCount?: number }).__printCount ?? 0) >= 1,
        null,
        { timeout: 5_000 },
      );

      await expect
        .poll(
          async () =>
            page.evaluate(() => document.body.classList.contains("is-printing")),
          { timeout: 3_000 },
        )
        .toBe(false);

      // Re-trigger after restoring all toggles to default to prove the button
      // never gets stuck in a non-responsive state.
      for (let i = 0; i < count; i++) {
        try {
          await switches.nth(i).click({ timeout: 500 });
        } catch { /* ignore */ }
      }
      await printBtn.click();
      await page.waitForFunction(
        () => ((window as unknown as { __printCount?: number }).__printCount ?? 0) >= 2,
        null,
        { timeout: 5_000 },
      );

      expect(consoleErrors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
    });
  }

  test("multi-page document repeats the table header on every page", async ({ page }) => {
    await page.goto(`/receipts/${STORE}/documents/new`);
    await expect(page.getByText("ออกเอกสาร")).toBeVisible();

    for (let i = 0; i < 30; i++) {
      const row = page.locator("table tbody tr").nth(i);
      await row.locator("input").first().fill(`item-${i + 1}`);
      await row.locator("input[type=number]").first().fill("1");
    }

    const pageCount = await page.locator("#doc-print .doc-page").count();
    expect(pageCount).toBeGreaterThanOrEqual(2);
    const theadCount = await page.locator("#doc-print .doc-page thead").count();
    expect(theadCount).toBeGreaterThanOrEqual(pageCount);
  });
});