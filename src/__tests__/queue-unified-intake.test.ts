import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildQueueIntakePayload, emptyQueueDraft, emptyQueueItem,
  queueDraftErrors, queueTotals, type QueueIntakeDraft,
} from '@/film-shop/lib/queueIntake';

const src = (p: string) => readFileSync(p, 'utf8');

const draft = (patch: Partial<QueueIntakeDraft> = {}): QueueIntakeDraft => ({
  ...emptyQueueDraft(),
  customerName: 'ครูเมย์',
  items: [{ ...emptyQueueItem(), title: 'ไวนิล', quantity: 2, unitPrice: 300 }],
  ...patch,
});

describe('Q รันงาน — รับงานครั้งเดียวได้ทั้งคิวและเอกสาร', () => {
  it('รับเงินภายหลังเมื่อมีมัดจำ — คิดยอดคงเหลือและเงินทอนจากยอดคงเหลือ', () => {
    const sheet = src('src/film-shop/components/queue/QueueReceiptSheet.tsx');
    // ยอดคงเหลือ = max(0, finalTotal - paidPreviously) และเงินทอนอิงยอดคงเหลือ
    expect(sheet).toMatch(/dueNow = Math\.max\(0, total - paidPreviously\)/);
    expect(sheet).toMatch(/received - dueNow/);
    expect(sheet).toMatch(/received < dueNow/);
    expect(sheet).not.toMatch(/received < total/);
    // ค่าเริ่มต้น “รับเงินมา” = ยอดคงเหลือ
    expect(sheet).toMatch(/setReceived\(Math\.max\(0, base - paidPreviously\)\)/);
    // deposit 200, final 700 → ต้องรับ 500, รับมา 600 → ทอน 100
    const dueNow = (final: number, paid: number) => Math.max(0, final - paid);
    expect(dueNow(700, 200)).toBe(500);
    expect(Math.max(0, 600 - dueNow(700, 200))).toBe(100);
    // ส่ง paidPreviously จากการ์ดออเดอร์เข้า sheet
    const page = src('src/film-shop/components/hub/QueueGroupPage.tsx');
    expect(page).toMatch(/paidPreviously: c\.paidPreviously/);
    expect(page).toMatch(/orderPaidAmount/);
  });

  it('ยอดสุดท้ายต่ำกว่าเงินที่รับไว้แล้ว ถูกบล็อกทั้ง UI และ RPC', () => {
    const sheet = src('src/film-shop/components/queue/QueueReceiptSheet.tsx');
    expect(sheet).toMatch(/belowPaid = total < paidPreviously/);
    expect(sheet).toMatch(/คืนเงินแยก/);
    expect(sheet).toMatch(/disabled=\{saving \|\| belowPaid\}/);
    const sql = src('supabase/migrations/20260817151004_91ce1d48-6f3f-44fb-8fd9-ea20371f1e6e.sql');
    expect(sql).toMatch(/v_paid_prev := greatest\(coalesce\(v_order\.paid_amount, 0\), coalesce\(v_order\.deposit, 0\), 0\)/);
    expect(sql).toMatch(/IF v_final < v_paid_prev THEN/);
  });

  it('SQL มี advisory lock ก่อนตรวจ duplicate', () => {
    const sql = src('supabase/migrations/20260817151004_91ce1d48-6f3f-44fb-8fd9-ea20371f1e6e.sql');
    const intakeLock = sql.indexOf("pg_advisory_xact_lock(hashtextextended('film_queue_intake:");
    const intakeLookup = sql.indexOf('WHERE intake_request_id = v_req');
    expect(intakeLock).toBeGreaterThan(-1);
    expect(intakeLock).toBeLessThan(intakeLookup);
    const rcLock = sql.indexOf("pg_advisory_xact_lock(hashtextextended('film_queue_receipt:");
    expect(rcLock).toBeGreaterThan(-1);
    const rcLookup = sql.indexOf("type = 'receipt' LIMIT 1", rcLock);
    expect(rcLookup).toBeGreaterThan(rcLock);
    // migration ต้องไม่มีคำสั่งลบข้อมูล
    const statements = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(statements).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP TABLE)\b/i);
  });

  it('คำนวณยอดรวม/มัดจำ/คงเหลือถูกต้อง', () => {
    expect(queueTotals(draft()).total).toBe(600);
    const dep = queueTotals(draft({ payMode: 'deposit', deposit: 200 }));
    expect(dep.deposit).toBe(200);
    expect(dep.balance).toBe(400);
    const paid = queueTotals(draft({ payMode: 'paid', received: 1000 }));
    expect(paid.balance).toBe(0);
    expect(paid.change).toBe(400);
  });

  it('ตรวจข้อมูลก่อนยืนยัน', () => {
    expect(queueDraftErrors(draft())).toHaveLength(0);
    expect(queueDraftErrors(draft({ customerName: '' })).length).toBeGreaterThan(0);
    expect(queueDraftErrors(draft({ payMode: 'deposit', deposit: 0 })).length).toBeGreaterThan(0);
    expect(queueDraftErrors(draft({ payMode: 'deposit', deposit: 9999 })).length).toBeGreaterThan(0);
    expect(queueDraftErrors(draft({ payMode: 'paid', received: 10 })).length).toBeGreaterThan(0);
  });

  it('payload มี request_id กันกดซ้ำ และส่งโหมดจ่ายเงิน', () => {
    const p = buildQueueIntakePayload(draft({ payMode: 'paid', received: 600 }), 'req-1') as any;
    expect(p.request_id).toBe('req-1');
    expect(p.payment.mode).toBe('paid');
    expect(p.items).toHaveLength(1);
    expect(p.items[0].unit_price).toBe(300);
  });

  it('การรับงานใช้ RPC เดียว (atomic) ไม่เขียนตารางทีละใบจากฝั่งเว็บ', () => {
    const code = src('src/film-shop/lib/queueIntake.ts');
    expect(code).toMatch(/film_queue_intake_confirm/);
    expect(code).toMatch(/film_queue_issue_receipt/);
    expect(code).not.toMatch(/from\('film_orders'\)/);
    expect(code).not.toMatch(/stock_movements/);
  });

  it('หน้า Q มีปุ่มรับงานใหม่ + แท็บสถานะ + ปุ่มเอกสาร', () => {
    const code = src('src/film-shop/components/hub/QueueGroupPage.tsx');
    expect(code).toMatch(/รับงานใหม่/);
    expect(code).toMatch(/q-tab-waiting|q-tab-\$\{/);
    expect(code).toMatch(/QueueIntakeSheet/);
    expect(code).toMatch(/QueueReceiptSheet/);
  });

  it('ลิงก์เก่า Film Shop เด้งมาที่ Q และบอทมีปุ่มรับงานใหม่', () => {
    expect(src('src/film-shop/FilmShopApp.tsx')).toMatch(/case 'group-filmshop':[\s\S]{0,200}QueueGroupPage/);
    expect(src('supabase/functions/_shared/nattaDocBot.ts')).toMatch(/NDB_FILM_QUEUE_INTAKE_URL/);
  });
});
describe('เก็บงานรอบสุดท้าย — migration ปลอดภัย, ทางเข้าเดียว, ร่าง, ยอดสุดท้าย', () => {
  it('migration cleanup ไม่มี DELETE hard-code', () => {
    const sql = src('supabase/migrations/20260817144347_078dded6-4a0a-492c-a1b9-86f306196a47.sql');
    const statements = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(statements).not.toMatch(/\b(delete|update|truncate|drop)\b/i);
    expect(statements).toMatch(/SELECT 1;/);
  });

  it('?doc=helper และ group-filmshop ถูก canonical redirect ไป Q', () => {
    const app = src('src/film-shop/FilmShopApp.tsx');
    expect(app).toMatch(/doc'\) === 'helper'/);
    expect(app).toMatch(/next\.set\('p', 'group-queue'\)/);
    expect(app).toMatch(/'q', 'intake'/);
    expect(app).toMatch(/'q', 'documents'/);
    expect(app).not.toMatch(/DocHelperSheet/);
  });

  it('Sidebar ไม่มีเมนู group-filmshop อีกแล้ว', () => {
    expect(src('src/film-shop/components/layout/Sidebar.tsx')).not.toMatch(/id: 'group-filmshop'/);
  });

  it('q=documents เปิดเอกสารทั้งหมด และปุ่มมีข้อความ', () => {
    const code = src('src/film-shop/components/hub/QueueGroupPage.tsx');
    expect(code).toMatch(/'documents'/);
    expect(code).toMatch(/เอกสารทั้งหมด/);
    expect(code).toMatch(/q-card-payment/);
    expect(code).not.toMatch(/ไม่ออกเอกสาร/);
  });

  it('การ์ด Q แสดงสถานะชำระเงิน 3 แบบ', () => {
    const code = src('src/film-shop/components/hub/QueueGroupPage.tsx');
    for (const label of ['ยังไม่รับเงิน', 'มัดจำ', 'จ่ายครบ']) expect(code).toMatch(label);
  });

  it('บันทึก/โหลด/ล้างร่างได้จริง', async () => {
    const store = new Map<string, string>();
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
    const m = await import('@/film-shop/lib/queueIntake');
    const d = draft();
    expect(m.saveQueueDraft(d)).toBe(true);
    const back = m.loadQueueDraft();
    expect(back?.customerName).toBe('ครูเมย์');
    expect(m.queueDraftHasContent(back!)).toBe(true);
    m.clearQueueDraft();
    expect(m.loadQueueDraft()).toBeNull();
    delete (globalThis as any).window;
  });

  it('sheet รับงานมีปุ่มบันทึกร่าง/ตรวจทาน และ progress 4 ส่วน', () => {
    const code = src('src/film-shop/components/queue/QueueIntakeSheet.tsx');
    expect(code).toMatch(/qi-save-draft/);
    expect(code).toMatch(/ตรวจทานข้อมูล/);
    expect(code).toMatch(/qi-progress/);
    expect(code).toMatch(/clearQueueDraft/);
    expect(code).toMatch(/ครบแล้ว/);
  });

  it('รับเงินภายหลังแก้ยอดสุดท้ายได้ และบังคับหมายเหตุเมื่อยอดต่าง', () => {
    const code = src('src/film-shop/components/queue/QueueReceiptSheet.tsx');
    expect(code).toMatch(/ยอดชำระสุดท้าย/);
    expect(code).toMatch(/หมายเหตุการปรับยอด/);
    expect(code).toMatch(/received < dueNow/);
  });

  it('เมนูบอท Film Shop เหลือเฉพาะ flow Q', () => {
    const bot = src('supabase/functions/_shared/nattaDocBot.ts');
    expect(bot).toMatch(/NDB_FILM_QUEUE_DOCS_URL/);
    expect(bot).toMatch(/Q รันงาน Film Shop/);
    expect(bot).not.toMatch(/uriBtn\("ช่วยสร้างเอกสาร"/);
    expect(bot).not.toMatch(/uriBtn\("ใบสั่งจ้าง"/);
    expect(bot).not.toMatch(/uriBtn\("ใบเสร็จรับเงิน"/);
    expect(bot).toMatch(/NDB_FILM_DOC_HELPER_URL = NDB_FILM_QUEUE_INTAKE_URL/);
  });
});
