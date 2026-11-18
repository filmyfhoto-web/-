import { describe, it, expect } from "vitest";
import { parsePageRange, applyPrintPageFilter } from "../printRange";

describe("parsePageRange", () => {
  it("returns null for empty or whitespace input (= print all)", () => {
    expect(parsePageRange("", 5)).toBeNull();
    expect(parsePageRange("   ", 5)).toBeNull();
  });

  it("parses a single page", () => {
    expect([...(parsePageRange("3", 5) ?? [])]).toEqual([3]);
  });

  it("parses a comma list", () => {
    expect([...(parsePageRange("1,3", 5) ?? [])].sort()).toEqual([1, 3]);
  });

  it("parses a range", () => {
    expect([...(parsePageRange("2-4", 5) ?? [])].sort()).toEqual([2, 3, 4]);
  });

  it("parses mixed list and ranges, dedups, clamps out-of-bounds", () => {
    expect([...(parsePageRange("1,3,5-7,3", 6) ?? [])].sort((a, b) => a - b)).toEqual([1, 3, 5, 6]);
  });

  it("accepts reversed ranges", () => {
    expect([...(parsePageRange("4-2", 5) ?? [])].sort()).toEqual([2, 3, 4]);
  });

  it("returns null for garbage input", () => {
    expect(parsePageRange("abc", 5)).toBeNull();
    expect(parsePageRange("1,abc", 5)).toBeNull();
  });
});

describe("applyPrintPageFilter", () => {
  function makeRoot(n: number) {
    const root = document.createElement("div");
    for (let i = 1; i <= n; i++) {
      const p = document.createElement("section");
      p.className = "doc-page";
      p.setAttribute("data-page-idx", String(i));
      root.appendChild(p);
    }
    return root;
  }

  it("marks pages outside the range with data-print-skip", () => {
    const root = makeRoot(4);
    applyPrintPageFilter(root, "1,3");
    const skipped = root.querySelectorAll('[data-print-skip="true"]');
    expect(skipped.length).toBe(2);
    expect(root.querySelector('[data-page-idx="1"]')?.getAttribute("data-print-skip")).toBeNull();
    expect(root.querySelector('[data-page-idx="2"]')?.getAttribute("data-print-skip")).toBe("true");
    expect(root.querySelector('[data-page-idx="3"]')?.getAttribute("data-print-skip")).toBeNull();
    expect(root.querySelector('[data-page-idx="4"]')?.getAttribute("data-print-skip")).toBe("true");
  });

  it("cleanup removes the attribute so on-screen preview is unaffected", () => {
    const root = makeRoot(3);
    const cleanup = applyPrintPageFilter(root, "2");
    expect(root.querySelectorAll('[data-print-skip="true"]').length).toBe(2);
    cleanup();
    expect(root.querySelectorAll('[data-print-skip="true"]').length).toBe(0);
  });

  it("empty range marks nothing (= print all)", () => {
    const root = makeRoot(3);
    applyPrintPageFilter(root, "");
    expect(root.querySelectorAll('[data-print-skip="true"]').length).toBe(0);
  });
});