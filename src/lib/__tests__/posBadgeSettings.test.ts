import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_BADGE_SETTINGS,
  BADGE_SETTINGS_KEY,
  loadBadgeSettings,
  saveBadgeSettings,
  resetBadgeSettings,
} from "@/lib/posBadgeSettings";

describe("posBadgeSettings", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing stored", () => {
    expect(loadBadgeSettings()).toEqual(DEFAULT_BADGE_SETTINGS);
  });

  it("persists and reloads", () => {
    saveBadgeSettings({
      ...DEFAULT_BADGE_SETTINGS,
      enabled: false,
      lowStock: { enabled: true, defaultThreshold: 12 },
    });
    const s = loadBadgeSettings();
    expect(s.enabled).toBe(false);
    expect(s.lowStock.defaultThreshold).toBe(12);
  });

  it("merges partial stored blob with defaults (forward compat)", () => {
    localStorage.setItem(BADGE_SETTINGS_KEY, JSON.stringify({ enabled: false }));
    const s = loadBadgeSettings();
    expect(s.enabled).toBe(false);
    expect(s.delivery.statuses).toEqual(DEFAULT_BADGE_SETTINGS.delivery.statuses);
    expect(s.pendingPo.statuses.length).toBeGreaterThan(0);
  });

  it("reset restores defaults", () => {
    saveBadgeSettings({ ...DEFAULT_BADGE_SETTINGS, enabled: false });
    resetBadgeSettings();
    expect(loadBadgeSettings()).toEqual(DEFAULT_BADGE_SETTINGS);
  });

  it("returns defaults on corrupted JSON", () => {
    localStorage.setItem(BADGE_SETTINGS_KEY, "{not json");
    expect(loadBadgeSettings()).toEqual(DEFAULT_BADGE_SETTINGS);
  });
});