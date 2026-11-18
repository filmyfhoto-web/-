import { describe, it, expect } from 'vitest';
import {
  bucketsForJob, countBuckets, dailySummary, inQuietHours, unreadCount, sortFeed,
  type BucketJob, type FeedItem,
} from '../lib/controlRoom';

const NOW = new Date('2026-03-10T10:00:00.000Z');
const job = (o: Partial<BucketJob>): BucketJob => ({
  id: o.id ?? 'j1', status: o.status ?? 'new', dueAt: o.dueAt ?? null,
  assignedEmployeeId: o.assignedEmployeeId ?? null, isOutsourced: o.isOutsourced ?? false,
  qcStatus: o.qcStatus ?? null, pausedAt: o.pausedAt ?? null,
});

describe('bucketsForJob', () => {
  it('งานใหม่ยังไม่มีผู้รับผิดชอบ เข้าช่องรอมอบหมายและต้องจัดการทันที', () => {
    const b = bucketsForJob(job({}), 120, NOW);
    expect(b).toContain('unassigned');
    expect(b).toContain('act_now');
  });

  it('งานที่มอบหมายแล้วไม่เข้าช่องรอมอบหมาย', () => {
    expect(bucketsForJob(job({ assignedEmployeeId: 'e1' }), 120, NOW)).not.toContain('unassigned');
  });

  it('เลยกำหนดเข้าช่อง overdue + act_now', () => {
    const b = bucketsForJob(job({ status: 'producing', assignedEmployeeId: 'e1', dueAt: '2026-03-10T08:00:00.000Z' }), 120, NOW);
    expect(b).toEqual(expect.arrayContaining(['overdue', 'act_now']));
  });

  it('ใกล้ครบกำหนดตามเวลาที่ตั้ง', () => {
    const b = bucketsForJob(job({ status: 'producing', assignedEmployeeId: 'e1', dueAt: '2026-03-10T11:00:00.000Z' }), 120, NOW);
    expect(b).toContain('due_soon');
    expect(b).not.toContain('overdue');
  });

  it('QC ไม่ผ่านหรือพักงาน = ติดปัญหา', () => {
    expect(bucketsForJob(job({ qcStatus: 'fail', assignedEmployeeId: 'e1', status: 'reviewing' }), 120, NOW)).toContain('problem');
    expect(bucketsForJob(job({ pausedAt: NOW.toISOString(), assignedEmployeeId: 'e1', status: 'producing' }), 120, NOW)).toContain('problem');
  });

  it('รอร้านใหญ่ / รอตรวจ / พร้อมส่งมอบ แยกช่องถูกต้อง', () => {
    expect(bucketsForJob(job({ status: 'waiting_outsource', assignedEmployeeId: 'e1' }), 120, NOW)).toContain('outsource');
    expect(bucketsForJob(job({ status: 'reviewing', assignedEmployeeId: 'e1' }), 120, NOW)).toContain('reviewing');
    expect(bucketsForJob(job({ status: 'ready', assignedEmployeeId: 'e1' }), 120, NOW)).toContain('ready');
  });
});

describe('countBuckets / dailySummary', () => {
  it('นับงานหลายใบหลายช่อง', () => {
    const counts = countBuckets([job({ id: 'a' }), job({ id: 'b', status: 'ready', assignedEmployeeId: 'e1' })], 120, NOW);
    expect(counts.unassigned).toBe(1);
    expect(counts.ready).toBe(1);
  });

  it('สรุปประจำวัน: วันนี้ / เลยกำหนด / พรุ่งนี้ / ร้านใหญ่ / capacity', () => {
    const s = dailySummary([
      { ...job({ id: '1', dueAt: '2026-03-10T15:00:00.000Z' }), estimatedMinutes: 60 },
      { ...job({ id: '2', dueAt: '2026-03-09T15:00:00.000Z' }) },
      { ...job({ id: '3', dueAt: '2026-03-11T15:00:00.000Z' }) },
      { ...job({ id: '4', dueAt: '2026-03-10T16:00:00.000Z', isOutsourced: true }), estimatedMinutes: 30 },
      { ...job({ id: '5', status: 'done', dueAt: '2026-03-10T16:00:00.000Z' }), estimatedMinutes: 999 },
    ], 480, NOW);
    expect(s).toMatchObject({ today: 2, overdue: 1, tomorrow: 1, outsource: 1, capacityUsedMinutes: 90, capacityLimitMinutes: 480 });
  });
});

describe('inQuietHours', () => {
  it('ไม่ตั้งค่า = ไม่เงียบ', () => {
    expect(inQuietHours(null, null, NOW)).toBe(false);
  });
  it('รองรับช่วงข้ามเที่ยงคืน', () => {
    const at23 = new Date('2026-03-10T23:30:00');
    const at12 = new Date('2026-03-10T12:00:00');
    expect(inQuietHours('22:00', '07:00', at23)).toBe(true);
    expect(inQuietHours('22:00', '07:00', at12)).toBe(false);
  });
});

describe('feed', () => {
  const item = (o: Partial<FeedItem>): FeedItem => ({
    id: o.id ?? 'n1', kind: o.kind ?? 'overdue', severity: o.severity ?? 'info',
    status: o.status ?? 'new', readAt: o.readAt ?? null, snoozeUntil: o.snoozeUntil ?? null,
    createdAt: o.createdAt ?? NOW.toISOString(),
  });

  it('นับค้างไม่รวมที่อ่านแล้ว/รับทราบแล้ว/ยัง snooze', () => {
    const n = unreadCount([
      item({ id: '1' }),
      item({ id: '2', readAt: NOW.toISOString() }),
      item({ id: '3', status: 'acknowledged' }),
      item({ id: '4', snoozeUntil: '2026-03-10T12:00:00.000Z' }),
    ], NOW);
    expect(n).toBe(1);
  });

  it('เรียงตามความรุนแรงก่อน แล้วค่อยเวลาใหม่สุด', () => {
    const sorted = sortFeed([
      item({ id: 'a', severity: 'info', createdAt: '2026-03-10T09:00:00.000Z' }),
      item({ id: 'b', severity: 'critical', createdAt: '2026-03-10T08:00:00.000Z' }),
      item({ id: 'c', severity: 'critical', createdAt: '2026-03-10T09:30:00.000Z' }),
    ]).map((i) => i.id);
    expect(sorted).toEqual(['c', 'b', 'a']);
  });
});
