import { beforeEach, describe, expect, it } from "vitest";
import {
  REQUISITION_AUTOSAVE_KEY,
  clearAutosave,
  isAutosaveEmpty,
  readAutosave,
  requisitionCsvFilename,
  requisitionToCsvRows,
  writeAutosave,
  type RequisitionItem,
} from "@/lib/schoolRequisition";

const items: RequisitionItem[] = [
  { id: "a", code: "", name: "กระดาษ A4", unit: "รีม", price: 120, qty: 10, source: "import" },
  { id: "b", code: "", name: "ปากกา", unit: "ด้าม", price: 7, qty: 50, source: "manual" },
];

describe("CSV ใบเขียนเบิก", () => {
  it("สร้างแถวรายการพร้อมยอดรวมท้ายไฟล์", () => {
    const rows = requisitionToCsvRows({ items });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ "ลำดับ": "1", "รายการ": "กระดาษ A4", "จำนวน": "10", "หน่วย": "รีม", "รวม": "1200.00" });
    expect(rows[2]).toMatchObject({ "รายการ": "ยอดรวมทั้งสิ้น", "รวม": "1550.00" });
  });

  it("ชื่อไฟล์ปลอดอักขระต้องห้าม", () => {
    expect(requisitionCsvFilename({ school_name: "รร./บ้าน*ศรี", doc_date: "2026-08-23" }))
      .toBe("ใบเขียนเบิก-รร.-บ้าน-ศรี-2026-08-23.csv");
  });
});

describe("บันทึกร่างอัตโนมัติ", () => {
  beforeEach(() => clearAutosave());

  const base = { school_name: "", project_name: "", prepared_by: "", doc_date: "2026-08-23", note: null, items: [] };

  it("ฟอร์มเปล่าไม่ถูกบันทึก", () => {
    expect(isAutosaveEmpty(base)).toBe(true);
    expect(writeAutosave(base)).toBeNull();
    expect(readAutosave()).toBeNull();
  });

  it("บันทึกและอ่านกลับได้ครบ", () => {
    const saved = writeAutosave({ ...base, school_name: "โรงเรียนบ้านศรีกลาง", items });
    expect(saved?.saved_at).toBeTruthy();
    const back = readAutosave();
    expect(back?.school_name).toBe("โรงเรียนบ้านศรีกลาง");
    expect(back?.items).toHaveLength(2);
    expect(localStorage.getItem(REQUISITION_AUTOSAVE_KEY)).toBeTruthy();
    clearAutosave();
    expect(readAutosave()).toBeNull();
  });
});
