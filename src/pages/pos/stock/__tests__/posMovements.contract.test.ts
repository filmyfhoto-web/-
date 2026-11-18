import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { shopOfProductLine, extractDocNo } from "../../PosMovements";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../PosMovements.tsx"), "utf8");

describe("PosMovements shop split", () => {
  it("maps product lines onto the three shop tabs", () => {
    expect(shopOfProductLine("colorlab")).toBe("colorlab");
    expect(shopOfProductLine("print")).toBe("print");
    expect(shopOfProductLine("other")).toBe("pos");
    expect(shopOfProductLine(null)).toBe("pos");
  });

  it("extracts POS/PO document numbers from reference or note", () => {
    expect(extractDocNo({ reference: "POS-260721-1e07f5", note: null })).toBe("POS-260721-1e07f5");
    expect(extractDocNo({ reference: null, note: "pos_checkout POS-260721-1e07f5" })).toBe("POS-260721-1e07f5");
    expect(extractDocNo({ reference: null, note: "รับเข้าจาก PO20260721-0001" })).toBe("PO20260721-0001");
    expect(extractDocNo({ reference: null, note: null })).toBe("");
  });

  it("renders three shop tabs and a bill sub-tab", () => {
    expect(SRC).toMatch(/shop-tab-/);
    expect(SRC).toMatch(/src-tab-bill/);
    expect(SRC).toMatch(/ซื้อของจริง \(หักสต๊อก\)/);
  });

  it("stock summary totals never include bill document amounts", () => {
    expect(SRC).toMatch(/matchesSource\(r, "real"\)/);
    expect(SRC).not.toMatch(/grand_total/);
    expect(SRC).not.toMatch(/rds_documents/);
  });
});
