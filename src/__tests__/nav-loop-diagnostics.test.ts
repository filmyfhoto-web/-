import { describe, it, expect, beforeEach } from "vitest";
import {
  detectLoop,
  recordNavigation,
  readLoopIncidents,
  clearNavDiagnostics,
} from "@/lib/navDiagnostics";

describe("nav loop diagnostics", () => {
  beforeEach(() => clearNavDiagnostics());

  it("flags the same path repeating inside the window", () => {
    const t = 1_000_000;
    expect(recordNavigation("/shop", t)).toBeNull();
    expect(recordNavigation("/shop", t + 400)).toBeNull();
    const hit = recordNavigation("/shop", t + 800);
    expect(hit?.kind).toBe("repeat");
    expect(hit?.count).toBe(3);
    expect(hit?.avgIntervalMs).toBe(400);
    expect(hit?.minIntervalMs).toBe(400);
  });

  it("flags two pages bouncing off each other", () => {
    const v = (path: string, t: number) => ({ path, t });
    const found = detectLoop([v("/a", 0), v("/b", 300), v("/a", 600), v("/b", 900)]);
    expect(found?.kind).toBe("pingpong");
    expect(found?.signature).toBe("/a ⇄ /b");
    expect(found?.count).toBe(4);
  });

  it("ignores normal navigation", () => {
    const t = 2_000_000;
    expect(recordNavigation("/a", t)).toBeNull();
    expect(recordNavigation("/b", t + 500)).toBeNull();
    expect(recordNavigation("/c", t + 900)).toBeNull();
    expect(readLoopIncidents()).toHaveLength(0);
  });

  it("ignores repeats spread beyond the detection window", () => {
    const t = 3_000_000;
    recordNavigation("/shop", t);
    recordNavigation("/shop", t + 20_000);
    expect(recordNavigation("/shop", t + 40_000)).toBeNull();
  });

  it("merges follow-up loops into one incident with a growing count", () => {
    const t = 4_000_000;
    recordNavigation("/x", t);
    recordNavigation("/x", t + 200);
    recordNavigation("/x", t + 400);
    const again = recordNavigation("/x", t + 600);
    expect(readLoopIncidents()).toHaveLength(1);
    expect(again?.count).toBe(4);
  });
});