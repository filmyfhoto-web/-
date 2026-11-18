/**
 * Pure math สำหรับตัด canvas ยาว ๆ เป็นหน้า PDF หลายหน้า
 *
 * แยกออกจาก component เพื่อพิสูจน์ด้วย unit test ว่าเอกสารยาวเกิน 2 หน้า
 * ถูกตัดครบทุกส่วน (ไม่มีเศษท้ายหาย) และหน้าสุดท้ายสูงเท่าที่เหลือจริง
 */
export interface PdfSlice {
  /** ตำแหน่ง y (px) บน canvas ต้นฉบับ */
  sourceY: number;
  /** ความสูง (px) ของชิ้นนี้ */
  heightPx: number;
  /** ลำดับหน้า เริ่มที่ 0 */
  index: number;
}

/**
 * แบ่ง canvas สูง `canvasHeightPx` เป็นชิ้นละไม่เกิน `pageHeightPx`
 * ชิ้นสุดท้ายได้ความสูงเท่าเศษที่เหลือ และผลรวมทุกชิ้น = ความสูงทั้งหมดเสมอ
 */
export function computePdfSlices(canvasHeightPx: number, pageHeightPx: number): PdfSlice[] {
  const total = Math.max(0, Math.floor(canvasHeightPx));
  const page = Math.floor(pageHeightPx);
  if (!total) return [];
  if (!page || page <= 0 || page >= total) {
    return [{ sourceY: 0, heightPx: total, index: 0 }];
  }
  const slices: PdfSlice[] = [];
  for (let sourceY = 0, index = 0; sourceY < total; sourceY += page, index += 1) {
    slices.push({ sourceY, heightPx: Math.min(page, total - sourceY), index });
  }
  return slices;
}
