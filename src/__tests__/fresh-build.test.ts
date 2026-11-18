import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shouldForceFresh } from "@/lib/freshBuild";

const RUNNING = "1.4.0-abc1234";
const DEPLOYED = "1.5.0-def5678";

describe("force fresh build on admin pages", () => {
  it("does nothing when the running build is already current", () => {
    expect(shouldForceFresh(RUNNING, RUNNING, null)).toBe(false);
  });

  it("ignores local/dev tags", () => {
    expect(shouldForceFresh("1.5.0-local", RUNNING, null)).toBe(false);
    expect(shouldForceFresh(DEPLOYED, "1.4.0-local", null)).toBe(false);
  });

  it("forces once when a newer build is live", () => {
    expect(shouldForceFresh(DEPLOYED, RUNNING, null)).toBe(true);
    expect(shouldForceFresh(DEPLOYED, RUNNING, DEPLOYED)).toBe(false);
  });

  it("work docs (ปลายทางใหม่ของศูนย์รวมลูกค้า) opts into the fresh-build check", () => {
    const src = readFileSync("src/pages/admin/WorkDocs.tsx", "utf8");
    expect(src).toContain("useFreshBuildOnMount");
    expect(src).toContain("useFreshBuildOnMount");
  });
});
