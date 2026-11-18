/**
 * ตัวเชื่อม "อ่านไฟล์" — อ่านในเครื่องเท่านั้น (deterministic/regex) ไม่เรียก AI/LLM/OCR ที่คิดเครดิต
 *
 * โหมดที่เหลือ:
 * - 'local'   → อ่านไฟล์จริงในเครื่อง (PDF ที่มีชั้นข้อความ / ไฟล์ข้อความ) แล้วจับข้อมูลด้วยกฎ
 * - 'preview' → ข้อมูลตัวอย่างสำหรับหน้า /film-intake-preview เท่านั้น (ต้องส่ง mode ตรง ๆ)
 * - 'off'     → ปิดการอ่านไฟล์
 * ไม่มีโหมดที่เรียกโมเดล cloud อีกต่อไป
 */
import type { ExtractedIntake, FileLike } from '@/film-shop/lib/fileIntakeExtract';
import { validateIntakeFile } from '@/film-shop/lib/fileIntakeExtract';
import { readLocalFileText } from '@/film-shop/lib/localFileText';

export type FileIntakeMode = 'off' | 'preview' | 'local';

/** runtime จริงอ่านไฟล์แบบ local เสมอ — ไม่มีทางเรียก AI */
export const getFileIntakeMode = (): FileIntakeMode => 'local';

/** ข้อความมาตรฐานเมื่ออ่านไฟล์ไม่ได้ (ให้ผู้ใช้กรอกเอง) */
export const FILE_INTAKE_MANUAL_MESSAGE = 'อ่านไฟล์นี้ไม่ได้ กรุณากรอกข้อมูลเอง';

/** ฟอร์มจริงจะเปิด OCR ก็ต่อเมื่อ mode ไม่ใช่ off */
export const isFileIntakeEnabled = (): boolean => getFileIntakeMode() !== 'off';

/** ผลอ่านตัวอย่างจากนามบัตรที่ใช้ทดสอบ (ไม่มีรายการงาน/กำหนดรับ จึงต้องเว้นว่าง) */
export const DEMO_NAMECARD_RESULT: ExtractedIntake = {
  sourceName: 'guru-namecard-demo.jpg',
  mode: 'preview',
  fields: {
    customerName: { value: 'บริษัท กูรู แพลตฟอร์ม จำกัด', confidence: 0.97 },
    customerNameEn: { value: 'GURU PLATFORM CO., LTD', confidence: 0.86 },
    phone: { value: '02-021-7456', confidence: 0.93 },
    taxId: { value: '0105563156639', confidence: 0.71 },
    address: { value: '48/24 หมู่ 4 ต.ลำลูกกา อ.ลำลูกกา จ.ปทุมธานี 12150', confidence: 0.9 },
  },
  items: [],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * โหมด local — อ่านไฟล์จริงในเครื่องแบบไม่ใช้ AI (ไม่เสียเครดิต)
 * รองรับ Excel (.xlsx/.xls), Word (.docx), CSV/TXT และ PDF ที่มีชั้นข้อความ
 * รูปภาพ / PDF สแกน / .ai / .psd อ่านไม่ได้ → โยน FILE_INTAKE_MANUAL_MESSAGE ให้กรอกเอง
 */
export async function localExtract(file: File): Promise<ExtractedIntake> {
  const { parseIntakeText } = await import('@/film-shop/lib/fileIntakeExtract');
  let text = '';
  try {
    text = await readLocalFileText(file);
  } catch {
    throw new Error(FILE_INTAKE_MANUAL_MESSAGE);
  }
  if (!text.trim()) throw new Error(FILE_INTAKE_MANUAL_MESSAGE);
  const parsed = parseIntakeText(text);
  return { sourceName: file.name, mode: 'local', fields: parsed.fields, items: parsed.items };
}

async function previewExtract(file: FileLike): Promise<ExtractedIntake> {
  await sleep(900);
  if (/fail|error/i.test(file.name)) throw new Error('อ่านไฟล์ไม่ได้ กรุณาลองอีกครั้งหรือกรอกเอง');
  return { ...DEMO_NAMECARD_RESULT, sourceName: file.name, mode: 'preview' };
}

/** อ่านข้อมูลจากไฟล์ — โยน Error พร้อมข้อความภาษาไทยเมื่ออ่านไม่ได้ */
export async function extractIntakeFromFile(
  file: File,
  opts: { token?: string | null; mode?: FileIntakeMode } = {},
): Promise<ExtractedIntake> {
  const mode = opts.mode ?? getFileIntakeMode();
  if (mode === 'off') throw new Error('ระบบอ่านไฟล์ยังไม่เปิดใช้งาน');
  if (mode === 'preview') {
    const check = validateIntakeFile(file);
    if (!check.ok) throw new Error(check.error);
    return previewExtract(file);
  }
  return localExtract(file);
}