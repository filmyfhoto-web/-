import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUEUE_SETTINGS,
  addWorkingMinutes,
  estimateMinutes,
  nextWorkingInstant,
  scheduleQueue,
  type QueueSettings,
  type SchedulableJob,
} from '@/film-shop/lib/queueScheduler';

const S: QueueSettings = { ...DEFAULT_QUEUE_SETTINGS, openTime: '09:00', closeTime: '17:00', bufferMinutes: 0, capacity: 1 };
// 2026-08-05 is a Wednesday. 03:00Z = 10:00 Bangkok.
const NOW = new Date('2026-08-05T03:00:00Z');

const job = (id: string, minutes: number, extra: Partial<SchedulableJob> = {}): SchedulableJob => ({
  id, priority: 100, isUrgent: false, estimatedMinutes: minutes, ...extra,
});

describe('estimateMinutes', () => {
  it('uses setup + per-unit time from the standard durations', () => {
    const d = [{ jobType: 'vinyl', setupMinutes: 20, minutesPerUnit: 15 }, { jobType: 'other', setupMinutes: 15, minutesPerUnit: 10 }];
    expect(estimateMinutes('vinyl', 4, d)).toBe(80);
    expect(estimateMinutes('unknown', 2, d)).toBe(35);
  });
});

describe('business hours', () => {
  it('pushes before-open work to opening time', () => {
    const before = Date.parse('2026-08-05T00:00:00Z'); // 07:00 BKK
    expect(new Date(nextWorkingInstant(before, S)).toISOString()).toBe('2026-08-05T02:00:00.000Z');
  });
  it('spills overtime into the next working day', () => {
    // start 16:00 BKK, 120 minutes → 1h today + 1h tomorrow from 09:00
    const start = Date.parse('2026-08-05T09:00:00Z');
    expect(new Date(addWorkingMinutes(start, 120, S)).toISOString()).toBe('2026-08-06T03:00:00.000Z');
  });
  it('skips non-working days', () => {
    const sunday = { ...S, workingDays: [1, 2, 3, 4, 5, 6] };
    const satEvening = Date.parse('2026-08-08T11:00:00Z'); // Sat 18:00 BKK (closed)
    expect(new Date(nextWorkingInstant(satEvening, sunday)).toISOString()).toBe('2026-08-10T02:00:00.000Z');
  });
});

describe('scheduleQueue', () => {
  it('queues jobs back to back within business hours', () => {
    const plan = scheduleQueue([job('a', 60), job('b', 30)], S, NOW);
    expect(plan.a.start.toISOString()).toBe('2026-08-05T03:00:00.000Z');
    expect(plan.a.finish.toISOString()).toBe('2026-08-05T04:00:00.000Z');
    expect(plan.b.start.toISOString()).toBe('2026-08-05T04:00:00.000Z');
  });

  it('puts urgent jobs first', () => {
    const plan = scheduleQueue([job('a', 60), job('u', 30, { isUrgent: true })], S, NOW);
    expect(plan.u.start.getTime()).toBeLessThan(plan.a.start.getTime());
  });

  it('never moves a locked job and never overlaps it', () => {
    const locked = job('L', 60, {
      scheduleLocked: true,
      plannedStartAt: '2026-08-05T03:00:00.000Z',
      plannedFinishAt: '2026-08-05T04:00:00.000Z',
    });
    const plan = scheduleQueue([locked, job('u', 30, { isUrgent: true })], S, NOW);
    expect(plan.L.start.toISOString()).toBe('2026-08-05T03:00:00.000Z');
    expect(plan.L.locked).toBe(true);
    expect(plan.u.start.getTime()).toBeGreaterThanOrEqual(plan.L.finish.getTime());
  });

  it('runs jobs in parallel up to the shop capacity', () => {
    const plan = scheduleQueue([job('a', 60), job('b', 60)], { ...S, capacity: 2 }, NOW);
    expect(plan.a.start.toISOString()).toBe(plan.b.start.toISOString());
  });
});
