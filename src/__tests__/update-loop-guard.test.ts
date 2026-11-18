import { beforeEach, describe, expect, it } from "vitest";
import { isComparableTag, isNewerBuild } from "@/lib/buildUpdate";
import { AUTO_UPDATE_IDLE_MS, markAutoUpdateApplied, shouldAutoUpdate } from "@/lib/autoUpdate";

describe("build tag comparison", () => {
  it("never treats a non-release tag as an update", () => {
    expect(isComparableTag("1.2.0-local")).toBe(false);
    expect(isComparableTag("1.2.0-dev")).toBe(false);
    expect(isComparableTag("1.2.0-8b276bab")).toBe(true);
    expect(isNewerBuild("1.2.0-local", "1.2.0-8b276bab")).toBe(false);
    expect(isNewerBuild("1.2.0-8b276bab", "1.2.0-local")).toBe(false);
  });

  it("identical tags are not an update, real new tags are", () => {
    expect(isNewerBuild("1.2.0-aaaaaaaa", "1.2.0-aaaaaaaa")).toBe(false);
    expect(isNewerBuild("1.3.0-bbbbbbbb", "1.2.0-aaaaaaaa")).toBe(true);
  });
});

describe("auto update guard", () => {
  const ctx = {
    hasUpdate: true,
    idleMs: AUTO_UPDATE_IDLE_MS + 1,
    dialogOpen: false,
    unsavedForm: false,
    visible: true,
    online: true,
  };

  beforeEach(() => {
    try { sessionStorage.clear(); } catch { /* ignore */ }
  });

  it("allows exactly one automatic reload per released build", () => {
    expect(shouldAutoUpdate(ctx)).toBe(true);
    markAutoUpdateApplied();
    expect(shouldAutoUpdate(ctx)).toBe(false);
  });

  it("still applies the next deploy on a device that stays open", () => {
    const first = { ...ctx, targetTag: "1.2.0-aaaaaaaa" };
    expect(shouldAutoUpdate(first)).toBe(true);
    markAutoUpdateApplied(first.targetTag);
    expect(shouldAutoUpdate(first)).toBe(false);
    // a newer build is deployed while the app is still open
    const second = { ...ctx, targetTag: "1.3.0-bbbbbbbb" };
    expect(shouldAutoUpdate(second)).toBe(true);
  });

  it("stays put when the versions match", () => {
    expect(shouldAutoUpdate({ ...ctx, hasUpdate: false })).toBe(false);
  });
});