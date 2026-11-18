import { describe, it, expect } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const ACK = read("supabase/functions/_shared/customerAck.ts");
const SUBMIT = read("supabase/functions/guest-order-submit/index.ts");

describe("ข้อความตอบรับลูกค้าอัตโนมัติหลังกดสั่งซื้อ", () => {
  it("ข้อความแยกตามปุ่ม: สั่งซื้อเลย กับ ขอใบเสนอราคา", () => {
    expect(ACK).toContain("✅ ได้รับคำสั่งซื้อเรียบร้อยแล้วค่ะ");
    expect(ACK).toContain("🧾 ได้รับคำขอใบเสนอราคาแล้วค่ะ");
    expect(ACK).toContain("ดูรายละเอียดคำสั่งซื้อ");
  });

  it("ใช้ notification_type เดิม received_ack เพื่อกันส่งซ้ำกับปุ่มยืนยันรับของพนักงาน", () => {
    expect(ACK).toContain('const notificationType = "received_ack"');
    expect(ACK).toContain("order_notification_logs");
    expect(ACK).toMatch(/existing\.status === "sent"/);
  });

  it("ไม่ส่งไปยังรหัสจำลอง guest:", () => {
    expect(ACK).toMatch(/startsWith\("guest:"\)/);
  });

  it("guest-order-submit เรียก ack แบบ best-effort หลังสร้างออเดอร์สำเร็จ", () => {
    expect(SUBMIT).toContain('from "../_shared/customerAck.ts"');
    expect(SUBMIT).toContain("sendCustomerAck(admin, {");
    expect(SUBMIT).toContain('intent: doc_intent === "quote" ? "quote" : "order"');
    expect(SUBMIT).toMatch(/catch \(e\) \{ console\.warn\("customer ack failed"/);
    // ต้องอยู่หลังจุด return ของเส้นทาง deduplicated (ไม่ส่งซ้ำเมื่อกดสั่งซ้ำ)
    expect(SUBMIT.indexOf("sendCustomerAck(admin, {")).toBeGreaterThan(
      SUBMIT.indexOf("deduplicated: true"),
    );
  });
});
