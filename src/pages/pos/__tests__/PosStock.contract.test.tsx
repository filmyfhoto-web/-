import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Contract tests for /pos/stock — verify by SOURCE INSPECTION that:
 *  - the page reads/writes the canonical `public.products` (same as /admin/products)
 *  - it does NOT create a POS-only product table or bypass the shared editor
 *  - it wires the crop dialog (ImageResizeDialog) and relations editor
 *  - it never imports AdminLayout (must render inside PosShell only)
 */

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../PosStock.tsx"),
  "utf8",
);

describe("PosStock source contract", () => {
  it("uses public.products (shared table) for read + write", () => {
    expect(SRC).toMatch(/\.from\(["']products["']\)/);
    // Must not touch pos_products (film-shop legacy) or invent a new table.
    expect(SRC).not.toMatch(/from\(["']pos_products["']\)/);
    expect(SRC).not.toMatch(/from\(["']pos_stock_products["']\)/);
  });

  it("wires the reusable image crop dialog and product relations editor", () => {
    expect(SRC).toMatch(/ImageResizeDialog/);
    expect(SRC).toMatch(/ProductRelationsSections/);
  });

  it("must not import AdminLayout (POS is a separate workspace)", () => {
    expect(SRC).not.toMatch(/AdminLayout/);
  });

  it("supports both list + editor split view", () => {
    expect(SRC).toMatch(/pos-stock-list/);
    expect(SRC).toMatch(/pos-stock-editor/);
    expect(SRC).toMatch(/pos-stock-split/);
  });
});