import { describe, expect, it } from "vitest";
import {
  canAutoMatch, customerCode, lineLinkState, maskLineUserId,
} from "@/lib/customer360/identity";
import {
  mergeHistory, normalizeExcelIntake, normalizeOrder, normalizeRequisition,
  summarizeHistory, topItems,
} from "@/lib/customer360/unifiedHistory";
import {
  checkExcelFile, csvSafeCell, intakeItemsToCsv, isSubmittableRow,
  rowsToTsv, summarize, toIntakeItems,
} from "@/lib/excelIntake";
import { parseSmartImport } from "@/lib/smartImport";

describe("customer identity", () => {
  it("ใช้รหัสลูกค้าจากฐานข้อมูลก่อน แล้วค่อย fallback", () => {
    expect(customerCode({ customer_code: "CUS-ABC123", id: "x" })).toBe("CUS-ABC123");
    expect(customerCode({ id: "6f1c2d3e-aaaa-bbbb-cccc-ddddeeeeffff" })).toBe("CUS-6F1C2D");
    expect(customerCode({})).toBe("—");
  });

  it("ไม่เปิดเผย line_user_id เต็ม", () => {
    const masked = maskLineUserId("U1234567890abcdef");
    expect(masked).not.toContain("1234567890abcdef");
    expect(masked.startsWith("U1234")).toBe(true);
  });

  it("แยกสถานะ linked / unmatched / none", () => {
    expect(lineLinkState({ lineUserId: null })).toBe("none");
    expect(lineLinkState({ lineUserId: "U1", boundCustomerId: null })).toBe("unmatched");
    expect(lineLinkState({ lineUserId: "U1", boundCustomerId: "c1", verifiedAt: "2026-01-01" })).toBe("linked");
  });

  it("ห้าม auto-match จากชื่ออย่างเดียว หรือเมื่อมีผู้สมัครหลายคน", () => {
    expect(canAutoMatch({ nameMatches: true })).toBe(false);
    expect(canAutoMatch({ phoneMatches: true, candidateCount: 2 })).toBe(false);
    expect(canAutoMatch({ phoneMatches: true, candidateCount: 1 })).toBe(true);
  });
});

describe("unified history", () => {
  const order = normalizeOrder({ id: "o1", order_no: "SO-1", status: "completed", total: 100, created_at: "2026-01-02T00:00:00Z" });
  const req = normalizeRequisition({ id: "r1", project_name: "งานเบิก", status: "submitted", total: 50, created_at: "2026-01-03T00:00:00Z" });
  const xls = normalizeExcelIntake({ id: "x1", filename: "a.xlsx", status: "submitted", total: 25, created_at: "2026-01-01T00:00:00Z" });

  it("เรียงล่าสุดก่อนและไม่มีรายการซ้ำ", () => {
    const merged = mergeHistory([[order, req], [xls, order]]);
    expect(merged.map((e) => e.id)).toEqual(["r1", "o1", "x1"]);
  });

  it("สรุปยอดโดยไม่นับซ้ำ", () => {
    const s = summarizeHistory(mergeHistory([[order, req, xls], [order]]));
    expect(s.count).toBe(3);
    expect(s.totalAmount).toBe(175);
    expect(s.byType.requisition).toBe(1);
  });

  it("แปลสถานะเป็นภาษาไทย", () => {
    expect(req.statusLabel).toBe("ส่งแล้ว");
    expect(order.statusLabel).toBe("เสร็จสิ้น");
  });

  it("หาสินค้าที่สั่งบ่อยจากรายการจริง", () => {
    const top = topItems([[{ name: "กระดาษ A4", qty: 5 }], [{ name: "กระดาษ A4", qty: 3 }, { name: "ปากกา", qty: 1 }]]);
    expect(top[0]).toMatchObject({ name: "กระดาษ A4", qty: 8, times: 2 });
  });
});

describe("excel intake", () => {
  it("รับเฉพาะไฟล์ที่รองรับและจำกัดขนาด", () => {
    expect(checkExcelFile({ name: "a.xlsx", size: 1000 }).ok).toBe(true);
    expect(checkExcelFile({ name: "a.pdf", size: 1000 }).ok).toBe(false);
    expect(checkExcelFile({ name: "a.csv", size: 9_000_000 }).ok).toBe(true);
    expect(checkExcelFile({ name: "a.csv", size: 11_000_000 }).ok).toBe(false);
    expect(checkExcelFile({ name: "a.csv", size: 0 }).ok).toBe(false);
  });

  it("กัน formula injection ตอน export CSV", () => {
    expect(csvSafeCell("=cmd|'/c calc'")).toBe("\"'=cmd|'/c calc'\"");
    expect(csvSafeCell('ชื่อ "พิเศษ"')).toBe('"ชื่อ ""พิเศษ"""');
  });

  it("แปลง matrix เป็น TSV แล้วอ่านด้วย parser เดิมได้", () => {
    const tsv = rowsToTsv([
      ["รายการ", "จำนวน", "หน่วย", "ราคา"],
      ["กระดาษ A4", "5", "รีม", "120"],
      ["", "", "", ""],
    ]);
    const parsed = parseSmartImport(tsv);
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0].name).toBe("กระดาษ A4");
    expect(parsed.rows[0].qty).toBe(5);
    expect(parsed.rows[0].price).toBe(120);
  });

  it("ส่งได้เฉพาะแถวที่มีชื่อและจำนวน", () => {
    const rows = parseSmartImport("กระดาษ A4\t2\tรีม\t100").rows;
    const withBadRows = [...rows, { ...rows[0], name: "  " }, { ...rows[0], qty: 0 }];
    expect(withBadRows.filter(isSubmittableRow).length).toBe(1);
    const items = toIntakeItems(withBadRows);
    expect(items).toHaveLength(1);
    expect(items[0].total).toBe(200);
  });

  it("สรุปจำนวนแถวที่ต้องตรวจสอบและยอดรวม", () => {
    const rows = parseSmartImport("กระดาษ A4\t2\tรีม\t100").rows;
    const s = summarize(rows);
    expect(s.total).toBe(200);
    expect(s.needsReviewCount).toBe(rows.filter((r) => r.needsReview).length);
  });

  it("CSV ที่ดาวน์โหลดมี BOM และหัวตารางภาษาไทย", () => {
    const csv = intakeItemsToCsv(toIntakeItems(parseSmartImport("กระดาษ A4\t2\tรีม\t100").rows));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("รายการ");
    expect(csv).toContain("กระดาษ A4");
  });
});
