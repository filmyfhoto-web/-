/**
 * โครงเมนูลัด (Rich Menu) ของ “ม่วงจดให้” — แยกไฟล์ไว้เพื่อให้ทดสอบได้
 */
const W = 2500;
const H = 1686;
const COLS = 4;
const ROWS = 2;
const CW = Math.floor(W / COLS);
const CH = Math.floor(H / ROWS);

/** 8 ปุ่มของ “ม่วงจดให้” (เรียงซ้าย→ขวา, บน→ล่าง ตามรูปเมนู) */
const CELLS: Array<{ label: string; text: string }> = [
  { label: "บันทึกงานวันนี้", text: "บันทึกงานวันนี้" },
  { label: "แนบสลิป/หลักฐาน", text: "แนบสลิป" },
  { label: "รายการล่าสุด", text: "รายการล่าสุด" },
  { label: "สรุปวันนี้", text: "สรุปวันนี้" },
  { label: "แก้ไขล่าสุด", text: "แก้ไขล่าสุด" },
  { label: "ยกเลิกล่าสุด", text: "ยกเลิกล่าสุด" },
  { label: "ค้างรับ & ติดตามงาน", text: "ค้างรับ" },
  { label: "ช่วยเหลือ", text: "ช่วยเหลือ" },
];

export function buildRichMenuBody() {
  return {
    size: { width: W, height: H },
    selected: true,
    name: "muang-jod-hai",
    chatBarText: "ม่วงจดให้",
    areas: CELLS.map((c, i) => ({
      bounds: { x: (i % COLS) * CW, y: Math.floor(i / COLS) * CH, width: CW, height: CH },
      action: { type: "message", label: c.label, text: c.text },
    })),
  };
}

