import { describe, it, expect, beforeEach } from "vitest";
import {
  pushScanHistory,
  loadScanHistory,
  clearScanHistory,
} from "../scanHistoryStore";

beforeEach(() => {
  window.localStorage.clear();
  clearScanHistory();
});

describe("scanHistoryStore", () => {
  it("stores entries newest first", () => {
    pushScanHistory({ raw: "A", normalized: "A", status: "matched", source: "usb" });
    pushScanHistory({ raw: "B", normalized: "B", status: "not_found", source: "camera" });
    const list = loadScanHistory();
    expect(list[0].raw).toBe("B");
    expect(list[1].raw).toBe("A");
  });

  it("dedupes identical scan within short window", () => {
    pushScanHistory({ raw: "X", normalized: "X", status: "matched", source: "usb" });
    pushScanHistory({ raw: "X", normalized: "X", status: "matched", source: "usb" });
    expect(loadScanHistory()).toHaveLength(1);
  });

  it("caps at 200 entries", () => {
    for (let i = 0; i < 250; i++) {
      pushScanHistory({
        raw: `code-${i}`,
        normalized: `code-${i}`,
        status: "matched",
        source: "usb",
        time: i, // unique time defeats dedupe
      });
    }
    const list = loadScanHistory();
    expect(list.length).toBeLessThanOrEqual(200);
    expect(list[0].raw).toBe("code-249");
  });
});