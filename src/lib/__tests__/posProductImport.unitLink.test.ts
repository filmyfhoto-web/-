import { describe, it, expect, vi } from "vitest";
import {
  buildPosTemplateWorkbook,
  POS_TEMPLATE_HEADERS,
  validatePosRows,
  type PosImportRow,
} from "@/lib/posProductImport";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

function makeRow(over: Partial<PosImportRow> = {}): PosImportRow {
  return {
    _row: 2, code: "", name: "สินค้า", category: "", stock: 1, unit: "ชิ้น",
    cost_price: 1, standard_price: 2, barcode_mode: null, barcode: "",
    low_stock_threshold: 5, description: "",
    base_code: "", base_ratio: null,
    ...over,
  };
}

describe("posProductImport — linked-unit columns in template", () => {
  it("template headers include the 2 new columns", () => {
    expect(POS_TEMPLATE_HEADERS).toContain("รหัสสินค้าหน่วยเล็ก");
    expect(POS_TEMPLATE_HEADERS).toContain("อัตราส่วนต่อหน่วยใหญ่");
  });

  it("general template ships a PEN-BASE / PEN-PACK4 / PEN-CARTON40 example", () => {
    const wb = buildPosTemplateWorkbook("general");
    const csv = require("xlsx").utils.sheet_to_csv(wb.Sheets["Products"]);
    expect(csv).toMatch(/PEN-BASE/);
    expect(csv).toMatch(/PEN-PACK4/);
    expect(csv).toMatch(/PEN-CARTON40/);
  });
});

describe("posProductImport — per-row linked-unit validation", () => {
  it("requires both columns together", () => {
    const rows = [
      makeRow({ _row: 2, code: "A", name: "a", base_code: "B", base_ratio: null }),
      makeRow({ _row: 3, code: "B", name: "b", base_code: "", base_ratio: 4 }),
    ];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    expect(rep.rows[0].errors.some((e) => e.includes("อัตราส่วน"))).toBe(true);
    expect(rep.rows[1].errors.some((e) => e.includes("รหัสสินค้าหน่วยเล็ก"))).toBe(true);
  });

  it("rejects non-positive-integer ratio", () => {
    const rows = [makeRow({ code: "PACK", name: "p", base_code: "BASE", base_ratio: 0 })];
    const rep = validatePosRows(rows, { mode: "create", existing: [{ id: "b1", code: "BASE", barcode: null }] });
    expect(rep.rows[0].status).toBe("error");
  });

  it("rejects self-link", () => {
    const rows = [makeRow({ code: "SAME", name: "x", base_code: "SAME", base_ratio: 2 })];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    expect(rep.rows[0].errors.some((e) => e.includes("ห้ามผูก"))).toBe(true);
  });
});

describe("posProductImport — cross-row linked-unit validation", () => {
  it("rejects unknown base_code (not in file nor DB)", () => {
    const rows = [makeRow({ code: "W1", name: "w", base_code: "GHOST", base_ratio: 4 })];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    expect(rep.rows[0].errors.some((e) => e.includes("ไม่พบ"))).toBe(true);
  });

  it("accepts base_code present in same file", () => {
    const rows = [
      makeRow({ _row: 2, code: "BASE", name: "b" }),
      makeRow({ _row: 3, code: "PACK", name: "p", base_code: "BASE", base_ratio: 4 }),
    ];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    expect(rep.rows[1].status).toBe("ok");
  });

  it("accepts base_code present in DB even when not in file", () => {
    const rows = [makeRow({ code: "PACK", name: "p", base_code: "DBBASE", base_ratio: 4 })];
    const rep = validatePosRows(rows, {
      mode: "create",
      existing: [
        { id: "pack-id-x", code: "OTHER", barcode: null },
        { id: "dbbase-id", code: "DBBASE", barcode: null },
      ],
    });
    // Note: "PACK" is not in DB so create-mode passes the code-uniqueness check;
    // linked-unit second pass resolves DBBASE from DB and accepts.
    expect(rep.rows[0].status).toBe("ok");
  });

  it("rejects chain: base row itself has a base", () => {
    const rows = [
      makeRow({ _row: 2, code: "BASE", name: "b" }),
      makeRow({ _row: 3, code: "MID", name: "m", base_code: "BASE", base_ratio: 4 }),
      makeRow({ _row: 4, code: "TOP", name: "t", base_code: "MID", base_ratio: 10 }),
    ];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    expect(rep.rows[2].errors.some((e) => e.includes("ผูกซ้อน"))).toBe(true);
  });

  it("rejects promotion: this wrapper is used as another row's base", () => {
    const rows = [
      makeRow({ _row: 2, code: "BASE", name: "b" }),
      makeRow({ _row: 3, code: "MID", name: "m", base_code: "BASE", base_ratio: 4 }),
      // MID cannot itself become a wrapper of BASE later
      makeRow({ _row: 4, code: "OTHER", name: "o", base_code: "MID", base_ratio: 2 }),
    ];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    // MID must fail (it's a base for OTHER while also being a wrapper of BASE)
    expect(rep.rows[1].status).toBe("error");
  });
});