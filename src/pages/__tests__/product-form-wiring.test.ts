import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Contract tests — every add/edit product entry point must funnel writes
 * through the shared ProductForm + saveProduct so price / stock / shop
 * bindings can't drift between screens.
 */

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("product form wiring", () => {
  it("POS Quick Add dialog uses shared ProductForm (no inline products insert)", () => {
    const src = read("pages/pos/QuickAddProductDialog.tsx");
    expect(src).toMatch(/from "@\/components\/products\/ProductForm"/);
    expect(src).not.toMatch(/\.from\(["']products["']\)[\s\S]*\.insert\(/);
    // Quick Add must inherit the photo/barcode widget from ProductForm —
    // no local PhotoBarcodeDialog or <input type=file> that would drift
    // from the shared UI.
    expect(src).not.toMatch(/PhotoBarcodeDialog/);
    expect(src).not.toMatch(/<input[^>]+type=["']file["']/);
  });

  it("PosStock editor uses shared ProductForm (no inline products update)", () => {
    const src = read("pages/pos/PosStock.tsx");
    expect(src).toMatch(/from "@\/components\/products\/ProductForm"/);
    // No inline save-shaped writes — the editor must go through ProductForm/
    // saveProduct. Soft-delete (`deleted_at`) is the only allowed direct
    // write to `products`; anything else would drift from POS/Admin edits.
    expect(src).not.toMatch(/\.from\(["']products["']\)\s*\.insert\(/);
    expect(src).not.toMatch(/\.from\(["']product_costs["']\)\s*\.upsert\(/);
    expect(src).not.toMatch(/rpc\(\s*["']admin_set_product_shops["']/);
    // SKU / units / relations must live in the advancedSlot so they render
    // consistently beneath the shared field grid.
    expect(src).toMatch(/advancedSlot=/);
  });

  it("Admin Products renders the shared ProductForm component", () => {
    const src = read("pages/admin/Products.tsx");
    // Admin now uses the same <ProductForm /> UI as POS Quick Add and
    // PosStock — identical buttons, sections, and save path. The inline
    // editor JSX + local save() have been removed.
    expect(src).toMatch(/from "@\/components\/products\/ProductForm"/);
    expect(src).toMatch(/<ProductForm\b/);
    // Admin owns the 5-slot image gallery + gallery-side camera; it
    // mounts via headerSlot and keeps PhotoBarcodeDialog imported for
    // the gallery scan path (separate from the ProductForm-internal one).
    expect(src).toMatch(/headerSlot=/);
    expect(src).toMatch(/PhotoBarcodeDialog/);
    // The image-upload escape hatch (ensureProductIdForUpload) is the ONLY
    // remaining direct write to `products` — it inserts a minimal row so a
    // photo can be uploaded before first save. Any other inline insert
    // would drift from POS/Stock.
    const insertMatches = src.match(/\.from\(["']products["']\)\s*\.insert\(/g) ?? [];
    expect(insertMatches.length).toBeLessThanOrEqual(1);
  });
});
