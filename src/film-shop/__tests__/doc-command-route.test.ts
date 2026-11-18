import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync('src/film-shop/FilmShopApp.tsx', 'utf8');
const legacy = /const LEGACY_PAGE_IDS = \[([\s\S]*?)\];/.exec(app)?.[1] ?? '';

describe('เมนูออกเอกสารด้วยคำสั่ง (doc-command)', () => {
  it('ไม่อยู่ในรายการหน้าเก่าที่ถูกเด้งกลับ Dashboard', () => {
    expect(legacy).not.toContain('doc-command');
  });
  it('มีชื่อเมนูภาษาไทยและเปิดหน้ารวมบอท+รายการเอกสาร', () => {
    expect(app).toContain("'doc-command': 'ออกเอกสารด้วยคำสั่ง (พิมพ์/เสียง)'");
    expect(app).toMatch(/case 'doc-command':\s*\n\s*return <ReceiptDocPage \/>;/);
  });
  it('หน้า invoices เป็นหน้าใบเสร็จ (แยกจากคิว)', () => {
    expect(app).toContain("invoices: 'ใบเสร็จรับเงิน'");
    expect(app).toMatch(/case 'invoices':\s*\n\s*return <QuickDocPage \/>;/);
  });
});
