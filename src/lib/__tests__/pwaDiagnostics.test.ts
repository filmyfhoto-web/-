import { describe, it, expect, beforeEach } from "vitest";
import { logPwa, readPwaLog, clearPwaLog, formatPwaLog, isInAppBrowserUA, isIOSUA } from "../pwaDiagnostics";

describe("pwaDiagnostics", () => {
  beforeEach(() => clearPwaLog());

  it("stores and formats events", () => {
    logPwa("warn", "install_blocked", "LINE in-app");
    const log = readPwaLog();
    expect(log).toHaveLength(1);
    expect(log[0].event).toBe("install_blocked");
    expect(formatPwaLog(log)).toContain("install_blocked — LINE in-app");
  });

  it("keeps at most 50 entries", () => {
    for (let i = 0; i < 60; i++) logPwa("info", `e${i}`);
    const log = readPwaLog();
    expect(log).toHaveLength(50);
    expect(log[log.length - 1].event).toBe("e59");
  });

  it("detects in-app browsers and iOS", () => {
    expect(isInAppBrowserUA("Mozilla/5.0 Line/13.0.0")).toBe(true);
    expect(isInAppBrowserUA("Mozilla/5.0 Chrome/120")).toBe(false);
    expect(isIOSUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe(true);
  });
});