import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  POS_TEMPLATE_HEADERS,
  buildPosTemplateWorkbook,
  parsePosImportFile,
  validatePosRows,
  generateUniqueProductCode,
  buildErrorReportCSV,
  type PosImportRow,
} from "@/lib/posProductImport";

// Silence the Supabase client env warning for pure-fn tests
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

function wbToFile(wb: XLSX.WorkBook, name = "t.xlsx"): File {
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const fake: any = {
    name,
    size: buf.byteLength,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    arrayBuffer: async () => buf,
  };
  return fake as File;
}

function makeRow(over: Partial<PosImportRow> = {}): PosImportRow {
  return {
    _row: 2, code: "", name: "สินค้า", category: "", stock: 1, unit: "ชิ้น",
    cost_price: 1, standard_price: 2, barcode_mode: null, barcode: "",
    low_stock_threshold: 5, description: "",
    base_code: "", base_ratio: null,
    ...over,
  };
}

describe("posProductImport — template headers", () => {
  it("headers include all required Thai columns", () => {
    for (const h of [
      "รหัสสินค้า","ชื่อสินค้า","หมวดหมู่","จำนวน","หน่วยนับ",
      "ต้นทุน","ราคาขาย","รูปแบบบาร์โค้ด (1 หรือ 2)","รหัสบาร์โค้ด",
      "จุดเตือนสต๊อกต่ำ","รายละเอียด",
    ]) expect(POS_TEMPLATE_HEADERS).toContain(h);
  });

  it("barcode template workbook includes instruction sheet and Products sheet", () => {
    const wb = buildPosTemplateWorkbook("barcode");
    expect(wb.SheetNames).toContain("คำแนะนำ");
    expect(wb.SheetNames).toContain("Products");
  });

  it("general template exists and mentions modes in instructions", () => {
    const wb = buildPosTemplateWorkbook("general");
    const ws = wb.Sheets["คำแนะนำ"]!;
    const csv = XLSX.utils.sheet_to_csv(ws);
    expect(csv).toMatch(/โหมด 1/);
    expect(csv).toMatch(/โหมด 2/);
  });
});

describe("posProductImport — parse preserves leading zeros", () => {
  it("keeps a barcode string with leading zero intact", async () => {
    const wb = buildPosTemplateWorkbook("barcode");
    // Add a row with barcode as literal text 0881
    const ws = wb.Sheets["Products"]!;
    XLSX.utils.sheet_add_aoa(ws, [
      ["", "test", "cat", 1, "ชิ้น", 1, 2, 2, "0881234", 3, ""],
    ], { origin: -1 });
    // Force text
    const ref = (ws as any)["!ref"] ? XLSX.utils.decode_range((ws as any)["!ref"]) : null;
    if (ref) {
      const addr = XLSX.utils.encode_cell({ r: ref.e.r, c: 8 });
      const cell = (ws as any)[addr];
      if (cell) { cell.t = "s"; cell.v = "0881234"; cell.z = "@"; }
    }
    const f = wbToFile(wb);
    const { rows } = await parsePosImportFile(f);
    const found = rows.find((r) => r.name === "test");
    expect(found?.barcode).toBe("0881234");
  });
});

describe("posProductImport — validation & barcode modes", () => {
  it("mode 2 requires barcode; mode 1 warns when barcode differs from code", () => {
    const rows: PosImportRow[] = [
      makeRow({ _row: 2, code: "A", name: "n1", barcode_mode: 2, barcode: "" }),
      makeRow({ _row: 3, code: "B", name: "n2", barcode_mode: 1, barcode: "999" }),
    ];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    expect(rep.rows[0].errors.some((e) => e.includes("โหมด 2"))).toBe(true);
    expect(rep.rows[1].warnings.length).toBeGreaterThan(0);
  });

  it("rejects invalid mode value", () => {
    const rows: PosImportRow[] = [
      // parser only emits 1/2/null so mock a raw invalid mode
      makeRow({ _row: 2, name: "x", barcode_mode: 9 as any }),
    ];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    expect(rep.rows[0].errors.some((e) => e.includes("รูปแบบบาร์โค้ด"))).toBe(true);
  });

  it("detects duplicates within the same file (code and barcode)", () => {
    const rows: PosImportRow[] = [
      makeRow({ _row: 2, code: "DUP", name: "a" }),
      makeRow({ _row: 3, code: "DUP", name: "b" }),
      makeRow({ _row: 4, code: "X", name: "c", barcode: "111", barcode_mode: 2 }),
      makeRow({ _row: 5, code: "Y", name: "d", barcode: "111", barcode_mode: 2 }),
    ];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    expect(rep.totals.duplicate).toBeGreaterThanOrEqual(2);
    expect(rep.rows[1].status).toBe("error");
    expect(rep.rows[3].status).toBe("error");
  });

  it("create mode rejects existing DB code/barcode; edit mode matches", () => {
    const rows: PosImportRow[] = [
      makeRow({ _row: 2, code: "EXIST", name: "x" }),
      makeRow({ _row: 3, code: "MISSING", name: "y" }),
    ];
    const existing = [{ id: "p1", code: "EXIST", barcode: null }];
    const create = validatePosRows(rows, { mode: "create", existing });
    expect(create.rows[0].status).toBe("error");
    const edit = validatePosRows(rows, { mode: "edit", existing });
    expect(edit.rows[0].status).toBe("ok");
    expect(edit.rows[0].matchProductId).toBe("p1");
    expect(edit.rows[1].status).toBe("error"); // no match
  });

  it("rejects negative numeric values", () => {
    const rows = [makeRow({ _row: 2, name: "n", stock: -1 })];
    const rep = validatePosRows(rows, { mode: "create", existing: [] });
    expect(rep.rows[0].errors.some((e) => e.includes("จำนวน"))).toBe(true);
  });
});

describe("posProductImport — utilities", () => {
  it("generateUniqueProductCode avoids taken codes", async () => {
    const taken = new Set<string>();
    const a = await generateUniqueProductCode(taken);
    const b = await generateUniqueProductCode(taken);
    expect(a).not.toBe(b);
    expect(a.startsWith("POS-")).toBe(true);
  });

  it("buildErrorReportCSV includes only error/warning rows", () => {
    const rep = validatePosRows(
      [makeRow({ _row: 2, name: "" }), makeRow({ _row: 3, name: "good" })],
      { mode: "create", existing: [] },
    );
    const csv = buildErrorReportCSV(rep);
    expect(csv).toMatch(/row,code,name,status/);
    expect(csv).toMatch(/,error,/);
    // "good" is ok and should NOT appear
    expect(csv).not.toMatch(/,good,/);
  });
});
