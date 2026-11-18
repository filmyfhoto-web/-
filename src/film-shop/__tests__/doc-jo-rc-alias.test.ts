import { describe, expect, it } from 'vitest';
import { expandDocBotAlias, parseDocBotCommand } from '../../../supabase/functions/_shared/docBotCommands.ts';
import { enforceQuotationFirst, parseSourceQuotationRef, isNextDocType } from '../../../supabase/functions/_shared/quotationFirst.ts';
import { lockCommandToRoomShop } from '../../../supabase/functions/_shared/docOnlyRoom.ts';

const NOW = new Date('2026-08-13T03:00:00Z');

describe('คำสั่งลัด /jo และ /rc', () => {
  it('/jo อ่านลูกค้า + รายการ + ราคาได้ และเป็นใบสั่งจ้าง', () => {
    const cmd = parseDocBotCommand('/jo โรงเรียน A | ปากกา 10 ด้าม | 5 บาท', NOW)!;
    expect(cmd.docType).toBe('job_order');
    expect(cmd.fields.customerName).toBe('โรงเรียน A');
    expect(cmd.fields.items[0]).toMatchObject({ quantity: 10, unit: 'ด้าม', unitPrice: 5 });
    expect(cmd.totals.total).toBe(50);
  });

  it('/jo แบบหลายบรรทัดก็อ่านได้เหมือนคำสั่งไทยเดิม', () => {
    const cmd = parseDocBotCommand('/jo\nลูกค้า: โรงเรียน B\nปากกา 10 ด้าม 5', NOW)!;
    expect(cmd.docType).toBe('job_order');
    expect(cmd.fields.customerName).toBe('โรงเรียน B');
  });

  it('ใบสั่งจ้างไม่ใช่เอกสารขั้นถัดไป — quotation-first ไม่เปลี่ยนชนิด', () => {
    const cmd = parseDocBotCommand('/jo โรงเรียน A | ปากกา 10 ด้าม | 5', NOW)!;
    expect(isNextDocType('job_order')).toBe(false);
    expect(enforceQuotationFirst(cmd, null).command.docType).toBe('job_order');
  });

  it('/jo ล็อกร้านตามห้องเอกสาร', () => {
    const cmd = parseDocBotCommand('/jo โรงเรียน A | ปากกา 10 ด้าม | 5', NOW)!;
    expect(lockCommandToRoomShop(cmd, 'colorlab').command.fields.shopKey).toBe('colorlab');
  });

  it('/rc งานใหม่ยังถูกบังคับให้เริ่มจากใบเสนอราคา', () => {
    const cmd = parseDocBotCommand('/rc โรงเรียน A | ปากกา 10 ด้าม | 5\nชำระแล้ว เงินสด', NOW)!;
    expect(cmd.docType).toBe('receipt');
    const out = enforceQuotationFirst(cmd, null);
    expect(out.command.docType).toBe('quotation');
    expect(out.notices.join(' ')).toContain('ใบเสนอราคา');
  });

  it('/rc จาก QT-xxxx อ่านเลขใบเสนอราคาต้นทางได้', () => {
    const text = '/rc จาก QT-2026-0001';
    expect(parseSourceQuotationRef(text)).toBe('QT-2026-0001');
    const cmd = parseDocBotCommand(text, NOW)!;
    expect(cmd.docType).toBe('receipt');
    expect(expandDocBotAlias(text)).toContain('ออกใบเสร็จ');
  });
});
