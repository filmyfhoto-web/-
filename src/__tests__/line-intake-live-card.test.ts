import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseQueueChatCommand, QUEUE_QUICK_REPLY_ITEMS, withQueueQuickReply, buildQueueMenuText,
} from '../../supabase/functions/_shared/adminRoomQueries';
import { isIntakeAiFile, normalizeIntakeExtract, buildIntakeCardSummary } from '../../supabase/functions/_shared/intakeAiExtract';

describe('บอทรันงาน: การ์ดเดียวจบ + ปุ่มลัด 4 ปุ่ม', () => {
  it('ปุ่มลัดมี 4 ปุ่มตามที่ตกลง', () => {
    expect(QUEUE_QUICK_REPLY_ITEMS.map((i) => i.text)).toEqual(['เช็คคิว', 'รับงาน', 'สรุปงาน', 'รีเฟรช']);
    expect(JSON.stringify(withQueueQuickReply({ type: "text" }))).toContain("quickReply");
  });

  it('“รับงาน” เปิดการ์ดรับงานใหม่ ไม่ไปดึงคิว', () => {
    expect(parseQueueChatCommand('รับงาน')).toEqual({ kind: 'intake_card' });
    expect(parseQueueChatCommand('รันงาน')).toEqual({ kind: 'queue_take' });
    // "รีเฟรช" = แสดงการ์ดงานปัจจุบันใหม่ (เมนูช่วยเหลือใช้คำว่า "เมนู")
    expect(parseQueueChatCommand('รีเฟรช')).toEqual({ kind: 'current_job' });
    expect(parseQueueChatCommand('เมนู')).toEqual({ kind: 'menu' });

    expect(buildQueueMenuText()).toContain('เช็คคิว');
  });

  it('รับเฉพาะรูป/PDF สำหรับอ่านด้วย AI', () => {
    expect(isIntakeAiFile('image/jpeg', 'a.jpg')).toBe(true);
    expect(isIntakeAiFile('application/pdf', 'a.pdf')).toBe(true);
    expect(isIntakeAiFile('application/zip', 'a.zip')).toBe(false);
  });

  it('ไม่เดาข้อมูล: ค่า null ถูกตัดทิ้ง และเลขภาษีต้องครบ 13 หลัก', () => {
    const r = normalizeIntakeExtract({
      customerName: { value: 'ร้าน ก', confidence: 0.9 },
      phone: null,
      taxId: { value: '123', confidence: 0.9 },
      items: [{ title: 'ไวนิล', quantity: 2, unit: 'ผืน', confidence: 0.7 }, { title: '' }],
    }, 'a.pdf');
    expect(r.fields.customerName?.value).toBe('ร้าน ก');
    expect(r.fields.phone).toBeUndefined();
    expect(r.fields.taxId).toBeUndefined();
    expect(r.items).toHaveLength(1);
    expect(r.mode).toBe('live');
    const s = buildIntakeCardSummary(r);
    expect(s.lines).toHaveLength(4);
    expect(s.lines[1].value).toBe('ยังไม่ได้ระบุ');
    expect(s.reviewCount).toBe(0);
  });

  it('webhook เชื่อมการ์ดไฟล์ + ยกเลิก + prefill token', () => {
    const src = readFileSync('supabase/functions/line-webhook/index.ts', 'utf8');
    expect(src).toContain('extractIntakeFromLineFile');
    expect(src).toContain('sourceMessageId');
    expect(src).toContain('intake_ocr:');
    expect(src).toContain('withQueueQuickReply');
  });

  it('ฟอร์มอ่าน prefill จาก token ฝั่ง server เท่านั้น', () => {
    const fn = readFileSync('supabase/functions/film-intake-form/index.ts', 'utf8');
    expect(fn).toContain('prefill: row.prefill');
    expect(fn).toContain('cancelled_at');
    const page = readFileSync('src/pages/FilmIntakeForm.tsx', 'utf8');
    expect(page).toContain('prefill={prefill}');
  });
});
