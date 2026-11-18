import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { sortQuickItems, type QuickItem } from '@/film-shop/hooks/useQuickItems';

const read = (p: string) => readFileSync(p, 'utf8');

const item = (p: Partial<QuickItem>): QuickItem => ({
  id: p.id ?? 'x', name: p.name ?? 'n', price: p.price ?? 0, unit: p.unit ?? 'ชิ้น',
  category: p.category ?? 'other', pinned: p.pinned ?? false, active: p.active ?? true,
  sort_order: p.sort_order ?? 0,
});

describe('ออกเอกสารด่วน (Film Shop)', () => {
  it('ลงทะเบียนหน้า quick-doc ใน FilmShopApp พร้อมเปิดจาก URL ได้', () => {
    const app = read('src/film-shop/FilmShopApp.tsx');
    expect(app).toContain("'quick-doc': 'ออกใบเสร็จด่วน'");
    expect(app).toContain("case 'quick-doc'");
    expect(app).toContain("currentPage === 'quick-doc'");
  });

  it('มีเมนูเข้าหน้าทั้งเดสก์ท็อปและมือถือ', () => {
    expect(read('src/film-shop/components/layout/Sidebar.tsx')).toContain("id: 'quick-doc'");
    expect(read('src/film-shop/components/layout/MobileNav.tsx')).toContain("id: 'quick-doc'");
  });

  it('ลิงก์เว็บแอปของ Film Shop เปลี่ยนจาก POS จอสัมผัส เป็น ออกเอกสารด่วน', () => {
    const links = read('src/film-shop/components/tools/FilmAppLinksPage.tsx');
    expect(links).not.toContain('PosLinksCard');
    expect(links).toContain('/film-shop/app?p=quick-doc');
  });

  it('POS กลางของร้านอื่นยังอยู่ครบ', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('path="/pos"');
    expect(read('src/components/admin/PosLinksCard.tsx')).toBeTruthy();
  });

  it('ออกได้เฉพาะใบเสร็จ ไม่มีใบสั่งจ้างในหน้านี้', () => {
    const page = read('src/film-shop/components/quickdoc/QuickDocPage.tsx');
    expect(page).toContain("const docKind = 'receipt' as const");
    expect(page).not.toContain('ใบสั่งจ้าง');
    expect(page).not.toContain('ใบเสนอราคา');
    expect(page).not.toContain('ใบส่งของ');
  });

  it('ใช้ระบบเอกสารเดิม (useAppData + buildFilmDocPayload + preview เดิม)', () => {
    const page = read('src/film-shop/components/quickdoc/QuickDocPage.tsx');
    expect(page).toContain('useAppData');
    expect(page).toContain('buildFilmDocPayload');
    expect(page).toContain('nextFilmDocNumber');
    expect(page).toContain('InvoicePreviewNew');
    expect(page).toContain('if (saving) return;');
  });

  it('รายการด่วนบันทึกในฐานข้อมูล ไม่ใช่ hard-code', () => {
    const hook = read('src/film-shop/hooks/useQuickItems.ts');
    expect(hook).toContain("film_quick_items");
    expect(hook).not.toContain('localStorage');
  });

  it('เรียงรายการด่วน: ปักหมุดขึ้นก่อน แล้วตาม sort order', () => {
    const sorted = sortQuickItems([
      item({ id: 'a', name: 'A', sort_order: 1 }),
      item({ id: 'b', name: 'B', sort_order: 5, pinned: true }),
      item({ id: 'c', name: 'C', sort_order: 0 }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});
