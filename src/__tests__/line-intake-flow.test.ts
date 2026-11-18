import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applyIntakeMessage, parseIntakeCommand, parseIntakePostback, parseItemLine,
  parseCustomerLine, parseDueText, validateAttachment, safeAttachmentName,
  isRateLimited, buildReviewFlex, buildConfirmedFlex, MAX_ITEMS,
} from '../../supabase/functions/_shared/lineIntakeFlow';
import {
  parseAdminQuery, isMutatingCommand, buildSystemStatusText,
} from '../../supabase/functions/_shared/adminRoomQueries';

const run = (texts: string[]) => {
  let s: any = null;
  let last: any = null;
  for (const t of texts) { last = applyIntakeMessage(s, t); s = last.session; }
  return last;
};

describe('LINE intake conversation', () => {
  it('starts on สั่งงาน and [TEST] สั่งงาน flags the draft', () => {
    expect(parseIntakeCommand('สั่งงาน')).toEqual({ kind: 'start', isTest: false });
    expect(parseIntakeCommand('[TEST] สั่งงาน')).toEqual({ kind: 'start', isTest: true });
    expect(run(['[TEST] สั่งงาน']).session.isTest).toBe(true);
  });

  it('collects customer, multiple items and due date then asks for review', () => {
    const r = run([
      'สั่งงาน',
      'คุณฟิล์ม 0812345678',
      'ไวนิล 2x1 เมตร 3 ผืน',
      'อัดรูป 4x6 20 ใบ',
      'ถ่ายเอกสาร 100 แผ่น',
      'สมุด 10 เล่ม',
      'จบรายการ',
      'ไม่ระบุ',
    ]);
    expect(r.session.customerName).toBe('ฟิล์ม');
    expect(r.session.customerPhone).toBe('0812345678');
    expect(r.session.items).toHaveLength(4);
    expect(new Set(r.session.items.map((i: any) => i.category)).size).toBeGreaterThan(1);
    expect(r.session.state).toBe('review');
    expect(r.showReview).toBe(true);
  });

  it('only confirms from the review state', () => {
    const early = run(['สั่งงาน', 'คุณเอ 0800000000', 'ยืนยัน']);
    expect(early.confirm).toBe(false);
    const ok = run(['สั่งงาน', 'คุณเอ 0800000000', 'ไวนิล 1 ผืน', 'จบรายการ', 'ไม่ระบุ', 'ยืนยัน']);
    expect(ok.confirm).toBe(true);
  });

  it('cancels and edits the draft', () => {
    expect(run(['สั่งงาน', 'ยกเลิก']).session.status).toBe('cancelled');
    const edited = run(['สั่งงาน', 'คุณเอ 0800000000', 'ไวนิล 1 ผืน', 'จบรายการ', 'ไม่ระบุ', 'แก้ไข']);
    expect(edited.session.state).toBe('items');
    expect(edited.session.items).toHaveLength(0);
  });

  it('caps the item count per order', () => {
    const texts = ['สั่งงาน', 'คุณเอ 0800000000', ...Array.from({ length: MAX_ITEMS + 2 }, () => 'ไวนิล 1 ผืน')];
    expect(run(texts).session.items.length).toBeLessThanOrEqual(MAX_ITEMS);
  });

  it('parses customer, item and due lines', () => {
    expect(parseCustomerLine('คุณบี 0899999999')).toEqual({ name: 'บี', phone: '0899999999' });
    expect(parseItemLine('ไวนิล 2x1 เมตร 3 ผืน')?.category).toBe('sign');
    const now = new Date('2026-08-09T03:00:00Z');
    expect(parseDueText('พรุ่งนี้ 15:00', now)).toBeTruthy();
    expect(parseDueText('ไม่รู้เรื่อง', now)).toBeNull();
  });

  it('validates attachments and builds safe names', () => {
    expect(validateAttachment({ mime: 'image/jpeg', bytes: 1000 }).ok).toBe(true);
    expect(validateAttachment({ mime: 'application/x-msdownload', bytes: 10 }).ok).toBe(false);
    expect(validateAttachment({ mime: 'image/png', bytes: 50 * 1024 * 1024 }).ok).toBe(false);
    expect(safeAttachmentName('../../etc/passwd.png', 'image/png', 1)).not.toContain('/');
  });

  it('rate limits noisy senders', () => {
    expect(isRateLimited(5)).toBe(false);
    expect(isRateLimited(999)).toBe(true);
  });

  it('parses intake postbacks only in the expected shape', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(parseIntakePostback(`film_intake:confirm:${id}`)).toEqual({ action: 'confirm', sessionId: id });
    expect(parseIntakePostback('film_intake:drop:1')).toBeNull();
    expect(parseIntakePostback(null)).toBeNull();
  });

  it('builds review and confirmation flex without leaking internal admin routes', () => {
    const s = run(['สั่งงาน', 'คุณเอ 0800000000', 'ไวนิล 1 ผืน', 'จบรายการ', 'ไม่ระบุ']).session;
    const review = JSON.stringify(buildReviewFlex(s, '11111111-2222-3333-4444-555555555555'));
    expect(review).toContain('film_intake:confirm');
    expect(review).not.toContain('/admin/');
    const confirmed = JSON.stringify(buildConfirmedFlex({
      orderNo: 'OR-2608-001', jobs: [{ jobNo: 'OR-2608-001-01', title: 'ไวนิล', status: 'queued' }],
      dueAt: null, trackUrl: 'https://filmyynatta.com/track/OR-2608-001',
    }));
    expect(confirmed).not.toContain('/admin/');
  });
});

describe('admin room commands', () => {
  it('parses read-only commands', () => {
    expect(parseAdminQuery('สถานะระบบ')).toEqual({ kind: 'system_status' });
    expect(parseAdminQuery('งานด่วน')).toEqual({ kind: 'urgent' });
    expect(parseAdminQuery('คิววันนี้')).toEqual({ kind: 'today' });
    expect(parseAdminQuery('ค้นหา JOB-2608-001-01')).toEqual({ kind: 'find', code: 'JOB-2608-001-01' });
    expect(parseAdminQuery('สวัสดี')).toBeNull();
  });

  it('refuses status changes sent as plain chat text', () => {
    expect(isMutatingCommand('ปิดงาน JOB-1')).toBe(true);
    expect(isMutatingCommand('คิววันนี้')).toBe(false);
  });

  it('reports setup state without exposing secret values', () => {
    const text = buildSystemStatusText({
      channelConfigured: true, adminRoomActive: false, pendingNotifications: 2,
      failedNotifications: 0, openJobs: 4, controlRoomUrl: 'https://filmyynatta.com/admin/control-room',
    });
    expect(text).toContain('ตั้งค่าแล้ว');
    expect(text).toContain('ยังไม่เชื่อม');
    expect(text).not.toMatch(/[0-9a-f]{32}/);
  });
});

describe('webhook wiring', () => {
  const src = readFileSync('supabase/functions/line-webhook/index.ts', 'utf8');

  it('keeps signature verification and event de-duplication', () => {
    expect(src).toContain('matchChannelBySignature');
    expect(src).toContain('webhookEventId');
  });

  it('routes intake through the shared modules and never hardcodes secrets', () => {
    expect(src).toContain('applyIntakeMessage');
    expect(src).toContain('confirmIntakeSession');
    expect(src).toContain('notifyAdminRooms');
    expect(src).not.toMatch(/f4e34ac19f22a854d1e791ad08bf787a/);
  });
});
