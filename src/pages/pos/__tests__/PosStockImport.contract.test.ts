import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const IMPORT_SRC = fs.readFileSync(
  path.resolve(__dirname, "../PosStockImport.tsx"),
  "utf8",
);
const STOCK_SRC = fs.readFileSync(
  path.resolve(__dirname, "../PosStock.tsx"),
  "utf8",
);
const APP_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../../App.tsx"),
  "utf8",
);
const LIB_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../../lib/posProductImport.ts"),
  "utf8",
);

describe("PosStockImport contract", () => {
  it("import page never imports AdminLayout", () => {
    expect(IMPORT_SRC).not.toMatch(/AdminLayout/);
  });

  it("import page uses shared public.products via lib (no direct pos_* table)", () => {
    expect(LIB_SRC).toMatch(/\.from\(["']products["']\)/);
    expect(LIB_SRC).not.toMatch(/from\(["']pos_products["']\)/);
    expect(LIB_SRC).not.toMatch(/from\(["']pos_stock_products["']\)/);
  });

  it("import page provides both tabs and a back link to /pos/stock", () => {
    expect(IMPORT_SRC).toMatch(/pos-import-tab-create/);
    expect(IMPORT_SRC).toMatch(/pos-import-tab-edit/);
    expect(IMPORT_SRC).toMatch(/pos-import-back/);
    expect(IMPORT_SRC).toMatch(/\/pos\/stock/);
  });

  it("import page exposes both template download options", () => {
    expect(IMPORT_SRC).toMatch(/pos-import-tpl-general/);
    expect(IMPORT_SRC).toMatch(/pos-import-tpl-barcode/);
  });

  it("import page accepts only xlsx/xls", () => {
    expect(IMPORT_SRC).toMatch(/\\\.\(xlsx\|xls\)/);
  });

  it("import page guards against double-click via a lock ref", () => {
    expect(IMPORT_SRC).toMatch(/importLockRef/);
  });

  it("PosStock adds an 'ผ่านไฟล์ Excel' entry that routes to /pos/stock/import", () => {
    expect(STOCK_SRC).toMatch(/ผ่านไฟล์ Excel/);
    expect(STOCK_SRC).toMatch(/\/pos\/stock\/import/);
  });

  it("App.tsx wires /pos/stock/import inside PosShell", () => {
    // Import route must live inside the /pos parent (PosShell)
    expect(APP_SRC).toMatch(/path="stock\/import"[\s\S]{0,120}<PosStockImport/);
    expect(APP_SRC).toMatch(/<Route path="\/pos"[\s\S]*?<PosShell/);
  });
});
