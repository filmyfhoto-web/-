import { describe, expect, it } from "vitest";
import { AUTO_UPDATE_IDLE_MS, shouldAutoUpdate } from "../autoUpdate";

const base = {
  hasUpdate: true,
  idleMs: AUTO_UPDATE_IDLE_MS,
  dialogOpen: false,
  unsavedForm: false,
  visible: true,
  online: true,
};

describe("auto update gating", () => {
  it("applies a new build when the screen is idle", () => {
    expect(shouldAutoUpdate(base)).toBe(true);
  });

  it("never interrupts an open dialog or unsaved form", () => {
    expect(shouldAutoUpdate({ ...base, dialogOpen: true })).toBe(false);
    expect(shouldAutoUpdate({ ...base, unsavedForm: true })).toBe(false);
  });

  it("waits for real idle time, visibility and network", () => {
    expect(shouldAutoUpdate({ ...base, idleMs: 5_000 })).toBe(false);
    expect(shouldAutoUpdate({ ...base, visible: false })).toBe(false);
    expect(shouldAutoUpdate({ ...base, online: false })).toBe(false);
    expect(shouldAutoUpdate({ ...base, hasUpdate: false })).toBe(false);
  });
});