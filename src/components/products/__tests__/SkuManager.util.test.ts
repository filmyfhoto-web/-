import { describe, it, expect } from "vitest";
import { __test__ } from "@/components/products/SkuManager";

const { buildDeterministicSku, cartesian, normalizeToken } = __test__;

describe("SkuManager utils", () => {
  it("cartesian 3x4 = 12 combos", () => {
    const c = cartesian([
      { key: "color", values: ["red","blue","green"] },
      { key: "size", values: ["S","M","L","XL"] },
    ]);
    expect(c).toHaveLength(12);
    const keys = c.map((x) => `${x.color}-${x.size}`);
    expect(new Set(keys).size).toBe(12); // unique
  });

  it("cartesian empty when any dim missing", () => {
    expect(cartesian([{ key: "a", values: [] }])).toEqual([]);
  });

  it("deterministic SKU stable + uppercase + hyphenated", () => {
    const a = buildDeterministicSku("fy-001", { color: "แดง", size: "M" }, ["color","size"]);
    const b = buildDeterministicSku("fy-001", { color: "แดง", size: "M" }, ["color","size"]);
    expect(a).toBe(b);
    expect(a.startsWith("FY-001")).toBe(true);
  });

  it("normalizeToken preserves unicode letters and strips spaces", () => {
    expect(normalizeToken("  hello world  ")).toBe("HELLO-WORLD");
    expect(normalizeToken("สี แดง")).toBe("สี-แดง");
  });
});