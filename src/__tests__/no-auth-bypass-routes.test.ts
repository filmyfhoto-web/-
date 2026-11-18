import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Security regression: no route may render a staff/POS surface outside its
 * guard. The E2E suite drives the real `/pos/register` route with a mocked
 * authenticated session instead of a public harness.
 */
const appSrc = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("production route table", () => {
  it("has no POS auth-bypass harness route", () => {
    expect(appSrc).not.toContain("pos-register-harness");
    expect(appSrc).not.toContain("PosRegisterHarness");
  });

  it("keeps /pos/register behind RequireStaffPerm module=\"pos\"", () => {
    const line = appSrc.split("\n").find((l) => l.includes('path="/pos/register"'))!;
    expect(line).toBeTruthy();
    expect(line).toContain('RequireStaffPerm module="pos"');
  });

  it("every /dev route renders a non-privileged surface only", () => {
    const devRoutes = appSrc.split("\n").filter((l) => l.includes('path="/dev/'));
    for (const r of devRoutes) {
      expect(r).toContain("PrintPreviewHarness");
    }
  });
});
