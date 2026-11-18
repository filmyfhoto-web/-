import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isQueueIntakeRoom, cancelIntakeCardToken, buildIntakeFormFlex, buildIntakeSummaryFlex,
} from '../../supabase/functions/_shared/intakeFormLink';
import { isIntakeAiFile } from '../../supabase/functions/_shared/intakeAiExtract';

const STORE = '11111111-1111-4111-8111-111111111111';

/** mock supabase update chain: บันทึก filter ที่ใช้ แล้วคืน row ตามที่ตรงจริง */
function mockAdmin(rows: Array<Record<string, unknown>>) {
  const calls: Record<string, unknown> = {};
  const builder: any = {
    update: (patch: Record<string, unknown>) => { calls.patch = patch; return builder; },
    eq: (k: string, v: unknown) => { calls[k] = v; return builder; },
    is: (k: string, v: unknown) => { calls[`is:${k}`] = v; return builder; },
    select: async () => ({
      data: rows.filter((r) =>
        r.card_key === calls.card_key && r.group_id === calls.group_id &&
        r.line_user_id === calls.line_user_id && r.channel_key === calls.channel_key &&
        r.used_at == null),
      error: null,
    }),
  };
  return { admin: { from: () => builder }, calls };
}

const ROW = {
  id: 'r1', card_key: 'card1', group_id: 'Cgroup', line_user_id: 'Uuser',
  channel_key: STORE, used_at: null,
};

describe('production hardening: AI intake ห้องคิวเท่านั้น', () => {
  it('queue_group + เปิดคำสั่งคิว + store_id UUID เท่านั้นที่เข้า AI intake', () => {
    expect(isQueueIntakeRoom({ channel_type: 'queue_group', queue_commands_enabled: true, store_id: STORE })).toBe(true);
  });

  it('doc_group ที่ queue_commands_enabled=true ต้องไม่เข้า AI intake (ไหลไป docFileIntake)', () => {
    expect(isQueueIntakeRoom({ channel_type: 'doc_group', queue_commands_enabled: true, store_id: STORE })).toBe(false);
  });

  it('ปฏิเสธห้องที่ไม่ผูกร้านจริง / ปิดคำสั่งคิว / ไม่ active', () => {
    expect(isQueueIntakeRoom({ channel_type: 'queue_group', queue_commands_enabled: true, store_id: 'film-shop' })).toBe(false);
    expect(isQueueIntakeRoom({ channel_type: 'queue_group', queue_commands_enabled: false, store_id: STORE })).toBe(false);
    expect(isQueueIntakeRoom({ channel_type: 'queue_group', queue_commands_enabled: true, store_id: STORE, is_active: false })).toBe(false);
    expect(isQueueIntakeRoom(null)).toBe(false);
  });

  it('webhook query ต้องดึง channel_type/store_id และใช้ isQueueIntakeRoom', () => {
    const src = readFileSync('supabase/functions/line-webhook/index.ts', 'utf8');
    expect(src).toContain('id, queue_commands_enabled, channel_type, store_id, is_active');
    expect(src).toContain('isQueueIntakeRoom(fileRoom as any) && isIntakeAiFile');
  });
});

describe('production hardening: ยกเลิกการ์ดผูกกลุ่ม/ผู้ใช้', () => {
  it('เจ้าของการ์ดในกลุ่มเดิมยกเลิกได้ และผูกครบทุก filter', async () => {
    const { admin, calls } = mockAdmin([{ ...ROW }]);
    const ok = await cancelIntakeCardToken(admin as any, {
      cardKey: 'card1', groupId: 'Cgroup', lineUserId: 'Uuser', channelKey: STORE,
    });
    expect(ok).toBe(true);
    expect(calls.group_id).toBe('Cgroup');
    expect(calls.line_user_id).toBe('Uuser');
    expect(calls.channel_key).toBe(STORE);
    expect(calls['is:used_at']).toBe(null);
  });

  it('ข้ามกลุ่ม / ข้าม user / ใช้ไปแล้ว ยกเลิกไม่ได้', async () => {
    const other = await cancelIntakeCardToken(mockAdmin([{ ...ROW }]).admin as any, {
      cardKey: 'card1', groupId: 'Cother', lineUserId: 'Uuser', channelKey: STORE,
    });
    const stranger = await cancelIntakeCardToken(mockAdmin([{ ...ROW }]).admin as any, {
      cardKey: 'card1', groupId: 'Cgroup', lineUserId: 'Uother', channelKey: STORE,
    });
    const used = await cancelIntakeCardToken(mockAdmin([{ ...ROW, used_at: 'x' }]).admin as any, {
      cardKey: 'card1', groupId: 'Cgroup', lineUserId: 'Uuser', channelKey: STORE,
    });
    expect([other, stranger, used]).toEqual([false, false, false]);
  });

  it('ไม่พบ row ต้องไม่ตอบว่ายกเลิกสำเร็จ', () => {
    const src = readFileSync('supabase/functions/line-webhook/index.ts', 'utf8');
    expect(src).toContain('cancelIntakeCardToken');
    expect(src).toContain('การ์ดนี้หมดอายุ ใช้ไปแล้ว หรือไม่ใช่ของผู้กดค่ะ');
  });
});

describe('production hardening: confirm idempotency + quick reply', () => {
  const fn = readFileSync('supabase/functions/film-intake-form/index.ts', 'utf8');

  it('override request_id จาก token row ไม่เชื่อ client', () => {
    expect(fn).toContain('payload.request_id = `line-intake-token:${row.id}`');
    expect(fn).not.toContain('request_id required');
  });

  it('token ที่ used แล้วต้องคืน duplicate และไม่ทับ used_at เดิม', () => {
    expect(fn).toContain('if (row.used_at) res.duplicate = true;');
    expect(fn).toContain('.is("used_at", null)');
  });

  it('การ์ดสรุปสุดท้ายแนบ quick reply 4 ปุ่ม', async () => {
    expect(fn).toContain('withQueueQuickReply(buildIntakeSummaryFlex(');
    const { QUEUE_QUICK_REPLY_ITEMS, withQueueQuickReply } =
      await import('../../supabase/functions/_shared/adminRoomQueries');
    const msg: any = withQueueQuickReply(buildIntakeSummaryFlex({
      orderNo: 'OR-1', customerName: 'ก', items: [], queueUrl: 'https://x/q', docsUrl: 'https://x/d',
    }) as any);
    expect(msg.quickReply.items).toHaveLength(4);
    expect(QUEUE_QUICK_REPLY_ITEMS.map((i) => i.text)).toEqual(['เช็คคิว', 'รับงาน', 'สรุปงาน', 'รีเฟรช']);
    expect(JSON.stringify(msg)).toContain('ดูคิวงาน');
    expect(JSON.stringify(msg)).toContain('ดูใบสั่งจ้าง');
  });
});

describe('production hardening: MIME + duplicate event', () => {
  it('MIME ต้องห้ามที่ตั้งชื่อ .pdf ต้องไม่ผ่าน', () => {
    expect(isIntakeAiFile('application/zip', 'a.pdf')).toBe(false);
    expect(isIntakeAiFile('text/html', 'a.jpg')).toBe(false);
    expect(isIntakeAiFile('application/octet-stream', 'a.pdf')).toBe(true);
    expect(isIntakeAiFile('', 'a.jpeg')).toBe(true);
    expect(isIntakeAiFile('application/octet-stream', 'a.zip')).toBe(false);
    expect(isIntakeAiFile('application/pdf', 'a.pdf')).toBe(true);
  });

  it('ไฟล์เดิม (messageId ซ้ำ) ไม่ส่งการ์ดซ้ำ', () => {
    const src = readFileSync('supabase/functions/line-webhook/index.ts', 'utf8');
    expect(src).toContain('if (!made.duplicate) {');
    expect(src).toContain('(duplicate)');
  });

  it('เอาข้อความ “พิมพ์ตอบทีละข้อ” ออกจากการ์ดฟอร์ม', () => {
    expect(JSON.stringify(buildIntakeFormFlex('https://x/f', 'ร้าน')))
      .not.toContain('หรือพิมพ์ตอบทีละข้อ');
  });
});
