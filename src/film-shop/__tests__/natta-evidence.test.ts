import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../../../supabase/functions/_shared/lineIntakeStore.ts", () => ({
  storeLineAttachment: vi.fn(async (_a: any, _t: any, input: any) => ({
    ok: true,
    name: `slip-${input.seq}.jpg`,
    path: `acct/x/slip-${input.seq}.jpg`,
  })),
}));

const { handleNattaAccountant, handleNattaAttachment, confirmPending, ATTACHABLE_ACTIONS } = await import(
  "../../../supabase/functions/_shared/nattaAccountantHandler"
);
const { bangkokDate } = await import("../../../supabase/functions/_shared/nattaAccountant");

function makeAdmin(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = JSON.parse(JSON.stringify(seed));
  let seq = 0;
  const from = (table: string) => {
    tables[table] ??= [];
    const filters: Array<(r: any) => boolean> = [];
    const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => { filters.push((r) => (c.includes("->>") ? String(r.payload?.[c.split("->>")[1].replace(/'/g, "")] ?? "") === String(v) : r[c] === v)); return q; },
      neq: (c: string, v: any) => { filters.push((r) => r[c] !== v); return q; },
      is: (c: string, v: any) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      order: () => q,
      limit: () => Promise.resolve({ data: rows(), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (f: any) => Promise.resolve({ data: rows(), error: null }).then(f),
      insert: (row: any) => {
        const rec = { id: `${table}-${++seq}`, created_at: new Date(2000 + seq, 0, 1).toISOString(), ...row };
        tables[table].push(rec);
        return { select: () => Promise.resolve({ data: [rec], error: null }), then: (f: any) => Promise.resolve({ error: null }).then(f) };
      },
      update: (patch: any) => {
        const u: any = {
          eq: (c: string, v: any) => { q.eq(c, v); return u; },
          is: (c: string, v: any) => { q.is(c, v); return u; },
          select: () => Promise.resolve({ data: apply(patch), error: null }),
          then: (f: any) => Promise.resolve({ data: apply(patch), error: null }).then(f),
        };
        return u;
      },
    };
    const apply = (patch: any) => { const hit = rows(); hit.forEach((r) => Object.assign(r, patch)); return hit; };
    return q;
  };
  return { admin: { from }, tables };
}

const NOW = new Date("2026-09-04T05:00:00.000Z");
const TODAY = bangkokDate(NOW);
const ctx = (admin: any, extra: any = {}) => ({
  admin, lineUserId: "U1", messageId: "M1", eventId: "E1", isAuthorized: true, lineToken: "tok", now: NOW, ...extra,
});

function seedTx(evidence: any[] = []) {
  return {
    film_transactions: [{
      id: "tx-1", line_user_id: "U1", date: TODAY, voided_at: null, type: "income",
      amount: 360, description: "ขายรูป", category: "งานถ่ายรูป", evidence, created_at: NOW.toISOString(),
    }],
  };
}

describe("แนบหลักฐานเพิ่มให้รายการที่บันทึกแล้ว (add_evidence)", () => {
  it("อยู่ในรายการ action ที่รับไฟล์ได้", () => {
    expect(ATTACHABLE_ACTIONS).toContain("add_evidence");
  });

  it("แนบสลิปโดยไม่มีร่าง → เปิดร่าง add_evidence และยังไม่แตะรายการจริง", async () => {
    const { admin, tables } = makeAdmin(seedTx());
    const res = await handleNattaAccountant(ctx(admin) as any, "แนบสลิป");
    expect(res.handled).toBe(true);
    const pending = tables.film_line_pending_actions ?? [];
    expect(pending.length).toBe(1);
    expect(pending[0].action).toBe("add_evidence");
    expect(tables.film_transactions[0].evidence).toEqual([]);
  });

  it("ส่งไฟล์เข้ามา → เก็บในร่างเท่านั้น ยังไม่อัปเดตรายการ", async () => {
    const { admin, tables } = makeAdmin(seedTx());
    await handleNattaAccountant(ctx(admin) as any, "แนบสลิป");
    const res = await handleNattaAttachment(ctx(admin) as any, { messageId: "MM1", fileName: null });
    expect(res.handled).toBe(true);
    expect(tables.film_transactions[0].evidence).toEqual([]);
    expect(tables.film_line_pending_actions[0].payload.newAttachments.length).toBe(1);
  });

  it("ยืนยันแล้วแนบเข้ารายการครั้งเดียว (ยืนยันซ้ำไม่เพิ่มไฟล์)", async () => {
    const { admin, tables } = makeAdmin(seedTx());
    await handleNattaAccountant(ctx(admin) as any, "แนบสลิป");
    await handleNattaAttachment(ctx(admin) as any, { messageId: "MM1", fileName: null });
    const pendingId = tables.film_line_pending_actions[0].id;
    const ok = await confirmPending(ctx(admin) as any, pendingId, NOW, TODAY);
    expect(ok.handled).toBe(true);
    expect(tables.film_transactions[0].evidence.length).toBe(1);
    const again = await confirmPending(ctx(admin) as any, pendingId, NOW, TODAY);
    expect(again.info).toContain("consumed");
    expect(tables.film_transactions[0].evidence.length).toBe(1);
  });

  it("ยกเลิกร่าง → ไม่มีไฟล์ถูกแนบ", async () => {
    const { admin, tables } = makeAdmin(seedTx());
    await handleNattaAccountant(ctx(admin) as any, "แนบสลิป");
    await handleNattaAttachment(ctx(admin) as any, { messageId: "MM1", fileName: null });
    await handleNattaAccountant(ctx(admin) as any, "ยกเลิก");
    expect(tables.film_transactions[0].evidence).toEqual([]);
  });

  it("คนอื่นแนบ/ยืนยันรายการของเราไม่ได้", async () => {
    const { admin, tables } = makeAdmin(seedTx());
    // ผู้ใช้อื่นสั่งแนบสลิป → ไม่พบรายการของตัวเอง
    const other = await handleNattaAccountant(ctx(admin, { lineUserId: "U2" }) as any, "แนบสลิป");
    expect(other.info).toContain("no draft");
    // และยืนยันร่างของ U1 ไม่ได้
    await handleNattaAccountant(ctx(admin) as any, "แนบสลิป");
    await handleNattaAttachment(ctx(admin) as any, { messageId: "MM1", fileName: null });
    const pendingId = tables.film_line_pending_actions.find((p: any) => p.action === "add_evidence").id;
    const res = await confirmPending(ctx(admin, { lineUserId: "U2" }) as any, pendingId, NOW, TODAY);
    expect(res.info).toContain("consumed");
    expect(tables.film_transactions[0].evidence).toEqual([]);
  });
});

describe("ความปลอดภัยของโค้ด (source contract)", () => {
  const webhook = readFileSync("supabase/functions/line-webhook/index.ts", "utf8");
  const evidenceFn = readFileSync("supabase/functions/film-transaction-evidence/index.ts", "utf8");

  it("รูป/ไฟล์ในช่อง natta ไม่หลุดไป intake อื่น แม้ไม่มีร่างรอยืนยัน", () => {
    const block = webhook.slice(webhook.indexOf('channel?.id === "natta"'));
    expect(block).toContain("handleNattaAttachment");
    expect(block).toContain("NATTA_ATTACH_NO_DRAFT");
    expect(block).toContain("NATTA_NO_PERMISSION");
    expect(block).not.toContain("hasOpenNattaDraft");
  });

  it("ฟังก์ชันดูหลักฐาน: owner/admin เท่านั้น และรับแค่ transaction_id", () => {
    expect(evidenceFn).toContain('_role: "owner"');
    expect(evidenceFn).toContain('_role: "admin"');
    expect(evidenceFn).toContain("transaction_id");
    expect(evidenceFn).toContain("createSignedUrl");
    expect(evidenceFn).not.toContain("body.path");
    expect(evidenceFn).not.toContain("getPublicUrl");
    expect(evidenceFn).not.toContain("SUPABASE_SERVICE_ROLE_KEY!)!");
  });

  it("UI ผู้ช่วยไม่มีชื่อเก่าให้ผู้ใช้เห็น", () => {
    for (const f of [
      "src/film-shop/components/transactions/TransactionManager.tsx",
      "src/film-shop/components/settings/NattaAssistantCard.tsx",
      "src/film-shop/components/settings/NattaQuickEntriesCard.tsx",
    ]) {
      expect(readFileSync(f, "utf8")).not.toContain("น้องนัตต้า");
    }
  });
});
