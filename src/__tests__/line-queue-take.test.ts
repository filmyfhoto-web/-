import { describe, it, expect } from "vitest";
import {
  postbackToQueueText,
  sumItemTotals,
  parseQueueChatCommand,
} from "../../supabase/functions/_shared/adminRoomQueries";
import {
  canTakeQueueStatus,
  matchEmployeeByIdentity,
  buildTakeUpdate,
  assigneeDisplay,
  normalizePhone,
  normalizeEmail,
} from "../../supabase/functions/_shared/queueTake";

describe("postbackToQueueText — ปุ่มการ์ดต้องแมปเป็นคำสั่งไทยชุดเดียวกับการพิมพ์", () => {
  const cases: Array<[string, string]> = [
    ["queue_list", "เช็คคิว"],
    ["queue_take", "รับงาน"],
    ["queue_close", "สรุปงาน"],
    ["refresh", "รีเฟรช"],
    ["doc_job_order", "ใบสั่งจ้าง"],
    ["doc_receipt", "ใบเสร็จรับเงิน"],
  ];
  it.each(cases)("nq:%s → %s (ไม่มี jobId)", (action, text) => {
    expect(postbackToQueueText(`nq:${action}`)).toEqual({ text, jobId: null });
  });
  it.each(cases)("nq:%s:job-77 → %s + jobId", (action, text) => {
    expect(postbackToQueueText(`nq:${action}:job-77`)).toEqual({ text, jobId: "job-77" });
  });
  it("ข้อความไทยที่ได้ ยังถูก dispatcher เดิมอ่านออกทุกตัว", () => {
    for (const [, text] of cases) {
      expect(parseQueueChatCommand(text)).not.toBeNull();
    }
  });
  it("ปฏิเสธ postback ที่ไม่รู้จัก", () => {
    expect(postbackToQueueText("nq:nope")).toBeNull();
    expect(postbackToQueueText("opsn:ack:1")).toBeNull();
    expect(postbackToQueueText(null)).toBeNull();
  });
});

describe("sumItemTotals", () => {
  it("รวมยอดจากรายการจริง รองรับ string/null", () => {
    expect(sumItemTotals([{ total: 100 }, { total: "250.5" }, { total: null }, {}])).toBe(350.5);
    expect(sumItemTotals([])).toBe(0);
    expect(sumItemTotals(null)).toBe(0);
  });
});

describe("canTakeQueueStatus — race semantics ของ queue_take", () => {
  it("สถานะรอคิวรับงานได้", () => {
    for (const s of ["new", "waiting", "queued", "ready", "pending"]) {
      expect(canTakeQueueStatus(s)).toBe(true);
    }
  });
  it("done/cancelled/producing รับซ้ำไม่ได้", () => {
    for (const s of ["done", "cancelled", "producing", "DONE", " Producing "]) {
      expect(canTakeQueueStatus(s)).toBe(false);
    }
  });
  it("สถานะว่าง/null ถือว่ารับไม่ได้", () => {
    expect(canTakeQueueStatus(null)).toBe(false);
    expect(canTakeQueueStatus("")).toBe(false);
  });
});

describe("buildTakeUpdate — ห้ามเขียนทับผู้รับเดิม", () => {
  const takenAt = "2026-08-18T10:00:00.000Z";
  it("ตั้งผู้รับเมื่อของเดิมว่างและ match ชัดเจน", () => {
    expect(buildTakeUpdate({ currentAssigneeId: null, matchedEmployeeId: "emp-1", takenAt })).toEqual({
      status: "producing", assigned_at: takenAt, assign_reason: "line_queue_take", assigned_employee_id: "emp-1",
    });
  });
  it("มีผู้รับเดิมอยู่แล้ว = ไม่แตะ assigned_employee_id", () => {
    const patch = buildTakeUpdate({ currentAssigneeId: "emp-old", matchedEmployeeId: "emp-new", takenAt });
    expect(patch).not.toHaveProperty("assigned_employee_id");
  });
  it("จับคู่ไม่ได้ = ไม่เดา employee id", () => {
    const patch = buildTakeUpdate({ currentAssigneeId: null, matchedEmployeeId: null, takenAt });
    expect(patch).not.toHaveProperty("assigned_employee_id");
    expect(patch.status).toBe("producing");
  });
});

describe("matchEmployeeByIdentity — ห้ามเดาพนักงาน", () => {
  const emps = [
    { id: "e1", email: "A@Shop.CO", phone: "081-992-0338", is_active: true },
    { id: "e2", email: "b@shop.co", phone: "+66819920339", is_active: true },
    { id: "e3", email: "old@shop.co", phone: "0812223333", is_active: false },
  ];
  it("match ด้วยอีเมลแบบ normalize", () => {
    expect(matchEmployeeByIdentity(emps, { email: "a@shop.co" })).toEqual({ employeeId: "e1", reason: "email" });
  });
  it("match ด้วยเบอร์โทรแบบ normalize (+66 → 0)", () => {
    expect(matchEmployeeByIdentity(emps, { phone: "0819920339" })).toEqual({ employeeId: "e2", reason: "phone" });
    expect(normalizePhone("+66 81 992 0338")).toBe("0819920338");
    expect(normalizeEmail(" A@B.co ")).toBe("a@b.co");
  });
  it("ไม่มี identity / ไม่ match / พนักงานปิดใช้งาน = null", () => {
    expect(matchEmployeeByIdentity(emps, {}).employeeId).toBeNull();
    expect(matchEmployeeByIdentity(emps, { email: "zz@shop.co" })).toEqual({ employeeId: null, reason: "no_match" });
    expect(matchEmployeeByIdentity(emps, { email: "old@shop.co" })).toEqual({ employeeId: null, reason: "no_match" });
  });
  it("match มากกว่าหนึ่งคน = ambiguous ไม่ตั้งค่า", () => {
    const dup = [
      { id: "x1", email: "same@shop.co", is_active: true },
      { id: "x2", email: "same@shop.co", is_active: true },
    ];
    expect(matchEmployeeByIdentity(dup, { email: "same@shop.co" })).toEqual({ employeeId: null, reason: "ambiguous" });
  });
});

describe("assigneeDisplay — การ์ดต้องไม่บอกว่าไม่มีผู้รับทั้งที่รับผ่าน LINE แล้ว", () => {
  it("ชื่อพนักงานมาก่อนเสมอ", () => {
    expect(assigneeDisplay({ employeeName: "แอดมินเอ", lastTakeActor: "บี" })).toBe("แอดมินเอ");
  });
  it("ไม่มีพนักงาน ใช้ actor จาก event", () => {
    expect(assigneeDisplay({ lastTakeActor: "คุณบี" })).toBe("รับผ่าน LINE โดย คุณบี");
  });
  it("ไม่มี actor ใช้ note ของ event", () => {
    expect(assigneeDisplay({ lastTakeNote: "รับงานผ่าน LINE โดย คุณซี" })).toBe("รับงานผ่าน LINE โดย คุณซี");
  });
  it("ไม่มีข้อมูลเลย = null (การ์ดค่อยแสดง 'ยังไม่มีผู้รับ')", () => {
    expect(assigneeDisplay({})).toBeNull();
  });
});