import { test, expect } from "@playwright/test";

test.describe("domain status guide", () => {
  test("shows DNS records, copy buttons and next steps", async ({ page }) => {
    await page.goto("/domain-status");
    await expect(page.getByRole("heading", { name: "สถานะการเชื่อมโดเมน" })).toBeVisible();
    await expect(page.getByText("เรคคอร์ด DNS ที่ต้องมี")).toBeVisible();
    await expect(page.getByText("ขั้นตอนต่อไป (ทำเองได้)")).toBeVisible();
    await expect(page.getByRole("button", { name: /คัดลอกค่า admin/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /คัดลอกค่า staff/ })).toBeVisible();
    await expect(page.getByText("185.158.133.1").first()).toBeVisible();
  });

  test("is reachable without login and lists the three workspace links", async ({ page }) => {
    await page.goto("/domain-status");
    await expect(page).toHaveURL(/\/domain-status/);
    await expect(page.getByText("ลิงก์ทดสอบด้วยตาเปล่า")).toBeVisible();
    await expect(page.getByText(/ลิงก์พนักงาน/)).toBeVisible();
    await expect(page.getByText(/ลิงก์เจ้าของ\/แอดมิน/)).toBeVisible();
  });
});
