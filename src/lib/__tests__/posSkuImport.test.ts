import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  POS_SKU_TEMPLATE_HEADERS,
  buildPosSkuTemplateWorkbook,
  buildPosTemplateWorkbook,
  POS_TEMPLATE_HEADERS,
  detectPosImportKind,
  parsePosSkuImportFile,
  validatePosSkuRows,
  buildSkuErrorReportCSV,
  type PosSkuVariantRow,
  type ExistingParentSku,
} from "@/lib/posProductImport";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

function wbToFile(wb: XLSX.WorkBook, name = "t.xlsx"): File {
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { name, size: buf.byteLength, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", arrayBuffer: async () => buf } as unknown as File;
}

function row(over: Partial<PosSkuVariantRow>): PosSkuVariantRow {
  return {
    _row: 2, parent_code: "P1", parent_name: "Post-it", sku: "S1",
    attrs: [{ name: "ขนาด", value: "S" }, { name: "สี", value: "เหลือง" }],
    barcode: "", stock: 10, cost: null, price: null, low_stock_threshold: null,
    active: true, ...over,
  };
}

describe("SKU template — backward compat with normal templates", () => {
  it("normal barcode template still contains all its Thai headers", () => {
    const wb = buildPosTemplateWorkbook("barcode");
    const ws = wb.Sheets["Products"]!;
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
    for (const h of POS_TEMPLATE_HEADERS) expect(aoa[0]).toContain(h);
  });

  it("SKU template contains all mandated SKU headers + Thai SKU vs barcode explanation", () => {
    const wb = buildPosSkuTemplateWorkbook();
    const ws = wb.Sheets["Variants"]!;
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
    for (const h of POS_SKU_TEMPLATE_HEADERS) expect(aoa[0]).toContain(h);
    const info = XLSX.utils.sheet_to_csv(wb.Sheets["คำแนะนำ"]!);
    expect(info).toMatch(/SKU vs บาร์โค้ด/);
    expect(info).toMatch(/บาร์โค้ดตัวเลือก/);
  });

  it("SKU example is Post-it 3×4=12", () => {
    const wb = buildPosSkuTemplateWorkbook();
    const ws = wb.Sheets["Variants"]!;
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
    const dataRows = aoa.slice(1).filter((r) => (r[0] ?? "") !== "");
    expect(dataRows.length).toBe(12);
  });
});

describe("SKU detect + parse", () => {
  it("detects SKU vs normal templates", async () => {
    expect(await detectPosImportKind(wbToFile(buildPosSkuTemplateWorkbook()))).toBe("sku");
    expect(await detectPosImportKind(wbToFile(buildPosTemplateWorkbook("barcode")))).toBe("normal");
  });

  it("preserves leading-zero barcode in variant rows", async () => {
    const wb = buildPosSkuTemplateWorkbook();
    const ws = wb.Sheets["Variants"]!;
    XLSX.utils.sheet_add_aoa(ws, [[
      "POSTIT-01", "Post-it", "PT-X", "ขนาด", "S", "สี", "เหลือง", "", "",
      "0881234", 5, "", "", "", "active",
    ]], { origin: -1 });
    const ref = XLSX.utils.decode_range((ws as any)["!ref"]);
    const bcCol = POS_SKU_TEMPLATE_HEADERS.indexOf("บาร์โค้ดตัวเลือก");
    const addr = XLSX.utils.encode_cell({ r: ref.e.r, c: bcCol });
    const cell = (ws as any)[addr];
    if (cell) { cell.t = "s"; cell.v = "0881234"; cell.z = "@"; }
    const { rows } = await parsePosSkuImportFile(wbToFile(wb));
    const r = rows.find((x) => x.sku === "PT-X");
    expect(r?.barcode).toBe("0881234");
  });
});

describe("SKU validation", () => {
  const noBarcodes = new Set<string>();
  it("Post-it 3×4=12 all valid when parent will be created", () => {
    const rows: PosSkuVariantRow[] = [];
    ["S", "M", "L"].forEach((s, i) => {
      ["เหลือง", "ชมพู", "ฟ้า", "เขียว"].forEach((c, j) => {
        rows.push(row({
          _row: 2 + i * 4 + j, sku: `PT-${s}-${j}`,
          attrs: [{ name: "ขนาด", value: s }, { name: "สี", value: c }],
        }));
      });
    });
    const rep = validatePosSkuRows(rows, { mode: "create", existingParents: [], existingBarcodes: noBarcodes });
    expect(rep.totals.parents).toBe(1);
    expect(rep.totals.variants).toBe(12);
    expect(rep.totals.error).toBe(0);
    expect(rep.groups[0].status).toBe("ok");
  });

  it("rejects gapped attributes and >3 attributes", () => {
    const rep = validatePosSkuRows([
      row({ _row: 2, sku: "A", attrs: [{ name: "", value: "S" }] }),
      row({ _row: 3, sku: "B", attrs: [
        { name: "x", value: "1" }, { name: "y", value: "2" },
        { name: "z", value: "3" }, { name: "w", value: "4" },
      ] }),
    ], { mode: "create", existingParents: [], existingBarcodes: noBarcodes });
    expect(rep.totals.error).toBeGreaterThanOrEqual(2);
  });

  it("rejects duplicate combination and duplicate SKU per parent", () => {
    const rep = validatePosSkuRows([
      row({ _row: 2, sku: "A" }),
      row({ _row: 3, sku: "A" }),      // dup SKU
      row({ _row: 4, sku: "B" }),      // dup combo (same attrs as row 2)
    ], { mode: "create", existingParents: [], existingBarcodes: noBarcodes });
    const flat = rep.groups[0].variants.flatMap((v) => v.errors);
    expect(flat.some((m) => m.includes("SKU ซ้ำ"))).toBe(true);
    expect(flat.some((m) => m.includes("ชุดค่าคุณสมบัติซ้ำ"))).toBe(true);
  });

  it("rejects mismatched attribute order across a parent group", () => {
    const rep = validatePosSkuRows([
      row({ _row: 2, sku: "A", attrs: [{ name: "ขนาด", value: "S" }, { name: "สี", value: "แดง" }] }),
      row({ _row: 3, sku: "B", attrs: [{ name: "สี", value: "แดง" }, { name: "ขนาด", value: "S" }] }),
    ], { mode: "create", existingParents: [], existingBarcodes: noBarcodes });
    const errs = rep.groups[0].variants[1].errors.join(" | ");
    expect(errs).toMatch(/ชุดคุณสมบัติ/);
  });

  it("rejects duplicate barcode in file and duplicate in DB", () => {
    const rep = validatePosSkuRows([
      row({ _row: 2, sku: "A", barcode: "111", attrs: [{ name: "ขนาด", value: "S" }] }),
      row({ _row: 3, sku: "B", barcode: "111", attrs: [{ name: "ขนาด", value: "M" }] }),
      row({ _row: 4, sku: "C", barcode: "222", attrs: [{ name: "ขนาด", value: "L" }] }),
    ], { mode: "create", existingParents: [], existingBarcodes: new Set(["222"]) });
    const g = rep.groups[0];
    const allErrs = g.variants.flatMap((v) => v.errors).join(" | ");
    expect(allErrs).toMatch(/บาร์โค้ดซ้ำในไฟล์/);
    expect(allErrs).toMatch(/มีในระบบแล้ว/);
  });

  it("create mode: existing SKU-enabled parent → dedup existing SKUs as warnings", () => {
    const parent: ExistingParentSku = {
      id: "p1", code: "P1", has_variants: true,
      variants: [{ id: "v1", sku: "S1", barcode: null, attributes: {} }],
    };
    const rep = validatePosSkuRows([
      row({ _row: 2, sku: "S1" }),
      row({ _row: 3, sku: "S2", attrs: [{ name: "ขนาด", value: "S" }, { name: "สี", value: "แดง" }] }),
    ], { mode: "create", existingParents: [parent], existingBarcodes: noBarcodes });
    const g = rep.groups[0];
    expect(g.variants[0].warnings.join(" ")).toMatch(/ข้ามเมื่อบันทึกซ้ำ/);
    expect(g.variants[1].status).toBe("ok");
  });

  it("edit mode: parent must exist and be SKU-enabled; SKU must match", () => {
    const parent: ExistingParentSku = {
      id: "p1", code: "P1", has_variants: true,
      variants: [{ id: "v1", sku: "S1", barcode: null, attributes: {} }],
    };
    const r1 = validatePosSkuRows([row({ sku: "S1" })],
      { mode: "edit", existingParents: [], existingBarcodes: noBarcodes });
    expect(r1.groups[0].errors.join(" ")).toMatch(/ไม่พบสินค้าหลัก/);

    const notEnabled: ExistingParentSku = { ...parent, has_variants: false, variants: [] };
    const r2 = validatePosSkuRows([row({ sku: "S1" })],
      { mode: "edit", existingParents: [notEnabled], existingBarcodes: noBarcodes });
    expect(r2.groups[0].errors.join(" ")).toMatch(/ยังไม่ได้เปิดโหมด SKU/);

    const r3 = validatePosSkuRows([row({ sku: "MISSING" })],
      { mode: "edit", existingParents: [parent], existingBarcodes: noBarcodes });
    expect(r3.groups[0].variants[0].errors.join(" ")).toMatch(/ไม่พบ SKU/);
  });

  it("create mode: new parent requires parent name", () => {
    const rep = validatePosSkuRows([row({ parent_name: "" })],
      { mode: "create", existingParents: [], existingBarcodes: noBarcodes });
    expect(rep.groups[0].errors.join(" ")).toMatch(/ชื่อสินค้าหลัก/);
  });

  it("error report CSV includes only error/warning rows", () => {
    const rep = validatePosSkuRows([
      row({ _row: 2, sku: "" }),      // error
      row({ _row: 3, sku: "OK" }),    // ok (different combo)
    ], { mode: "create", existingParents: [], existingBarcodes: noBarcodes });
    const csv = buildSkuErrorReportCSV(rep);
    expect(csv).toMatch(/row,parent_code,sku,status/);
    expect(csv).toMatch(/,error,/);
    expect(csv).not.toMatch(/,OK,/);
  });
});
