import { describe, it, expect } from "vitest";
import {
  buildEffectiveStockMap,
  computeAggregateBaseDemand,
  wouldExceedBaseStock,
  type UnitLinkRow,
} from "@/lib/productUnitLink";

describe("buildEffectiveStockMap", () => {
  it("uses own stock when no link", () => {
    const m = buildEffectiveStockMap(
      [{ id: "a", stock: 7 }],
      [],
    );
    expect(m.get("a")!.effectiveStock).toBe(7);
    expect(m.get("a")!.isLinked).toBe(false);
  });
  it("derives wrapper stock from base and ratio (floor)", () => {
    const links: UnitLinkRow[] = [
      { wrapper_id: "pack", base_id: "stick", ratio: 4, enabled: true },
    ];
    const m = buildEffectiveStockMap(
      [{ id: "stick", stock: 9 }, { id: "pack", stock: 999 }],
      links,
    );
    expect(m.get("pack")!.effectiveStock).toBe(2);
    expect(m.get("pack")!.remainder).toBe(1);
    expect(m.get("pack")!.isLinked).toBe(true);
    expect(m.get("pack")!.baseId).toBe("stick");
  });
  it("disabled link falls back to own stock", () => {
    const m = buildEffectiveStockMap(
      [{ id: "stick", stock: 9 }, { id: "pack", stock: 3 }],
      [{ wrapper_id: "pack", base_id: "stick", ratio: 4, enabled: false }],
    );
    expect(m.get("pack")!.effectiveStock).toBe(3);
    expect(m.get("pack")!.isLinked).toBe(false);
  });
});

describe("computeAggregateBaseDemand", () => {
  it("sums base + wrapper lines against the shared base", () => {
    const d = computeAggregateBaseDemand([
      { product_id: "stick", qty: 2 },
      { product_id: "pack", qty: 1, base_id: "stick", ratio: 4 },
    ]);
    expect(d.get("stick")).toBe(6);
  });
  it("sums two wrappers sharing the same base", () => {
    const d = computeAggregateBaseDemand([
      { product_id: "pack", qty: 2, base_id: "stick", ratio: 4 },
      { product_id: "carton", qty: 1, base_id: "stick", ratio: 24 },
    ]);
    expect(d.get("stick")).toBe(32);
  });
  it("ignores non-positive qty", () => {
    const d = computeAggregateBaseDemand([{ product_id: "x", qty: 0 }]);
    expect(d.size).toBe(0);
  });
});

describe("wouldExceedBaseStock", () => {
  const stock = new Map([["stick", 10]]);
  it("passes within capacity", () => {
    const r = wouldExceedBaseStock(
      [{ product_id: "pack", qty: 1, base_id: "stick", ratio: 4 }],
      { product_id: "stick" },
      2,
      stock,
    );
    expect(r.ok).toBe(true);
  });
  it("rejects when base+wrapper aggregate exceeds base stock", () => {
    const r = wouldExceedBaseStock(
      [{ product_id: "pack", qty: 2, base_id: "stick", ratio: 4 }], // 8
      { product_id: "stick" },
      3, // total 11
      stock,
    );
    expect(r.ok).toBe(false);
    expect(r.baseId).toBe("stick");
    expect(r.available).toBe(10);
    expect(r.requested).toBe(11);
  });
  it("rejects when two wrappers together exceed base stock", () => {
    const r = wouldExceedBaseStock(
      [{ product_id: "pack", qty: 2, base_id: "stick", ratio: 4 }], // 8
      { product_id: "carton", base_id: "stick", ratio: 24 },
      1, // +24
      stock,
    );
    expect(r.ok).toBe(false);
  });
});