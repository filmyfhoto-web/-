import { describe, it, expect } from 'vitest';
import {
  parseFilmJobMessage,
  intakeStatusFor,
  parseThaiDueAt,
  buildDraftReply,
} from '@/film-shop/lib/lineJobParser';

// Fixed reference point: 2026-08-05 03:00 UTC = 10:00 Bangkok
const NOW = new Date('2026-08-05T03:00:00Z');

describe('parseFilmJobMessage', () => {
  it('reads a fully labelled Thai order message', () => {
    const p = parseFilmJobMessage(
      [
        'ชื่อ: ร้านลุงหมี',
        'งาน: ป้ายไวนิลเปิดร้าน',
        'จำนวน: 2 ผืน',
        'ขนาด: 2x3 เมตร',
        'ไฟล์: มีแล้ว',
        'รับงาน: พรุ่งนี้ 14:00',
        'หมายเหตุ: เจาะตาไก่ 4 มุม',
      ].join('\n'),
      NOW,
    );
    expect(p.isJobRequest).toBe(true);
    expect(p.customerName).toBe('ร้านลุงหมี');
    expect(p.title).toBe('ป้ายไวนิลเปิดร้าน');
    expect(p.jobType).toBe('vinyl');
    expect(p.quantity).toBe(2);
    expect(p.hasDesign).toBe(true);
    expect(p.sizeText).toBe('2x3 เมตร');
    expect(p.dueAtISO).toBe('2026-08-06T14:00:00+07:00');
    expect(p.notes).toBe('เจาะตาไก่ 4 มุม');
    expect(p.missing).toEqual([]);
    expect(intakeStatusFor(p)).toBe('ready');
  });

  it('never guesses — reports missing fields and stays in review', () => {
    const p = parseFilmJobMessage('อยากทำสติกเกอร์ครับ', NOW);
    expect(p.isJobRequest).toBe(true);
    expect(p.jobType).toBe('sticker');
    expect(p.missing).toContain('ชื่อลูกค้า');
    expect(p.missing).toContain('จำนวน');
    expect(p.missing).toContain('วันและเวลานัดรับ');
    expect(intakeStatusFor(p)).toBe('needs_review');
  });

  it('flags chit-chat as not a job request', () => {
    const p = parseFilmJobMessage('สวัสดีครับ', NOW);
    expect(p.isJobRequest).toBe(false);
    expect(intakeStatusFor(p)).toBe('not_a_job');
  });

  it('detects urgency and missing artwork', () => {
    const p = parseFilmJobMessage('ด่วนมากครับ ทำป้ายไวนิล 1 ผืน ยังไม่มีไฟล์ รับวันนี้ 16:30 ชื่อ: สมชาย', NOW);
    expect(p.isUrgent).toBe(true);
    expect(p.hasDesign).toBe(false);
    expect(p.dueAtISO).toBe('2026-08-05T16:30:00+07:00');
  });
});

describe('parseThaiDueAt', () => {
  it('reads explicit dd/mm with Buddhist year', () => {
    expect(parseThaiDueAt('รับ 12/9/2569', NOW)).toBe('2026-09-12T17:00:00+07:00');
  });
  it('rolls a past time to tomorrow', () => {
    expect(parseThaiDueAt('เอา 09:00', NOW)).toBe('2026-08-06T09:00:00+07:00');
  });
  it('returns undefined when nothing explicit is written', () => {
    expect(parseThaiDueAt('ทำป้ายให้หน่อย', NOW)).toBeUndefined();
  });
});

describe('buildDraftReply', () => {
  it('asks for missing info', () => {
    expect(buildDraftReply({ missing: ['จำนวน'] })).toContain('จำนวน');
  });
  it('confirms with order number and finish time', () => {
    const t = buildDraftReply({ orderNo: 'OR-2608-0001', finishAtText: '6 ส.ค. 14:00 น.' });
    expect(t).toContain('OR-2608-0001');
    expect(t).toContain('คาดว่าเสร็จ');
  });
});
