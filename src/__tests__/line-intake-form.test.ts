import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildQueueIntakePayload, emptyQueueDraft } from '@/film-shop/lib/queueIntake';
import { intakeFormUrl, buildIntakeFormFlex, buildIntakeSummaryFlex } from '../../supabase/functions/_shared/intakeFormLink';

describe('ฟอร์มรับงานจากกลุ่ม LINE', () => {
  it('payload ส่งโหมดเอกสารและ flag ใบเสร็จ', () => {
    const d = { ...emptyQueueDraft(), customerName: 'ก', docs: 'queue_only' as const, prepareReceipt: true };
    d.items[0] = { ...d.items[0], title: 'งาน', quantity: 1, unitPrice: 10 };
    const p = buildQueueIntakePayload(d, 'r1') as any;
    expect(p.docs).toBe('queue_only');
    expect(p.prepare_receipt).toBe(true);
  });

  it('ค่าเริ่มต้นคือคิวอย่างเดียว (ไม่มีใบสั่งจ้าง)', () => {
    const p = buildQueueIntakePayload({ ...emptyQueueDraft(), customerName: 'ข' }, 'r2') as any;
    expect(p.docs).toBe('queue_only');
    expect(p.prepare_receipt).toBe(false);
  });

  it('ลิงก์ฟอร์มแนบ token และชี้หน้า /film-intake', () => {
    expect(intakeFormUrl('https://x.app/', 'abc')).toBe('https://x.app/film-intake?t=abc');
  });

  it('การ์ดเปิดฟอร์มมีปุ่ม uri เดียว ไม่โชว์ URL ดิบ', () => {
    const flex: any = buildIntakeFormFlex('https://x.app/film-intake?t=abc', 'FILM SHOP');
    const body = JSON.stringify(flex.contents.body.contents.filter((c: any) => c.type === 'text'));
    expect(body).not.toContain('http');
    expect(flex.contents.body.contents.some((c: any) => c.action?.type === 'uri')).toBe(true);
  });

  it('การ์ดสรุปมีเลขคิว ลูกค้า และปุ่มดูคิว/ใบเสร็จ', () => {
    const flex: any = buildIntakeSummaryFlex({
      orderNo: 'OR-1', customerName: 'ค', items: [{ title: 'ป้าย', quantity: 2, unit: 'ผืน' }],
      dueText: '18/8 10:00 น.', queueUrl: 'https://q', docsUrl: 'https://d',
    });
    const s = JSON.stringify(flex);
    expect(s).toContain('OR-1');
    expect(s).toContain('ป้าย');
    expect(s).toContain('ดูใบเสร็จ');
    expect(s).not.toContain('ใบสั่งจ้าง');
    expect(flex.contents.footer.contents).toHaveLength(2);
  });

  it('webhook ตอบการ์ดฟอร์มเมื่อพิมพ์ “สั่งงาน” ในกลุ่ม และยังมี flow พิมพ์ทีละข้อ', () => {
    const src = readFileSync('supabase/functions/line-webhook/index.ts', 'utf8');
    expect(src).toContain('createIntakeFormToken');
    expect(src).toMatch(/cmd\?\.kind === "start" && groupId/);
    expect(src).toContain('applyIntakeMessage');
  });

  it('edge function ไม่เชื่อ groupId/ร้าน จาก client', () => {
    const src = readFileSync('supabase/functions/film-intake-form/index.ts', 'utf8');
    expect(src).toContain('film_intake_form_tokens');
    expect(src).toContain('invalid_or_expired_token');
    expect(src).not.toMatch(/body\??\.\s*group_id/);
  });
});
