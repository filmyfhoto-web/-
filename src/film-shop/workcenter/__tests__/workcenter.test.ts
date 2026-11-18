import { describe, expect, it } from 'vitest';
import {
  WORK_STATUSES, canDeliverOrder, computeTotals, defaultDept, deliverBlockReason, dueTone,
  emptyItem, initialJobStatus, isWorkStatus, jobStatusForOutsource, missingFieldsForStatus,
  nextWorkStatus, validateIntake,
} from '@/film-shop/workcenter/lib/workcenter';
import { buildInternalDocHtml } from '@/film-shop/workcenter/lib/printInternalDoc';

function item(over: Partial<ReturnType<typeof emptyItem>>) {
  return { ...emptyItem(Math.random().toString()), ...over };
}

describe('workcenter lib', () => {
  it('มี 11 สถานะตามที่ร้านใช้จริง', () => {
    expect(WORK_STATUSES).toHaveLength(11);
    expect(isWorkStatus('order_review')).toBe(true);
    expect(isWorkStatus('design_queue')).toBe(true);
    expect(isWorkStatus('waiting_outsource')).toBe(true);
    expect(isWorkStatus('nope')).toBe(false);
  });

  it('แมปหมวดงาน → ฝ่ายผลิตอัตโนมัติ', () => {
    expect(defaultDept('vinyl')).toBe('largeformat');
    expect(defaultDept('photo')).toBe('photo');
    expect(defaultDept('copy')).toBe('copy');
    expect(defaultDept('stationery')).toBe('front');
    expect(defaultDept(null)).toBe('front');
  });

  it('งานส่งร้านใหญ่เริ่มที่สถานะรอส่งร้านใหญ่', () => {
    expect(initialJobStatus(true)).toBe('waiting_outsource');
    expect(initialJobStatus(false)).toBe('new');
    expect(initialJobStatus(false, { channel: 'web' })).toBe('order_review');
    expect(initialJobStatus(false, { category: 'design' })).toBe('design_queue');
  });

  it('คำนวณยอดรวม ส่วนลด มัดจำ คงเหลือ และต้นทุน', () => {
    const t = computeTotals(
      [item({ quantity: '2', unitPrice: '100', costPrice: '60' }), item({ quantity: '3', unitPrice: '50', costPrice: '20' })],
      50, 100,
    );
    expect(t.subtotal).toBe(350);
    expect(t.cost).toBe(180);
    expect(t.total).toBe(300);
    expect(t.balance).toBe(200);
  });

  it('ตรวจความครบถ้วนของการรับงาน', () => {
    expect(validateIntake('', [])).toMatch('ลูกค้า');
    expect(validateIntake('สมชาย', [emptyItem('a')])).toMatch('อย่างน้อย 1 รายการ');
    expect(validateIntake('สมชาย', [item({ category: 'vinyl', title: 'ป้าย' })])).toBeNull();
    expect(validateIntake('สมชาย', [item({ category: 'vinyl', title: 'ป้าย', quantity: '0' })])).toMatch('จำนวน');
  });

  it('บอกงานเลยกำหนดและใกล้กำหนด', () => {
    const now = new Date('2026-08-08T10:00:00Z');
    expect(dueTone('2026-08-07T10:00:00Z', now)).toBe('overdue');
    expect(dueTone('2026-08-08T20:00:00Z', now)).toBe('soon');
    expect(dueTone('2026-08-20T10:00:00Z', now)).toBe('normal');
    expect(dueTone(null, now)).toBe('none');
  });

  it('สถานะใบสั่งผลิตร้านใหญ่ผลักสถานะงานย่อยถูกต้อง', () => {
    expect(jobStatusForOutsource('pending')).toBe('waiting_outsource');
    expect(jobStatusForOutsource('producing')).toBe('producing');
    expect(jobStatusForOutsource('received')).toBe('reviewing');
    expect(jobStatusForOutsource('problem')).toBe('waiting_info');
  });
});

describe('เอกสารภายใน', () => {
  it('พิมพ์ A4 แนวตั้ง มีคำเตือนเอกสารภายใน และไม่แสดงราคาขายในใบสั่งผลิต', () => {
    const html = buildInternalDocHtml({
      docTitle: 'ใบสั่งผลิต (ร้านใหญ่)',
      docNo: 'WO-2608-001',
      notice: 'เอกสารภายในร้าน / ไม่ใช่เอกสารทางบัญชี',
      meta: [{ label: 'ร้านผู้ผลิต', value: 'ร้านใหญ่ A' }],
      columns: ['no', 'title', 'size', 'qty', 'cost'],
      rows: [{ no: 1, title: 'ป้ายไวนิล', size: '1x3', quantity: 2, unit: 'ผืน', costPrice: 300 }],
    });
    expect(html).toContain('size: A4 portrait');
    expect(html).toContain('เอกสารภายในร้าน / ไม่ใช่เอกสารทางบัญชี');
    expect(html).toContain('ราคาทุน');
    expect(html).not.toContain('ราคา/หน่วย');
  });

  it('หนีอักขระ HTML กัน XSS ในเอกสาร', () => {
    const html = buildInternalDocHtml({
      docTitle: 'ใบรับงานภายใน',
      notice: 'เอกสารภายในร้าน / ไม่ใช่เอกสารทางบัญชี',
      meta: [],
      columns: ['no', 'title'],
      rows: [{ no: 1, title: '<script>alert(1)</script>' }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
describe('กฎการรันคิวงาน', () => {
  it('งานในร้านไปผลิต ส่วนงานร้านใหญ่แวะรอส่งร้านใหญ่ก่อน', () => {
    expect(nextWorkStatus('waiting_approval', false)).toBe('producing');
    expect(nextWorkStatus('waiting_approval', true)).toBe('waiting_outsource');
    expect(nextWorkStatus('done')).toBeNull();
    expect(nextWorkStatus('new')).toBe('order_review');
    expect(nextWorkStatus('order_review', false, 'design')).toBe('design_queue');
    expect(nextWorkStatus('order_review', false, 'print')).toBe('waiting_info');
    expect(nextWorkStatus('design_queue')).toBe('waiting_info');
  });

  it('บล็อกการเปลี่ยนสถานะเมื่อข้อมูลไม่ครบ', () => {
    expect(missingFieldsForStatus({ title: '', quantity: 0 }, 'waiting_approval')).toContain('ชื่องาน');
    expect(missingFieldsForStatus(
      { title: 'ป้าย', category: 'sign', quantity: 2, dueAt: '2026-01-01', dept: 'print', assignedEmployeeId: 'e1' },
      'producing',
    )).toEqual([]);
  });

  it('ปิดงานได้เมื่องานย่อยทุกใบผ่านขั้นตรวจแล้ว', () => {
    expect(canDeliverOrder([{ status: 'ready' }, { status: 'done' }])).toBe(true);
    expect(canDeliverOrder([{ status: 'ready' }, { status: 'producing' }])).toBe(false);
    expect(deliverBlockReason([{ status: 'producing', title: 'ป้าย' }])).toContain('ป้าย');
  });
});
