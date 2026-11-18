import { test, expect } from "@playwright/test";

test.describe("public legal pages", () => {
  test("/privacy-policy is public and not redirected", async ({ page }) => {
    await page.goto("/privacy-policy");
    await expect(page).toHaveURL(/\/privacy-policy$/);
    await expect(page.getByRole("heading", { name: /นโยบายความเป็นส่วนตัว/ }).first()).toBeVisible();
  });

  test("/terms-of-use is public and not redirected", async ({ page }) => {
    await page.goto("/terms-of-use");
    await expect(page).toHaveURL(/\/terms-of-use$/);
    await expect(page.getByRole("heading", { name: /เงื่อนไขการใช้งาน/ }).first()).toBeVisible();
  });

  test("login page shows legal links", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /เงื่อนไขการใช้งาน/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /นโยบายความเป็นส่วนตัว/ })).toBeVisible();
  });

  test("signup page shows legal links", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("link", { name: /เงื่อนไขการใช้งาน/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /นโยบายความเป็นส่วนตัว/ })).toBeVisible();
  });

  // Edge-case variants: must never redirect to /login
  const variants = [
    "/privacy-policy",
    "/privacy-policy/",
    "/privacy-policy?ref=line",
    "/privacy-policy?utm_source=fb&utm_campaign=x",
    "/privacy-policy#section-1",
    "/terms-of-use",
    "/terms-of-use/",
    "/terms-of-use?ref=signup",
    "/terms-of-use#cancel",
  ];
  for (const path of variants) {
    test(`does not redirect to /login for ${path}`, async ({ page }) => {
      await page.goto(path);
      // Wait a moment for any client-side redirect to trigger
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(300);
      expect(page.url()).not.toMatch(/\/login(\?|$|#)/);
      expect(page.url()).not.toMatch(/\/signup(\?|$|#)/);
    });
  }

  test("legal pages remain accessible even with stale auth token in storage", async ({ page, context }) => {
    // Pre-seed an obviously-invalid auth token to simulate stale session — must not redirect
    await page.goto("/");
    await page.evaluate(() => {
      try {
        localStorage.setItem("sb-fake-auth-token", JSON.stringify({ access_token: "invalid", expires_at: 1 }));
      } catch {}
    });
    await page.goto("/privacy-policy");
    expect(page.url()).not.toMatch(/\/login/);
    await expect(page.getByRole("heading", { name: /นโยบายความเป็นส่วนตัว/ }).first()).toBeVisible();
    await page.goto("/terms-of-use");
    expect(page.url()).not.toMatch(/\/login/);
    await expect(page.getByRole("heading", { name: /เงื่อนไขการใช้งาน/ }).first()).toBeVisible();
  });
});

test.describe("signup consent gate", () => {
  test("submit button disabled until legal checkbox is ticked", async ({ page }) => {
    await page.goto("/signup");
    const submit = page.getByRole("button", { name: /สมัครสมาชิก|ส่งคำขอเข้าร่วม/ });
    await expect(submit).toBeDisabled();
    await page.locator("#signup-accept-legal").click();
    await expect(submit).toBeEnabled();
  });
});
