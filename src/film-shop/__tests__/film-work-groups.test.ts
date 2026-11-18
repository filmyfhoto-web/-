import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ORDER_STATUSES, WORK_GROUPS, WORK_GROUP_LABELS, workGroupOf } from '@/film-shop/types/order';

const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');

describe('film shop work groups', () => {
  it('exposes the 5 staff-facing groups in Thai', () => {
    expect(WORK_GROUPS).toHaveLength(6);
    expect(WORK_GROUPS.map((g) => WORK_GROUP_LABELS[g])).toEqual([
      'ใหม่', 'กำลังทำ', 'รอลูกค้า/ข้อมูล', 'พร้อมรับ/ส่ง', 'เสร็จแล้ว', 'ยกเลิก',
    ]);
  });

  it('maps every status to exactly one group', () => {
    for (const s of ORDER_STATUSES) expect(WORK_GROUPS).toContain(workGroupOf(s));
    expect(workGroupOf('waiting_info')).toBe('waiting');
    expect(workGroupOf('waiting_customer')).toBe('waiting');
    expect(workGroupOf('waiting_design')).toBe('inbox');
    expect(workGroupOf('producing')).toBe('doing');
    expect(workGroupOf('ready')).toBe('ready');
    expect(workGroupOf('delivered')).toBe('done');
    expect(workGroupOf('cancelled')).toBe('cancelled');
  });

  it('order detail keeps status actions and attachments on one screen', () => {
    const detail = read('src/film-shop/components/orders/OrderDetailDialog.tsx');
    expect(detail).toContain('data-testid="order-status-bar"');
    expect(detail).toContain('data-testid="order-attachments"');
  });

  it('order list filters by work group', () => {
    const mgr = read('src/film-shop/components/orders/OrderManager.tsx');
    expect(mgr).toContain('workGroupOf(o.status) === filter');
    expect(mgr).toContain('autoFocusSearch');
  });
});
