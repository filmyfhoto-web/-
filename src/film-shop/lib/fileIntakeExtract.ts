/**
 * อ่านข้อมูลลูกค้า/งานจากไฟล์แนบ (รูป/PDF) เพื่อ "เสนอ" ให้ผู้ใช้ยืนยันก่อนเติมฟอร์ม
 *
 * กติกา: ห้ามเดาข้อมูลที่ไม่มีในไฟล์ — ค่าที่ไม่พบต้องเว้นว่างและแสดง "ไม่พบในไฟล์"
 * และห้ามสร้างคิว/เอกสารจากผลอ่านโดยตรง ต้องผ่านการยืนยันของผู้ใช้เสมอ
 */
import type { QueueIntakeDraft } from '@/film-shop/lib/queueIntake';

export const INTAKE_FILE_MAX_MB = 20;
export const INTAKE_FILE_ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,application/pdf';
const OK_EXT = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'];

export interface FileLike { name: string; type?: string; size?: number }

/** ตรวจชนิด/ขนาดไฟล์ก่อนส่งอ่าน (ข้อความผิดพลาดภาษาไทย) */
export function validateIntakeFile(f: FileLike): { ok: boolean; error?: string } {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!OK_EXT.includes(ext)) {
    return { ok: false, error: `ไฟล์ "${f.name}" ไม่รองรับ (รองรับ JPG, JPEG, PNG, HEIC, PDF)` };
  }
  if ((f.size ?? 0) > INTAKE_FILE_MAX_MB * 1024 * 1024) {
    return { ok: false, error: `ไฟล์ "${f.name}" ใหญ่เกิน ${INTAKE_FILE_MAX_MB} MB` };
  }
  return { ok: true };
}

export type IntakeFieldKey =
  | 'customerName' | 'customerNameEn' | 'contactName'
  | 'phone' | 'taxId' | 'address'
  | 'dueAt' | 'note';

export interface ExtractedField {
  value: string;
  /** 0–1 ; ต่ำกว่า 0.8 จะขึ้นป้าย "ไม่แน่ใจ" ให้ผู้ใช้ตรวจ */
  confidence: number;
}

export interface ExtractedItem {
  title: string;
  quantity: number | null;
  unit: string;
  confidence: number;
}

export interface ExtractedIntake {
  sourceName: string;
  fields: Partial<Record<IntakeFieldKey, ExtractedField>>;
  items: ExtractedItem[];
  /** โหมดที่ใช้ประมวลผล — preview = ตัวอย่าง, local = อ่านจริงแบบไม่ใช้ AI */
  mode: 'preview' | 'local' | 'live';
}

export const NOT_FOUND_TEXT = 'ไม่พบในไฟล์';
export const LOW_CONFIDENCE = 0.8;

/**
 * ตัวอ่านข้อความแบบกำหนดกฎ (ไม่ใช้ AI = ไม่เสียเครดิต)
 * ใช้กับข้อความที่ดึงได้จริงจากไฟล์ PDF/ข้อความ — ไม่มีการเดาค่าที่ไม่ปรากฏในไฟล์
 */
export function parseIntakeText(text: string): { fields: Partial<Record<IntakeFieldKey, ExtractedField>>; items: ExtractedItem[] } {
  const raw = (text || '').replace(/\r/g, '');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const fields: Partial<Record<IntakeFieldKey, ExtractedField>> = {};
  const put = (k: IntakeFieldKey, value: string, confidence: number) => {
    if (value.trim() && !fields[k]) fields[k] = { value: value.trim(), confidence };
  };

  const after = (re: RegExp) => {
    for (const l of lines) {
      const m = re.exec(l);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return '';
  };

  put('customerName', after(/^(?:ชื่อลูกค้า|ชื่อบริษัท|ชื่อ|ลูกค้า|บริษัท)\s*[:：]\s*(.+)$/), 0.9);
  if (!fields.customerName) {
    const co = lines.find((l) => /(บริษัท|ห้างหุ้นส่วน|หจก\.|ร้าน)/.test(l));
    if (co) put('customerName', co, 0.75);
  }
  put('customerNameEn', after(/^([A-Z][A-Z0-9&.,'’\- ]{5,}(?:CO\.?,? ?LTD\.?|LIMITED|COMPANY)?)$/), 0.8);
  put('contactName', after(/^(?:ผู้ติดต่อ|ติดต่อ)\s*[:：]?\s*(.+)$/), 0.85);

  const phone = /(0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4})/.exec(raw)?.[1] ?? '';
  put('phone', phone.replace(/\s+/g, '-'), 0.9);

  const taxDigits = (raw.match(/\d[\d\s-]{12,20}/g) ?? [])
    .map((s) => s.replace(/\D+/g, ''))
    .find((s) => s.length === 13) ?? '';
  put('taxId', taxDigits, 0.85);

  put('address', after(/^(?:ที่อยู่)\s*[:：]?\s*(.+)$/), 0.9);
  if (!fields.address) {
    const addr = lines.find((l) => /(หมู่|ต\.|อ\.|จ\.|ถนน|แขวง|เขต)/.test(l) && /\d{5}/.test(l));
    if (addr) put('address', addr, 0.72);
  }
  put('dueAt', after(/^(?:กำหนดรับ|กำหนดส่ง|วันรับงาน)\s*[:：]?\s*(.+)$/), 0.85);
  put('note', after(/^(?:หมายเหตุ)\s*[:：]?\s*(.+)$/), 0.8);

  const items: ExtractedItem[] = [];
  for (const l of lines) {
    const m = /^(?:-|\d+[.)])?\s*(.+?)\s*(\d+(?:[.,]\d+)?)\s*(ชิ้น|อัน|ใบ|แผ่น|เล่ม|ชุด|ผืน|ม้วน|กล่อง|ตร\.ม\.|เมตร|ม\.)$/.exec(l);
    if (m && !/^(?:ยอดรวม|รวม|ราคา|ที่อยู่|โทร)/.test(m[1])) {
      items.push({
        title: m[1].trim(),
        quantity: Number(m[2].replace(',', '')),
        unit: m[3],
        confidence: 0.85,
      });
    }
  }
  return { fields, items };
}

export const isLowConfidence = (f?: ExtractedField) =>
  !!f && f.value.trim().length > 0 && f.confidence < LOW_CONFIDENCE;

/** เลขผู้เสียภาษี: เก็บเฉพาะตัวเลข และถือว่าใช้ได้เมื่อครบ 13 หลัก */
export function normalizeTaxId(raw: string): string {
  const digits = (raw || '').replace(/\D+/g, '');
  return digits.length === 13 ? digits : '';
}

export const FIELD_LABEL: Record<IntakeFieldKey, string> = {
  customerName: 'ชื่อลูกค้า / บริษัท',
  customerNameEn: 'ชื่อภาษาอังกฤษ',
  contactName: 'ผู้ติดต่อ',
  phone: 'เบอร์โทร',
  taxId: 'เลขผู้เสียภาษี',
  address: 'ที่อยู่',
  dueAt: 'กำหนดรับ',
  note: 'หมายเหตุ',
};

export interface ExtractLine {
  no: number;
  label: string;
  value: string;
  found: boolean;
  uncertain: boolean;
}

export interface ExtractPage {
  title: string;
  lines: ExtractLine[];
}

const line = (no: number, label: string, f?: ExtractedField): ExtractLine => ({
  no,
  label,
  value: f?.value?.trim() ? f.value.trim() : NOT_FOUND_TEXT,
  found: !!f?.value?.trim(),
  uncertain: isLowConfidence(f),
});

/** สรุปผลอ่านเป็น 4 หมวด พร้อมเลขข้อ (ใช้ทั้งในฟอร์มและการ์ด LINE) */
export function buildExtractPages(r: ExtractedIntake): ExtractPage[] {
  let n = 0;
  const next = () => (n += 1);
  const p1: ExtractPage = {
    title: '1. ลูกค้า',
    lines: [
      line(next(), FIELD_LABEL.customerName, r.fields.customerName),
      line(next(), FIELD_LABEL.customerNameEn, r.fields.customerNameEn),
    ],
  };
  const p2: ExtractPage = {
    title: '2. ติดต่อ / ภาษี / ที่อยู่',
    lines: [
      line(next(), FIELD_LABEL.contactName, r.fields.contactName),
      line(next(), FIELD_LABEL.phone, r.fields.phone),
      line(next(), FIELD_LABEL.taxId, r.fields.taxId),
      line(next(), FIELD_LABEL.address, r.fields.address),
    ],
  };
  const p3: ExtractPage = {
    title: '3. รายการงาน',
    lines: r.items.length
      ? r.items.map((it) => ({
          no: next(),
          label: it.title,
          value: it.quantity ? `${it.quantity} ${it.unit || 'ชิ้น'}` : (it.unit || '-'),
          found: true,
          uncertain: it.confidence < LOW_CONFIDENCE,
        }))
      : [{ no: next(), label: 'รายการงาน', value: NOT_FOUND_TEXT, found: false, uncertain: false }],
  };
  const p4: ExtractPage = {
    title: '4. กำหนดรับ / หมายเหตุ',
    lines: [
      line(next(), FIELD_LABEL.dueAt, r.fields.dueAt),
      line(next(), FIELD_LABEL.note, r.fields.note),
    ],
  };
  return [p1, p2, p3, p4];
}

/** สรุปการ์ดเดียวสำหรับกลุ่ม LINE — ไม่เกิน 4 บรรทัด ไม่ยัดที่อยู่ยาว */
export const NOT_SPECIFIED_TEXT = 'ยังไม่ได้ระบุ';

export interface SingleCardSummary {
  lines: { no: number; label: string; value: string; found: boolean }[];
  /** จำนวนค่าที่ความมั่นใจต่ำ ต้องให้คนตรวจ */
  reviewCount: number;
}

export function buildSingleCardSummary(r: ExtractedIntake): SingleCardSummary {
  const val = (k: IntakeFieldKey) => r.fields[k]?.value?.trim() || '';
  const items = r.items.length
    ? r.items.map((i) => i.title).filter(Boolean).join(', ')
    : '';
  const raw: { label: string; value: string }[] = [
    { label: 'ลูกค้า', value: val('customerName') },
    { label: 'โทร', value: val('phone') },
    { label: 'รายการงาน', value: items },
    { label: 'กำหนดรับ', value: val('dueAt') },
  ];
  const reviewCount = (Object.keys(r.fields) as IntakeFieldKey[])
    .filter((k) => isLowConfidence(r.fields[k])).length;
  return {
    lines: raw.map((l, i) => ({
      no: i + 1,
      label: l.label,
      value: l.value || NOT_SPECIFIED_TEXT,
      found: !!l.value,
    })),
    reviewCount,
  };
}

export const extractFoundCount = (r: ExtractedIntake) =>
  buildExtractPages(r).reduce((s, p) => s + p.lines.filter((l) => l.found).length, 0);

/** เติมค่าที่อ่านได้ลงร่างฟอร์มเดิม (ไม่ทับค่าที่ผู้ใช้พิมพ์เองไว้แล้ว) */
export function applyExtractToDraft(draft: QueueIntakeDraft, r: ExtractedIntake): QueueIntakeDraft {
  const v = (k: IntakeFieldKey) => r.fields[k]?.value?.trim() || '';
  const next: QueueIntakeDraft = { ...draft };
  if (!next.customerName.trim() && v('customerName')) next.customerName = v('customerName');
  if (!next.customerPhone.trim() && v('phone')) next.customerPhone = v('phone');
  if (!next.customerOrg.trim() && v('customerNameEn')) next.customerOrg = v('customerNameEn');

  const extraNotes = [
    v('taxId') ? `เลขผู้เสียภาษี: ${v('taxId')}` : '',
    v('address') ? `ที่อยู่: ${v('address')}` : '',
    v('contactName') ? `ผู้ติดต่อ: ${v('contactName')}` : '',
    v('note'),
  ].filter(Boolean).join('\n');
  if (extraNotes) next.jobDetail = [next.jobDetail.trim(), extraNotes].filter(Boolean).join('\n');

  if (!next.dueAt && v('dueAt')) next.dueAt = v('dueAt');

  if (r.items.length) {
    const blank = next.items.filter((i) => !i.title.trim());
    const kept = next.items.filter((i) => i.title.trim());
    const mapped = r.items.map((it, idx) => ({
      ...(blank[0] ?? kept[0] ?? next.items[0]),
      key: `ocr-${Date.now()}-${idx}`,
      title: it.title,
      quantity: it.quantity ?? 1,
      unit: it.unit || 'ชิ้น',
      detail: '',
      size: '',
      unitPrice: 0,
      discount: 0,
    }));
    next.items = [...kept, ...mapped];
  }
  return next;
}