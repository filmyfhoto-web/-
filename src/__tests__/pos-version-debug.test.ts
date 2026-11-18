import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isNewerBuild } from "@/lib/buildUpdate";

const bar = readFileSync("src/components/pos/PosVersionBar.tsx", "utf8");
const reg = readFileSync("src/pages/pos/PosRegister.tsx", "utf8");

describe("POS version + update debug surface", () => {
  it("register mounts the always-visible version bar", () => {
    expect(reg).toContain("<PosVersionBar />");
    expect(reg).toContain('data-testid="pos-version-footer"');
  });
  it("badge shows the running version and opens the debug panel", () => {
    expect(bar).toContain('data-testid="pos-version-badge"');
    expect(bar).toContain("POS v{BUILD_INFO.version}");
    expect(bar).toContain('data-testid="pos-debug-panel"');
    expect(bar).toContain('testid="pos-debug-sw"');
    expect(bar).toContain('data-testid="pos-debug-caches"');
  });
  it("offers new-build banner and force update", () => {
    expect(bar).toContain('data-testid="pos-update-banner"');
    expect(bar).toContain('data-testid="pos-update-banner-refresh"');
    expect(bar).toContain('data-testid="pos-force-update"');
    expect(reg).toContain('testid="pos-force-update-rail"');
  });
  it("only flags a genuinely different tag", () => {
    expect(isNewerBuild("1.1.99-abc", "1.1.12-def")).toBe(true);
    expect(isNewerBuild("1.1.12-def", "1.1.12-def")).toBe(false);
    expect(isNewerBuild("", "1.1.12-def")).toBe(false);
    expect(isNewerBuild(null, "1.1.12-def")).toBe(false);
  });
});
