import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { chatLinesToItems, detectChatOrder, parseChatLine } from "@/lib/chatOrderDetect";

/** ตัวอย่างจริงจากแชท LINE ของร้าน (ตัดให้สั้นลง) */
const ORDER_MSG = `1. กระดาษเคลือบหลังเหลือง a4 2 แพ็ค
2. ฟิวเจอร์บอร์ดขนาดกลาง 20 แผ่น
3. แผ่นเคลือบ pvc 25 แผ่น
4. กระดาษสีสองหน้า สีฟ้า 10 แผ่น`;

const ORDER_MSG_2 = `จากโครงการนี้ จะรบกวนสั่งของตามนี้
1. กระดาษ a4 5 รีม
2. หมึกเครื่องปริ้นส์ epsonl3110 = 2 ชุด
3. กาวสองหน้าบาง 4 อัน`;

const NAME_LIST = `เจ้าภาพประกอบด้วย
1.แม่จันสม การินทร์ บุตร
2.นางนิดดา นายประยูร วันทอง บุตร
3 นายถนัด-นางยอด อิ่นมีกุล บุตร
4.นายอนัน อิ่นมีกุล บุตร`;

const PROJECT_LIST = `รร.ผาหลัก ยังไม่ได้ใบเสร็จ ยอดมีดังนี้
1.) 1080 โครงการส่งเสริมความเป็นเลิศ
2.) 5550 โครงการส่งเสริมความเป็นเลิศ`;

describe("ตรวจจับรายการสั่งของจากข้อความ LINE", () => {
  it("จับข้อความที่เป็นรายการสินค้าพร้อมจำนวน+หน่วย", () => {
    const d = detectChatOrder(ORDER_MSG);
    expect(d.looksLikeOrder).toBe(true);
    expect(d.lines.length).toBe(4);
    expect(d.lines[1]).toMatchObject({ name: "ฟิวเจอร์บอร์ดขนาดกลาง", qty: 20, unit: "แผ่น", hasQty: true });
    expect(d.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("จับข้อความที่มีคำนำว่าสั่งของ แม้มีเครื่องหมาย = คั่น", () => {
    const d = detectChatOrder(ORDER_MSG_2);
    expect(d.looksLikeOrder).toBe(true);
    expect(d.lines.map((l) => l.qty)).toEqual([5, 2, 4]);
  });

  it("ไม่จับรายชื่อคน", () => {
    expect(detectChatOrder(NAME_LIST).looksLikeOrder).toBe(false);
  });

  it("ไม่จับรายการโครงการ/งบประมาณ", () => {
    expect(detectChatOrder(PROJECT_LIST).looksLikeOrder).toBe(false);
  });

  it("ไม่จับข้อความคุยเล่นหรือข้อความสั้น", () => {
    expect(detectChatOrder("สวัสดีค่ะ รบกวนสอบถามหน่อยนะคะ").looksLikeOrder).toBe(false);
    expect(detectChatOrder("1. ขอใบเสนอราคา").looksLikeOrder).toBe(false);
    expect(detectChatOrder("").looksLikeOrder).toBe(false);
  });

  it("บรรทัดที่ไม่มีจำนวน ยังอ่านชื่อได้ แต่ติดธงให้ตรวจสอบ", () => {
    const line = parseChatLine("ลูกบอลสี");
    expect(line).toMatchObject({ name: "ลูกบอลสี", qty: 1, hasQty: false });
    const items = chatLinesToItems([line!]);
    expect(items[0]).toMatchObject({ name: "ลูกบอลสี", qty: 1, price: 0, unit: "ชิ้น", needsReview: true });
  });

  it("แปลงเป็นรายการของ 'รับงานใหม่' ได้ครบ", () => {
    const items = chatLinesToItems(detectChatOrder(ORDER_MSG).lines);
    expect(items.length).toBe(4);
    expect(items.every((i) => i.name && i.qty > 0 && i.price === 0)).toBe(true);
  });
});

describe("การ์ดคำแนะนำในหน้างานและเอกสาร", () => {
  const page = fs.readFileSync("src/pages/admin/WorkDocs.tsx", "utf8");

  it("หน้า work-docs วางการ์ดและปุ่มครบ", () => {
    expect(page).toContain("ChatOrderHints");
    expect(page).toContain("listChatOrderHints");
    expect(page).toContain("markChatOrderHint");
  });

  it("การ์ดมีปุ่มสร้างงานและปุ่มข้าม", () => {
    const card = fs.readFileSync("src/components/admin/work-docs/ChatOrderHints.tsx", "utf8");
    expect(card).toContain("chat-hint-create");
    expect(card).toContain("chat-hint-dismiss");
    expect(card).toContain("ดูเหมือนเป็นรายการสั่งของ");
  });

  it("ไม่แตะ edge function ของ LINE webhook", () => {
    const lib = fs.readFileSync("src/lib/chatOrderDetect.ts", "utf8");
    expect(lib).not.toContain("functions.invoke");
    expect(lib).not.toContain("supabase");
  });
});
