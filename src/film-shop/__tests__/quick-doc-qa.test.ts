import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { quickDocPaymentFields } from '@/film-shop/lib/quickDocPayment';

const MIG_DIR = 'supabase/migrations';
const allMigrations = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(`${MIG_DIR}/${f}`, 'utf8'))
  .join('\n');

const SEED = [
  ['ถ่ายเอกสาร A4 ขาวดำ', '1'],
  ['ปริ้นสี A4', '10'],
  ['รูปถ่าย 1 นิ้ว 1 โหล', '120'],
  ['เข้าเล่มห่วง A4', '35'],
  ['เคลือบ A4', '20'],
  ['ออกแบบงานทั่วไป', '150'],
] as const;

describe('QA รายการด่วน + สถานะชำระเงิน', () => {
  it('มี migration seed รายการด่วน 6 รายการ และเป็นแบบ idempotent', () => {
    for (const [name, price] of SEED) {
      expect(allMigrations).toContain(name);
      expect(allMigrations).toMatch(new RegExp(`${name}'[^\\n]*${price}`));
    }
    expect(allMigrations).toMatch(/WHERE NOT EXISTS\s*\(\s*SELECT 1 FROM public\.film_quick_items/i);
  });

  it('RLS ของ film_quick_items ไม่ใช่ USING (true) และผูกกับสิทธิ์พนักงาน', () => {
    const policyBlocks = allMigrations
      .split(/CREATE POLICY/g)
      .filter((b) => b.includes('film_quick_items'));
    expect(policyBlocks.length).toBeGreaterThan(0);
    const latest = policyBlocks.slice(-4);
    for (const b of latest) {
      expect(b).not.toMatch(/USING \(true\)/);
      expect(b).not.toMatch(/WITH CHECK \(true\)/);
      expect(b).toContain('auth.uid()');
      const viaRolesTable = b.includes('public.user_roles');
      const viaStaffHelper = /public\.is_staff(_any)?\s*\(/.test(b);
      expect(viaRolesTable || viaStaffHelper).toBe(true);
      if (viaRolesTable) {
        for (const role of ['owner', 'admin', 'stock_staff', 'photo_staff', 'staff']) {
          expect(b).toContain(`'${role}'`);
        }
      }
    }
  });

  it('การแก้รายการใช้ draft ต่อแถว ไม่ยิง update ทุก keystroke', () => {
    const src = readFileSync('src/film-shop/components/quickdoc/QuickItemsManager.tsx', 'utf8');
    // ไม่มี onChange ที่เรียก update() ตรงๆ ในช่องข้อความ
    expect(src).not.toMatch(/onChange=\{\(e\) => update\(/);
    expect(src).toContain('setDraft({ ...draft, name: e.target.value })');
    expect(src).toContain('onBlur={() => void save()}');
    expect(src).toContain("useState<'idle' | 'saving' | 'saved'>");
    // กัน race: มีคิวและ flag in-flight
    expect(src).toContain('inFlight');
    expect(src).toContain('queued');
  });

  it('ตัวอย่างใบเสร็จที่ยังไม่ชำระ = pending / amountDue เต็ม / ไม่มี paidAt', () => {
    const pending = quickDocPaymentFields('receipt', false, 250);
    expect(pending.status).toBe('pending');
    expect(pending.amountDue).toBe(250);
    expect(pending.paidAt).toBeUndefined();
    expect('paidAt' in pending).toBe(false);
  });

  it('ใบเสร็จที่ชำระแล้ว = paid / amountDue 0 / มี paidAt', () => {
    const paid = quickDocPaymentFields('receipt', true, 250);
    expect(paid.status).toBe('paid');
    expect(paid.amountDue).toBe(0);
    expect(paid.paidAt).toBeInstanceOf(Date);
  });

  it('หน้าออกเอกสารด่วนใช้ helper เดียวกันทั้งตอนบันทึกและตอนดูตัวอย่าง', () => {
    const page = readFileSync('src/film-shop/components/quickdoc/QuickDocPage.tsx', 'utf8');
    const uses = page.match(/quickDocPaymentFields\(docKind, paid, netTotal\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
});
