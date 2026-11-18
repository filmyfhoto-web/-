import { describe, expect, it } from "vitest";
import { cleanNumber, parseSmartImport } from "@/lib/smartImport";
import { grandTotal, lineTotal, formatThaiDate } from "@/lib/schoolRequisition";

describe("cleanNumber", () => {
  it("ล้าง comma / ฿ / บาท", () => {
    expect(cleanNumber("1,250.50")).toBe(1250.5);
    expect(cleanNumber("฿125")).toBe(125);
    expect(cleanNumber("85 บาท")).toBe(85);
    expect(cleanNumber("กระดาษ")).toBeNull();
  });
});

describe("parseSmartImport", () => {
  const tabbed = [
    "รายการสินค้า\tราคา\tจำนวน",
    "กระดาษถ่ายเอกสาร A4 80 แกรม\t125\t10",
    "ปากกาลูกลื่น น้ำเงิน\t150\t5",
    "",
    "แฟ้มสันกว้าง 3 นิ้ว สีฟ้า\t120\t10",
  ].join("\n");

  it("อ่านตารางที่มีหัวคอลัมน์จาก Excel", () => {
    const res = parseSmartImport(tabbed);
    expect(res.usedHeader).toBe(true);
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toMatchObject({ name: "กระดาษถ่ายเอกสาร A4 80 แกรม", price: 125, qty: 10, order: 1 });
    expect(res.rows[2].name).toBe("แฟ้มสันกว้าง 3 นิ้ว สีฟ้า");
    expect(res.rows.every((r) => !r.needsReview)).toBe(true);
  });

  it("คำนวณยอดรวมถูกต้อง", () => {
    const rows = parseSmartImport(tabbed).rows;
    expect(rows.map((r) => lineTotal(r))).toEqual([1250, 750, 1200]);
    expect(grandTotal(rows.map((r) => ({ ...r, id: "x", source: "import" as const })))).toBe(3200);
  });

  it("รองรับ CSV และไม่มีหัวตาราง", () => {
    const res = parseSmartImport("กาวแท่ง ขนาด 21 กรัม,25,20\nกระดาษสี A4,85,10");
    expect(res.usedHeader).toBe(false);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({ price: 25, qty: 20 });
  });

  it("ทำเครื่องหมายแถวที่ข้อมูลไม่ครบแทนการทิ้ง", () => {
    const res = parseSmartImport("รายการสินค้า\tราคา\tจำนวน\nสมุดปกอ่อน\t\t");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].needsReview).toBe(true);
    expect(res.rows[0].qty).toBe(1);
  });
});

describe("formatThaiDate", () => {
  it("แสดงปี พ.ศ.", () => {
    expect(formatThaiDate("2026-08-22")).toBe("22/08/2569");
  });
});
