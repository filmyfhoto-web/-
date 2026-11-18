import { describe, it, expect } from 'vitest';
import {
  buildAutoOrderText,
  CONTEXT_MESSAGE_LIMIT,
} from '../../../supabase/functions/_shared/nattaqAutoOrder';
import { parseFilmJobMessage, intakeStatusFor } from '@/film-shop/lib/lineJobParser';

const NOW = new Date('2026-08-05T03:00:00Z');

describe('buildAutoOrderText', () => {
  it('รวมเฉพาะข้อความลูกค้า (inbound) และตัดข้อความซ้ำ', () => {
    const t = buildAutoOrderText(
      [
        { text: 'ชื่อ: ร้านลุงหมี', direction: 'inbound' },
        { text: 'สวัสดีครับ', direction: 'outbound' },
        { text: 'ชื่อ: ร้านลุงหมี', direction: 'inbound' },
        { text: 'จำนวน: 2 ผืน', direction: 'inbound' },
      ],
      'คอนเฟิร์ม',
    );
    expect(t).toBe('ชื่อ: ร้านลุงหมี\nจำนวน: 2 ผืน\nคอนเฟิร์ม');
  });

  it('จำกัดจำนวนบรรทัดตามบริบทที่กำหนด', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ text: `บรรทัด ${i}`, direction: 'inbound' }));
    expect(buildAutoOrderText(many, 'คอนเฟิร์ม').split('\n')).toHaveLength(CONTEXT_MESSAGE_LIMIT);
  });

  it('บริบทที่ครบทำให้ระบบพร้อมสร้างงานอัตโนมัติ', () => {
    const text = buildAutoOrderText(
      [
        { text: 'ชื่อ: ร้านลุงหมี', direction: 'inbound' },
        { text: 'งาน: ป้ายไวนิลเปิดร้าน', direction: 'inbound' },
        { text: 'จำนวน: 2 ผืน', direction: 'inbound' },
        { text: 'ไฟล์: มีแล้ว', direction: 'inbound' },
        { text: 'รับงาน: พรุ่งนี้ 14:00', direction: 'inbound' },
      ],
      'คอนเฟิร์ม',
    );
    expect(intakeStatusFor(parseFilmJobMessage(text, NOW))).toBe('ready');
  });

  it('บริบทไม่ครบ → ยังไม่สร้างงานอัตโนมัติ', () => {
    const text = buildAutoOrderText([{ text: 'อยากทำสติกเกอร์', direction: 'inbound' }], 'คอนเฟิร์ม');
    expect(intakeStatusFor(parseFilmJobMessage(text, NOW))).toBe('needs_review');
  });
});
