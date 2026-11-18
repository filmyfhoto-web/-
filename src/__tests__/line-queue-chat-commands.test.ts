import { describe, it, expect } from "vitest";
import {
  parseQueueChatCommand,
  parseQueuePostback,
  buildQueueListText,
  buildQueueCloseText,
  buildQueueTakeText,
  buildQueueListFlex,
  buildQueueTakeFlex,
  buildQueueCloseFlex,
  buildCurrentJobFlex,
  queueDenyText,
  QUEUE_BRAND_COLOR,
  QUEUE_MAX_ROWS,
} from "../../supabase/functions/_shared/adminRoomQueries";
import { summarizeQueueStats, buildQueueStatsText } from "../../supabase/functions/_shared/adminRoomQueries";

describe("สรุปผลลัพธ์และจำนวนคิวล่าสุด", () => {
  const jobs = [
    { job_no: "J1", status: "producing" },
    { job_no: "J2", status: "new" },
    { job_no: "J3", status: "new" },
  ];
  it("นับกำลังทำ/รอคิว/รวม", () => {
    expect(summarizeQueueStats(jobs)).toMatchObject({ running: 1, waiting: 2, total: 3 });
    expect(buildQueueStatsText(summarizeQueueStats(jobs, 5))).toContain("ปิดวันนี้ 5");
  });
  it("ทุกการ์ดแสดงแถบสรุปทันที", () => {
    const stats = { running: 1, waiting: 2, total: 3, doneToday: 4 };
    for (const m of [
      buildQueueListFlex(jobs, "u", stats),
      buildQueueTakeFlex({ job_no: "J1" }, "u", "แอดมิน", stats),
      buildQueueCloseFlex({ job_no: "J1" }, null, "u", "แอดมิน", stats),
    ]) {
      const json = JSON.stringify(m);
      expect(json).toContain("กำลังทำ 1");
      expect(json).toContain("รอคิว 2");
      expect(json).toContain("รวม 3");
      expect(json).toContain("ปิดวันนี้ 4");
      expect((m as any).altText).toContain("รวม 3");
    }
  });
});

describe("คำสั่งรันคิวผ่านแชท LINE", () => {
  it("อ่านคำสั่งเช็คคิว/ดูคิว", () => {
    expect(parseQueueChatCommand("เช็คคิว")).toEqual({ kind: "queue_list" });
    expect(parseQueueChatCommand(" ดูคิว ")).toEqual({ kind: "queue_list" });
    expect(parseQueueChatCommand("รีเฟรชคิว")).toEqual({ kind: "queue_list" });
  });
  it("อ่านคำสั่งปิดจ๊อบ/สรุปงาน/เสร็จสิ้น", () => {
    for (const t of ["สรุปงาน", "ปิดจ๊อบ", "เสร็จสิ้น"]) {
      expect(parseQueueChatCommand(t)).toEqual({ kind: "queue_close" });
    }
  });
  it("ข้อความทั่วไปไม่ใช่คำสั่ง", () => {
    expect(parseQueueChatCommand("พิมพ์นามบัตร 2 กล่อง")).toBeNull();
  });
  it("อ่านคำสั่งเริ่มงาน/รันงาน/รันคิว → ดึงคิวถัดไปเข้าทำงาน", () => {
    // "รับงาน" ตรงกับปุ่มในเมนูบอท = เปิดการ์ดรับงานใหม่ (intake_card) จึงไม่อยู่ในชุดนี้
    for (const t of ["เริ่มงาน", "รันงาน", "รันคิว"]) {
      expect(parseQueueChatCommand(t)).toEqual({ kind: "queue_take" });
    }
    expect(parseQueueChatCommand("รับงาน")).toEqual({ kind: "intake_card" });
  });

  it("อ่านคำสั่งเปิดฟอร์มงานใหม่", () => {
    for (const t of ["สั่งงาน", "งานใหม่", "เปิดงานใหม่", "ฟอร์มสั่งงาน", "เปิดฟอร์ม"]) {
      expect(parseQueueChatCommand(t)).toEqual({ kind: "intake_card" });
    }
  });
  it("อ่านคำสั่งงานปัจจุบัน/รีเฟรช", () => {
    for (const t of ["ตอนนี้ทำอะไร", "ทำอะไรอยู่", "งานปัจจุบัน", "รีเฟรช"]) {
      expect(parseQueueChatCommand(t)).toEqual({ kind: "current_job" });
    }
  });
  it("อ่านคำสั่งเรียกเอกสาร (ใบสั่งจ้าง/ใบเสร็จ)", () => {
    expect(parseQueueChatCommand("ใบสั่งจ้าง")).toEqual({ kind: "doc_job_order" });
    expect(parseQueueChatCommand("ใบเสร็จ")).toEqual({ kind: "doc_receipt" });
    expect(parseQueueChatCommand("ใบเสร็จรับเงิน")).toEqual({ kind: "doc_receipt" });
  });
  it("อ่าน postback ของปุ่มในการ์ดงานปัจจุบัน", () => {
    expect(parseQueuePostback("nq:queue_list")).toEqual({ cmd: { kind: "queue_list" }, jobId: null });
    expect(parseQueuePostback("nq:queue_take:job-123")).toEqual({ cmd: { kind: "queue_take" }, jobId: "job-123" });
    expect(parseQueuePostback("nq:queue_close:job-9")).toEqual({ cmd: { kind: "queue_close" }, jobId: "job-9" });
    expect(parseQueuePostback("nq:refresh:job-9")).toEqual({ cmd: { kind: "current_job" }, jobId: "job-9" });
    expect(parseQueuePostback("nq:doc_job_order:job-9")).toEqual({ cmd: { kind: "doc_job_order" }, jobId: "job-9" });
    expect(parseQueuePostback("nq:doc_receipt:job-9")).toEqual({ cmd: { kind: "doc_receipt" }, jobId: "job-9" });
    expect(parseQueuePostback("nq:unknown")).toBeNull();
    expect(parseQueuePostback("opsn:ack:1")).toBeNull();
    expect(parseQueuePostback(null)).toBeNull();
  });
  it("รายงานรับงานมีเลขงาน ผู้ทำ และเวลา", () => {
    const t = buildQueueTakeText({ job_no: "JOB-9", title: "ป้าย" }, "u", "แอดมินเอ");
    expect(t).toContain("JOB-9");
    expect(t).toContain("แอดมินเอ");
    expect(t).toContain("🕒");
    expect(buildQueueTakeText(null, "u")).toContain("ไม่มีคิวงานรออยู่");
  });
  it("ข้อความปฏิเสธแยกตามเหตุผล", () => {
    expect(queueDenyText("queue_disabled", "u")).toContain("ยังไม่ได้เปิดสิทธิ์");
    expect(queueDenyText("not_authorized", "u")).toContain("ไม่มีสิทธิ์");
    expect(queueDenyText("not_linked", "u")).toContain("ยังไม่ได้ผูก");
  });
  it("แสดงคิวว่าง/คิวที่มีงาน", () => {
    expect(buildQueueListText([], "https://x/y")).toContain("ไม่มีคิวงานค้าง");
    const txt = buildQueueListText(
      [{ queue_code: "Q-1", title: "ไวนิล", status: "producing" }, { job_no: "JOB-2", title: "นามบัตร", status: "new" }],
      "https://x/y",
    );
    expect(txt).toContain("🔄 กำลังทำ");
    expect(txt).toContain("⏳ รอคิว");
  });
  it("ข้อความปิดงานและดึงคิวถัดไป", () => {
    expect(buildQueueCloseText(null, null, "u")).toContain("ไม่พบงานที่กำลังดำเนินการ");
    const t = buildQueueCloseText({ job_no: "JOB-1", title: "ป้าย" }, { job_no: "JOB-2", title: "สติกเกอร์" }, "u", "แอดมินบี");
    expect(t).toContain("ปิดงาน JOB-1");
    expect(t).toContain("JOB-2");
    expect(t).toContain("แอดมินบี");
    expect(t).toContain("🕒");
    expect(buildQueueCloseText({ job_no: "JOB-1", title: "ป้าย" }, null, "u")).toContain("ไม่มีคิวค้าง");
  });
});

describe('queue flex cards', () => {
  it('list flex has brand header, customer, control-room button and altText', () => {
    const msg = buildQueueListFlex(
      [{ queue_code: 'Q-1', title: 'ป้าย', status: 'producing', customer_name: 'ร้านนัฐภรณ์ การพิมพ์' }],
      'https://filmyynatta.com/admin/control-room',
    );
    const json = JSON.stringify(msg);
    expect(msg.type).toBe('flex');
    expect(msg.contents.header.backgroundColor).toBe('#0F766E');
    expect(QUEUE_BRAND_COLOR).toBe('#0F766E');
    expect(msg.contents.size).toBe('kilo');
    expect(json).toContain('รีเฟรชคิว');
    expect(json).toContain('Q-1');
    expect(json).toContain('ร้านนัฐภรณ์ การพิมพ์');
    expect(json).toContain('https://filmyynatta.com/admin/control-room');
    expect(msg.altText).toContain('Q-1');
  });

  it('take/close flex handle empty queue', () => {
    expect(JSON.stringify(buildQueueTakeFlex(null, 'u'))).toContain('ไม่มีคิวงานรออยู่');
    expect(JSON.stringify(buildQueueCloseFlex(null, null, 'u'))).toContain('ไม่พบงานที่กำลังดำเนินการ');
    const t = JSON.stringify(buildQueueCloseFlex({ job_no: 'JOB-1', title: 'ป้าย' }, { job_no: 'JOB-2' }, 'u', 'แอดมินบี'));
    expect(t).toContain('JOB-1');
    expect(t).toContain('JOB-2');
    expect(t).toContain('แอดมินบี');
  });

  it('list flex stays compact when queue is long', () => {
    const jobs = Array.from({ length: 12 }, (_, i) => ({ job_no: `JOB-${i + 1}`, title: 'งาน', status: 'new' }));
    const msg = buildQueueListFlex(jobs, 'u');
    const rows = JSON.stringify(msg.contents.body.contents);
    expect((rows.match(/JOB-/g) ?? []).length).toBe(QUEUE_MAX_ROWS);
    expect(rows).toContain(`+ อีก ${12 - QUEUE_MAX_ROWS} งาน`);
  });
});

describe('quick reply buttons', () => {
  it('ทุกการ์ดคิวมีปุ่มลัดใต้ช่องพิมพ์', () => {
    const msgs = [
      buildQueueListFlex([], 'u'),
      buildQueueTakeFlex(null, 'u'),
      buildQueueCloseFlex(null, null, 'u'),
    ];
    for (const m of msgs) {
      const labels = (m as any).quickReply.items.map((i: any) => i.action.text);
      expect(labels).toContain('เช็คคิว');
      expect(labels).toContain('รับงาน');
      expect(labels).toContain('สรุปงาน');
      expect((m as any).quickReply.items.length).toBeLessThanOrEqual(13);
    }
  });
});


describe("การ์ดงานปัจจุบัน · NATTA.Q", () => {
  it("แสดงครบทุกฟิลด์และปุ่ม 6 ช่อง เมื่อมีงานอยู่", () => {
    const msg = buildCurrentJobFlex(
      {
        id: "job-1",
        job_no: "JOB-9",
        queue_code: "Q-9",
        title: "ไวนิล 2x3",
        status: "producing",
        customer_name: "ร้านนัฐภรณ์",
        due: "12/12/2025",
        assignee: "แอดมินเอ",
        amount_due: 1500,
      },
      { controlRoomUrl: "https://x/y" },
    );
    const json = JSON.stringify(msg);
    expect(msg.altText).toContain("Q-9");
    expect(json).toContain("งานปัจจุบัน");
    expect(json).toContain("Q-9");
    expect(json).toContain("ร้านนัฐภรณ์");
    expect(json).toContain("แอดมินเอ");
    expect(json).toContain("12/12/2025");
    expect(json).toContain("฿1,500");
    for (const action of ["queue_list", "queue_take", "queue_close", "refresh", "doc_job_order", "doc_receipt"]) {
      expect(json).toContain(`nq:${action}:job-1`);
    }
    expect((msg as any).quickReply.items.length).toBe(6);
  });

  it("แสดงข้อความว่างเมื่อไม่มีงาน", () => {
    const msg = buildCurrentJobFlex(null, { controlRoomUrl: "https://x/y" });
    expect(JSON.stringify(msg)).toContain("ไม่มีงานที่กำลังทำอยู่");
  });
});
