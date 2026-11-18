import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const products = readFileSync("src/pages/admin/Products.tsx", "utf8");

describe("product status filter + stock visibility", () => {
  it("exposes a real status filter with all five options", () => {
    expect(products).toContain('data-testid="product-status-filter"');
    for (const label of ["ทั้งหมด", "เปิดขาย", "ปิดขาย", "ใกล้หมด", "หมดสต๊อก"]) {
      expect(products).toContain(label);
    }
    expect(products).toMatch(/statusFilter !== "all"/);
  });

  it("derives low/out from real stock + low_stock_threshold without mutating them", () => {
    expect(products).toMatch(/statusFilter === "low"[\s\S]*?st <= th/);
    expect(products).toMatch(/statusFilter === "out"[\s\S]*?st > 0/);
    // the filter block must not write stock back to the DB
    const block = products.slice(products.indexOf('if (statusFilter !== "all")'), products.indexOf("const bulk ="));
    expect(block).not.toMatch(/supabase|update\(|\.rpc\(/);
  });

  it("shows คงเหลือ in table, grid and mobile views", () => {
    expect(products).toContain(">คงเหลือ</th>");
    expect(products).toContain('data-testid="product-stock-cell"');
    expect(products).toContain('data-testid="product-stock-grid"');
    expect(products).toContain('data-testid="product-stock-mobile"');
    expect(products).toContain("text-destructive");
    expect(products).toContain("text-warning");
  });

  it("keeps the table inside a horizontal scroll container", () => {
    expect(products).toContain('<div className="overflow-x-auto">');
  });
});
