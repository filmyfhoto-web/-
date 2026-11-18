import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  loadFilmOrder, resolveFilmRecipient, filmStageMatchesStatus,
  isFilmDeliveryStage, buildFilmDeliveryText,
} from '../../supabase/functions/_shared/filmDelivery';

const send = vi.fn();

/** mock DB client จำลอง supabase-js เท่าที่โค้ดใช้ + จดว่า query ตารางไหน */
function mockDb(rows: Record<string, unknown[]>) {
  const tables: string[] = [];
  const db = {
    tables,
    from(table: string) {
      tables.push(table);
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            const list = (rows[table] ?? []).filter((r: any) => r[col] === val);
            return {
              maybeSingle: async () => ({ data: list[0] ?? null, error: null }),
              limit: async () => ({ data: list, error: null }),
            };
          },
        }),
      };
    },
  };
  return db as typeof db;
}

const order = {
  id: 'fo-1', order_no: 'FS-0001', customer_id: 'fc-1',
  customer_name: 'ร้านทดสอบ', customer_phone: '0812345678', status: 'ready',
};

describe('film_delivery ต้องใช้ตาราง Film Shop จริง', () => {
  it('loadFilmOrder query film_orders ไม่ใช่ orders', async () => {
    const db = mockDb({ film_orders: [order] });
    const res = await loadFilmOrder(db as never, 'fo-1');
    expect(db.tables).toEqual(['film_orders']);
    expect(db.tables).not.toContain('orders');
    expect(res).toMatchObject({ order_no: 'FS-0001', status: 'ready' });
  });

  it('ไม่พบออเดอร์ → null', async () => {
    expect(await loadFilmOrder(mockDb({ film_orders: [] }) as never, 'x')).toBeNull();
  });

  it('ใช้ film_customers.line_user_id และชื่อจาก film_customers', async () => {
    const db = mockDb({
      film_customers: [{ id: 'fc-1', name: 'บริษัท ฟิล์ม จำกัด', line_user_id: 'U-real' }],
    });
    const r = await resolveFilmRecipient(db as never, order as never);
    expect(r).toEqual({ lineUserId: 'U-real', customerName: 'บริษัท ฟิล์ม จำกัด' });
    expect(db.tables).toEqual(['film_customers']);
  });

  it('ข้อมูลเก่า: fallback ไป line_account_links ด้วย customer_id เดียวกัน', async () => {
    const db = mockDb({
      film_customers: [{ id: 'fc-1', name: 'ลูกค้าเก่า', line_user_id: null }],
      line_account_links: [
        { customer_id: 'fc-other', line_user_id: 'U-wrong', customer_source: 'film', verified_at: 'x' },
        { customer_id: 'fc-1', line_user_id: 'U-old', customer_source: 'film', verified_at: 'x' },
      ],
    });
    const r = await resolveFilmRecipient(db as never, order as never);
    expect(r.lineUserId).toBe('U-old');
    expect(r.customerName).toBe('ลูกค้าเก่า');
  });

  it('binding ที่ยังไม่ verified หรือคนละ source → ไม่ส่ง (no_line_binding)', async () => {
    const db = mockDb({
      film_customers: [{ id: 'fc-1', name: 'ลูกค้า', line_user_id: null }],
      line_account_links: [
        { customer_id: 'fc-1', line_user_id: 'U-unverified', customer_source: 'film', verified_at: null },
        { customer_id: 'fc-1', line_user_id: 'U-rds', customer_source: 'rds', verified_at: 'x' },
      ],
    });
    const r = await resolveFilmRecipient(db as never, order as never);
    expect(r).toMatchObject({ lineUserId: null, reason: 'no_line_binding' });
    expect(send).not.toHaveBeenCalled();
  });

  it('ออเดอร์ไม่มี customer_id → no_line_binding ไม่ query อะไรเพิ่ม', async () => {
    const db = mockDb({});
    const r = await resolveFilmRecipient(db as never, { ...order, customer_id: null } as never);
    expect(r).toEqual({ lineUserId: null, customerName: 'ร้านทดสอบ', reason: 'no_line_binding' });
    expect(db.tables).toEqual([]);
  });
});

describe('guard สถานะฝั่งเซิร์ฟเวอร์', () => {
  it('stage ต้องตรงกับ film_orders.status', () => {
    expect(filmStageMatchesStatus('ready', 'ready')).toBe(true);
    expect(filmStageMatchesStatus('ready', 'in_production')).toBe(false);
    expect(filmStageMatchesStatus('delivered', 'ready')).toBe(false);
    expect(filmStageMatchesStatus('delivered', 'delivered')).toBe(true);
    // ปิดงานจริงบันทึกเป็น completed
    expect(filmStageMatchesStatus('delivered', 'completed')).toBe(true);
    expect(filmStageMatchesStatus('ready', 'completed')).toBe(false);
  });

  it('stage อื่นถูกปฏิเสธ', () => {
    expect(isFilmDeliveryStage('cancelled')).toBe(false);
    expect(isFilmDeliveryStage('ready')).toBe(true);
  });
});

describe('ข้อความใช้เลขที่/ชื่อของ Film Shop', () => {
  it('มี order_no และชื่อลูกค้า', () => {
    const t = buildFilmDeliveryText('ready', order as never, 'บริษัท ฟิล์ม จำกัด');
    expect(t).toContain('FS-0001');
    expect(t).toContain('บริษัท ฟิล์ม จำกัด');
    expect(t).toContain('รอส่งมอบ');
  });
});

describe('branch ใน edge function', () => {
  const src = readFileSync('supabase/functions/line-notify/index.ts', 'utf8');
  const branch = src.slice(src.indexOf('kind === "film_delivery"'), src.indexOf('kind === "new_quotation"'));
  it('ไม่ใช้ loadOrder(orders) และคง staff-only + idempotency key เดิม', () => {
    expect(branch).not.toContain('loadOrder(');
    expect(branch).toContain('loadFilmOrder(');
    expect(branch).toContain('isStaffUser');
    expect(branch).toContain('`${baseKey}:film_delivery:${stage}`');
    expect(branch).toContain('status mismatch');
  });
});
