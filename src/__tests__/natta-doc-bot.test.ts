import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  fileDrafts: [] as { id: string; roomId: string; lineUserId: string; extract: any; fileName: string }[],
}));

vi.mock("../../supabase/functions/_shared/docBotIssue.ts", () => ({
  issueDocFromLine: vi.fn(async () => ({
    docNo: "QT2026080002",
    already: false,
    draftId: "d1",
    imageUrl: null,
    pdfUrl: "https://files/pdf",
    sentTo: null,
  })),
}));
vi.mock("../../supabase/functions/_shared/docFileIntake.ts", () => ({
  loadPendingFileDraft: vi.fn(async (_admin: unknown, roomId: string, lineUserId?: string | null) => {
    const hit = hoisted.fileDrafts
      .filter((d) => d.roomId === roomId && (!lineUserId || d.lineUserId === lineUserId))
      .at(-1);
    return hit ? { id: hit.id, extract: hit.extract, fileName: hit.fileName } : null;
  }),
  consumeFileDraft: vi.fn(async () => {}),
}));
vi.mock("../../supabase/functions/_shared/docNextDoc.ts", () => ({
  createNextDocFromQuotation: vi.fn(async (_a: unknown, i: any) => ({
    ok: true,
    message: `สร้าง ${i.docType} จาก ${i.sourceDocNo} แล้ว`,
    docNo: "DN2026080001",
  })),
}));

import {
  NDB_NEXT_DOCS,
  NDB_QUOTATION_REQUIRED,
  NDB_THEME,
  buildNdbBundleCarousel,
  buildNdbBundleLinksText,
  buildNdbMenuFlex,
  buildNdbPostback,
  parseNdbBundleTrigger,
  isNdbMenuTrigger,
  ndbActionKey,
  parseNdbDirectNextDoc,
  parseNdbPostback,
  parseNdbSearchTrigger,
} from "../../supabase/functions/_shared/nattaDocBot.ts";
import {
  bangkokDayStartIso,
  claimNdbAction,
  sanitizeNdbKeyword,
  summarizeNdbToday,
} from "../../supabase/functions/_shared/nattaDocBotStore.ts";
import {
  buildQuotationCommand,
  handleNdbPostback,
  handleNdbText,
  isNdbNextDocAllowed,
  type NdbContext,
} from "../../supabase/functions/_shared/nattaDocBotHandler.ts";
import { issueDocFromLine } from "../../supabase/functions/_shared/docBotIssue.ts";
import { loadPendingFileDraft } from "../../supabase/functions/_shared/docFileIntake.ts";
import { createNextDocFromQuotation } from "../../supabase/functions/_shared/docNextDoc.ts";

/* ------------------------------ fake supabase ----------------------------- */

type Row = Record<string, any>;

function fakeAdmin(seed?: { docs?: Row[]; approvals?: Row[]; claimError?: boolean }) {
  const db: Record<string, Row[]> = {
    line_doc_bot_drafts: [],
    line_doc_bot_approvals: seed?.approvals ?? [],
    line_doc_bot_actions: [],
    line_doc_bot_audit: [],
    rds_documents: seed?.docs ?? [],
    document_command_drafts: [],
    profiles: [],
  };
  let n = 0;
  function table(name: string) {
    const filters: [string, any][] = [];
    let payload: Row[] = [];
    let mode = "select";
    const api: any = {
      select() { return api; },
      insert(v: Row | Row[]) {
        mode = "insert";
        payload = Array.isArray(v) ? v : [v];
        return api;
      },
      update(v: Row) { mode = "update"; payload = [v]; return api; },
      delete() { mode = "delete"; return api; },
      eq(c: string, v: any) { filters.push([c, v]); return api; },
      in(c: string, v: any[]) { filters.push([c, v]); return api; },
      filter() { return api; },
      gte() { return api; },
      or() { return api; },
      order() { return api; },
      limit() { return api; },
      match(rows: Row[]) {
        return rows.filter((r) =>
          filters.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v)),
        );
      },
      run() {
        if (mode === "insert") {
          const created: Row[] = payload.map((p) => ({ id: `id-${++n}`, ...p }));
          if (name === "line_doc_bot_actions") {
            if (seed?.claimError) return { data: null, error: { code: "XX000", message: "db down" } };
            const key = created[0].action_key;
            if (db[name].some((r) => r.action_key === key)) {
              return { data: null, error: { code: "23505", message: "duplicate" } };
            }
          }
          db[name].push(...created);
          return { data: created[0], error: null };
        }
        if (mode === "update") {
          const hit = api.match(db[name]);
          hit.forEach((r: Row) => Object.assign(r, payload[0]));
          return { data: hit[0] ?? null, error: null };
        }
        if (mode === "delete") {
          const hit = api.match(db[name]);
          db[name] = db[name].filter((r) => !hit.includes(r));
          return { data: hit, error: null };
        }
        const rows = api.match(db[name]);
        return { data: rows, error: null };
      },
      maybeSingle() {
        const r = api.run();
        return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error });
      },
      single() { return api.maybeSingle(); },
      then(res: any, rej?: any) {
        const r = api.run();
        return Promise.resolve(Array.isArray(r.data) ? r : { data: r.data ? [r.data] : [], error: r.error }).then(res, rej);
      },
    };
    return api;
  }
  return {
    db,
    from: (name: string) => table(name),
    rpc: async () => ({ data: null, error: null }),
  };
}

function ctxFor(admin: any, shopKey: "colorlab" | "printing" = "colorlab", lineUserId = "U1"): NdbContext & { sent: unknown[][] } {
  const sent: unknown[][] = [];
  return {
    admin,
    groupId: "C-group",
    lineUserId,
    eventId: "ev-1",
    shopKey,
    storeId: "store-1",
    storeSlug: shopKey,
    storeLabel: NDB_THEME[shopKey].label,
    channelId: "ch-1",
    appOrigin: "https://app.test",
    lineToken: "token",
    actorLabel: "พนักงาน A",
    send: async (m: unknown[]) => { sent.push(m); },
    sent,
  } as any;
}

const json = (v: unknown) => JSON.stringify(v);

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.fileDrafts.length = 0;
});

/* ---------------------------------- tests --------------------------------- */

describe("NATTA DOC BOT — เมนู Flex และการแยก 2 ร้าน", () => {
  it("เมนูหลักมีหัวการ์ดและปุ่มครบตามสเปก", () => {
    const flex = buildNdbMenuFlex("colorlab", "นัฐภรณ์ คัลเลอร์แล็ป");
    const s = json(flex);
    expect(s).toContain("NATTA DOC BOT");
    expect(s).toContain("นัฐภรณ์ คัลเลอร์แล็ป");
    for (const label of ["สร้างใบเสนอราคา", "เอกสารล่าสุด", "ค้นหาเอกสาร", "เอกสารวันนี้", "วิธีใช้งาน", "เมนูหลัก"]) {
      expect(s).toContain(label);
    }
    expect(s).not.toMatch(/https?:\/\//);
  });

  it("คัลเลอร์แล็ปใช้สีส้ม การพิมพ์ใช้สีเขียว", () => {
    expect(json(buildNdbMenuFlex("colorlab"))).toContain(NDB_THEME.colorlab.primary);
    expect(json(buildNdbMenuFlex("printing"))).toContain(NDB_THEME.printing.primary);
    expect(NDB_THEME.colorlab.primary).not.toBe(NDB_THEME.printing.primary);
  });

  it("เอกสารต่อเนื่องต่างกันตามร้าน", () => {
    expect(NDB_NEXT_DOCS.colorlab.map((n) => n.type)).toEqual(["delivery_note", "tax_receipt"]);
    expect(NDB_NEXT_DOCS.printing.map((n) => n.type)).toEqual(["delivery_note", "receipt", "delivery_receipt"]);
  });

  it("ทริกเกอร์เมนูและ postback แปลงกลับได้", () => {
    ["เมนู", "menu", "ช่วยเหลือ", "เริ่ม"].forEach((t) => expect(isNdbMenuTrigger(t)).toBe(true));
    const data = buildNdbPostback({ action: "confirm", shopKey: "printing", draftId: "d-9" });
    expect(parseNdbPostback(data)).toMatchObject({ action: "confirm", shopKey: "printing", draftId: "d-9" });
    expect(parseNdbPostback("opsn:ack:1")).toBeNull();
    expect(parseNdbSearchTrigger("ค้นหา โรงเรียนบ้านนา")).toBe("โรงเรียนบ้านนา");
  });
});

describe("ร่างใบเสนอราคา", () => {
  it("ข้อความธรรมชาติไม่แบ่งบรรทัดกลายเป็นร่างใบเสนอราคาของร้านนั้น", () => {
    const cmd = buildQuotationCommand("ลูกค้า: โรงเรียนบ้านนา / ป้ายไวนิล 2 ผืน 800", "printing");
    expect(cmd?.docType).toBe("quotation");
    expect(cmd?.fields.shopKey).toBe("printing");
    expect(cmd?.fields.customerName).toContain("โรงเรียนบ้านนา");
    expect(cmd?.fields.items[0]).toMatchObject({ quantity: 2, unitPrice: 800 });
    expect(cmd?.sendTo).toBeNull();
  });

  it("ข้อมูลขาด → ถามเฉพาะช่องที่ขาด ไม่เดาข้อมูล", async () => {
    const admin = fakeAdmin();
    const ctx = ctxFor(admin);
    const res = await handleNdbText(ctx, "ป้ายไวนิล 2 ผืน 800");
    expect(res.handled).toBe(true);
    const s = json(ctx.sent);
    expect(s).toContain("ข้อมูลยังไม่ครบ");
    expect(s).toContain("ชื่อลูกค้า");
    expect(admin.db.line_doc_bot_drafts).toHaveLength(1);
  });

  it("ข้อมูลครบ → การ์ดตรวจสอบร่าง ระบุว่ายังไม่มีเลขเอกสาร", async () => {
    const admin = fakeAdmin();
    const ctx = ctxFor(admin);
    await handleNdbText(ctx, "ลูกค้า: โรงเรียนบ้านนา / ป้ายไวนิล 2 ผืน 800");
    const s = json(ctx.sent);
    expect(s).toContain("ตรวจสอบร่างใบเสนอราคา");
    expect(s).toContain("ยังไม่มีเลขเอกสาร และยังไม่ได้บันทึกเป็นเอกสารจริง");
    expect(s).toContain("ยืนยันและสร้างใบเสนอราคา");
    expect(issueDocFromLine).not.toHaveBeenCalled();
  });

  it("แก้ไขด้วยภาษาธรรมชาติ", async () => {
    const admin = fakeAdmin();
    const ctx = ctxFor(admin);
    await handleNdbText(ctx, "ลูกค้า: โรงเรียนบ้านนา / ป้ายไวนิล 2 ผืน 800");
    await handleNdbText(ctx, "เปลี่ยนราคาผืนละ 900");
    const draft = admin.db.line_doc_bot_drafts[0];
    expect(draft.payload.command.fields.items[0].unitPrice).toBe(900);
  });
});

describe("ยืนยัน / กันซ้ำ / ผู้ใช้พร้อมกัน", () => {
  async function makeDraft(admin: any, user = "U1") {
    const ctx = ctxFor(admin, "colorlab", user);
    await handleNdbText(ctx, `ลูกค้า: ลูกค้าของ ${user} / งานพิมพ์ 1 ชุด 500`);
    const draft = admin.db.line_doc_bot_drafts.find((d: any) => d.line_user_id === user);
    return { ctx, draft };
  }

  it("กดยืนยันจึงออกเลขเอกสารจริง และตอบการ์ดสร้างเอกสารสำเร็จ", async () => {
    const admin = fakeAdmin();
    const { ctx, draft } = await makeDraft(admin);
    const res = await handleNdbPostback(ctx, buildNdbPostback({ action: "confirm", shopKey: "colorlab", draftId: draft.id }));
    expect(res.handled).toBe(true);
    expect(issueDocFromLine).toHaveBeenCalledTimes(1);
    const s = json(ctx.sent.at(-1));
    expect(s).toContain("สร้างเอกสารสำเร็จ");
    expect(s).toContain("QT2026080002");
    expect(s).toContain("รอลูกค้ายืนยัน");
    expect(admin.db.line_doc_bot_drafts[0].status).toBe("confirmed");
  });

  it("กดยืนยันซ้ำ (หรือ LINE ส่งซ้ำ) ต้องไม่ออกเลขซ้ำ", async () => {
    const admin = fakeAdmin();
    const { ctx, draft } = await makeDraft(admin);
    const pb = buildNdbPostback({ action: "confirm", shopKey: "colorlab", draftId: draft.id });
    await handleNdbPostback(ctx, pb);
    await handleNdbPostback(ctx, pb);
    expect(issueDocFromLine).toHaveBeenCalledTimes(1);
  });

  it("คนอื่นในกลุ่มกดยืนยันร่างที่ไม่ใช่ของตนไม่ได้ และร่างไม่ปะปนกัน", async () => {
    const admin = fakeAdmin();
    const a = await makeDraft(admin, "U1");
    const b = await makeDraft(admin, "U2");
    expect(a.draft.id).not.toBe(b.draft.id);
    expect(b.draft.payload.command.fields.customerName).toContain("U2");
    const ctxB = ctxFor(admin, "colorlab", "U2");
    await handleNdbPostback(ctxB, buildNdbPostback({ action: "confirm", shopKey: "colorlab", draftId: a.draft.id }));
    expect(issueDocFromLine).not.toHaveBeenCalled();
    expect(json(ctxB.sent)).toContain("ไม่ใช่ของคุณ");
  });

  it("ยกเลิกร่างได้ และไม่ลบเอกสารผ่าน LINE", async () => {
    const admin = fakeAdmin();
    const { ctx, draft } = await makeDraft(admin);
    await handleNdbPostback(ctx, buildNdbPostback({ action: "cancel", shopKey: "colorlab", draftId: draft.id }));
    expect(admin.db.line_doc_bot_drafts[0].status).toBe("cancelled");
    const ctx2 = ctxFor(admin);
    await handleNdbText(ctx2, "ลบเอกสาร QT2026080002");
    expect(json(ctx2.sent)).toContain("ระบบแอดมิน");
  });
});

describe("บังคับใบเสนอราคาก่อน", () => {
  it("พิมพ์ออกใบส่งของ/ใบเสร็จโดยยังไม่มีใบเสนอราคาที่อนุมัติ → บล็อก", async () => {
    expect(parseNdbDirectNextDoc("ออกใบส่งของ")).toBe("delivery_note");
    const admin = fakeAdmin();
    const ctx = ctxFor(admin, "printing");
    await handleNdbText(ctx, "ออกใบเสร็จ\nลูกค้า: โรงเรียนบ้านนา\nงานพิมพ์ 1 ชุด 500");
    const s = json(ctx.sent);
    expect(s).toContain(NDB_QUOTATION_REQUIRED);
    expect(s).toContain("ค้นหาใบเสนอราคา");
    expect(createNextDocFromQuotation).not.toHaveBeenCalled();
  });

  it("ปุ่มเอกสารต่อเนื่องยังออกไม่ได้ถ้ายังไม่ได้ยืนยันการอนุมัติ", async () => {
    const admin = fakeAdmin();
    const ctx = ctxFor(admin, "printing");
    await handleNdbPostback(
      ctx,
      buildNdbPostback({ action: "next_doc", shopKey: "printing", docNo: "QT2026080002", docType: "delivery_note" }),
    );
    expect(createNextDocFromQuotation).not.toHaveBeenCalled();
    expect(json(ctx.sent)).toContain(NDB_QUOTATION_REQUIRED);
  });

  it("ยืนยันการอนุมัติต้องถามซ้ำ แล้วจึงออกเอกสารต่อเนื่องที่อ้างอิงใบเสนอราคา", async () => {
    const admin = fakeAdmin({
      docs: [{ id: "doc-1", store_id: "store-1", document_no: "QT2026080002", document_type: "quotation" }],
    });
    const ctx = ctxFor(admin, "printing");
    await handleNdbPostback(ctx, buildNdbPostback({ action: "approve_ask", shopKey: "printing", docNo: "QT2026080002" }));
    expect(json(ctx.sent.at(-1))).toContain("ยืนยันว่าลูกค้าอนุมัติใบเสนอราคาเลขที่ QT2026080002 แล้วหรือไม่");

    await handleNdbPostback(ctx, buildNdbPostback({ action: "approve_yes", shopKey: "printing", docNo: "QT2026080002" }));
    expect(admin.db.line_doc_bot_approvals).toHaveLength(1);
    expect(json(ctx.sent.at(-1))).toContain("ออกใบส่งของ");

    await handleNdbPostback(
      ctx,
      buildNdbPostback({ action: "next_doc", shopKey: "printing", docNo: "QT2026080002", docType: "delivery_receipt" }),
    );
    expect(createNextDocFromQuotation).toHaveBeenCalledTimes(2);
    expect((createNextDocFromQuotation as any).mock.calls[0][1]).toMatchObject({ sourceDocNo: "QT2026080002" });
  });
});

describe("รายงานและความปลอดภัย", () => {
  it("เอกสารวันนี้นับแยกประเภท และไม่นับใบเสนอราคาเป็นยอดขาย", () => {
    const summary = summarizeNdbToday(
      [
        { document_type: "quotation", document_no: "QT1", grand_total: 1000 },
        { document_type: "quotation", document_no: "QT2", grand_total: 2000 },
        { document_type: "delivery", document_no: "DN1", grand_total: 1000 },
        { document_type: "receipt", document_no: "RC1", grand_total: 1500 },
      ],
      new Set(["QT1"]),
    );
    expect(summary).toEqual({ quotations: 2, approved: 1, deliveries: 1, receipts: 1, receiptAmount: 1500 });
  });

  it("คีย์กันซ้ำผูกกับกลุ่ม ผู้ใช้ และเอกสารอ้างอิง", () => {
    const k1 = ndbActionKey({ groupId: "C1", lineUserId: "U1", action: "confirm", ref: "d1" });
    const k2 = ndbActionKey({ groupId: "C1", lineUserId: "U2", action: "confirm", ref: "d1" });
    expect(k1).not.toBe(k2);
  });

  it("บันทึก audit ทุกขั้น โดยไม่เก็บโทเคน", async () => {
    const admin = fakeAdmin();
    const ctx = ctxFor(admin);
    await handleNdbText(ctx, "ลูกค้า: โรงเรียนบ้านนา / ป้ายไวนิล 2 ผืน 800");
    const actions = admin.db.line_doc_bot_audit.map((r: any) => r.action);
    expect(actions).toContain("draft_created");
    expect(json(admin.db.line_doc_bot_audit)).not.toContain("token");
  });
});

describe("ขอบเขตของบอท (source guard)", () => {
  const read = (p: string) => require("node:fs").readFileSync(p, "utf8");

  it("เรียกใช้เฉพาะห้องเอกสารที่เป็นกลุ่ม — เหตุการณ์ 1:1 ไม่เข้า flow นี้", () => {
    const src = read("supabase/functions/line-webhook/index.ts");
    // ห้องเอกสาร (docOnly) และห้องรันคิวที่เปิดคำสั่งเอกสาร ต้องเป็นกลุ่ม + รู้ตัวผู้ใช้เสมอ
    expect(src).toContain("docBotRoom && groupId && lineUserId &&");
    expect(src).toContain("docBotRoom.docOnly");
    expect(src).toContain("handleNdbPostback");
    // webhook ยังรับ source.type = group ตามเดิม
    expect(src).toContain("ev?.source?.groupId");
  });


  it("บอทไม่แตะคิวงาน/สต๊อก และไม่ส่งเอกสารให้ลูกค้าอัตโนมัติ", () => {
    const handler = read("supabase/functions/_shared/nattaDocBotHandler.ts");
    expect(handler).not.toMatch(/film_order_jobs|film_queue|stock_movements|stock_sync_outbox|nattaq/i);
    expect(handler).toContain("sendTo: null");
  });
});

/* ------------------------- hardening (รอบตรวจทาน) ------------------------- */

describe("แยกไฟล์แนบตามผู้ส่งจริง", () => {
  it("สองคนส่งไฟล์พร้อมกันในห้องเดียวกัน ข้อมูลไม่ปะปน", async () => {
    hoisted.fileDrafts.push(
      { id: "f1", roomId: "C-group", lineUserId: "U1", fileName: "a.pdf", extract: { customerName: "ลูกค้าของ U1", items: [] } },
      { id: "f2", roomId: "C-group", lineUserId: "U2", fileName: "b.pdf", extract: { customerName: "ลูกค้าของ U2", items: [] } },
    );
    const admin = fakeAdmin();
    await handleNdbText(ctxFor(admin, "colorlab", "U1"), "ป้ายไวนิล 2 ผืน 800");
    await handleNdbText(ctxFor(admin, "colorlab", "U2"), "ป้ายไวนิล 1 ผืน 500");
    const d1 = admin.db.line_doc_bot_drafts.find((d: any) => d.line_user_id === "U1");
    const d2 = admin.db.line_doc_bot_drafts.find((d: any) => d.line_user_id === "U2");
    expect(d1.payload.command.fields.customerName).toContain("U1");
    expect(d2.payload.command.fields.customerName).toContain("U2");
    expect(loadPendingFileDraft).toHaveBeenCalledWith(expect.anything(), "C-group", "U1");
    expect(loadPendingFileDraft).toHaveBeenCalledWith(expect.anything(), "C-group", "U2");
  });

  it("loadPendingFileDraft กรอง line_user_id และ NDB ส่ง lineUserId เสมอ", () => {
    const read = (p: string) => require("node:fs").readFileSync(p, "utf8");
    const intake = read("supabase/functions/_shared/docFileIntake.ts");
    expect(intake).toMatch(/if \(lineUserId\) q = q\.eq\("line_user_id", lineUserId\)/);
    const handler = read("supabase/functions/_shared/nattaDocBotHandler.ts");
    expect(handler).not.toMatch(/loadPendingFileDraft\(ctx\.admin, ctx\.groupId\)/);
    expect(
      (handler.match(/loadPendingFileDraft\(ctx\.admin, ctx\.groupId, ctx\.lineUserId\)/g) ?? []).length,
    ).toBe(2);
  });
});

describe("idempotency ล้มเหลวและการ retry", () => {
  it("claimNdbAction ไม่ fail-open เมื่อฐานข้อมูลผิดพลาด", async () => {
    const admin = fakeAdmin({ claimError: true });
    expect(await claimNdbAction(admin, "k1")).toBe("error");
    const ok = fakeAdmin();
    expect(await claimNdbAction(ok, "k1")).toBe("claimed");
    expect(await claimNdbAction(ok, "k1")).toBe("duplicate");
  });

  it("claim ผิดพลาด → ไม่ออกเอกสารเลย และแจ้งให้ลองใหม่", async () => {
    const admin = fakeAdmin({ claimError: true });
    const ctx = ctxFor(admin);
    await handleNdbText(ctx, "ลูกค้า: โรงเรียนบ้านนา / ป้ายไวนิล 2 ผืน 800");
    const draft = admin.db.line_doc_bot_drafts[0];
    await handleNdbPostback(ctx, buildNdbPostback({ action: "confirm", shopKey: "colorlab", draftId: draft.id }));
    expect(issueDocFromLine).not.toHaveBeenCalled();
    expect(json(ctx.sent)).toContain("ลองกดใหม่");
  });

  it("ยืนยันแล้วออกเอกสารล้มเหลว → กดใหม่ retry ได้ ด้วย messageId เดิม", async () => {
    const admin = fakeAdmin();
    const ctx = ctxFor(admin);
    await handleNdbText(ctx, "ลูกค้า: โรงเรียนบ้านนา / ป้ายไวนิล 2 ผืน 800");
    const draft = admin.db.line_doc_bot_drafts[0];
    const pb = buildNdbPostback({ action: "confirm", shopKey: "colorlab", draftId: draft.id });
    (issueDocFromLine as any).mockRejectedValueOnce(new Error("pdf_upload_failed"));
    await handleNdbPostback(ctx, pb);
    expect(json(ctx.sent.at(-1))).toContain("ออกใบเสนอราคาไม่สำเร็จ");
    expect(admin.db.line_doc_bot_actions).toHaveLength(0); // ปล่อย claim คืนแล้ว

    await handleNdbPostback(ctx, pb);
    expect(issueDocFromLine).toHaveBeenCalledTimes(2);
    const calls = (issueDocFromLine as any).mock.calls;
    expect(calls[0][1].messageId).toBe(calls[1][1].messageId);
    expect(admin.db.line_doc_bot_drafts[0].status).toBe("confirmed");
  });

  it("ใบส่งของสำเร็จ แต่ใบเสร็จล้ม → retry ออกเฉพาะใบเสร็จ ไม่ออกใบส่งของซ้ำ", async () => {
    const admin = fakeAdmin({
      docs: [{ id: "doc-1", store_id: "store-1", document_no: "QT1", document_type: "quotation" }],
      approvals: [{ id: "a1", store_id: "store-1", quotation_no: "QT1" }],
    });
    const ctx = ctxFor(admin, "printing");
    const pb = buildNdbPostback({ action: "next_doc", shopKey: "printing", docNo: "QT1", docType: "delivery_receipt" });
    (createNextDocFromQuotation as any)
      .mockImplementationOnce(async (_a: unknown, i: any) => ({ ok: true, message: `ok ${i.docType}`, docNo: "DN1" }))
      .mockImplementationOnce(async () => ({ ok: false, message: "❌ ออกใบเสร็จไม่สำเร็จ" }));
    await handleNdbPostback(ctx, pb);
    expect((createNextDocFromQuotation as any).mock.calls.map((c: any[]) => c[1].docType)).toEqual([
      "delivery_note",
      "receipt",
    ]);

    (createNextDocFromQuotation as any).mockImplementation(async (_a: unknown, i: any) => ({
      ok: true,
      message: `ok ${i.docType}`,
      docNo: "RC1",
    }));
    await handleNdbPostback(ctx, pb);
    const all = (createNextDocFromQuotation as any).mock.calls.map((c: any[]) => c[1].docType);
    expect(all).toEqual(["delivery_note", "receipt", "receipt"]);
  });
});

describe("ตรวจชนิดเอกสารตามร้าน", () => {
  it("colorlab รับเฉพาะ delivery_note / tax_receipt", () => {
    expect(isNdbNextDocAllowed("colorlab", "delivery_note")).toBe(true);
    expect(isNdbNextDocAllowed("colorlab", "tax_receipt")).toBe(true);
    expect(isNdbNextDocAllowed("colorlab", "receipt")).toBe(false);
    expect(isNdbNextDocAllowed("colorlab", "delivery_receipt")).toBe(false);
  });

  it("printing รับเฉพาะ delivery_note / receipt / delivery_receipt", () => {
    expect(isNdbNextDocAllowed("printing", "receipt")).toBe(true);
    expect(isNdbNextDocAllowed("printing", "delivery_receipt")).toBe(true);
    expect(isNdbNextDocAllowed("printing", "tax_receipt")).toBe(false);
  });

  it("postback ที่ปลอมชนิดเอกสารถูกปฏิเสธก่อนเรียกสร้างเอกสาร", async () => {
    const admin = fakeAdmin({ approvals: [{ id: "a1", store_id: "store-1", quotation_no: "QT1" }] });
    const ctx = ctxFor(admin, "colorlab");
    await handleNdbPostback(
      ctx,
      buildNdbPostback({ action: "next_doc", shopKey: "colorlab", docNo: "QT1", docType: "delivery_receipt" }),
    );
    expect(createNextDocFromQuotation).not.toHaveBeenCalled();
    expect(json(ctx.sent)).toContain("ออกเอกสารชนิดนี้ไม่ได้");
  });
});

describe("กรองร้านก่อนหยิบเอกสารตามเลขที่", () => {
  it("เลขเอกสารซ้ำต่างร้าน → ไม่หยิบใบของร้านอื่น", async () => {
    const admin = fakeAdmin({
      docs: [
        { id: "other", store_id: "store-2", document_no: "QT9", document_type: "quotation" },
        { id: "mine", store_id: "store-1", document_no: "QT9", document_type: "quotation" },
      ],
    });
    const ctx = ctxFor(admin);
    await handleNdbPostback(ctx, buildNdbPostback({ action: "copy_link", shopKey: "colorlab", docNo: "QT9" }));
    expect(json(ctx.sent.at(-1))).toContain("/documents/mine/edit");
  });

  it("อนุมัติใบของร้านอื่นไม่ได้", async () => {
    const admin = fakeAdmin({
      docs: [{ id: "other", store_id: "store-2", document_no: "QT9", document_type: "quotation" }],
    });
    const ctx = ctxFor(admin);
    await handleNdbPostback(ctx, buildNdbPostback({ action: "approve_yes", shopKey: "colorlab", docNo: "QT9" }));
    expect(admin.db.line_doc_bot_approvals).toHaveLength(0);
    expect(json(ctx.sent.at(-1))).toContain("ไม่พบใบเสนอราคานี้");
  });

  it("docNextDoc กรอง store_id ในคิวรีต้นทาง", () => {
    const src = require("node:fs").readFileSync("supabase/functions/_shared/docNextDoc.ts", "utf8");
    expect(src).toMatch(/\.eq\("document_no", input\.sourceDocNo\)\s*\.eq\("store_id", input\.storeId\)/);
  });
});

describe("permission ไม่ผ่าน = deny แล้วจบ", () => {
  it("ทั้ง text และ postback ไม่ไหลไป handler เดิม", () => {
    const src = require("node:fs").readFileSync("supabase/functions/line-webhook/index.ts", "utf8");
    const block = src.slice(src.indexOf("const ndbPerm ="), src.indexOf("const ndbPerm =") + 600);
    expect(block).toContain("if (!ndbPerm.allowed)");
    expect(block).not.toContain('if (ndbData.startsWith("ndb?"))');
    expect(block).toContain("continue;");
  });
});

describe("เอกสารวันนี้ใช้เวลาไทย", () => {
  it("ช่วง 00:00–06:59 เวลาไทย ยังนับเป็นวันเดียวกัน (ไม่ใช่ UTC)", () => {
    // 2026-08-15 01:30 ไทย = 2026-08-14T18:30Z
    expect(bangkokDayStartIso(new Date("2026-08-14T18:30:00Z"))).toBe("2026-08-14T17:00:00.000Z");
    // 2026-08-15 06:59 ไทย
    expect(bangkokDayStartIso(new Date("2026-08-14T23:59:00Z"))).toBe("2026-08-14T17:00:00.000Z");
    // 2026-08-15 08:00 ไทย → วันเดียวกันอยู่
    expect(bangkokDayStartIso(new Date("2026-08-15T01:00:00Z"))).toBe("2026-08-14T17:00:00.000Z");
    // ก่อนเที่ยงคืนไทย = วันก่อนหน้า
    expect(bangkokDayStartIso(new Date("2026-08-14T16:59:00Z"))).toBe("2026-08-13T17:00:00.000Z");
  });
});

describe("ดูตัวอย่างเอกสาร", () => {
  it("แสดงตัวอย่างรายละเอียด ไม่ออกเลขจริง และไม่ใช่การ์ดตรวจสอบเดิม", async () => {
    const admin = fakeAdmin();
    const ctx = ctxFor(admin);
    await handleNdbText(ctx, "ลูกค้า: โรงเรียนบ้านนา / ป้ายไวนิล 2 ผืน 800");
    const draft = admin.db.line_doc_bot_drafts[0];
    ctx.sent.length = 0;
    await handleNdbPostback(ctx, buildNdbPostback({ action: "preview", shopKey: "colorlab", draftId: draft.id }));
    const s = json(ctx.sent);
    expect(s).toContain("ตัวอย่างเอกสาร (ยังไม่ออกเลข)");
    expect(s).toContain("โรงเรียนบ้านนา");
    expect(s).not.toContain("ตรวจสอบร่างใบเสนอราคา");
    expect(s).not.toMatch(/QT20\d{6}/);
    expect(issueDocFromLine).not.toHaveBeenCalled();
  });
});

describe("sanitize คำค้น PostgREST", () => {
  it("ตัดอักขระอันตราย แต่ยังค้นไทย/เลขเอกสาร/เบอร์โทรได้", () => {
    expect(sanitizeNdbKeyword("โรงเรียนบ้านนา")).toBe("โรงเรียนบ้านนา");
    expect(sanitizeNdbKeyword("QT2026080002")).toBe("QT2026080002");
    expect(sanitizeNdbKeyword("081-992-0338")).toBe("081-992-0338");
    expect(sanitizeNdbKeyword("a,b.c(d)e%f*g\\h'i\"j")).toBe("a b c d e f g h i j");
    expect(sanitizeNdbKeyword("x".repeat(200)).length).toBe(60);
  });
});

/* ---------- อินพุตที่ไม่รองรับ + ข้อความยืนยันหลังออกเอกสาร + audit ---------- */

describe("NDB unsupported input & done summary", () => {
  it("บอกชนิดข้อความที่รองรับและย้ำว่าไม่ออกเอกสาร", async () => {
    const { ndbUnsupportedMessageText, isNdbSupportedMessageType } = await import(
      "../../supabase/functions/_shared/nattaDocBot.ts"
    );
    expect(isNdbSupportedMessageType("text")).toBe(true);
    expect(isNdbSupportedMessageType("image")).toBe(true);
    expect(isNdbSupportedMessageType("sticker")).toBe(false);
    const t = ndbUnsupportedMessageText("sticker");
    expect(t).toContain("สติกเกอร์");
    expect(t).toContain("PDF");
    expect(t).toContain("ยังไม่มีการสร้างร่างหรือออกเลขเอกสาร");
  });

  it("ไฟล์ที่อ่านไม่ได้ตอบเหตุผลและวิธีส่งใหม่", async () => {
    const { ndbUnsupportedFileText } = await import("../../supabase/functions/_shared/nattaDocBot.ts");
    const t = ndbUnsupportedFileText('ไฟล์ "a.zip" ระบบยังอ่านไม่ได้');
    expect(t).toContain("a.zip");
    expect(t).toContain("XLSX");
    expect(t).toContain("ยังไม่มีการสร้างร่างหรือออกเลขเอกสาร");
  });

  it("ข้อความยืนยันระบุชนิดเอกสาร เลขที่ และลิงก์ดาวน์โหลด", async () => {
    const { buildNdbDoneSummaryText } = await import("../../supabase/functions/_shared/nattaDocBot.ts");
    const t = buildNdbDoneSummaryText({
      docTypeLabel: "ใบส่งของ",
      docNo: "DN2026080001",
      sourceDocNo: "QT2026080002",
      docUrl: "https://app/doc/1",
      pdfUrl: "https://files/pdf",
    });
    expect(t).toContain("สร้างใบส่งของเรียบร้อย");
    expect(t).toContain("DN2026080001");
    expect(t).toContain("QT2026080002");
    expect(t).toContain("https://files/pdf");
    expect(t).toContain("https://app/doc/1");
  });

  it("webhook บันทึก audit ครบ (เวลา, groupId, ประเภทเอกสาร, รหัสอ้างอิง)", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("supabase/functions/line-webhook/index.ts", "utf8");
    expect(src).toMatch(/processed_at: new Date\(\)\.toISOString\(\)/);
    expect(src).toMatch(/duration_ms:/);
    expect(src).toMatch(/group_id: \(ev\?\.source\?\.groupId/);
    expect(src).toMatch(/ref_code:/);
    expect(src).toMatch(/ndbUnsupportedMessageText/);
    expect(src).toMatch(/ndbUnsupportedFileText/);
  });
});

describe('รวมลิงก์ทั้งชุด', () => {
  const docs = [
    { docNo: 'QT-0001', docTypeLabel: 'ใบเสนอราคา', customerName: 'คุณเอ', total: 396, url: 'https://x/1', isSource: true, items: [{ description: 'ป้ายไวนิล', quantity: 2, unit: 'ผืน', total: 396 }] },
    { docNo: 'DN-0001', docTypeLabel: 'ใบส่งของ', customerName: 'คุณเอ', total: 396, url: 'https://x/2', items: [], moreItems: 0 },
  ];

  it('อ่านคำสั่งรวมลิงก์ทั้งชุดได้ทั้งแบบระบุและไม่ระบุเลขที่', () => {
    expect(parseNdbBundleTrigger('รวมลิงก์ทั้งชุด')).toEqual({ docNo: null });
    expect(parseNdbBundleTrigger('รวมลิงก์ทั้งชุด QT-0001')).toEqual({ docNo: 'QT-0001' });
    expect(parseNdbBundleTrigger('เมนูหลัก')).toBeNull();
  });

  it('สร้าง carousel ตัวอย่างเอกสารรายฉบับ และข้อความรวมลิงก์', () => {
    const carousel = buildNdbBundleCarousel({ shopKey: 'printing', storeLabel: 'ร้าน', docs }) as any;
    expect(carousel.type).toBe('carousel');
    expect(carousel.contents).toHaveLength(2);
    const text = buildNdbBundleLinksText(docs, 'QT-0001');
    expect(text).toContain('https://x/1');
    expect(text).toContain('https://x/2');
    expect(text).toContain('2 ฉบับ');
  });

  it('เงื่อนไขปุ่มรวมลิงก์ทั้งชุด: ต้องมีต้นชุด + ต่อเนื่องอย่างน้อย 1 ใบ', async () => {
    const { ndbShouldShowBundleButton } = await import('../../supabase/functions/_shared/nattaDocBot.ts');
    expect(ndbShouldShowBundleButton(undefined)).toBe(false);
    expect(ndbShouldShowBundleButton(null)).toBe(false);
    expect(ndbShouldShowBundleButton(0)).toBe(false);
    expect(ndbShouldShowBundleButton(1)).toBe(false);
    expect(ndbShouldShowBundleButton(2)).toBe(true);
    expect(ndbShouldShowBundleButton(9)).toBe(true);
    expect(ndbShouldShowBundleButton(Number.NaN)).toBe(false);
  });

  it('การ์ดออกเอกสารซ่อน/แสดงปุ่มรวมลิงก์ตามจำนวนเอกสารในชุด', async () => {
    const { buildNdbIssuedFlex } = await import('../../supabase/functions/_shared/nattaDocBot.ts');
    const labels = (flex: any) => JSON.stringify(flex.footer ?? flex);
    const base = { shopKey: 'printing' as const, docTypeLabel: 'ใบเสนอราคา', docNo: 'QT-0001', total: 100 };
    expect(labels(buildNdbIssuedFlex(base))).not.toContain('รวมลิงก์ทั้งชุด');
    expect(labels(buildNdbIssuedFlex({ ...base, bundleCount: 1 }))).not.toContain('รวมลิงก์ทั้งชุด');
    expect(labels(buildNdbIssuedFlex({ ...base, bundleCount: 3 }))).toContain('รวมลิงก์ทั้งชุด');
  });

  it('บันทึก log การสร้างการ์ด Flex พร้อม doc type/ร้าน/รหัสอ้างอิง', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('supabase/functions/_shared/nattaDocBotHandler.ts', 'utf8');
    expect(src).toMatch(/action: "flex_issued_card"/);
    expect(src).toMatch(/ref: flexRef/);
    expect(src).toMatch(/bundleButton: showBundleBtn/);
    expect(src).toMatch(/bundle_links_skipped/);
  });
});
