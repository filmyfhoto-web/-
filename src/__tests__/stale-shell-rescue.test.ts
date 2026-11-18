import { describe, it, expect } from "vitest";
import { decideRescue, cacheBustedUrl } from "@/lib/staleShellRescue";

const RUNNING = "1.4.0-abc1234";
const DEPLOYED = "1.5.0-def5678";

describe("stale shell rescue", () => {
  it("does nothing when the running build matches the deployed one", () => {
    expect(decideRescue(RUNNING, RUNNING, null)).toBe("none");
  });

  it("ignores non-comparable tags (local/dev builds)", () => {
    expect(decideRescue("1.5.0-local", RUNNING, null)).toBe("none");
    expect(decideRescue(DEPLOYED, "1.4.0-local", null)).toBe("none");
    expect(decideRescue(null, RUNNING, null)).toBe("none");
  });

  it("purges old files immediately when a newer build is live", () => {
    expect(decideRescue(DEPLOYED, RUNNING, null)).toBe("purge");
  });

  it("keeps purging when a previous attempt did not help", () => {
    expect(decideRescue(DEPLOYED, RUNNING, DEPLOYED)).toBe("purge");
  });

  it("purges for any newer deploy tag", () => {
    expect(decideRescue("1.6.0-aaa", RUNNING, DEPLOYED)).toBe("purge");
  });


  it("adds a cache-busting query without dropping the path", () => {
    const out = cacheBustedUrl("https://filmyynatta.com/shop?p=A1", DEPLOYED);
    expect(out).toContain("/shop");
    expect(out).toContain("p=A1");
    expect(out).toContain(`v=${DEPLOYED}`);
  });
});
