import { describe, expect, it, beforeEach } from "vitest";
import { claimUpdateReload, MAX_RELOADS, RELOAD_WINDOW_MS, withinReloadBudget } from "../reloadGuard";

describe("update reload guard", () => {
  beforeEach(() => { try { sessionStorage.clear(); } catch { /* ignore */ } });

  it("allows a bounded number of reloads inside the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_RELOADS; i++) expect(claimUpdateReload(t0 + i)).toBe(true);
    expect(claimUpdateReload(t0 + MAX_RELOADS)).toBe(false);
  });

  it("lets the budget recover after the window", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < MAX_RELOADS; i++) claimUpdateReload(t0 + i);
    expect(claimUpdateReload(t0 + RELOAD_WINDOW_MS + 1)).toBe(true);
  });

  it("ignores timestamps outside the window", () => {
    expect(withinReloadBudget([0, 1], RELOAD_WINDOW_MS + 10)).toBe(true);
  });
});
