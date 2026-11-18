import { describe, it, expect } from "vitest";
import {
  DEMO_CARD_BUTTONS, applyDemoAction, autoPrice, demoTotal, finalPrice, lineArea,
  parseDemoCommand, sampleDemoJob,
} from "@/lib/automationDemo";

describe("automation demo", () => {
  it("มีปุ่มครบ 6 ปุ่มในการ์ดเดียว", () => {
    expect(DEMO_CARD_BUTTONS.map((b) => b.action)).toEqual([
      "queue_list", "queue_take", "queue_summary", "refresh", "doc_job_order", "doc_receipt",
    ]);
  });

  it("คิดพื้นที่และราคาอัตโนมัติจากงานตัวอย่าง", () => {
    const job = sampleDemoJob();
    const l = job.lines[0];
    expect(lineArea(l)).toBeCloseTo(3.75);
    expect(autoPrice(l)).toBeCloseTo(450);
    expect(demoTotal(job.lines)).toBeCloseTo(450);
  });

  it("แปลงหน่วย cm เป็นตร.ม. ก่อนคำนวณ", () => {
    const l = { ...sampleDemoJob().lines[0], unit: "cm" as const, width: 150, height: 250 };
    expect(lineArea(l)).toBeCloseTo(3.75);
  });

  it("ราคาที่แก้เองไม่ถูกเขียนทับจนกว่าจะกลับเป็นอัตโนมัติ", () => {
    const base = sampleDemoJob().lines[0];
    const manual = { ...base, manual: true, manualPrice: 400, width: 3 };
    expect(finalPrice(manual)).toBe(400);
    expect(finalPrice({ ...manual, manual: false })).toBeCloseTo(900);
  });

  it("map คำสั่งภาษาไทยเป็น action", () => {
    expect(parseDemoCommand("ตอนนี้ทำอะไร")).toBe("queue_list");
    expect(parseDemoCommand("งานใหม่")).toBe("new_draft");
    expect(parseDemoCommand("สั่งงาน")).toBe("intake_form");
    expect(parseDemoCommand("พิมพ์นามบัตร")).toBeNull();
  });

  it("ลำดับสถานะ: งานใหม่ → รับงาน → สรุปงาน → ออกเอกสาร", () => {
    let job = sampleDemoJob();
    job = applyDemoAction(job, "queue_take").job;
    expect(job.status).toBe("producing");
    expect(job.assignee).toBeTruthy();
    job = applyDemoAction(job, "queue_summary").job;
    expect(job.status).toBe("summarized");
    const r = applyDemoAction(job, "doc_receipt");
    expect(r.openDoc).toBe("receipt");
    expect(r.job.status).toBe("completed");
  });

  it("สั่งงานเปิดฟอร์ม และ เช็คคิว สรุปงานปัจจุบัน", () => {
    const job = sampleDemoJob();
    expect(applyDemoAction(job, "intake_form").openIntake).toBe(true);
    expect(applyDemoAction(job, "queue_list").reply).toContain("DEMO-0001");
  });
});