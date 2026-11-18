import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  JOB_STAGES,
  JOB_STAGE_LABELS,
  autoAssignJobs,
  nextJobStage,
  pickAssignee,
  pickReassignee,
  workloadByEmployee,
  type AssignableEmployee,
  type AssignableJob,
} from '@/film-shop/lib/jobAssignment';

const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');

const emp = (id: string, name: string, extra: Partial<AssignableEmployee> = {}): AssignableEmployee =>
  ({ id, name, isActive: true, isAvailable: true, jobTypes: [], ...extra });
const job = (id: string, extra: Partial<AssignableJob> = {}): AssignableJob =>
  ({ id, jobType: null, estimatedMinutes: 60, stage: 'intake', assignedEmployeeId: null, ...extra });

describe('kanban stages', () => {
  it('has the 4 Thai stages in order', () => {
    expect(JOB_STAGES.map((s) => JOB_STAGE_LABELS[s])).toEqual(['รับงาน', 'กำลังทำ', 'รอตรวจ', 'พร้อมส่ง']);
    expect(nextJobStage('intake')).toBe('doing');
    expect(nextJobStage('ready')).toBeNull();
  });
});

describe('auto assignment', () => {
  it('counts only unfinished work as workload', () => {
    const load = workloadByEmployee([
      job('a', { assignedEmployeeId: 'e1', estimatedMinutes: 30 }),
      job('b', { assignedEmployeeId: 'e1', estimatedMinutes: 90, stage: 'ready' }),
    ]);
    expect(load).toEqual({ e1: 30 });
  });

  it('prefers a skilled employee over a generalist', () => {
    const pick = pickAssignee({ jobType: 'vinyl' }, [emp('e1', 'ทั่วไป'), emp('e2', 'ช่างไวนิล', { jobTypes: ['vinyl'] })], {});
    expect(pick?.id).toBe('e2');
  });

  it('picks the least loaded available employee', () => {
    const pick = pickAssignee({ jobType: null }, [emp('e1', 'A'), emp('e2', 'B')], { e1: 120, e2: 30 });
    expect(pick?.id).toBe('e2');
  });

  it('skips inactive or unavailable employees', () => {
    const pick = pickAssignee({ jobType: null }, [emp('e1', 'A', { isAvailable: false }), emp('e2', 'B', { isActive: false })], {});
    expect(pick).toBeNull();
  });

  it('spreads pending jobs instead of stacking them on one person', () => {
    const plan = autoAssignJobs([job('j1'), job('j2')], [emp('e1', 'A'), emp('e2', 'B')]);
    expect(new Set(plan.map((p) => p.employeeId)).size).toBe(2);
  });

  it('reassigns to somebody else when the owner is not ready', () => {
    const j = job('j1', { assignedEmployeeId: 'e1' });
    const pick = pickReassignee(j, [emp('e1', 'A'), emp('e2', 'B')], [j]);
    expect(pick?.id).toBe('e2');
  });
});

describe('board wiring', () => {
  it('renders 4 columns, persistent queue numbers and auto-assign', () => {
    const src = read('src/film-shop/components/board/JobKanbanBoard.tsx');
    expect(src).toContain('data-testid="film-job-queue-no"');
    expect(src).toContain('data-testid="film-auto-assign"');
    expect(src).toContain('JOB_STAGES.map(column)');
  });
  it('is reachable from the Film Shop app', () => {
    const app = read('src/film-shop/FilmShopApp.tsx');
    expect(app).toContain('JobKanbanBoard');
    expect(app).toContain("'job-board'");
  });
});
