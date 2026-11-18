import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Customer surfaces must not expose any admin entry points. Verify the Shop
// hero and CustomerLayout footer no longer link to /admin-login or the
// canonical admin auth URL.
describe("Customer surfaces expose no admin login link", () => {
  it("Shop hero has no admin-login button", () => {
    const src = readFileSync(resolve(__dirname, "../Shop.tsx"), "utf8");
    expect(src).not.toMatch(/shop-hero-admin-login/);
    expect(src).not.toMatch(/ADMIN_LOGIN_URL/);
    expect(src).not.toMatch(/เข้าสู่ระบบแอดมิน/);
  });

  it("CustomerLayout footer has no staff-login link", () => {
    const src = readFileSync(
      resolve(__dirname, "../../components/layout/CustomerLayout.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/footer-admin-login/);
    expect(src).not.toMatch(/\/admin-login/);
    expect(src).not.toMatch(/Staff login/);
  });
});