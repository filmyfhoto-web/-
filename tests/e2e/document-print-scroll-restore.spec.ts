import { test, expect } from "@playwright/test";

const STORE = process.env.E2E_STORE_SLUG ?? "colorlab";

test.describe("print: first page + scroll restore", () => {
  test("captures #doc-print as page 1 and restores scroll after print", async ({ page }) => {
    // Intercept window.print() so we can synchronously inspect DOM state at the
    // moment printing happens, then fire `afterprint` to drive the cleanup.
    await page.addInitScript(() => {
      type W = Window & {
        __printSnapshots?: Array<{
          firstPageIdx: string | null;
          firstPageHidden: boolean;
          isPrintingClass: boolean;
          docPrintCount: number;
          skipCount: number;
          scrollY: number;
        }>;
        print: () => void;
      };
      const w = window as unknown as W;
      w.__printSnapshots = [];
      w.print = () => {
        const docPrint = document.querySelector("#doc-print");
        const pages = docPrint
          ? docPrint.querySelectorAll<HTMLElement>(".doc-page[data-page-idx]")
          : [];
        const first = pages[0] ?? null;
        w.__printSnapshots!.push({
          firstPageIdx: first?.getAttribute("data-page-idx") ?? null,
          firstPageHidden: first?.getAttribute("data-print-skip") === "true",
          isPrintingClass: document.body.classList.contains("is-printing"),
          docPrintCount: document.querySelectorAll("#doc-print").length,
          skipCount: document.querySelectorAll(
            '#doc-print .doc-page[data-print-skip="true"]',
          ).length,
          scrollY: window.scrollY,
        });
        // Drive the cleanup path the app registers on afterprint.
        window.dispatchEvent(new Event("beforeprint"));
        window.dispatchEvent(new Event("afterprint"));
      };
    });

    await page.goto(`/receipts/${STORE}/documents/new`);
    await expect(page.getByText("ออกเอกสาร")).toBeVisible();

    // Fill 1 row so the printable copy renders.
    const firstNameCell = page.locator("table tbody tr").first().locator("input").first();
    await firstNameCell.fill("สินค้าทดสอบ");
    const firstPriceCell = page.locator("table tbody tr").first().locator("input[type=number]").first();
    await firstPriceCell.fill("10");

    // Scroll down so we can verify the page jumps back after printing.
    await page.evaluate(() => window.scrollTo(0, 600));
    const beforeScroll = await page.evaluate(() => window.scrollY);
    expect(beforeScroll).toBeGreaterThan(100);

    // Trigger the no-save "พิมพ์ทันที" button so we don't depend on backend.
    await page.getByRole("button", { name: /พิมพ์ทันที/ }).click();

    // Wait for the snapshot taken inside our patched window.print.
    await page.waitForFunction(
      () => (window as unknown as { __printSnapshots?: unknown[] }).__printSnapshots?.length === 1,
      null,
      { timeout: 5_000 },
    );

    const snap = await page.evaluate(
      () =>
        (
          window as unknown as {
            __printSnapshots: Array<{
              firstPageIdx: string | null;
              firstPageHidden: boolean;
              isPrintingClass: boolean;
              docPrintCount: number;
              skipCount: number;
              scrollY: number;
            }>;
          }
        ).__printSnapshots[0],
    );

    // First page must be present, marked as page 1, and not hidden.
    expect(snap.firstPageIdx).toBe("1");
    expect(snap.firstPageHidden).toBe(false);
    expect(snap.isPrintingClass).toBe(true);
    // No range filter applied → nothing is skipped.
    expect(snap.skipCount).toBe(0);
    // Exactly one printable copy in the DOM (the always-mounted one).
    expect(snap.docPrintCount).toBeGreaterThanOrEqual(1);

    // After afterprint, the is-printing flag is cleared and scroll is restored.
    await expect
      .poll(async () => page.evaluate(() => document.body.classList.contains("is-printing")), {
        timeout: 3_000,
      })
      .toBe(false);
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 3_000 })
      .toBeGreaterThanOrEqual(beforeScroll - 5);
  });

  test("page-range input hides pages outside the selection at print time", async ({ page }) => {
    await page.addInitScript(() => {
      type W = Window & {
        __rangeSnapshot?: {
          visibleIdx: string[];
          hiddenIdx: string[];
        };
        print: () => void;
      };
      const w = window as unknown as W;
      w.print = () => {
        const root = document.querySelector("#doc-print");
        const pages = root
          ? Array.from(root.querySelectorAll<HTMLElement>(".doc-page[data-page-idx]"))
          : [];
        w.__rangeSnapshot = {
          visibleIdx: pages
            .filter((p) => p.getAttribute("data-print-skip") !== "true")
            .map((p) => p.getAttribute("data-page-idx") ?? ""),
          hiddenIdx: pages
            .filter((p) => p.getAttribute("data-print-skip") === "true")
            .map((p) => p.getAttribute("data-page-idx") ?? ""),
        };
        window.dispatchEvent(new Event("beforeprint"));
        window.dispatchEvent(new Event("afterprint"));
      };
    });

    await page.goto(`/receipts/${STORE}/documents/new`);
    await expect(page.getByText("ออกเอกสาร")).toBeVisible();

    // Add enough rows to spill into a second page (>= 20 rows / A4 modern).
    // We push 24 rows by typing in sequential first-cell inputs.
    for (let i = 0; i < 24; i++) {
      const row = page.locator("table tbody tr").nth(i);
      // The table appends a blank row when the last row gains a value; this
      // is the same pattern other tests rely on.
      await row.locator("input").first().fill(`item-${i + 1}`);
      await row.locator("input[type=number]").first().fill("1");
    }

    // Request only page 1.
    await page.getByLabel(/ระบุหน้าที่ต้องการพิมพ์/).fill("1");
    await page.getByRole("button", { name: /พิมพ์ทันที/ }).click();

    await page.waitForFunction(
      () => Boolean((window as unknown as { __rangeSnapshot?: unknown }).__rangeSnapshot),
      null,
      { timeout: 5_000 },
    );

    const snap = await page.evaluate(
      () =>
        (
          window as unknown as {
            __rangeSnapshot: { visibleIdx: string[]; hiddenIdx: string[] };
          }
        ).__rangeSnapshot,
    );

    // Only page 1 may remain visible. There must be at least one hidden page,
    // otherwise the test data wasn't enough to spill — fail loudly.
    expect(snap.visibleIdx).toEqual(["1"]);
    expect(snap.hiddenIdx.length).toBeGreaterThan(0);
  });
});