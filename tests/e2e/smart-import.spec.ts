import { test, expect } from "@playwright/test";

/**
 * Smart Import edge cases — exercised through the real Vite-served module so
 * the test verifies the bundle the app ships, not a duplicate copy.
 *
 * Covers:
 * - reordered columns with header
 * - multiple tables separated by blank lines in one paste
 * - summary rows ("รวมทั้งสิ้น", "ยอดสุทธิ") interleaved with data
 * - no header (positional inference)
 * - mixed numeric formats: ฿, comma-thousands, space-thousands, european comma-decimal
 * - user re-mapping via applyMapping
 */

test.describe("Smart Import — edge cases", () => {
  test.beforeEach(async ({ page }) => {
    // Any served HTML page is fine; we only need the dev server's module graph.
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  });

  async function loadMod(page: import("@playwright/test").Page) {
    return await page.evaluate(async () => {
      const mod = await import("/src/pages/receipts/documents/smartParse.ts");
      // expose for repeated evals
      (window as any).__smart = mod;
      return Object.keys(mod);
    });
  }

  test("reordered columns with thai header", async ({ page }) => {
    await loadMod(page);
    const result = await page.evaluate(() => {
      const m = (window as any).__smart;
      const text = "จำนวน\tหน่วย\tชื่อสินค้า\tราคา\n5\tรีม\tกระดาษ A4\t120\n10\tแผ่น\tปริ้นสี\t15";
      const r = m.smartParseText(text);
      return { rows: r.rows, hasHeader: r.meta.hasHeader, errors: r.errors.length };
    });
    expect(result.hasHeader).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.rows).toEqual([
      { name: "กระดาษ A4", price: 120, quantity: 5, unit: "รีม" },
      { name: "ปริ้นสี", price: 15, quantity: 10, unit: "แผ่น" },
    ]);
  });

  test("multiple tables in one paste (blank lines between)", async ({ page }) => {
    await loadMod(page);
    const result = await page.evaluate(() => {
      const text = [
        "กระดาษ A4\t120\t5\tรีม",
        "",
        "",
        "ปากกา\t15\t10\tด้าม",
        "หมึก\t250\t2\tกล่อง",
      ].join("\n");
      return (window as any).__smart.smartParseText(text).rows;
    });
    expect(result.map((r: any) => r.name)).toEqual(["กระดาษ A4", "ปากกา", "หมึก"]);
  });

  test("summary rows interleaved are skipped", async ({ page }) => {
    await loadMod(page);
    const r = await page.evaluate(() => {
      const text = [
        "ชื่อ\tราคา\tจำนวน\tหน่วย",
        "กระดาษ\t120\t5\tรีม",
        "ปากกา\t15\t10\tด้าม",
        "รวมทั้งสิ้น\t\t\t",
        "ยอดสุทธิ\t1800\t\t",
      ].join("\n");
      return (window as any).__smart.smartParseText(text);
    });
    expect(r.rows).toHaveLength(2);
    expect(r.meta.hasHeader).toBe(true);
  });

  test("no header — positional inference works", async ({ page }) => {
    await loadMod(page);
    const r = await page.evaluate(() => {
      const text = "กระดาษ A4\t120\t5\tรีม\nปริ้นสี\t15\t10\tแผ่น";
      return (window as any).__smart.smartParseText(text);
    });
    expect(r.meta.hasHeader).toBe(false);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].price).toBe(120);
    expect(r.rows[0].quantity).toBe(5);
  });

  test("mixed numeric formats parse correctly", async ({ page }) => {
    await loadMod(page);
    const out = await page.evaluate(() => {
      const m = (window as any).__smart;
      return [
        m.toNumber("฿1,250.00"),
        m.toNumber("1 250"),
        m.toNumber("1\u00A0250.50"),
        m.toNumber("1.250,00"),
        m.toNumber("1'250"),
        m.toNumber("(1,250)"),
        m.toNumber("x10"),
      ];
    });
    expect(out).toEqual([1250, 1250, 1250.5, 1250, 1250, -1250, 10]);
  });

  test("applyMapping re-derives rows when user swaps columns", async ({ page }) => {
    await loadMod(page);
    const r = await page.evaluate(() => {
      const m = (window as any).__smart;
      const matrix = [
        ["120", "5", "กระดาษ A4", "รีม"],
        ["15", "10", "ปริ้นสี", "แผ่น"],
      ];
      return m.applyMapping(matrix, { name: 2, price: 0, quantity: 1, unit: 3 }, false).rows;
    });
    expect(r).toEqual([
      { name: "กระดาษ A4", price: 120, quantity: 5, unit: "รีม" },
      { name: "ปริ้นสี", price: 15, quantity: 10, unit: "แผ่น" },
    ]);
  });
});