/**
 * Excel export must respect the same visible-column choices the user makes
 * in the print settings panel. This test drives `exportDocumentAsXlsx` and
 * inspects the AoA payload passed to `XLSX.utils.aoa_to_sheet` to prove
 * hidden columns are removed from both header and value rows.
 */
import { describe, it, expect, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const capturedRows: any[][][] = [];
  return {
    capturedRows,
    aoa_to_sheet: vi.fn((rows: any[][]) => {
      capturedRows.push(rows);
      return { "!ref": "A1" } as any;
    }),
    book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
    book_append_sheet: vi.fn(),
    writeFile: vi.fn(),
  };
});

vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: hoisted.aoa_to_sheet,
    book_new: hoisted.book_new,
    book_append_sheet: hoisted.book_append_sheet,
  },
  writeFile: hoisted.writeFile,
}));

import { exportDocumentAsXlsx } from "../documentExports";
const { capturedRows } = hoisted;

const baseState: any = {
  document_type: "receipt",
  document_date: "2026-01-01",
  customer_name: "ลูกค้า",
  vat_mode: "none",
  payment_method: "cash",
  items: [],
};
const totals: any = { subtotal: 300, grand_total: 300, net_total: 300, amount_before_vat: 0, vat_amount: 0, withholding_tax_amount: 0 };
const items: any[] = [
  { key: "1", name: "A", description: "d", price: 100, quantity: 3, unit: "ชิ้น", discount_percent: 0, discount_amount: 0 },
];

function itemHeaderRow(rows: any[][]): any[] {
  return rows.find((r) => r.includes("ลำดับ") && r.includes("รายการ")) as any[];
}

describe("exportDocumentAsXlsx · hiddenColumns", () => {
  it("includes every column by default", () => {
    capturedRows.length = 0;
    exportDocumentAsXlsx({ state: baseState, totals, items, store: null, docNo: "R-1" });
    const header = itemHeaderRow(capturedRows[0]);
    expect(header).toEqual(["ลำดับ", "รายการ", "รายละเอียด", "จำนวน", "หน่วย", "ราคา/หน่วย", "จำนวนเงิน"]);
  });

  it("drops hidden qty / unit / price columns from header and values", () => {
    capturedRows.length = 0;
    exportDocumentAsXlsx({
      state: baseState, totals, items, store: null, docNo: "R-1",
      hiddenColumns: ["qty", "unit", "price"],
    });
    const rows = capturedRows[0];
    const header = itemHeaderRow(rows);
    expect(header).toEqual(["ลำดับ", "รายการ", "รายละเอียด", "จำนวนเงิน"]);
    const itemIdx = rows.indexOf(header) + 1;
    // The item row should have exactly 4 cells (index, name, desc, total).
    expect(rows[itemIdx]).toHaveLength(4);
    expect(rows[itemIdx][0]).toBe(1);
    // Money cells are wrapped as XLSX cell objects with an explicit
    // "#,##0.00" number format so Excel renders `.00` consistently.
    const totalCell: any = rows[itemIdx][3];
    expect(totalCell).toMatchObject({ v: 300, t: "n", z: "#,##0.00" });
  });
});

describe("exportDocumentAsXlsx · money formatting", () => {
  it("wraps price/total/totals cells with number format #,##0.00 and never emits ฿", () => {
    capturedRows.length = 0;
    exportDocumentAsXlsx({
      state: { ...baseState, vat_mode: "exclusive", vat_rate: 7, withholding_tax_enabled: true, withholding_tax_rate: 3 } as any,
      totals: { subtotal: 300, amount_before_vat: 300, vat_amount: 21, grand_total: 321, net_total: 311.37, withholding_tax_amount: 9.63 } as any,
      items, store: null, docNo: "R-2",
    });
    const rows = capturedRows[0];

    // Every money cell is an object with the .00 number format.
    const money = rows.flat().filter((c: any) => c && typeof c === "object" && "v" in c && "z" in c);
    expect(money.length).toBeGreaterThan(0);
    for (const cell of money as any[]) {
      expect(cell.t).toBe("n");
      expect(cell.z).toBe("#,##0.00");
    }

    // No ฿ symbol anywhere in the sheet (headers, labels, or values).
    const flat = rows.flat().map((c: any) => (c && typeof c === "object" ? String(c.v) : String(c ?? "")));
    for (const s of flat) expect(s).not.toContain("฿");

    // Totals rows carry money cells for subtotal / before-vat / vat /
    // withholding / grand total.
    const labels = ["รวม", "ก่อน VAT", "VAT 7%", "หัก ณ ที่จ่าย 3%", "ยอดรวม"];
    for (const lbl of labels) {
      const row = rows.find((r: any[]) => r.includes(lbl));
      expect(row, `row for ${lbl}`).toBeTruthy();
      const last: any = row![row!.length - 1];
      expect(last).toMatchObject({ t: "n", z: "#,##0.00" });
    }
  });
});