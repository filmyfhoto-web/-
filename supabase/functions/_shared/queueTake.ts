/**
 * Pure helpers สำหรับ "รับงาน" (queue_take) ผ่าน LINE
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้ทดสอบ race/idempotency และการจับคู่
 * พนักงานได้โดยไม่ต้องมีฐานข้อมูลจริง — ตัว webhook เพียงแค่เรียกใช้
 */

/** สถานะที่ "ไม่ใช่คิวรอ" — ห้าม transition เป็น producing จากสถานะเหล่านี้ */
export const QUEUE_TAKE_BLOCKED_STATUSES = ["done", "cancelled", "producing"] as const;

/** งานที่รับเข้าทำได้ต้องเป็นสถานะรอคิวเท่านั้น (กัน done/cancelled/producing) */
export function canTakeQueueStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return false;
  return !(QUEUE_TAKE_BLOCKED_STATUSES as readonly string[]).includes(s);
}

export function normalizeEmail(v: string | null | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

/** เหลือเฉพาะตัวเลข และตัดรหัสประเทศไทย (+66) ให้เทียบกับเบอร์ 0xxxxxxxxx ได้ */
export function normalizePhone(v: string | null | undefined): string {
  const digits = String(v ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("66") && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

export interface EmployeeCandidate {
  id: string;
  email?: string | null;
  phone?: string | null;
  is_active?: boolean | null;
}

export interface ActorIdentity {
  email?: string | null;
  phone?: string | null;
}

export type EmployeeMatchReason = "email" | "phone" | "no_identity" | "no_match" | "ambiguous";

/**
 * จับคู่พนักงานจาก identity ของผู้ใช้ (profiles.email / profiles.phone)
 * คืน employeeId ก็ต่อเมื่อ match แบบชัดเจน "คนเดียวเท่านั้น" — ห้ามเดา
 */
export function matchEmployeeByIdentity(
  candidates: EmployeeCandidate[] | null | undefined,
  identity: ActorIdentity | null | undefined,
): { employeeId: string | null; reason: EmployeeMatchReason } {
  const email = normalizeEmail(identity?.email);
  const phone = normalizePhone(identity?.phone);
  if (!email && !phone) return { employeeId: null, reason: "no_identity" };

  const active = (candidates ?? []).filter((c) => c?.id && c.is_active !== false);

  const byEmail = email ? active.filter((c) => normalizeEmail(c.email) === email) : [];
  if (byEmail.length === 1) return { employeeId: byEmail[0].id, reason: "email" };
  if (byEmail.length > 1) return { employeeId: null, reason: "ambiguous" };

  const byPhone = phone ? active.filter((c) => normalizePhone(c.phone) === phone) : [];
  if (byPhone.length === 1) return { employeeId: byPhone[0].id, reason: "phone" };
  if (byPhone.length > 1) return { employeeId: null, reason: "ambiguous" };

  return { employeeId: null, reason: "no_match" };
}

/**
 * แพตช์ที่จะเขียนลง film_order_jobs ตอนรับงาน — ห้ามเขียนทับผู้รับเดิม
 * (assigned_employee_id จะถูกใส่ก็ต่อเมื่อของเดิมว่างและ match ชัดเจน)
 */
export function buildTakeUpdate(input: {
  currentAssigneeId?: string | null;
  matchedEmployeeId?: string | null;
  takenAt: string;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: "producing",
    assigned_at: input.takenAt,
    assign_reason: "line_queue_take",
  };
  if (!input.currentAssigneeId && input.matchedEmployeeId) {
    patch.assigned_employee_id = input.matchedEmployeeId;
  }
  return patch;
}

/**
 * ข้อความ "ผู้รับงาน" สำหรับการ์ด เมื่อจับคู่พนักงานไม่ได้ แต่มี event queue_take
 * จริงในระบบ — การ์ดต้องไม่ทำให้เข้าใจผิดว่ายังไม่มีใครรับ
 */
export function assigneeDisplay(input: {
  employeeName?: string | null;
  lastTakeNote?: string | null;
  lastTakeActor?: string | null;
}): string | null {
  const emp = String(input.employeeName ?? "").trim();
  if (emp) return emp;
  const actor = String(input.lastTakeActor ?? "").trim();
  if (actor) return `รับผ่าน LINE โดย ${actor}`;
  const note = String(input.lastTakeNote ?? "").trim();
  if (note) return note;
  return null;
}
