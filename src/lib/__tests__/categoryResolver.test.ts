import { describe, it, expect } from "vitest";
import {
  normalizeCategoryName,
  resolveCategories,
  mergeCreated,
} from "@/lib/categoryResolver";

describe("normalizeCategoryName", () => {
  it("trims, lowercases, collapses whitespace", () => {
    expect(normalizeCategoryName("  Pen  ")).toBe("pen");
    expect(normalizeCategoryName("PEN")).toBe("pen");
    expect(normalizeCategoryName("Hello   World")).toBe("hello world");
  });
  it("returns '' for null/undefined/empty", () => {
    expect(normalizeCategoryName(null)).toBe("");
    expect(normalizeCategoryName(undefined)).toBe("");
    expect(normalizeCategoryName("   ")).toBe("");
  });
});

describe("resolveCategories", () => {
  const existing = [
    { id: "id-pen", name: "Pen" },
    { id: "id-paper", name: "Paper" },
  ];

  it("maps exact existing name to its id, no creation", () => {
    const r = resolveCategories(["Pen"], existing);
    expect(r.map.get("Pen")).toBe("id-pen");
    expect(r.toCreate).toEqual([]);
  });

  it("queues brand-new names for creation", () => {
    const r = resolveCategories(["Notebook"], existing);
    expect(r.toCreate).toEqual(["Notebook"]);
    expect(r.map.has("Notebook")).toBe(false);
  });

  it("dedupes duplicate raw names — creates once", () => {
    const r = resolveCategories(["Notebook", "Notebook", "Notebook"], existing);
    expect(r.toCreate).toEqual(["Notebook"]);
  });

  it("collapses case/whitespace variants onto existing id", () => {
    const r = resolveCategories(["pen", "PEN", " Pen "], existing);
    expect(r.map.get("pen")).toBe("id-pen");
    expect(r.map.get("PEN")).toBe("id-pen");
    expect(r.map.get("Pen")).toBe("id-pen");
    expect(r.toCreate).toEqual([]);
    // Variants emit a soft warning
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("treats genuinely different spellings as separate categories", () => {
    const r = resolveCategories(["ปากกา", "ปาก กา"], existing);
    // After normalize they differ ("ปากกา" vs "ปาก กา"), so 2 distinct categories.
    expect(r.toCreate.sort()).toEqual(["ปาก กา", "ปากกา"]);
    expect(r.warnings).toEqual([]);
  });

  it("ignores empty / null values", () => {
    const r = resolveCategories(["", "   ", null, undefined], existing);
    expect(r.toCreate).toEqual([]);
    expect(r.map.size).toBe(0);
  });

  it("mergeCreated wires up newly-inserted ids", () => {
    const r = resolveCategories(["Notebook", "notebook"], existing);
    expect(r.toCreate).toEqual(["Notebook"]);
    mergeCreated(r, ["Notebook", "notebook"], [{ id: "id-note", name: "Notebook" }]);
    expect(r.map.get("Notebook")).toBe("id-note");
    expect(r.map.get("notebook")).toBe("id-note");
  });
});