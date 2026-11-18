import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('4 กลุ่มงานแยกจากกัน', () => {
  it('มีนิยามกลุ่มพร้อม prefix เลขเอกสาร', () => {
    const g = read('src/film-shop/lib/groups.ts');
    for (const k of ['colorlab', 'printing', 'filmshop', 'queue']) expect(g).toContain(k);
    for (const p of ['CL', 'NP', 'FS']) expect(g).toContain(`'${p}'`);
  });

  it('router รองรับ 4 กลุ่ม', () => {
    const app = read('src/film-shop/FilmShopApp.tsx');
    for (const id of ['group-colorlab', 'group-printing', 'group-filmshop', 'group-queue'])
      expect(app).toContain(`case '${id}'`);
  });

  it('หน้า Film Shop เหลือเมนูใบเสร็จ + กลับหน้าหลัก', () => {
    const p = read('src/film-shop/components/hub/FilmShopGroupPage.tsx');
    for (const label of ['ออกใบเสร็จ', 'ใบเสร็จที่บันทึกไว้', 'ช่วยสร้างใบเสร็จ'])
      expect(p).toContain(label);
    expect(p).toContain('onHome');
    expect(p).not.toContain('ใบสั่งจ้าง');
  });

  it('Q รันงานมีปุ่มเดิมครบและอยู่แยกจากร้าน', () => {
    const q = read('src/film-shop/components/hub/QueueGroupPage.tsx');
    for (const label of ['เช็คคิว', 'รับงาน', 'สรุปงาน', 'รีเฟรช']) expect(q).toContain(label);
    expect(q).toContain('q-control-card');
  });
});
