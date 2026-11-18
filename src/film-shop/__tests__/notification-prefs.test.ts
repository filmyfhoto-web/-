import { describe, expect, it } from 'vitest';
import { inQuietHours, kindChannels, kindEnabled, shouldNotify } from '@/film-shop/lib/notificationKinds';

describe('notificationKinds', () => {
  it('เปิดใช้งานทุกประเภทโดยค่าเริ่มต้น', () => {
    expect(kindEnabled({}, 'low_stock')).toBe(true);
    expect(kindEnabled({ low_stock: false }, 'low_stock')).toBe(false);
  });

  it('ช่องทางรายประเภทยึดค่าเริ่มต้นเมื่อยังไม่ตั้ง', () => {
    expect(kindChannels(undefined, 'new_job')).toEqual({ in_app: true, sound: true, push: true, line: false });
    expect(kindChannels({ new_job: { push: false } }, 'new_job').push).toBe(false);
  });

  it('สวิตช์หลักปิดแล้วต้องไม่แจ้งเตือน', () => {
    expect(shouldNotify({ master: { push: false } }, 'new_job', 'push')).toBe(false);
    expect(shouldNotify({ kinds: { new_job: false } }, 'new_job', 'in_app')).toBe(false);
    expect(shouldNotify({ perKind: { new_job: { line: true } } }, 'new_job', 'line')).toBe(true);
  });

  it('ช่วงห้ามรบกวนรองรับการข้ามเที่ยงคืน', () => {
    const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m);
    expect(inQuietHours('22:00', '07:00', at(23))).toBe(true);
    expect(inQuietHours('22:00', '07:00', at(3))).toBe(true);
    expect(inQuietHours('22:00', '07:00', at(12))).toBe(false);
    expect(inQuietHours(null, '07:00', at(23))).toBe(false);
  });
});
