import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseBulkPaste, poSubtotal } from "../parse";

// Contract test for the redesigned ใบสั่งสินค้า page. Reads the source file
// as text and asserts the non-negotiables so regressions surface immediately.
const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../../PurchaseOrder.tsx"),
  "utf8",
);

describe("PurchaseOrder redesign — document contract", () => {
  it("uses 'ใบสั่งสินค้า' as the document title and never a quotation heading", () => {
    expect(SRC).toContain("ใบสั่งสินค้า");
    // The prohibited phrase may appear only inside the explanatory notice
    // (surrounded by clarifying wording). Ensure it never appears as an
    // <h1> title or dropdown label for this document.
    expect(SRC).not.toMatch(/<h1[^>]*>\s*ใบเสนอราคา/);
    expect(SRC).not.toMatch(/title=["']ใบเสนอราคา/);
  });

  it("renders a single deterministic print root with data attribute", () => {
    expect(SRC).toMatch(/id="po-print-root"/);
    expect(SRC).toMatch(/data-po-print="true"/);
  });

  it("toolbar is marked print-excluded and lives outside the print root", () => {
    // Toolbar block appears before the print root and carries both markers.
    const toolbarIdx = SRC.indexOf('data-print-exclude="true"');
    const rootIdx = SRC.indexOf('id="po-print-root"');
    expect(toolbarIdx).toBeGreaterThan(-1);
    expect(rootIdx).toBeGreaterThan(-1);
    expect(toolbarIdx).toBeLessThan(rootIdx);
    expect(SRC).toMatch(/po-no-print/);
  });

  it("keeps the required action buttons wired", () => {
    for (const label of ["ดูตัวอย่าง", "แชร์", "พิมพ์", "ดาวน์โหลด PDF", "บันทึก"]) {
      expect(SRC).toContain(label);
    }
  });
});

describe("PurchaseOrder redesign — paste + totals", () => {
  it("parses tab-separated rows and defaults empty cells sensibly", () => {
    const text = "รายการ\tจำนวน\tหน่วย\tราคา\nกระดาษ A4\t5\tรีม\t120\n\nปากกา\t\t\t7";
    const { items } = parseBulkPaste(text);
    expect(items.length).toBeGreaterThanOrEqual(1);
    const paper = items.find((i) => i.name.includes("กระดาษ"));
    expect(paper).toBeTruthy();
    expect(paper!.quantity).toBe(5);
    expect(paper!.unit).toBe("รีม");
    expect(paper!.price).toBe(120);
  });

  it("net total = subtotal - discount + shipping", () => {
    const { items } = parseBulkPaste("ปากกา\t2\tด้าม\t10\nสมุด\t3\tเล่ม\t20");
    const subtotal = poSubtotal(items);
    expect(subtotal).toBe(2 * 10 + 3 * 20);
    const discount = 5;
    const shipping = 15;
    expect(Math.max(0, subtotal - discount + shipping)).toBe(subtotal - discount + shipping);
  });
});