/**
 * สูตรคิดเงินรายการใบเสร็จ/ใบสั่งจ้าง Film Shop (ใช้ที่เดียวทั้งฟอร์ม/พรีวิว/พิมพ์)
 *   งานทั่วไป  = ราคาต่อหน่วย × จำนวน − ส่วนลด
 *   งานพื้นที่  = กว้าง(ม.) × ยาว(ม.) × จำนวน × ราคา/ตร.ม. − ส่วนลด
 * ค่าที่รับต้องเป็นตัวเลขหน่วย “เมตร” แล้วเท่านั้น (ห้ามคำนวณจาก string)
 */
export interface FilmLineInput {
  width?: number | null;
  height?: number | null;
  quantity: number;
  price: number;
  discount?: number | null;
  /** true = คิดแบบพื้นที่เมื่อมีกว้าง–ยาว */
  areaMode?: boolean;
}

export function filmLineTotal(input: FilmLineInput): number {
  const w = Number(input.width) || 0;
  const h = Number(input.height) || 0;
  const qty = Number(input.quantity) || 0;
  const price = Number(input.price) || 0;
  const discount = Number(input.discount) || 0;
  const useArea = !!input.areaMode && w > 0 && h > 0;
  const gross = useArea ? w * h * qty * price : price * qty;
  return Math.max(0, gross - discount);
}

/** สองคอลัมน์ราคาแยกกันจริง: ราคาต่อหน่วย และ ราคา/ตร.ม. */
export interface FilmItemPriceInput {
  width?: number | null;
  height?: number | null;
  quantity: number;
  pricePerPiece?: number | null;
  pricePerSqm?: number | null;
  discount?: number | null;
  /** true = ใช้สูตรพื้นที่เมื่อมีกว้าง–ยาวครบ */
  areaMode?: boolean;
}

/** งานพื้นที่ใช้ราคา/ตร.ม. งานทั่วไปใช้ราคาต่อหน่วย (ไม่ปนกัน) */
export function isAreaLine(input: FilmItemPriceInput): boolean {
  return !!input.areaMode && (Number(input.width) || 0) > 0 && (Number(input.height) || 0) > 0;
}

export function filmItemTotal(input: FilmItemPriceInput): number {
  const qty = Number(input.quantity) || 0;
  const discount = Number(input.discount) || 0;
  const gross = isAreaLine(input)
    ? (Number(input.width) || 0) * (Number(input.height) || 0) * qty * (Number(input.pricePerSqm) || 0)
    : (Number(input.pricePerPiece) || 0) * qty;
  return Math.max(0, gross - discount);
}

/** ลำดับคอลัมน์ตารางรายการของใบเสร็จ Film Shop (ไม่รวมคอลัมน์ “รวม” ท้ายตาราง) */
export const FILM_RECEIPT_COLUMNS = [
  'ลำดับ', 'รายการ', 'ราคาต่อหน่วย', 'ราคา ตร.ม.', 'จำนวน', 'หน่วย', 'กว้าง', 'ยาว',
] as const;

/** หน่วยความยาวที่ผู้ใช้กรอก: เซนติเมตร หรือ เมตร (ค่าปริยาย = เมตร) */
export type FilmLengthUnit = 'cm' | 'm';

/** แปลงค่าความยาวเป็นเมตรเสมอก่อนคำนวณพื้นที่ (cm หาร 100) */
export function toMeters(value: number | null | undefined, unit: FilmLengthUnit = 'm'): number {
  const v = Number(value) || 0;
  return unit === 'cm' ? v / 100 : v;
}

export interface FilmLineAreaInput {
  width?: number | null;
  height?: number | null;
  /** หน่วยของ width/height ที่กรอกมา (ค่าปริยาย = เมตร) */
  unit?: FilmLengthUnit;
}

/** พื้นที่ (ตร.ม.) = กว้าง(ม.) × ยาว(ม.) — แปลงหน่วยให้เป็นเมตรก่อนเสมอ */
export function lineAreaSqm(input: FilmLineAreaInput): number {
  return toMeters(input.width, input.unit ?? 'm') * toMeters(input.height, input.unit ?? 'm');
}

export interface AutoLineTotalInput extends FilmItemPriceInput {
  /** หน่วยของ width/height (ค่าปริยาย = เมตร เหมือน filmItemTotal เดิม) */
  unit?: FilmLengthUnit;
}

/** ราคาอัตโนมัติ: เหมือน filmItemTotal เดิมทุกประการ แต่รองรับหน่วย cm/m ของ width/height */
export function autoLineTotal(input: AutoLineTotalInput): number {
  const qty = Number(input.quantity) || 0;
  const discount = Number(input.discount) || 0;
  const gross = isAreaLine(input)
    ? lineAreaSqm({ width: input.width, height: input.height, unit: input.unit }) * qty * (Number(input.pricePerSqm) || 0)
    : (Number(input.pricePerPiece) || 0) * qty;
  return Math.max(0, gross - discount);
}

export interface ResolveLineTotalInput extends AutoLineTotalInput {
  /** true = ผู้ใช้กด "แก้ราคาเอง" → ใช้ manualTotal เสมอ ห้ามคำนวณทับตอนแก้กว้าง/ยาว/จำนวน */
  manualPrice?: boolean;
  manualTotal?: number | null;
}

/** ราคาสุดท้ายของบรรทัด: ใช้ราคาที่แก้เองถ้าเปิด manualPrice ไว้ ไม่งั้นคำนวณอัตโนมัติ */
export function resolveLineTotal(input: ResolveLineTotalInput): number {
  if (input.manualPrice) return Math.max(0, Number(input.manualTotal) || 0);
  return autoLineTotal(input);
}
