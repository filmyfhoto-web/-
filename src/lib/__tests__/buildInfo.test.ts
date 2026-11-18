import { describe, expect, it } from "vitest";
import pkg from "../../../package.json";
import { BUILD_INFO, buildLabel, formatThaiDateTime, isCurrentBuild } from "../buildInfo";

describe("buildInfo", () => {
  it("reports the version from package.json (never a hard-coded value)", () => {
    expect(BUILD_INFO.version).toBe(pkg.version);
    expect(BUILD_INFO.version).not.toBe("0.0.0");
  });

  it("has a real build timestamp and short commit id", () => {
    expect(Number.isNaN(new Date(BUILD_INFO.builtAt).getTime())).toBe(false);
    expect(new Date(BUILD_INFO.builtAt).getTime()).toBeGreaterThan(0);
    expect(BUILD_INFO.commit.length).toBeGreaterThan(0);
    expect(BUILD_INFO.commit.length).toBeLessThanOrEqual(8);
  });

  it("formats the update time in Thai, Asia/Bangkok", () => {
    const s = formatThaiDateTime("2026-07-28T03:04:00.000Z"); // 10:04 Bangkok
    expect(s).toContain("2569");
    expect(s).toContain("10:04");
    expect(s.endsWith("น.")).toBe(true);
  });

  it("falls back gracefully for an unknown timestamp", () => {
    expect(formatThaiDateTime("not-a-date")).toBe("ไม่ทราบ");
  });

  it("builds a support label and detects the current build", () => {
    expect(buildLabel()).toBe(`${BUILD_INFO.version}+${BUILD_INFO.commit}`);
    expect(isCurrentBuild()).toBe(true);
    expect(isCurrentBuild({ ...BUILD_INFO, commit: "deadbeef" }, BUILD_INFO)).toBe(false);
    expect(isCurrentBuild({ ...BUILD_INFO, version: "0.9.0" }, BUILD_INFO)).toBe(false);
  });
});