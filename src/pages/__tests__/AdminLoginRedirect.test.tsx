import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("AdminLoginRedirect (/admin-login)", () => {
  it("renders the Login component directly (no ?admin=1 required)", () => {
    const src = readFileSync(resolve(__dirname, "../AdminLoginRedirect.tsx"), "utf-8");
    expect(src).toMatch(/from ["']\.\/Login["']/);
    expect(src).toMatch(/<Login\s*\/>/);
    // No cross-origin bounce or ?admin=1 handshake anymore.
    expect(src).not.toMatch(/window\.location\.replace/);
    // Comment mentions `?admin=1` but no code path uses it.
  });

  it("Login treats /admin-login pathname as admin flow", () => {
    const src = readFileSync(resolve(__dirname, "../Login.tsx"), "utf-8");
    expect(src).toMatch(/onAdminLoginPath/);
    expect(src).toMatch(/\/admin-login/);
  });
});