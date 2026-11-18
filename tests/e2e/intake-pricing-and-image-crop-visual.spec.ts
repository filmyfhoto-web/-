import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression + พฤติกรรมการคำนวณ
 *  1) ฟอร์ม “รับงานใหม่” (/film-intake) — กว้าง × ยาว × ราคา/ตร.ม. → รวมเงินอัตโนมัติ
 *  2) กล่องตัวอย่างรูปก่อนอัปโหลด (ครอปอัตโนมัติ) ในหน้า “จัดการหน้าเว็บไซต์”
 *
 * อัปเดต baseline: bunx playwright test intake-pricing-and-image-crop-visual --update-snapshots
 */

const STORAGE_KEY = process.env.E2E_STAFF_STORAGE_KEY;
const SESSION_JSON = process.env.E2E_STAFF_SESSION_JSON;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function stabilize(page: Page) {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important}`,
  });
  await page.waitForTimeout(400);
}

test.describe("ฟอร์มรับงานใหม่ — คิดราคาเป็นตารางเมตร", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.route(/\/functions\/v1\/film-intake-form.*/, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true, store_label: "FILM SHOP", expires_at: new Date(Date.now() + 6e5).toISOString(),
          used: false, order_id: null, prefill: null,
        }),
      }),
    );
    await page.addInitScript(() => {
      try { localStorage.removeItem("film-shop:intake-wizard:v1"); } catch { /* ignore */ }
    });
  });

  test("กรอก กว้าง × ยาว + ราคา/ตร.ม. แล้วรวมเงินอัตโนมัติ", async ({ page }) => {
    await page.goto("/film-intake?t=e2e-token", { waitUntil: "domcontentloaded" });
    await page.getByLabel("ชื่อลูกค้า *").fill("ลูกค้าทดสอบ");
    await page.getByRole("button", { name: /ถัดไป/ }).click();

    await page.getByPlaceholder("ชื่องาน *").fill("ป้ายไวนิล");
    await page.getByTestId("wz-size-unit-0").selectOption("cm");
    await page.getByTestId("wz-width-0").fill("150");
    await page.getByTestId("wz-height-0").fill("100");
    await page.getByTestId("wz-price-sqm-0").fill("200");
    await page.getByTestId("wz-qty-0").fill("2");

    await expect(page.getByTestId("wz-area-0")).toContainText("1.5 ตร.ม.");
    await expect(page.getByTestId("wz-line-total-0")).toHaveValue("600");
    await expect(page.getByTestId("wz-grand-total")).toContainText("600.00");

    await stabilize(page);
    await expect(page.getByTestId("wz-line-total-0").locator("xpath=ancestor::div[1]")).toBeVisible();
    expect(await page.screenshot()).toMatchSnapshot("intake-area-pricing-390.png", { maxDiffPixelRatio: 0.02 });
  });

  test("กรอกตัวเลขผิดรูปแบบมีข้อความเตือน", async ({ page }) => {
    await page.goto("/film-intake?t=e2e-token", { waitUntil: "domcontentloaded" });
    await page.getByLabel("ชื่อลูกค้า *").fill("ลูกค้าทดสอบ");
    await page.getByRole("button", { name: /ถัดไป/ }).click();
    await page.getByTestId("wz-qty-0").fill("1.5");
    await expect(page.getByTestId("wz-qty-0-error")).toBeVisible();
  });
});

test.describe("จัดการหน้าเว็บไซต์ — ตัวอย่างรูปก่อนอัปโหลด", () => {
  test.skip(!STORAGE_KEY || !SESSION_JSON, "ต้องมี session แอดมินจริง");
  test.use({ viewport: { width: 1440, height: 960 } });

  test("ตัวอย่างรูปที่ครอปแล้วตรงกับ baseline", async ({ page }) => {
    await page.addInitScript(
      ([k, v]) => { try { localStorage.setItem(k as string, v as string); } catch { /* ignore */ } },
      [STORAGE_KEY!, SESSION_JSON!],
    );
    await page.goto("/receipts/film?p=site-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("site-editor")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("site-editor-dashboard-file").setInputFiles({
      name: "dash.png", mimeType: "image/png", buffer: PNG,
    });
    const dialog = page.getByTestId("site-image-preview-dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await stabilize(page);
    expect(await dialog.screenshot()).toMatchSnapshot("site-image-crop-preview.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
