import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { DEFAULT_SHORTCUTS, DEFAULT_THEME, hexToHsl, hslToHex, themeCssVars, resolveIcon } from "@/lib/shopHomeConfig";

describe("shop home config", () => {
  it("ships default shortcuts with unique keys", () => {
    const keys = DEFAULT_SHORTCUTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(10);
  });

  it("round-trips hex and hsl within rounding tolerance", () => {
    const hsl = hexToHsl("#17324d");
    expect(hsl).toMatch(/^\d+ \d+% \d+%$/);
    const back = hslToHex(hsl as string).toLowerCase();
    const channels = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    channels(back).forEach((v, i) => {
      expect(Math.abs(v - channels("#17324d")[i])).toBeLessThanOrEqual(3);
    });
  });

  it("emits theme css variables", () => {
    const vars = themeCssVars(DEFAULT_THEME);
    expect(vars["--primary"]).toBe(DEFAULT_THEME.primary_hsl);
    expect(vars["--gradient-primary"]).toContain("linear-gradient");
  });

  it("falls back to a safe icon", () => {
    expect(resolveIcon("__missing__")).toBeTruthy();
  });

  it("floating cart clears the bottom nav via the shared safe-area variable", () => {
    const shop = fs.readFileSync("src/pages/Shop.tsx", "utf8");
    expect(shop).toContain("var(--shop-nav-h");
    expect(shop).toContain("env(safe-area-inset-bottom");
    const css = fs.readFileSync("src/index.css", "utf8");
    expect(css).toContain("--shop-nav-h");
  });
});
