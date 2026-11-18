import { describe, it, expect } from "vitest";
import {
  buildFaqReply,
  buildOrderCreatedReply,
  buildStatusReply,
  genChatOrderNo,
  ingestChatOrder,
  parseCustomerCommand,
} from "../../supabase/functions/_shared/customerLineBot";

const ORDER_TEXT = [
  "รายการสั่งของค่ะ",
  "1. กระดาษ A4 2 รีม",
  "2. ปากกาน้ำเงิน 12 ด้าม",
  "3. แฟ้มสันกว้าง 5 เล่ม",
].join("\n");

/** ตัวแทน service-role client แบบในหน่วยความจำ */
function fakeAdmin() {
  const tables: Record<string, any[]> = { orders: [], order_items: [], line_order_hints: [] };
  const api = {
    tables,
    from(name: string) {
      const rows = (tables[name] ||= []);
      let filter: (r: any) => boolean = () => true;
      const q: any = {
        select: () => q,
        eq: (col: string, val: any) => {
          const prev = filter;
          filter = (r) => prev(r) && r[col] === val;
          return q;
        },
        maybeSingle: async () => ({ data: rows.find(filter) ?? null }),
        insert: (row: any) => {
          const arr = Array.isArray(row) ? row : [row];
          const created = arr.map((r, i) => ({ id: `${name}-${rows.length + i + 1}`, ...r }));
          rows.push(...created);
          const result = { data: created.length === 1 ? created[0] : created, error: null };
          return {
            select: () => ({ single: async () => ({ data: created[0], error: null }) }),
            then: (resolve: any) => resolve(result),
          };
        },
        upsert: async (row: any) => {
          const idx = rows.findIndex((r) => r.message_id === row.message_id);
          if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
          else rows.push(row);
          return { error: null };
        },
      };
      return q;
    },
  };
  return api;
}

describe("คำสั่งลูกค้าในบอท LINE", () => {
  it("อ่านคำสั่งที่รองรับได้ถูกต้อง", () => {
    expect(parseCustomerCommand("เมนู")).toBe("menu");
    expect(parseCustomerCommand("สถานะ")).toBe("status");
    expect(parseCustomerCommand("เวลาทำการ")).toBe("hours");
    expect(parseCustomerCommand("ที่อยู่")).toBe("address");
    expect(parseCustomerCommand("วิธีสั่งของ")).toBe("how_to_order");
  });

  it("ข้อความทั่วไปต้องไม่ถูกจับเป็นคำสั่ง (บอทต้องไม่ตอบมั่ว)", () => {
    expect(parseCustomerCommand("อยากทราบราคากระดาษหน่อยค่ะ")).toBeNull();
    expect(parseCustomerCommand("")).toBeNull();
    expect(parseCustomerCommand(ORDER_TEXT)).toBeNull();
  });

  it("คำตอบ FAQ ใช้ข้อมูลร้านจริงเมื่อมี", () => {
    const reply = buildFaqReply("address", { name: "นัฐภรณ์ การพิมพ์", phone: "081-234-5678" });
    expect(reply).toContain("นัฐภรณ์ การพิมพ์");
    expect(reply).toContain("081-234-5678");
    expect(buildFaqReply("hours", { hours: "ทุกวัน 09:00–17:00" })).toContain("ทุกวัน 09:00–17:00");
  });
});

describe("ข้อความสถานะงาน", () => {
  it("ไม่มีออเดอร์ → บอกวิธีสั่งแทน", () => {
    expect(buildStatusReply([])).toContain("ยังไม่พบออเดอร์");
  });

  it("แสดงเลขที่ สถานะภาษาไทย และลิงก์ติดตาม", () => {
    const text = buildStatusReply(
      [{ order_no: "SO-2608-1234", status: "quoted", created_at: "2026-08-29T03:00:00Z", doc_intent: "order" }],
      "https://example.com/my-orders",
    );
    expect(text).toContain("SO-2608-1234");
    expect(text).toContain("เสนอราคาแล้ว");
    expect(text).toContain("https://example.com/my-orders");
  });
});

describe("สร้างออเดอร์อัตโนมัติจากข้อความแชท", () => {
  it("รายการเป็นข้อพร้อมจำนวน → สร้างออเดอร์และรายการครบ", async () => {
    const admin = fakeAdmin();
    const res = await ingestChatOrder(admin as any, {
      lineUserId: "U1", displayName: "คุณฟิล์ม", messageId: "msg-1", conversationId: "conv-1", text: ORDER_TEXT,
    });
    expect(res.created).toBe(true);
    expect(admin.tables.orders).toHaveLength(1);
    expect(admin.tables.orders[0].doc_intent).toBe("order");
    expect(admin.tables.orders[0].line_user_id).toBe("U1");
    expect(admin.tables.order_items).toHaveLength(3);
    // ราคาต้องเป็น 0 เสมอ — ร้านเป็นผู้เสนอราคา
    expect(admin.tables.order_items.every((i: any) => i.price === 0)).toBe(true);
    expect(admin.tables.order_items[0].qty).toBe(2);
    expect(admin.tables.order_items[0].unit).toBe("รีม");
    // ปิดการ์ดคำแนะนำในหน้างานและเอกสาร กันงานซ้ำ
    expect(admin.tables.line_order_hints[0].state).toBe("converted");
  });

  it("ข้อความเดิมส่งซ้ำ → ไม่สร้างออเดอร์ใหม่", async () => {
    const admin = fakeAdmin();
    await ingestChatOrder(admin as any, { lineUserId: "U1", messageId: "msg-1", text: ORDER_TEXT });
    const again = await ingestChatOrder(admin as any, { lineUserId: "U1", messageId: "msg-1", text: ORDER_TEXT });
    expect(again.duplicate).toBe(true);
    expect(again.created).toBe(false);
    expect(admin.tables.orders).toHaveLength(1);
  });

  it("ข้อความคุยเล่นหรือรายชื่อคน → ไม่สร้างออเดอร์", async () => {
    const admin = fakeAdmin();
    const chat = await ingestChatOrder(admin as any, { lineUserId: "U1", messageId: "m2", text: "สวัสดีค่ะ สอบถามหน่อย" });
    expect(chat.created).toBe(false);
    const names = await ingestChatOrder(admin as any, {
      lineUserId: "U1", messageId: "m3",
      text: ["รายชื่อผู้ปกครอง", "1. นายสมชาย ใจดี", "2. นางสมหญิง ใจงาม"].join("\n"),
    });
    expect(names.created).toBe(false);
    expect(admin.tables.orders).toHaveLength(0);
  });

  it("เลขที่ออเดอร์ใช้รูปแบบเดียวกับการสั่งผ่านเว็บ", () => {
    expect(genChatOrderNo(new Date("2026-08-29T10:00:00Z"))).toMatch(/^SO-2608-\d{8}$/);
  });

  it("ข้อความยืนยันมีเลขที่และรายการ", () => {
    const text = buildOrderCreatedReply("SO-2608-11112222", [
      { name: "กระดาษ A4", qty: 2, unit: "รีม", hasQty: true, raw: "" },
    ], "https://example.com/my-orders");
    expect(text).toContain("SO-2608-11112222");
    expect(text).toContain("กระดาษ A4 — 2 รีม");
    expect(text).toContain("https://example.com/my-orders");
  });
});
