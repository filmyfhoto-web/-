import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('รวมแอปแอดมินเข้า Film Shop', () => {
  it('มีหน้า "ลิงก์เว็บแอป" ในเมนู Film Shop ทั้งเดสก์ท็อปและมือถือ', () => {
    expect(read('src/film-shop/components/layout/Sidebar.tsx')).toContain("id: 'applinks'");
    expect(read('src/film-shop/components/layout/MobileNav.tsx')).toContain("id: 'applinks'");
    expect(read('src/film-shop/FilmShopApp.tsx')).toContain("case 'applinks'");
  });



  it('ตั้งค่าเป็นหน้าเดียวมีสารบัญ ไม่แยกเป็นหลายหน้าในเมนู', () => {
    const set = read('src/film-shop/components/settings/SettingsManager.tsx');
    expect(set).toContain('fs-settings-toc');
    expect(set).not.toContain('TabsTrigger');
    const side = read('src/film-shop/components/layout/Sidebar.tsx');
    expect(side).not.toContain("id: 'notify-prefs'");
    expect(side).not.toContain("id: 'queue-settings'");
  });

  it('ไม่แตะเอกสารในหน้า Receipt & Delivery', () => {
    expect(read('src/film-shop/FilmShopApp.tsx')).toContain("case 'receipts':");
    expect(read('src/film-shop/FilmShopApp.tsx')).toContain("case 'documents':");
  });
});
