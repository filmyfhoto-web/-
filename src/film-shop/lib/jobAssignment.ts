/**
 * Film Shop — คิวงาน (kanban) และการมอบหมายพนักงานอัตโนมัติ
 *
 * ทั้งหมดเป็นฟังก์ชันบริสุทธิ์ (pure) เพื่อให้ทดสอบได้ และให้ผลลัพธ์เหมือนกัน
 * ทุกครั้งที่รันด้วยข้อมูลชุดเดียวกัน
 */

export const JOB_STAGES = ['intake', 'doing', 'review', 'ready'] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const JOB_STAGE_LABELS: Record<JobStage, string> = {
  intake: 'รับงาน',
  doing: 'กำลังทำ',
  review: 'รอตรวจ',
  ready: 'พร้อมส่ง',
};

export const JOB_STAGE_TONE: Record<JobStage, string> = {
  intake: 'border-sky-300 bg-sky-50 text-sky-800',
  doing: 'border-amber-300 bg-amber-50 text-amber-900',
  review: 'border-primary/30 bg-accent text-primary',
  ready: 'border-emerald-300 bg-emerald-50 text-emerald-800',
};

export function isJobStage(v: unknown): v is JobStage {
  return typeof v === 'string' && (JOB_STAGES as readonly string[]).includes(v);
}

/** ขั้นถัดไปตามลำดับ (พร้อมส่งคือขั้นสุดท้าย) */
export function nextJobStage(stage: JobStage): JobStage | null {
  const i = JOB_STAGES.indexOf(stage);
  return i < 0 || i === JOB_STAGES.length - 1 ? null : JOB_STAGES[i + 1];
}

export interface AssignableEmployee {
  id: string;
  name: string;
  isActive: boolean;
  /** พนักงานกดว่า "ไม่พร้อมรับงาน" ได้ */
  isAvailable: boolean;
  /** ประเภทงานที่ถนัด (ว่าง = รับได้ทุกประเภท) */
  jobTypes: string[];
}

export interface AssignableJob {
  id: string;
  jobType: string | null;
  estimatedMinutes: number;
  stage: JobStage;
  assignedEmployeeId: string | null;
}

/** ภาระงานคงค้าง (นาที) ของพนักงานแต่ละคน — งานที่ยัง "ไม่พร้อมส่ง" เท่านั้น */
export function workloadByEmployee(jobs: AssignableJob[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of jobs) {
    if (!j.assignedEmployeeId || j.stage === 'ready') continue;
    out[j.assignedEmployeeId] = (out[j.assignedEmployeeId] ?? 0) + (Number(j.estimatedMinutes) || 0);
  }
  return out;
}

/**
 * เลือกพนักงานที่ "ว่างสุดและภาระงานต่ำสุด" สำหรับงานหนึ่งใบ
 * ลำดับการตัดสิน: ถนัดตรงประเภทงานก่อน → ภาระงานน้อยกว่า → ชื่อ (คงที่)
 * `excludeIds` ใช้ตอน reassign เพื่อไม่เลือกคนเดิมซ้ำ
 */
export function pickAssignee(
  job: Pick<AssignableJob, 'jobType'>,
  employees: AssignableEmployee[],
  workload: Record<string, number>,
  excludeIds: string[] = [],
): AssignableEmployee | null {
  const pool = employees.filter(
    (e) => e.isActive && e.isAvailable && !excludeIds.includes(e.id),
  );
  if (pool.length === 0) return null;
  const type = job.jobType || '';
  const skilled = (e: AssignableEmployee) =>
    e.jobTypes.length === 0 ? 1 : e.jobTypes.includes(type) ? 0 : 2;
  return [...pool].sort((a, b) => {
    const sa = skilled(a); const sb = skilled(b);
    if (sa !== sb) return sa - sb;
    const wa = workload[a.id] ?? 0; const wb = workload[b.id] ?? 0;
    if (wa !== wb) return wa - wb;
    return a.name.localeCompare(b.name, 'th');
  })[0];
}

export interface AutoAssignment { jobId: string; employeeId: string; employeeName: string }

/**
 * มอบหมายงานที่ยังไม่มีเจ้าของทั้งหมด โดยกระจายภาระงานไปเรื่อย ๆ
 * (ภาระงานสะสมระหว่างการคำนวณ เพื่อไม่ให้ทุกงานตกที่คนเดียว)
 */
export function autoAssignJobs(
  jobs: AssignableJob[],
  employees: AssignableEmployee[],
): AutoAssignment[] {
  const load = workloadByEmployee(jobs);
  const out: AutoAssignment[] = [];
  const pending = jobs
    .filter((j) => !j.assignedEmployeeId && j.stage !== 'ready')
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const j of pending) {
    const pick = pickAssignee(j, employees, load);
    if (!pick) continue;
    load[pick.id] = (load[pick.id] ?? 0) + (Number(j.estimatedMinutes) || 0);
    out.push({ jobId: j.id, employeeId: pick.id, employeeName: pick.name });
  }
  return out;
}

/** ย้ายงานไปพนักงานคนอื่น เมื่อคนเดิมไม่พร้อม */
export function pickReassignee(
  job: AssignableJob,
  employees: AssignableEmployee[],
  jobs: AssignableJob[],
): AssignableEmployee | null {
  const load = workloadByEmployee(jobs);
  return pickAssignee(job, employees, load, job.assignedEmployeeId ? [job.assignedEmployeeId] : []);
}
