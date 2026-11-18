import { describe, it, expect } from "vitest";
import { smartParseText, smartParseMatrix, applyMapping, toNumber } from "../smartParse";

describe("smartParseText", () => {
  it("parses tab-separated rows", () => {
    const { rows } = smartParseText("ถ่ายเอกสาร\t2\t100\tแผ่น\nปริ้นสี A4\t15\t10\tแผ่น");
    expect(rows).toEqual([
      { name: "ถ่ายเอกสาร", price: 2, quantity: 100, unit: "แผ่น" },
      { name: "ปริ้นสี A4", price: 15, quantity: 10, unit: "แผ่น" },
    ]);
  });

  it("parses CSV with english header", () => {
    const { rows, meta } = smartParseText("name,price,qty,unit\nPaper A4,120,5,ream\nPen,15,10,pcs");
    expect(meta.hasHeader).toBe(true);
    expect(rows[0]).toEqual({ name: "Paper A4", price: 120, quantity: 5, unit: "ream" });
    expect(rows[1].unit).toBe("pcs");
  });

  it("handles thai header with reordered columns", () => {
    const text = "จำนวน\tหน่วย\tชื่อสินค้า\tราคา\n5\tรีม\tกระดาษ A4\t120\n10\tแผ่น\tปริ้นสี\t15";
    const { rows, meta } = smartParseText(text);
    expect(meta.hasHeader).toBe(true);
    expect(rows[0]).toEqual({ name: "กระดาษ A4", price: 120, quantity: 5, unit: "รีม" });
  });

  it("handles currency symbols and thousand separators (tab)", () => {
    const { rows } = smartParseText("name\tprice\tqty\tunit\nหมึก\t฿1,250.00\t2\tกล่อง");
    expect(rows[0].price).toBe(1250);
    expect(rows[0].quantity).toBe(2);
  });

  it("skips total/summary lines", () => {
    const text = "Paper,120,5,ream\nPen,15,10,pcs\nรวมทั้งสิ้น,1,800,";
    const { rows } = smartParseText(text);
    expect(rows).toHaveLength(2);
  });

  it("strips leading numbering", () => {
    const { rows } = smartParseText("1. Paper\t120\t5\tream\n2) Pen\t15\t10\tpcs");
    expect(rows[0].name).toBe("Paper");
    expect(rows[1].name).toBe("Pen");
  });

  it("infers columns without header (space-delimited from PDF/chat)", () => {
    const text = "กระดาษ A4  120  5  รีม\nปริ้นสี      15   10  แผ่น";
    const { rows } = smartParseText(text);
    expect(rows[0].name).toContain("กระดาษ");
    expect(rows[0].price).toBe(120);
    expect(rows[0].quantity).toBe(5);
    expect(rows[0].unit).toBe("รีม");
  });

  it("handles pipe delimiter", () => {
    const { rows } = smartParseText("Paper|120|5|ream\nPen|15|10|pcs");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ name: "Pen", price: 15, quantity: 10, unit: "pcs" });
  });

  it("single-line fallback with ฿ and x prefix", () => {
    const { rows } = smartParseText("ปริ้นสี ฿15 x10 แผ่น");
    expect(rows[0]).toEqual({ name: "ปริ้นสี", price: 15, quantity: 10, unit: "แผ่น" });
  });
});

describe("toNumber — flexible numeric formats", () => {
  it("strips ฿ and บาท and commas", () => {
    expect(toNumber("฿1,250.00")).toBe(1250);
    expect(toNumber("1,250 บาท")).toBe(1250);
  });
  it("handles space-thousand separators", () => {
    expect(toNumber("1 250")).toBe(1250);
    expect(toNumber("1 250.75")).toBe(1250.75);
    expect(toNumber("1 000 000")).toBe(1000000);
  });
  it("handles narrow no-break space (Excel exports)", () => {
    expect(toNumber("1\u00A0250")).toBe(1250);
    expect(toNumber("1\u202F250.50")).toBe(1250.5);
  });
  it("handles european comma-decimal", () => {
    expect(toNumber("1.250,00")).toBe(1250);
    expect(toNumber("12,50")).toBe(12.5);
  });
  it("handles apostrophe thousand separator", () => {
    expect(toNumber("1'250.00")).toBe(1250);
  });
  it("handles parenthesised negatives", () => {
    expect(toNumber("(1,250)")).toBe(-1250);
  });
  it("strips leading x prefix", () => {
    expect(toNumber("x10")).toBe(10);
  });
  it("returns null for non-numeric", () => {
    expect(toNumber("กระดาษ")).toBeNull();
    expect(toNumber("")).toBeNull();
  });
});

describe("smartParseText — edge cases", () => {
  it("reports rows that cannot be parsed", () => {
    const text = "name,price,qty,unit\n,100,1,ชิ้น\nPaper,120,5,ream";
    const { rows, errors } = smartParseText(text);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/ชื่อ/);
    expect(errors[0].line).toBe(2);
  });

  it("handles space-thousand prices inside the table", () => {
    const text = "name\tprice\tqty\tunit\nหมึก\t1 250.00\t2\tกล่อง";
    const { rows } = smartParseText(text);
    expect(rows[0].price).toBe(1250);
  });

  it("handles multiple tables separated by blank lines", () => {
    const text = [
      "Paper\t120\t5\tream",
      "",
      "",
      "Pen\t15\t10\tpcs",
      "Ink\t250\t2\tbottle",
    ].join("\n");
    const { rows } = smartParseText(text);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(["Paper", "Pen", "Ink"]);
  });

  it("skips summary rows in long tables", () => {
    const text = [
      "ชื่อ\tราคา\tจำนวน\tหน่วย",
      "กระดาษ\t120\t5\tรีม",
      "ปากกา\t15\t10\tด้าม",
      "รวมทั้งสิ้น\t\t\t",
      "ยอดสุทธิ\t1800\t\t",
    ].join("\n");
    const { rows, meta } = smartParseText(text);
    expect(rows).toHaveLength(2);
    expect(meta.hasHeader).toBe(true);
  });

  it("works without header (only numeric rows)", () => {
    const text = "กระดาษ A4\t120\t5\tรีม\nปริ้นสี\t15\t10\tแผ่น";
    const { rows, meta } = smartParseText(text);
    expect(meta.hasHeader).toBe(false);
    expect(rows).toHaveLength(2);
  });
});

describe("applyMapping — user override", () => {
  it("re-derives rows when user swaps columns", () => {
    const matrix = [
      ["120", "5", "กระดาษ A4", "รีม"],
      ["15", "10", "ปริ้นสี", "แผ่น"],
    ];
    const { rows } = applyMapping(matrix, { name: 2, price: 0, quantity: 1, unit: 3 }, false);
    expect(rows[0]).toEqual({ name: "กระดาษ A4", price: 120, quantity: 5, unit: "รีม" });
    expect(rows[1].name).toBe("ปริ้นสี");
  });
});

describe("smartParseMatrix", () => {
  it("uses header when present", () => {
    const { rows } = smartParseMatrix([
      ["ชื่อสินค้า", "ราคา", "จำนวน", "หน่วย"],
      ["กระดาษ", 120, 5, "รีม"],
    ]);
    expect(rows[0]).toEqual({ name: "กระดาษ", price: 120, quantity: 5, unit: "รีม" });
  });

  it("infers when header missing", () => {
    const { rows } = smartParseMatrix([
      ["กระดาษ A4", 120, 5, "รีม"],
      ["ปริ้นสี", 15, 10, "แผ่น"],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].price).toBe(120);
  });
});

describe("smartParse — purchase order layout (name | qty | unit | price | amount)", () => {
  it("parses thai PO header with 5 columns", () => {
    const text = [
      "รายการ\tจำนวน\tหน่วย\tราคาต่อหน่วย (บาท)\tจำนวนเงิน (บาท)",
      "ถ่ายเอกสาร\t2\tแผ่น\t100\t200",
      "ปริ้นสี A4\t10\tแผ่น\t15\t150",
    ].join("\n");
    const { rows, meta } = smartParseText(text);
    expect(meta.hasHeader).toBe(true);
    expect(rows[0]).toEqual({ name: "ถ่ายเอกสาร", quantity: 2, unit: "แผ่น", price: 100 });
    expect(rows[1]).toEqual({ name: "ปริ้นสี A4", quantity: 10, unit: "แผ่น", price: 15 });
  });

  it("infers PO order without header (name qty unit price)", () => {
    const text = "ถ่ายเอกสาร\t2\tแผ่น\t100\nปริ้นสี A4\t10\tแผ่น\t15";
    const { rows, meta } = smartParseText(text);
    expect(meta.hasHeader).toBe(false);
    expect(rows[0]).toEqual({ name: "ถ่ายเอกสาร", quantity: 2, unit: "แผ่น", price: 100 });
    expect(rows[1].price).toBe(15);
    expect(rows[1].quantity).toBe(10);
  });

  it("back-fills price from amount when price column is blank", () => {
    const text = [
      "รายการ,จำนวน,หน่วย,ราคาต่อหน่วย,จำนวนเงิน",
      "ปากกา,10,ด้าม,,150",
    ].join("\n");
    const { rows } = smartParseText(text);
    expect(rows[0].quantity).toBe(10);
    expect(rows[0].price).toBe(15);
  });

  it("still supports legacy [name, price, qty, unit] when col3 is not a unit", () => {
    const { rows } = smartParseText("กระดาษ A4\t120\t5\tรีม\nปริ้นสี\t15\t10\tแผ่น");
    // col[2] is numeric (5,10) — falls back to legacy ordering
    expect(rows[0].price).toBe(120);
    expect(rows[0].quantity).toBe(5);
    expect(rows[0].unit).toBe("รีม");
  });
});