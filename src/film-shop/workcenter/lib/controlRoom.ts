import type { WorkStatus } from '@/film-shop/workcenter/lib/workcenter';

export type Severity = 'info' | 'watch' | 'urgent' | 'critical';

export const SEVERITY_LABELS: Record<Severity, string> = {
  info: 'ข้อมูล', watch: 'ควรดู', urgent: 'เร่งด่วน', critical: 'วิกฤต',
};

export const SEVERITY_TONE: Record<Severity, string> = {
  info: 'border-border text-muted-foreground',
  watch: 'border-primary/40 text-primary',
  urgent: 'border-warning/50 bg-warning/10 text-warning',
  critical: 'border-destructive/50 bg-destructive/10 text-destructive',
};

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, watch: 1, urgent: 2, critical: 3 };

export const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  unassigned: 'งานใหม่ยังไม่มีผู้รับผิดชอบ',
  missing_info: 'ข้อมูล/ไฟล์ไม่ครบ',
  sla_soon: 'ใกล้ครบกำหนด',
  overdue: 'เลยกำหนด',
  stalled: 'งานหยุดนิ่ง',
  outsource_late: 'ร้านใหญ่ช้า',
  qc_fail: 'QC ไม่ผ่าน',
  deposit_missing: 'มัดจำไม่ครบก่อนผลิต',
  message_failed: 'ส่งข้อความลูกค้าไม่สำเร็จ',
};

export const CONTROL_BUCKETS = [
  'act_now', 'unassigned', 'due_soon', 'overdue', 'problem', 'outsource', 'reviewing', 'ready',
] as const;
export type ControlBucket = (typeof CONTROL_BUCKETS)[number];

export const BUCKET_LABELS: Record<ControlBucket, string> = {
  act_now: 'ต้องจัดการทันที',
  unassigned: 'งานใหม่รอมอบหมาย',
  due_soon: 'ใกล้ครบกำหนด',
  overdue: 'เลยกำหนด',
  problem: 'ติดปัญหา',
  outsource: 'รอร้านใหญ่',
  reviewing: 'รอตรวจ',
  ready: 'พร้อมส่งมอบ',
};

export interface BucketJob {
  id: string;
  status: WorkStatus;
  dueAt: string | null;
  assignedEmployeeId: string | null;
  isOutsourced: boolean;
  qcStatus?: string | null;
  pausedAt?: string | null;
}

/** จัดงานเข้าช่องของห้องควบคุม — งานหนึ่งใบอยู่ได้หลายช่อง (เช่น เลยกำหนด + ต้องจัดการทันที) */
export function bucketsForJob(job: BucketJob, warnMinutes = 120, now: Date = new Date()): ControlBucket[] {
  const out = new Set<ControlBucket>();
  const due = job.dueAt ? new Date(job.dueAt).getTime() : null;
  const overdue = due !== null && due < now.getTime();
  const soon = due !== null && !overdue && due - now.getTime() <= warnMinutes * 60000;
  const problem = job.status === 'waiting_info' || job.qcStatus === 'fail' || !!job.pausedAt;

  if (overdue) out.add('overdue');
  if (soon) out.add('due_soon');
  if (problem) out.add('problem');
  if (job.status === 'new' && !job.assignedEmployeeId) out.add('unassigned');
  if (job.status === 'waiting_outsource') out.add('outsource');
  if (job.status === 'reviewing') out.add('reviewing');
  if (job.status === 'ready') out.add('ready');
  if (overdue || problem || (job.status === 'new' && !job.assignedEmployeeId)) out.add('act_now');
  return [...out];
}

export function countBuckets(jobs: BucketJob[], warnMinutes = 120, now: Date = new Date()): Record<ControlBucket, number> {
  const base = Object.fromEntries(CONTROL_BUCKETS.map((b) => [b, 0])) as Record<ControlBucket, number>;
  for (const j of jobs) for (const b of bucketsForJob(j, warnMinutes, now)) base[b] += 1;
  return base;
}

export interface DailySummary {
  today: number; overdue: number; tomorrow: number; outsource: number;
  capacityUsedMinutes: number; capacityLimitMinutes: number;
}

export function dailySummary(
  jobs: (BucketJob & { estimatedMinutes?: number })[],
  capacityLimitMinutes: number,
  now: Date = new Date(),
): DailySummary {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const todayKey = day(now);
  const tomorrowKey = day(new Date(now.getTime() + 86400000));
  let today = 0, overdue = 0, tomorrow = 0, outsource = 0, used = 0;
  for (const j of jobs) {
    if (j.status === 'done' || j.status === 'cancelled') continue;
    const d = j.dueAt ? new Date(j.dueAt) : null;
    if (d && d.getTime() < now.getTime()) overdue += 1;
    else if (d && day(d) === todayKey) today += 1;
    else if (d && day(d) === tomorrowKey) tomorrow += 1;
    if (j.isOutsourced) outsource += 1;
    if (d && day(d) === todayKey) used += j.estimatedMinutes ?? 0;
  }
  return { today, overdue, tomorrow, outsource, capacityUsedMinutes: used, capacityLimitMinutes };
}

/** true = ควรเงียบ (อยู่ในช่วงเงียบของผู้ใช้) รองรับช่วงข้ามเที่ยงคืน */
export function inQuietHours(start?: string | null, end?: string | null, now: Date = new Date()): boolean {
  if (!start || !end) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + (sm || 0);
  const e = eh * 60 + (em || 0);
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e;
}

export interface FeedItem {
  id: string; kind: string; severity: Severity; status: string;
  readAt: string | null; snoozeUntil: string | null; createdAt: string;
}

/** นับค้างบนกระดิ่ง — ไม่รวมที่อ่านแล้ว/รับทราบแล้ว/ยัง snooze อยู่ */
export function unreadCount(items: FeedItem[], now: Date = new Date()): number {
  return items.filter((i) => !i.readAt && i.status === 'new'
    && (!i.snoozeUntil || new Date(i.snoozeUntil) <= now)).length;
}

export function sortFeed(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => {
    const r = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (r) return r;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
