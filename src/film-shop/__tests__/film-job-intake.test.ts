import { describe, it, expect } from 'vitest';
import { ingestFilmJobMessage } from '../../../supabase/functions/_shared/filmJobIntake';

/** Minimal in-memory stand-in for the service-role Supabase client. */
function fakeAdmin() {
  const tables: Record<string, any[]> = {
    film_job_requests: [],
    film_orders: [],
    film_order_items: [],
    film_order_jobs: [],
    film_order_events: [],
    film_job_type_durations: [{ job_type: 'other', setup_minutes: 15, minutes_per_unit: 10 }],
  };
  let seq = 0;
  const api = {
    tables,
    rpc: async () => ({ data: `OR-2608-${String(++seq).padStart(4, '0')}` }),
    from(name: string) {
      const rows = (tables[name] ||= []);
      let filterFn: (r: any) => boolean = () => true;
      const q: any = {
        select: () => q,
        eq: (col: string, val: any) => { const prev = filterFn; filterFn = (r) => prev(r) && r[col] === val; return q; },
        or: (expr: string) => {
          const clauses = expr.split(',').map((c) => c.split('.eq.'));
          filterFn = (r) => clauses.some(([col, val]) => r[col] === val && val);
          return q;
        },
        maybeSingle: async () => ({ data: rows.find(filterFn) ?? null }),
        single: async () => ({ data: rows.filter(filterFn)[0] ?? null }),
        insert: (row: any) => {
          const arr = Array.isArray(row) ? row : [row];
          const created = arr.map((r) => ({ id: `${name}-${rows.length + 1}`, ...r }));
          // enforce the unique indexes on the LINE ids
          if (name === 'film_job_requests') {
            for (const c of created) {
              const dup = rows.some((r) =>
                (c.line_event_id && r.line_event_id === c.line_event_id) ||
                (c.line_message_id && r.line_message_id === c.line_message_id));
              if (dup) {
                const err: any = { code: '23505', message: 'duplicate key' };
                return { select: () => ({ single: async () => ({ data: null, error: err }) }), then: undefined };
              }
            }
          }
          rows.push(...created);
          const res = { data: created.length === 1 ? created[0] : created, error: null };
          const chain: any = {
            select: () => ({ single: async () => ({ data: created[0], error: null }), then: (r: any) => r(res) }),
            then: (r: any) => r(res),
          };
          return chain;
        },
        update: (patch: any) => ({
          eq: async (col: string, val: any) => {
            rows.filter((r) => r[col] === val).forEach((r) => Object.assign(r, patch));
            return { error: null };
          },
        }),
        then: (r: any) => r({ data: rows, error: null }),
      };
      return q;
    },
  };
  return api;
}

const FULL = [
  'ชื่อ: ร้านลุงหมี',
  'งาน: ป้ายไวนิลเปิดร้าน',
  'จำนวน: 2 ผืน',
  'ไฟล์: มีแล้ว',
  'รับงาน: พรุ่งนี้ 14:00',
].join('\n');

describe('ingestFilmJobMessage', () => {
  it('creates an order when nothing is missing and links it back to the request', async () => {
    const admin = fakeAdmin();
    const res = await ingestFilmJobMessage(admin as any, {
      eventId: 'ev-1', messageId: 'msg-1', lineUserId: 'U1', displayName: 'ลุงหมี', text: FULL,
    });
    expect(res.intakeStatus).toBe('created');
    expect(res.orderNo).toBeTruthy();
    expect(admin.tables.film_orders).toHaveLength(1);
    expect(admin.tables.film_orders[0].channel).toBe('line');
    expect(admin.tables.film_order_jobs[0].estimated_minutes).toBeGreaterThan(0);
    // event timeline keeps the original message
    expect(admin.tables.film_order_events[0].note).toContain('ป้ายไวนิลเปิดร้าน');
    expect(admin.tables.film_job_requests[0].linked_order_id).toBe(res.orderId);
  });

  it('is idempotent for a repeated LINE event id', async () => {
    const admin = fakeAdmin();
    const a = await ingestFilmJobMessage(admin as any, { eventId: 'ev-1', messageId: 'msg-1', text: FULL });
    const b = await ingestFilmJobMessage(admin as any, { eventId: 'ev-1', messageId: 'msg-1', text: FULL });
    expect(b.duplicate).toBe(true);
    expect(b.requestId).toBe(a.requestId);
    expect(admin.tables.film_job_requests).toHaveLength(1);
    expect(admin.tables.film_orders).toHaveLength(1);
  });

  it('holds incomplete messages for review without creating an order', async () => {
    const admin = fakeAdmin();
    const res = await ingestFilmJobMessage(admin as any, { eventId: 'ev-2', messageId: 'msg-2', text: 'อยากทำสติกเกอร์ครับ' });
    expect(res.intakeStatus).toBe('needs_review');
    expect(res.missing.length).toBeGreaterThan(0);
    expect(admin.tables.film_orders).toHaveLength(0);
    expect(admin.tables.film_job_requests[0].draft_reply).toContain('รบกวนขอข้อมูลเพิ่มเติม');
  });

  it('marks chit-chat as not a job', async () => {
    const admin = fakeAdmin();
    const res = await ingestFilmJobMessage(admin as any, { eventId: 'ev-3', messageId: 'msg-3', text: 'สวัสดีครับ' });
    expect(res.intakeStatus).toBe('not_a_job');
    expect(admin.tables.film_orders).toHaveLength(0);
  });
});
