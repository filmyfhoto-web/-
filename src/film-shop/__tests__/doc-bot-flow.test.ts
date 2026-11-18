import { describe, expect, it } from 'vitest';
import {
  parseDocOrderRefs,
  hasDocOrderRefs,
  isDocConfirmText,
  isDocCancelText,
  parseDocEditCommand,
  applyDocEditPatch,
  isDocEditHelpText,
  shopKeyFromSlug,
  parseOrderSelection,
  mergeSelectedOrders,
  buildOrderPickSummaryText,
  type DocOrderCandidate,
} from '../../../supabase/functions/_shared/docBotFlow.ts';
import { parseDocBotCommand } from '../../../supabase/functions/_shared/docBotCommands.ts';

const NOW = new Date('2026-08-12T03:00:00Z');

describe('doc bot flow', () => {
  it('reads order numbers and date ranges', () => {
    expect(parseDocOrderRefs('ออกใบเสร็จ ออเดอร์ FY-0001', NOW).orderNos).toEqual(['FY-0001']);
    const r = parseDocOrderRefs('ช่วงวันที่ 1/8 - 7/8', NOW);
    expect(r.from).toBe('2026-08-01');
    expect(r.to).toBe('2026-08-07');
    expect(hasDocOrderRefs(r)).toBe(true);
    expect(hasDocOrderRefs(parseDocOrderRefs('ออกใบเสร็จ การพิมพ์', NOW))).toBe(false);
  });

  it('detects confirm / cancel', () => {
    expect(isDocConfirmText('ยืนยัน')).toBe(true);
    expect(isDocCancelText('ยกเลิก')).toBe(true);
    expect(isDocConfirmText('ออกใบเสร็จ')).toBe(false);
  });

  it('edits name, items and quantity in one reply and recomputes totals', () => {
    const cmd = parseDocBotCommand(
      ['ออกใบเสร็จ การพิมพ์', 'ลูกค้า: คุณสมชาย', 'ปริ้นงาน A4 10 แผ่น 10', 'ชำระแล้ว เงินสด'].join('\n'),
      NOW,
    )!;
    expect(cmd.totals.total).toBe(100);

    const patch = parseDocEditCommand('แก้ ลูกค้า: คุณมานี / จำนวน ปริ้นงาน 20')!;
    const next = applyDocEditPatch(cmd, patch);
    expect(next.fields.customerName).toBe('คุณมานี');
    expect(next.fields.items[0].quantity).toBe(20);
    expect(next.totals.total).toBe(200);
    expect(next.missing).toHaveLength(0);
  });

  it('maps store slug to shop key', () => {
    expect(isDocEditHelpText('แก้ไข')).toBe(true);
    expect(shopKeyFromSlug('printing')).toBe('printing');
    expect(shopKeyFromSlug('unknown')).toBeNull();
  });

  it('edits header fields, adds and removes items after preview', () => {
    const cmd = parseDocBotCommand(
      ['ออกใบเสนอราคา การพิมพ์', 'ลูกค้า: คุณเอ', 'ปริ้นงาน A4 10 แผ่น 10', 'เคลือบมัน 5 ชิ้น 20'].join('\n'),
      NOW,
    )!;
    const patch = parseDocEditCommand('แก้ สาขา: สำนักงานใหญ่ / กระดาษ: A5 / วันที่เอกสาร: 13/8 / พร้อม: ใบส่งของ / ลบรายการ เคลือบมัน / เพิ่ม ไดคัท 2 ชิ้น 50', NOW)!;
    const next = applyDocEditPatch(cmd, patch);
    expect(next.doc?.customerBranch).toBe('สำนักงานใหญ่');
    expect(next.doc?.paperSize).toBe('A5');
    expect(next.doc?.documentDate).toBe('2026-08-13');
    expect(next.doc?.companions).toEqual(['delivery_note']);
    expect(next.fields.items.map((i) => i.description)).toEqual(['ปริ้นงาน A4', 'ไดคัท']);
    expect(next.totals.subtotal).toBe(200);
  });

  it('reads header fields and companion documents from the command', () => {
    const cmd = parseDocBotCommand(
      [
        'ออกใบเสนอราคา การพิมพ์',
        'ลูกค้า: โรงเรียนบ้านเชียงกลาง',
        'สาขา: สำนักงานใหญ่',
        'กระดาษ: A4',
        'ประเภทราคา: ราคาก่อน VAT',
        'วันที่เอกสาร: 13/8',
        'พร้อม: ใบส่งของ, ใบเสร็จ',
        'ปริ้นงาน A4 10 แผ่น 10',
      ].join('\n'),
      NOW,
    )!;
    expect(cmd.doc.customerBranch).toBe('สำนักงานใหญ่');
    expect(cmd.doc.paperSize).toBe('A4');
    expect(cmd.doc.priceType).toBe('exclude_vat');
    expect(cmd.doc.documentDate).toBe('2026-08-13');
    expect(cmd.doc.companions).toEqual(['delivery_note', 'receipt']);
    expect(cmd.fields.items).toHaveLength(1);
    expect(cmd.totals.subtotal).toBe(100);
  });

  const candidates: DocOrderCandidate[] = [1, 2, 3].map((n) => ({
    orderNo: `FY-000${n}`,
    customerName: n === 1 ? 'คุณเอ' : null,
    customerPhone: n === 1 ? '0812345678' : null,
    dateText: `2026-08-0${n}`,
    items: [{ description: `งาน ${n}`, quantity: n, unit: 'ชิ้น', unitPrice: 10, discount: 0, total: n * 10 }],
    total: n * 10,
  }));

  it('parses order selections', () => {
    expect(parseOrderSelection('เลือกทั้งหมด', 3)).toEqual({ all: true, indexes: [1, 2, 3] });
    expect(parseOrderSelection('เลือก 1,3', 3)).toEqual({ all: false, indexes: [1, 3] });
    expect(parseOrderSelection('เลือก 1-3', 3)).toEqual({ all: true, indexes: [1, 2, 3] });
    expect(parseOrderSelection('ออกใบเสร็จ', 3)).toBeNull();
    expect(parseOrderSelection('เลือก 9', 3)).toBeNull();
  });

  it('merges selected orders and summarises totals', () => {
    const merged = mergeSelectedOrders(candidates, [1, 3])!;
    expect(merged.orderNos).toEqual(['FY-0001', 'FY-0003']);
    expect(merged.items).toHaveLength(2);
    expect(merged.customerName).toBe('คุณเอ');
    expect(buildOrderPickSummaryText(candidates, [1, 3])).toContain('40.00');
  });
});
