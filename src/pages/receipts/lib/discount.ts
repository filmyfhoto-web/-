/**
 * ส่วนลดท้ายบิล (bill-level discount)
 * - แปลงค่าที่ผู้ใช้พิมพ์ (มี comma / ช่องว่าง / เครื่องหมาย ฿ / ตัวเลขไทย) ให้เป็นตัวเลข
 * - ตรวจสอบว่าไม่ติดลบ และไม่เกินยอดก่อนหักส่วนลด
 * ใช้ร่วมกันทั้งฟอร์มออกเอกสารและหน้าพิมพ์ เพื่อให้ผลลัพธ์ตรงกันเสมอ
 */

export type DiscountProblem = "invalid" | "negative" | "exceeds" | null;

export interface DiscountCheck {
  /** ค่าที่ผู้ใช้กรอก (หลังแปลงเป็นตัวเลข) */
  raw: number;
  /** ค่าที่นำไปใช้จริง — จำกัดให้อยู่ในช่วง 0..subtotal */
  effective: number;
  problem: DiscountProblem;
  message: string | null;
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/**
 * แปลงข้อความเป็นจำนวนเงิน — คืน NaN เมื่อรูปแบบผิด (เช่น "abc", "1.2.3")
 * ค่าว่างถือเป็น 0
 */
export function parseDiscountInput(input: unknown): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : NaN;
  if (input == null) return 0;
  let s = String(input).trim();
  if (!s) return 0;
  s = s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
  s = s.replace(/[,\s฿]/g, "").replace(/บาท$/u, "");
  if (!s) return 0;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** ปัดเป็นทศนิยม 2 ตำแหน่งแบบเงินบาท */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * ตรวจสอบส่วนลดเทียบกับยอดก่อนหัก
 * - ผิดรูปแบบ/NaN → ใช้ 0
 * - ติดลบ → ใช้ 0
 * - เกินยอดก่อนหัก → จำกัดที่ยอดก่อนหัก (กันยอดสุทธิติดลบ)
 */
export function checkDiscount(rawInput: unknown, subtotalBeforeDiscount: number): DiscountCheck {
  const sub = Number.isFinite(subtotalBeforeDiscount) ? Math.max(0, subtotalBeforeDiscount) : 0;
  const raw = parseDiscountInput(rawInput);

  if (!Number.isFinite(raw)) {
    return { raw: 0, effective: 0, problem: "invalid", message: "ส่วนลดต้องเป็นตัวเลข — ระบบใช้ค่า 0 แทน" };
  }
  if (raw < 0) {
    return { raw, effective: 0, problem: "negative", message: "ส่วนลดติดลบไม่ได้ — ระบบใช้ค่า 0 แทน" };
  }
  if (raw > sub + 0.005) {
    return {
      raw,
      effective: round2(sub),
      problem: "exceeds",
      message: `ส่วนลดมากกว่ายอดก่อนหัก (${sub.toFixed(2)}) — ระบบจำกัดไว้ที่ยอดก่อนหักเพื่อไม่ให้ติดลบ`,
    };
  }
  return { raw, effective: round2(raw), problem: null, message: null };
}

/** ยอดหลังหักส่วนลด — ไม่ต่ำกว่า 0 เสมอ */
export function afterDiscount(subtotalBeforeDiscount: number, rawInput: unknown): number {
  const sub = Number.isFinite(subtotalBeforeDiscount) ? Math.max(0, subtotalBeforeDiscount) : 0;
  const { effective } = checkDiscount(rawInput, sub);
  return Math.max(0, round2(sub - effective));
}
