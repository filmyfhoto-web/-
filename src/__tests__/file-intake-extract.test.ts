import { describe, it, expect } from 'vitest';
import {
  validateIntakeFile, normalizeTaxId, buildExtractPages, applyExtractToDraft,
  extractFoundCount, NOT_FOUND_TEXT, buildSingleCardSummary, NOT_SPECIFIED_TEXT,
} from '@/film-shop/lib/fileIntakeExtract';
import {
  DEMO_NAMECARD_RESULT, extractIntakeFromFile, getFileIntakeMode, isFileIntakeEnabled,
} from '@/film-shop/lib/fileIntakeAdapter';
import { emptyQueueDraft } from '@/film-shop/lib/queueIntake';
import { buildIntakeOcrFlex, parseIntakeOcrPostback, buildIntakeSingleCardFlex, buildIntakeSuccessFlex } from '../../supabase/functions/_shared/intakeExtractFlex';

describe('อ่านข้อมูลจากไฟล์แนบ (พรีวิว)', () => {
  it('runtime อ่านไฟล์เป็นโหมด local เท่านั้น (ไม่มีโหมดที่เรียก AI)', () => {
    expect(getFileIntakeMode()).toBe('local');
    expect(isFileIntakeEnabled()).toBe(true);
  });

  it('ไฟล์งานเดิม .ai/.psd ยังแนบได้ แต่ไม่ถูกส่งเข้า OCR', () => {
    for (const name of ['artwork.ai', 'artwork.psd']) {
      expect(validateIntakeFile({ name, size: 1024 }).ok).toBe(false);
    }
    const picked = ['artwork.ai', 'artwork.psd'].filter((n) => validateIntakeFile({ name: n, size: 1 }).ok);
    expect(picked).toEqual([]);
  });

  it('ตรวจชนิด/ขนาดไฟล์ พร้อมข้อความไทย', () => {
    expect(validateIntakeFile({ name: 'a.jpg', size: 100 }).ok).toBe(true);
    expect(validateIntakeFile({ name: 'a.HEIC', size: 100 }).ok).toBe(true);
    expect(validateIntakeFile({ name: 'a.pdf', size: 100 }).ok).toBe(true);
    expect(validateIntakeFile({ name: 'a.zip', size: 1 }).error).toContain('ไม่รองรับ');
    expect(validateIntakeFile({ name: 'a.png', size: 30 * 1024 * 1024 }).error).toContain('ใหญ่เกิน');
  });

  it('เลขผู้เสียภาษีต้องครบ 13 หลัก', () => {
    expect(normalizeTaxId('0-1055-63156-63-9')).toBe('0105563156639');
    expect(normalizeTaxId('123')).toBe('');
  });

  it('อ่านนามบัตรตัวอย่างได้ตามค่าที่คาด และไม่แต่งรายการงาน/กำหนดรับ', async () => {
    const r = await extractIntakeFromFile({ name: 'card.jpg', type: 'image/jpeg', size: 10 } as File, { mode: 'preview' });
    expect(r.fields.customerName?.value).toBe('บริษัท กูรู แพลตฟอร์ม จำกัด');
    expect(r.fields.customerNameEn?.value).toBe('GURU PLATFORM CO., LTD');
    expect(r.fields.taxId?.value).toBe('0105563156639');
    expect(r.fields.address?.value).toContain('ปทุมธานี 12150');
    expect(r.fields.phone?.value).toBe('02-021-7456');
    expect(r.items).toHaveLength(0);
    expect(r.fields.dueAt).toBeUndefined();
  });

  it('อ่านไม่ได้ต้องโยน error ภาษาไทยให้ลองอีกครั้ง', async () => {
    await expect(extractIntakeFromFile({ name: 'fail.jpg', size: 10 } as File, { mode: 'preview' }))
      .rejects.toThrow(/อ่านไฟล์ไม่ได้/);
  });

  it('สรุปเป็น 4 หมวดพร้อมเลขข้อ และค่าที่ไม่พบขึ้น "ไม่พบในไฟล์"', () => {
    const pages = buildExtractPages(DEMO_NAMECARD_RESULT);
    expect(pages.map((p) => p.title)).toEqual([
      '1. ลูกค้า', '2. ติดต่อ / ภาษี / ที่อยู่', '3. รายการงาน', '4. กำหนดรับ / หมายเหตุ',
    ]);
    expect(pages[0].lines[0].no).toBe(1);
    expect(pages[2].lines[0].value).toBe(NOT_FOUND_TEXT);
    expect(pages[3].lines.every((l) => !l.found)).toBe(true);
    expect(extractFoundCount(DEMO_NAMECARD_RESULT)).toBe(5);
  });

  it('ป้าย "ไม่แน่ใจ" เฉพาะค่าที่ความมั่นใจต่ำ', () => {
    const pages = buildExtractPages(DEMO_NAMECARD_RESULT);
    const tax = pages[1].lines.find((l) => l.label.includes('ภาษี'))!;
    const phone = pages[1].lines.find((l) => l.label.includes('เบอร์'))!;
    expect(tax.uncertain).toBe(true);
    expect(phone.uncertain).toBe(false);
  });

  it('กด "ใช้ข้อมูลนี้" เติมฟอร์มเดิม ไม่สร้างคิว', () => {
    const d = applyExtractToDraft(emptyQueueDraft(), DEMO_NAMECARD_RESULT);
    expect(d.customerName).toBe('บริษัท กูรู แพลตฟอร์ม จำกัด');
    expect(d.customerPhone).toBe('02-021-7456');
    expect(d.jobDetail).toContain('0105563156639');
    expect(d.dueAt).toBe('');
    expect(d.items.filter((i) => i.title.trim())).toHaveLength(0);
  });

  it('การ์ด LINE แบ่งหน้าด้วย postback ไม่มี URL ดิบระหว่างหน้า', () => {
    const pages = buildExtractPages(DEMO_NAMECARD_RESULT);
    const first: any = buildIntakeOcrFlex({ sessionId: 'sess1234', page: 0, pages, formUrl: 'https://x/film-intake?t=a' });
    expect(JSON.stringify(first.contents.body)).not.toContain('http');
    const labels = JSON.stringify(first.contents.footer);
    expect(labels).toContain('ถัดไป');
    expect(labels).not.toContain('ก่อนหน้า');
    const last: any = buildIntakeOcrFlex({ sessionId: 'sess1234', page: 3, pages, formUrl: 'https://x/film-intake?t=a' });
    expect(JSON.stringify(last.contents.footer)).toContain('เปิดฟอร์มตรวจสอบ');
    expect(JSON.stringify(last.contents.footer)).toContain('ยกเลิก');
    expect(parseIntakeOcrPostback('intake_ocr:sess1234:2')).toEqual({ sessionId: 'sess1234', action: 'page', page: 2 });
    expect(parseIntakeOcrPostback('intake_ocr:sess1234:cancel')).toEqual({ sessionId: 'sess1234', action: 'cancel' });
    expect(parseIntakeOcrPostback('nope')).toBeNull();
  });
});
describe('การ์ดเดียว "รับงานใหม่" (single card)', () => {
  it('สรุปไม่เกิน 4 บรรทัด และค่าที่ไม่มีขึ้น "ยังไม่ได้ระบุ"', () => {
    const s = buildSingleCardSummary(DEMO_NAMECARD_RESULT);
    expect(s.lines).toHaveLength(4);
    expect(s.lines.map((l) => `${l.label}: ${l.value}`)).toEqual([
      'ลูกค้า: บริษัท กูรู แพลตฟอร์ม จำกัด',
      'โทร: 02-021-7456',
      `รายการงาน: ${NOT_SPECIFIED_TEXT}`,
      `กำหนดรับ: ${NOT_SPECIFIED_TEXT}`,
    ]);
    expect(s.reviewCount).toBe(1);
  });

  it('การ์ดเดียวมีปุ่ม "เปิดฟอร์มสั่งงาน" + "ยกเลิก" ไม่มีถัดไป/ก่อนหน้า และ body ไม่มี URL', () => {
    const s = buildSingleCardSummary(DEMO_NAMECARD_RESULT);
    const card: any = buildIntakeSingleCardFlex({
      sessionId: 'sess1234', lines: s.lines, reviewCount: s.reviewCount,
      formUrl: 'https://x/film-intake?t=a', fromFile: true,
    });
    const body = JSON.stringify(card.contents.body);
    const footer = JSON.stringify(card.contents.footer);
    expect(body).not.toContain('http');
    expect(body).toContain('มีข้อมูลให้ตรวจ 1 จุด');
    expect(footer).toContain('เปิดฟอร์มสั่งงาน');
    expect(footer).toContain('ยกเลิก');
    expect(JSON.stringify(card)).not.toContain('ถัดไป');
    expect(JSON.stringify(card)).not.toContain('ก่อนหน้า');
    expect(parseIntakeOcrPostback('intake_ocr:sess1234:cancel')).toEqual({ sessionId: 'sess1234', action: 'cancel' });
  });

  it('การ์ด "รับงานสำเร็จ" แสดงเลขคิว/ใบสั่งจ้าง และไม่มีปุ่มถามต่อ', () => {
    const card: any = buildIntakeSuccessFlex({
      queueNo: 'Q-2026-0001', jobOrderNo: 'JO-2026-0001', customerName: 'บริษัท กูรู แพลตฟอร์ม จำกัด',
    });
    const s = JSON.stringify(card);
    expect(s).toContain('Q-2026-0001');
    expect(s).toContain('JO-2026-0001');
    expect(card.contents.footer).toBeUndefined();
  });
});

describe('อ่านไฟล์จริงแบบไม่ใช้ AI + การ์ดใบเดียวในกลุ่ม LINE', () => {
  it('parseIntakeText อ่านลูกค้า/โทร/ภาษี/ที่อยู่/กำหนดรับ/รายการงานได้ครบ', async () => {
    const { parseIntakeText } = await import('@/film-shop/lib/fileIntakeExtract');
    const r = parseIntakeText([
      'บริษัท กูรู แพลตฟอร์ม จำกัด',
      'โทร: 02-021-7456',
      'เลขผู้เสียภาษี: 0105563156639',
      'ที่อยู่: 48/24 หมู่ 4 ต.ลำลูกกา อ.ลำลูกกา จ.ปทุมธานี 12150',
      'สติกเกอร์ไดคัท 200 ชิ้น',
      'กำหนดรับ: 25/08/2026',
    ].join('\n'));
    expect(r.fields.customerName?.value).toContain('กูรู');
    expect(r.fields.phone?.value).toBe('02-021-7456');
    expect(r.fields.taxId?.value).toBe('0105563156639');
    expect(r.fields.dueAt?.value).toBe('25/08/2026');
    expect(r.items[0]).toMatchObject({ title: 'สติกเกอร์ไดคัท', quantity: 200, unit: 'ชิ้น' });
  });

  it('ไม่เดาข้อมูลที่ไม่มีในไฟล์', async () => {
    const { parseIntakeText } = await import('@/film-shop/lib/fileIntakeExtract');
    const r = parseIntakeText('ทดสอบข้อความเปล่า');
    expect(r.fields.phone).toBeUndefined();
    expect(r.items).toHaveLength(0);
  });

  it('webhook ส่งการ์ดใบเดียว “รับงานใหม่” เมื่อพิมพ์ “สั่งงาน” ในกลุ่ม', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('supabase/functions/line-webhook/index.ts', 'utf8');
    expect(src).toContain('buildIntakeSingleCardFlex');
    expect(src).not.toContain('buildIntakeFormFlex(');
  });

  it('ลิงก์บอทคิดจาก origin ของร้านจริง ไม่ hardcode โดเมนเดิมในเมนู', async () => {
    const fs = await import('node:fs/promises');
    const bot = await fs.readFile('supabase/functions/_shared/nattaDocBot.ts', 'utf8');
    expect(bot).toMatch(/export function filmQueueUrls/);
    expect(bot).toMatch(/buildNdbMenuFlex\([\s\S]*?appOrigin/);
    const handler = await fs.readFile('supabase/functions/_shared/nattaDocBotHandler.ts', 'utf8');
    expect(handler).toContain('buildNdbMenuFlex(ctx.shopKey, ctx.storeLabel, ctx.appOrigin)');
  });
});
