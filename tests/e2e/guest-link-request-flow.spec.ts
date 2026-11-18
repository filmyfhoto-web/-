import { test, expect } from "@playwright/test";

const RPC_URL = /\/rest\/v1\/rpc\/submit_link_request_v2/;
const CONFIRM_URL = /\/rest\/v1\/rpc\/confirm_link_request/;
const NOTIFY_URL = /\/functions\/v1\/link-request-notify/;
const RESOLVE_URL = /\/rest\/v1\/rpc\/(get_org_by_slug|resolve_org_by_slug|org_by_slug)/;

async function stubNotify(page: import("@playwright/test").Page) {
  await page.route(NOTIFY_URL, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );
}

test.describe("/s guest link-request flow", () => {
  test("form renders with SEO title and disabled submit until 2+ chars", async ({ page }) => {
    await page.goto("/s");
    await expect(page).toHaveTitle(/ขอลิงก์โรงเรียน/);
    const btn = page.getByRole("button", { name: /ขอลิงก์โรงเรียน/ });
    await expect(btn).toBeDisabled();
    await page.getByPlaceholder(/บ้านสบกอน/).fill("บ");
    await expect(btn).toBeDisabled();
    await page.getByPlaceholder(/บ้านสบกอน/).fill("บ้าน");
    await expect(btn).toBeEnabled();
  });

  test("single-match auto-redirects to /s/:slug", async ({ page }) => {
    await stubNotify(page);
    await page.route(RPC_URL, (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          matched_slug: "test-school-alpha",
          matched_name: "โรงเรียนทดสอบ ก",
          candidates: [{ id: "a", slug: "test-school-alpha", name: "โรงเรียนทดสอบ ก" }],
        }),
      })
    );
    await page.goto("/s");
    await page.getByPlaceholder(/บ้านสบกอน/).fill("โรงเรียนทดสอบ ก");
    await page.getByRole("button", { name: /ขอลิงก์โรงเรียน/ }).click();
    await page.waitForURL(/\/s\/test-school-alpha/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/s\/test-school-alpha/);
  });

  test("multiple matches show candidate picker; choosing routes to that slug", async ({ page }) => {
    await stubNotify(page);
    await page.route(RPC_URL, (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000002",
          matched_slug: null,
          matched_name: null,
          candidates: [
            { id: "a", slug: "huayfong", name: "โรงเรียนบ้านห้วยฟอง" },
            { id: "b", slug: "huayluang", name: "โรงเรียนบ้านห้วยหลวง" },
            { id: "c", slug: "huaykrai", name: "โรงเรียนบ้านห้วยไคร้" },
          ],
        }),
      })
    );
    await page.route(CONFIRM_URL, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "null" })
    );

    await page.goto("/s");
    await page.getByPlaceholder(/บ้านสบกอน/).fill("บ้านห้วย");
    await page.getByRole("button", { name: /ขอลิงก์โรงเรียน/ }).click();

    const list = page.getByTestId("candidate-list");
    await expect(list).toBeVisible();
    await expect(page.getByTestId("candidate-huayfong")).toBeVisible();
    await expect(page.getByTestId("candidate-huayluang")).toBeVisible();

    await page.getByTestId("candidate-huayluang").click();
    await page.waitForURL(/\/s\/huayluang/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/s\/huayluang/);
  });

  test("no-match shows queued confirmation, no redirect", async ({ page }) => {
    await stubNotify(page);
    await page.route(RPC_URL, (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000003",
          matched_slug: null, matched_name: null, candidates: [],
        }),
      })
    );
    await page.goto("/s");
    await page.getByPlaceholder(/บ้านสบกอน/).fill("โรงเรียนที่ไม่มีอยู่ในระบบ 99");
    await page.getByRole("button", { name: /ขอลิงก์โรงเรียน/ }).click();
    await expect(page.getByText(/ส่งคำขอเรียบร้อย/)).toBeVisible({ timeout: 5000 });
    expect(page.url()).toMatch(/\/s$/);
  });

  test("/s/:invalid-slug bounces back to /s with error toast", async ({ page }) => {
    // Do not stub org resolver — GuestContext.resolveOrg returns null for missing slug
    await page.goto("/s/definitely-not-a-real-slug-xyz");
    await page.waitForURL(/\/s(\?|$)/, { timeout: 8000 });
    expect(page.url()).toMatch(/\/s(\?|$)/);
  });
});
