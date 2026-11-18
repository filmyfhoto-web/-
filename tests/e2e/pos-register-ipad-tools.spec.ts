import { test, expect } from "@playwright/test";
import { openRegister, scanOneItem, noHorizontalOverflow } from "./posRegisterFixture";

/**
 * iPad (portrait + landscape) must never scroll sideways, and the new POS
 * tools — camera scan, attach file, add product — must stay reachable.
 */
for (const vp of [
  { name: "ipad-portrait", width: 768, height: 1024 },
  { name: "ipad-landscape", width: 1024, height: 768 },
  { name: "ipad-pro-landscape", width: 1366, height: 1024 },
  { name: "iphone-390", width: 390, height: 844 },
]) {
  test(`POS tools fit @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openRegister(page);
    await scanOneItem(page);
    await noHorizontalOverflow(page, vp.width);

    for (const id of ["pos-cam-scan-btn", "pos-attach-btn", "pos-add-product-btn"]) {
      const btn = page.getByTestId(id);
      await expect(btn).toBeVisible();
      const box = (await btn.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    }
  });
}

test("attach dialog opens and starts empty", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openRegister(page);
  await page.getByTestId("pos-attach-btn").click();
  await expect(page.getByTestId("pos-attach-dialog")).toBeVisible();
  await expect(page.getByTestId("pos-attach-list")).toContainText("ยังไม่มีไฟล์แนบ");
});

test("unknown barcode keeps the code searchable and offers a rescan", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openRegister(page);
  const input = page.getByTestId("pos-scan-input");
  await input.click();
  await input.fill("0000000000000");
  await input.press("Enter");
  await expect(page.getByText("ไม่พบสินค้าจากบาร์โค้ดนี้").first()).toBeVisible();
  await expect(input).toHaveValue("0000000000000");
  await expect(page.getByRole("button", { name: "สแกนใหม่" })).toBeVisible();
});