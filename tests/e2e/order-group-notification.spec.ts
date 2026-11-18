import { test, expect } from "@playwright/test";
import {
  installStagingBackend, newState, seedCart, seedLineCustomer, TEST_PRODUCT,
} from "./fixtures/stagingBackend";

/**
 * ลูกค้าสั่งซื้อผ่าน LINE gate → ข้อความ "คำสั่งซื้อใหม่" ต้องไปโผล่ใน
 * กลุ่ม LINE ที่แอดมินตั้งค่าไว้ (channel_type = order_group) จริง ๆ
 * ไม่ใช่แค่มี log — assertion อยู่ที่ "ปลายทาง + เนื้อความ" ที่กลุ่มได้รับ.
 */
const GROUP = "Ce2e00000000000000000000000000aa";

async function checkout(page: import("@playwright/test").Page, name: string) {
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line").first()).toBeVisible({ timeout: 15000 });
  await page.getByTestId("cart-name").fill(name);
  await page.getByTestId("cart-phone").fill("0800000000");
  await page.getByTestId("cart-school").fill("โรงเรียนทดสอบ");
  await page.getByTestId("cart-project").fill("งานทดสอบแจ้งเตือนกลุ่ม");
  await page.getByTestId("submit-order-btn").click();
  const confirm = page.getByTestId("confirm-submit-order");
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
}

test.describe("order group LINE notification", () => {
  test("ออเดอร์ใหม่ส่งข้อความเข้ากลุ่มที่ตั้งค่าไว้", async ({ page }) => {
    const state = newState();
    state.orderGroupChannels = [
      { line_destination_id: GROUP, is_active: true, display_name: "กลุ่มออเดอร์ร้าน" },
      { line_destination_id: "Uprivate0000000000000000000000", is_active: true }, // 1:1 ต้องไม่ถูกส่ง
      { line_destination_id: "Coff00000000000000000000000000", is_active: false }, // ปิดอยู่
    ];

    await installStagingBackend(page, state);
    await seedLineCustomer(page);
    await seedCart(page, 3);
    await checkout(page, "ลูกค้าทดสอบกลุ่ม");

    await expect.poll(() => state.orders.length, { timeout: 15000 }).toBe(1);
    await expect.poll(() => state.lineGroupMessages.length, { timeout: 15000 }).toBe(1);

    const msg = state.lineGroupMessages[0];
    expect(msg.to).toBe(GROUP); // ไปเฉพาะกลุ่มที่เปิดใช้งาน
    expect(msg.text).toContain("🛒 คำสั่งซื้อใหม่");
    expect(msg.text).toContain(state.orders[0].order_no);
    expect(msg.text).toContain("ลูกค้าทดสอบกลุ่ม");
    expect(msg.text).toContain((TEST_PRODUCT.price * 3).toLocaleString("th-TH"));
    expect(msg.text).toContain(`order=${state.orders[0].id}`);
  });

  test("ยังไม่ได้ตั้งค่ากลุ่ม — ออเดอร์ยังบันทึกได้ แต่ไม่มีข้อความเข้ากลุ่ม", async ({ page }) => {
    const state = newState(); // ไม่มี order_group
    await installStagingBackend(page, state);
    await seedLineCustomer(page);
    await seedCart(page, 1);
    await checkout(page, "ลูกค้าไม่มีกลุ่ม");

    await expect.poll(() => state.orders.length, { timeout: 15000 }).toBe(1);
    expect(state.lineGroupMessages).toHaveLength(0);
  });
});
