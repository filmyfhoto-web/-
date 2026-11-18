import { describe, it, expect } from "vitest";
import {
  parseNattaCommand,
  parseNattaPostback,
  detectCategory,
  bangkokDate,
  buildSummaryText,
  buildListText,
  splitNote,
  NATTA_NO_PERMISSION,
  NATTA_HELP_TEXT,
  VOID_REASON,
  BRAND,
} from "../../../supabase/functions/_shared/nattaAccountant";
import {
  handleNattaAccountant,
  handleNattaPostback,
} from "../../../supabase/functions/_shared/nattaAccountantHandler";
import { buildRichMenuBody } from "../../../supabase/functions/_shared/nattaRichMenu";

/**
 * stub ฐานข้อมูลในหน่วยความจำ — รองรับ filter/insert/update/select แบบที่ handler ใช้จริง
 * เพื่อทดสอบพฤติกรรม "ยืนยันก่อนบันทึก" ได้ครบวงจร
 */
function makeAdmin(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = JSON.parse(JSON.stringify(seed));
  const calls: any[] = [];
  let seq = 0;

  const from = (table: string) => {
    tables[table] ??= [];
    const filters: Array<(r: any) => boolean> = [];
    const q: any = {
      select: () => q,
      eq: (col: string, val: any) => {
        if (col.includes("->>")) {
          const key = col.split("->>")[1].replace(/'/g, "");
          filters.push((r) => String(r.payload?.[key] ?? "") === String(val));
        } else filters.push((r) => r[col] === val);
        return q;
      },
      neq: (col: string, val: any) => { filters.push((r) => r[col] !== val); return q; },
      is: (col: string, val: any) => { filters.push((r) => (r[col] ?? null) === val); return q; },
      order: () => q,
      limit: () => Promise.resolve({ data: rows(), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (fn: any) => Promise.resolve({ data: rows(), error: null }).then(fn),
      insert: (row: any) => {
        calls.push({ table, op: "insert", row });
        if (seed.insertError) return { select: () => Promise.resolve({ data: [], error: seed.insertError }), then: (f: any) => Promise.resolve({ error: seed.insertError }).then(f) };
        const rec = { id: `${table}-${++seq}`, created_at: new Date(2000 + seq, 0, 1).toISOString(), ...row };
        tables[table].push(rec);
        const result = { data: [rec], error: null };
        return { select: () => Promise.resolve(result), then: (f: any) => Promise.resolve({ error: null }).then(f) };
      },
      update: (patch: any) => {
        const u: any = {
          eq: (c: string, v: any) => { q.eq(c, v); return u; },
          is: (c: string, v: any) => { q.is(c, v); return u; },
          select: () => Promise.resolve({ data: apply(patch), error: null }),
          then: (f: any) => { const d = apply(patch); return Promise.resolve({ data: d, error: null }).then(f); },
        };
        return u;
      },
    };
    const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
    const apply = (patch: any) => {
      const hit = rows();
      calls.push({ table, op: "update", row: patch, count: hit.length });
      hit.forEach((r) => Object.assign(r, patch));
      return hit;
    };
    return q;
  };
  return { admin: { from }, calls, tables };
}

const ctx = (admin: any, extra: any = {}) => ({
  admin,
  lineUserId: "U1",
  messageId: "M1",
  eventId: "E1",
  isAuthorized: true,
  ...extra,
});

describe(`parser ${BRAND}`, () => {
  it("อ่านรายรับ/รายจ่ายจากภาษาไทยธรรมชาติ", () => {
    expect(parseNattaCommand("ขายรูป 360")).toMatchObject({ kind: "add", type: "income", amount: 360 });
    expect(parseNattaCommand("รับเงิน งานป้าย 1200")).toMatchObject({ type: "income", amount: 1200 });
    expect(parseNattaCommand("ซื้อกระดาษ 625")).toMatchObject({ type: "expense", amount: 625 });
    expect(parseNattaCommand("ค่าส่ง 80")).toMatchObject({ type: "expense", amount: 80 });
    expect(parseNattaCommand("ขายรูป 1,200 บาท")).toMatchObject({ amount: 1200 });
  });

  it("แยกหมายเหตุออกจากยอดเงิน", () => {
    expect(splitNote("ขายรูป 360 หมายเหตุ ลูกค้าโอนแล้ว")).toEqual({ body: "ขายรูป 360", note: "ลูกค้าโอนแล้ว" });
    expect(parseNattaCommand("ขายรูป 360 หมายเหตุ ลูกค้าโอนแล้ว")).toMatchObject({ amount: 360, note: "ลูกค้าโอนแล้ว" });
  });

  it("จัดหมวดหมู่ตามคำสำคัญ และ fallback เป็นอื่นๆ", () => {
    expect(detectCategory("ขายรูป", "income")).toBe("งานถ่ายรูป");
    expect(detectCategory("ซื้อกระดาษ", "expense")).toBe("วัสดุงานพิมพ์");
    expect(detectCategory("ค่าส่งพัสดุ", "expense")).toBe("ค่าขนส่ง");
    expect(detectCategory("จิปาถะ", "expense")).toBe("อื่นๆ");
  });

  it("รองรับคำสั่งใหม่: แก้รายละเอียด แนบสลิป ค้างรับ เมนูงานวันนี้", () => {
    expect(parseNattaCommand("แก้ไขล่าสุด")).toEqual({ kind: "edit_latest_menu" });
    expect(parseNattaCommand("แก้ล่าสุดเป็น 650")).toEqual({ kind: "edit_latest", amount: 650 });
    expect(parseNattaCommand("แก้รายละเอียดล่าสุด งานรูปด่วน")).toEqual({ kind: "edit_latest_desc", description: "งานรูปด่วน" });
    expect(parseNattaCommand("แนบสลิป")).toEqual({ kind: "attach_request" });
    expect(parseNattaCommand("ค้างรับ")).toEqual({ kind: "outstanding" });
    expect(parseNattaCommand("บันทึกงานวันนี้")).toEqual({ kind: "today_menu" });
    expect(parseNattaCommand("มัดจำ ORD-1234 500")).toEqual({ kind: "deposit", orderNo: "ORD-1234", amount: 500 });
    expect(parseNattaCommand("สวัสดีครับ")).toBeNull();
  });

  it("แบรนด์ใหม่ในข้อความช่วยเหลือ และยังรับคำเรียกเดิมได้", () => {
    expect(parseNattaCommand("ม่วงจดให้")).toEqual({ kind: "help" });
    expect(parseNattaCommand("น้องนัตต้า")).toEqual({ kind: "help" }); // backward compatible
    expect(NATTA_HELP_TEXT).toContain("ม่วงจดให้");
    expect(NATTA_HELP_TEXT).not.toContain("น้องนัตต้า");
    expect(VOID_REASON).toBe("ยกเลิกผ่าน LINE (ม่วงจดให้)");
  });

  it("อ่าน postback ของปุ่มยืนยัน/ยกเลิก/แนบ", () => {
    expect(parseNattaPostback("natta:confirm:p1")).toEqual({ kind: "confirm", pendingId: "p1" });
    expect(parseNattaPostback("natta:cancel:p1")).toEqual({ kind: "cancel", pendingId: "p1" });
    expect(parseNattaPostback("natta:attach:p1")).toEqual({ kind: "attach", pendingId: "p1" });
    expect(parseNattaPostback("natta:text:สรุปวันนี้")).toEqual({ kind: "text", text: "สรุปวันนี้" });
    expect(parseNattaPostback("opsn:ack:1")).toBeNull();
  });

  it("สรุปยอดตามวันเวลาไทย", () => {
    expect(bangkokDate(new Date("2026-09-03T18:30:00Z"))).toBe("2026-09-04");
    const text = buildSummaryText(
      [{ type: "income", amount: 1000, category: null, description: null }, { type: "expense", amount: 250, category: null, description: null }],
      "2026-09-03",
    );
    expect(text).toContain("1,000");
    expect(text).toContain("750");
    expect(buildListText([])).toContain("ยังไม่มีรายการ");
  });

  it("Rich Menu มี 8 ปุ่ม ขนาด 2500x1686 และไม่ใช้ชื่อเดิม", () => {
    const body = buildRichMenuBody() as any;
    expect(body.size).toEqual({ width: 2500, height: 1686 });
    expect(body.areas.length).toBe(8);
    expect(body.chatBarText).toBe("ม่วงจดให้");
    expect(JSON.stringify(body)).not.toContain("น้องนัตต้า");
  });
});

describe(`handler ${BRAND}`, () => {
  it("ปฏิเสธผู้ที่ไม่มีสิทธิ์ และไม่แตะฐานข้อมูล", async () => {
    const { admin, calls } = makeAdmin();
    const res = await handleNattaAccountant(ctx(admin, { isAuthorized: false }) as any, "ขายรูป 360");
    expect(res.reply).toBe(NATTA_NO_PERMISSION);
    expect(calls.length).toBe(0);
  });

  it("ข้อความทั่วไปไม่ถูกจับ (ไม่รบกวน flow อื่น)", async () => {
    const { admin } = makeAdmin();
    expect((await handleNattaAccountant(ctx(admin) as any, "สวัสดีครับ")).handled).toBe(false);
  });

  it("บันทึกรายรับต้องยืนยันก่อนเขียนบัญชี", async () => {
    const { admin, calls, tables } = makeAdmin();
    const res = await handleNattaAccountant(ctx(admin) as any, "ขายรูป 360");
    expect(res.reply).toContain("รอยืนยัน");
    expect(calls.some((c) => c.table === "film_transactions" && c.op === "insert")).toBe(false);
    const pendingId = tables.film_line_pending_actions[0].id;

    const done = await handleNattaPostback(ctx(admin) as any, { kind: "confirm", pendingId });
    expect(done.reply).toContain("บันทึกแล้ว");
    expect(tables.film_transactions[0]).toMatchObject({ amount: 360, type: "income", source: "line", line_user_id: "U1" });

    // ยืนยันซ้ำต้องไม่เขียนซ้ำ
    const again = await handleNattaPostback(ctx(admin) as any, { kind: "confirm", pendingId });
    expect(again.info).toContain("consumed");
    expect(tables.film_transactions.length).toBe(1);
  });

  it("กดยกเลิกแล้วไม่มีอะไรถูกบันทึก", async () => {
    const { admin, tables } = makeAdmin();
    await handleNattaAccountant(ctx(admin) as any, "ค่าส่ง 80");
    const pendingId = tables.film_line_pending_actions[0].id;
    const res = await handleNattaPostback(ctx(admin) as any, { kind: "cancel", pendingId });
    expect(res.reply).toContain("ไม่มีอะไรถูกบันทึก");
    expect(tables.film_transactions ?? []).toHaveLength(0);
    // ยืนยันหลังยกเลิกไม่ได้อีก
    const after = await handleNattaPostback(ctx(admin) as any, { kind: "confirm", pendingId });
    expect(after.info).toContain("consumed");
  });

  it("ยืนยันร่างของคนอื่นไม่ได้", async () => {
    const { admin, tables } = makeAdmin();
    await handleNattaAccountant(ctx(admin) as any, "ขายรูป 100");
    const pendingId = tables.film_line_pending_actions[0].id;
    const other = await handleNattaPostback(ctx(admin, { lineUserId: "U2" }) as any, { kind: "confirm", pendingId });
    expect(other.info).toContain("consumed");
    expect(tables.film_transactions ?? []).toHaveLength(0);
  });

  it("แก้ยอด/แก้รายละเอียด/ยกเลิกรายการ ต้องยืนยันอีกครั้ง และแตะเฉพาะรายการวันนี้ของตัวเอง", async () => {
    const today = bangkokDate();
    const seedTx = [{ id: "t1", amount: 500, description: "ขายรูป", type: "income", date: today, line_user_id: "U1", voided_at: null, evidence: [] }];
    const a = makeAdmin({ film_transactions: JSON.parse(JSON.stringify(seedTx)) });
    const res = await handleNattaAccountant(ctx(a.admin) as any, "แก้ล่าสุดเป็น 650");
    expect(res.reply).toContain("ยืนยัน");
    expect(a.tables.film_transactions[0].amount).toBe(500);
    await handleNattaPostback(ctx(a.admin) as any, { kind: "confirm", pendingId: a.tables.film_line_pending_actions[0].id });
    expect(a.tables.film_transactions[0].amount).toBe(650);

    const b = makeAdmin({ film_transactions: JSON.parse(JSON.stringify(seedTx)) });
    await handleNattaAccountant(ctx(b.admin) as any, "แก้รายละเอียดล่าสุด งานรูปด่วน");
    await handleNattaPostback(ctx(b.admin) as any, { kind: "confirm", pendingId: b.tables.film_line_pending_actions[0].id });
    expect(b.tables.film_transactions[0].description).toBe("งานรูปด่วน");

    const c = makeAdmin({ film_transactions: JSON.parse(JSON.stringify(seedTx)) });
    await handleNattaAccountant(ctx(c.admin) as any, "ยกเลิกล่าสุด");
    expect(c.tables.film_transactions[0].voided_at ?? null).toBeNull();
    await handleNattaPostback(ctx(c.admin) as any, { kind: "confirm", pendingId: c.tables.film_line_pending_actions[0].id });
    expect(c.tables.film_transactions[0].voided_at).toBeTruthy();
    expect(c.tables.film_transactions[0].void_reason).toBe(VOID_REASON);

    // ไม่มีรายการของตัวเองในวันนี้ → ไม่ทำอะไร
    const d = makeAdmin({ film_transactions: [{ ...seedTx[0], line_user_id: "U9" }] });
    const none = await handleNattaAccountant(ctx(d.admin) as any, "ยกเลิกล่าสุด");
    expect(none.reply).toContain("ยังไม่มีรายการ");
  });

  it("มัดจำ: ต้องมีเลขที่งาน ห้ามเกินยอดคงค้าง และยืนยันก่อนรับเงิน", async () => {
    const noOrder = makeAdmin({ film_orders: [] });
    expect((await handleNattaAccountant(ctx(noOrder.admin) as any, "มัดจำ ORD-9999 500")).reply).toContain("ไม่พบงาน");
    expect((await handleNattaAccountant(ctx(noOrder.admin) as any, "ลูกค้า สมชาย งานป้าย 1200 มัดจำ 500")).reply).toContain("เลขที่งาน");

    const over = makeAdmin({ film_orders: [{ id: "o1", order_no: "ORD-1", total: 1000, paid_amount: 800, is_test: false }] });
    const res = await handleNattaAccountant(ctx(over.admin) as any, "มัดจำ ORD-1 500");
    expect(res.reply).toContain("เกินยอดคงค้าง");
    expect(over.calls.some((c) => c.table === "film_order_payments" && c.op === "insert")).toBe(false);

    const ok = makeAdmin({ film_orders: [{ id: "o1", order_no: "ORD-1", customer_name: "สมชาย", total: 1000, paid_amount: 0, is_test: false }] });
    const pend = await handleNattaAccountant(ctx(ok.admin) as any, "มัดจำ ORD-1 500");
    expect(pend.reply).toContain("รอยืนยัน");
    expect(ok.tables.film_order_payments ?? []).toHaveLength(0);
    await handleNattaPostback(ctx(ok.admin) as any, { kind: "confirm", pendingId: ok.tables.film_line_pending_actions[0].id });
    expect(ok.tables.film_order_payments[0]).toMatchObject({ order_id: "o1", amount: 500, kind: "deposit" });

    // ยอดคงค้างเปลี่ยนหลังเปิดร่าง → ปฏิเสธ
    const race = makeAdmin({ film_orders: [{ id: "o1", order_no: "ORD-1", total: 1000, paid_amount: 0, is_test: false }] });
    await handleNattaAccountant(ctx(race.admin) as any, "มัดจำ ORD-1 900");
    race.tables.film_orders[0].paid_amount = 1000;
    const raced = await handleNattaPostback(ctx(race.admin) as any, { kind: "confirm", pendingId: race.tables.film_line_pending_actions[0].id });
    expect(raced.reply).toContain("ชำระครบแล้ว");
    expect(race.tables.film_order_payments ?? []).toHaveLength(0);
  });

  it("ค้างรับแสดงเฉพาะงานที่ยังมียอดคงเหลือ", async () => {
    const { admin } = makeAdmin({
      film_orders: [
        { id: "o1", order_no: "ORD-1", customer_name: "สมชาย", total: 1000, paid_amount: 400, payment_status: "partial", is_test: false, is_draft: false },
        { id: "o2", order_no: "ORD-2", customer_name: "ทดสอบ", total: 500, paid_amount: 0, payment_status: "unpaid", is_test: true, is_draft: false },
      ],
    });
    const res = await handleNattaAccountant(ctx(admin) as any, "ค้างรับ");
    expect(res.reply).toContain("ORD-1");
    expect(res.reply).not.toContain("ORD-2");
    expect(res.reply).toContain("600");
  });

  it("แนบหลักฐานเมื่อไม่มีร่างรอยืนยัน จะบอกให้เริ่มรายการก่อน", async () => {
    const { admin } = makeAdmin();
    const res = await handleNattaAccountant(ctx(admin) as any, "แนบสลิป");
    expect(res.reply).toContain("ยังไม่มีรายการที่รอยืนยัน");
  });
});

/* ------------------------ เมนูลัด 8 ปุ่ม (ตรงกับรูป) ----------------------- */
describe("rich menu ม่วงจดให้ — ลำดับปุ่มตรงกับรูปเมนู", () => {
  it("มี 8 ปุ่ม ลำดับ/ข้อความถูกต้อง และกรอบไม่ทับกันในขนาด 2500x1686", () => {
    const body = buildRichMenuBody() as any;
    expect(body.name).toBe("muang-jod-hai");
    expect(body.chatBarText).toBe("ม่วงจดให้");
    expect(body.size).toEqual({ width: 2500, height: 1686 });
    const expected = [
      ["บันทึกงานวันนี้", "บันทึกงานวันนี้"],
      ["แนบสลิป/หลักฐาน", "แนบสลิป"],
      ["รายการล่าสุด", "รายการล่าสุด"],
      ["สรุปวันนี้", "สรุปวันนี้"],
      ["แก้ไขล่าสุด", "แก้ไขล่าสุด"],
      ["ยกเลิกล่าสุด", "ยกเลิกล่าสุด"],
      ["ค้างรับ & ติดตามงาน", "ค้างรับ"],
      ["ช่วยเหลือ", "ช่วยเหลือ"],
    ];
    expect(body.areas.length).toBe(8);
    body.areas.forEach((a: any, i: number) => {
      expect(a.action.type).toBe("message");
      expect([a.action.label, a.action.text]).toEqual(expected[i]);
      expect(a.bounds.width).toBe(625);
      expect(a.bounds.height).toBe(843);
      expect(a.bounds.x + 625).toBeLessThanOrEqual(2500);
      expect(a.bounds.y + 843).toBeLessThanOrEqual(1686);
    });
    // ไม่ทับกัน
    const keys = body.areas.map((a: any) => `${a.bounds.x}:${a.bounds.y}`);
    expect(new Set(keys).size).toBe(8);
    // ทุกคำสั่งของปุ่มต้องแปลได้จริง
    body.areas.forEach((a: any) => expect(parseNattaCommand(a.action.text)).not.toBeNull());
  });
});
