import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/film-shop/components/invoices/InvoiceManager.tsx', 'utf8');

describe('หน้าจัดการใบเสร็จรับเงิน (Receipt Only)', () => {
  it('ไม่มีแท็บประเภทเอกสารเหลืออยู่', () => {
    expect(src).not.toMatch(/<TabsTrigger/);
  });
  it('ไม่มีใบสั่งจ้างในหน้านี้แล้ว', () => {
    expect(src).not.toContain('job_order');
    expect(src).not.toContain('ใบสั่งจ้าง');
  });
  it('รายการจำกัดเฉพาะใบเสร็จ', () => {
    expect(src).toContain("(i) => i.type === 'receipt'");
  });
  it('มีปุ่มบันทึก PNG และ PDF ในแต่ละแถว', () => {
    expect(src).toContain('doc-download-png');
    expect(src).toContain('doc-download-pdf');
  });
});
