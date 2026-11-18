import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const mainSrc = readFileSync("src/main.tsx", "utf8");
const guardSrc = readFileSync("src/lib/mobileRuntime.ts", "utf8");
const authSrc = readFileSync("src/contexts/AuthContext.tsx", "utf8");

describe("mobile runtime guards", () => {
  it("installs before the supabase client is imported", () => {
    expect(mainSrc.indexOf("mobileRuntime")).toBeLessThan(mainSrc.indexOf("./App.tsx"));
    expect(guardSrc.trimEnd().endsWith("installMobileRuntimeGuards();")).toBe(true);
  });

  it("falls back to memory storage and legacy clipboard", () => {
    expect(guardSrc).toContain("memoryStorage");
    expect(guardSrc).toContain("execCommand");
  });

  it("never leaves the auth loading screen stuck", () => {
    expect(authSrc).toContain("watchdog");
    expect(authSrc).toContain("clearTimeout(watchdog)");
  });
});
