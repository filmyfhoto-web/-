import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { touchConversation } from '../../supabase/functions/_shared/inboxStore';
import {
  sanitizeFileName, validateOutboundAttachments, outboundPrefix,
  IMAGE_URL_TTL_SEC, FILE_URL_TTL_SEC,
} from '../../supabase/functions/_shared/inboxAttachments';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const CONV = '11111111-1111-1111-1111-111111111111';
const p = (name: string) => `${outboundPrefix(CONV)}${name}`;

describe('outbound attachment validation', () => {
  it('accepts a JPEG/PNG image inside the conversation prefix', () => {
    const res = validateOutboundAttachments(CONV, [
      { path: p('a.jpg'), name: 'a.jpg', mime: 'image/jpeg', size: 1024 },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.items[0].kind).toBe('image');
  });

  it('classifies non-image types as link-only files, never a fake LINE file message', () => {
    const res = validateOutboundAttachments(CONV, [
      { path: p('quote.pdf'), name: 'quote.pdf', mime: 'application/pdf', size: 2048 },
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.items[0].kind).toBe('file');
    const shared = read('supabase/functions/_shared/inboxAttachments.ts');
    expect(shared).not.toMatch(/type:\s*"file"/);
  });

  it('rejects paths from another conversation or with traversal', () => {
    expect(validateOutboundAttachments(CONV, [{ path: 'outbound/other/x.jpg', mime: 'image/png', size: 5 }]).ok).toBe(false);
    expect(validateOutboundAttachments(CONV, [{ path: p('../x.jpg'), mime: 'image/png', size: 5 }]).ok).toBe(false);
    expect(validateOutboundAttachments(CONV, [{ path: 'inbound/x.jpg', mime: 'image/png', size: 5 }]).ok).toBe(false);
  });

  it('enforces LINE image limits and a file ceiling', () => {
    const big = validateOutboundAttachments(CONV, [{ path: p('b.png'), mime: 'image/png', size: 11 * 1024 * 1024 }]);
    expect(big).toMatchObject({ ok: false, reason: 'attachment_image_too_large' });
    const bigFile = validateOutboundAttachments(CONV, [{ path: p('b.zip'), mime: 'application/zip', size: 26 * 1024 * 1024 }]);
    expect(bigFile).toMatchObject({ ok: false, reason: 'attachment_file_too_large' });
    expect(validateOutboundAttachments(CONV, [{ path: p('c.png'), mime: 'image/png', size: 0 }]).ok).toBe(false);
  });

  it('caps the number of attachments and rejects malformed payloads', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ path: p(`${i}.png`), mime: 'image/png', size: 10 }));
    expect(validateOutboundAttachments(CONV, many)).toMatchObject({ ok: false, reason: 'attachment_too_many' });
    expect(validateOutboundAttachments(CONV, 'nope')).toMatchObject({ ok: false, reason: 'attachment_invalid' });
    expect(validateOutboundAttachments(CONV, null)).toMatchObject({ ok: true });
  });

  it('sanitizes display filenames', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('')).toBe('attachment');
    expect(sanitizeFileName('a<b>c.png')).toBe('abc.png');
  });

  it('keeps signed URLs short-lived for images and bounded for files', () => {
    expect(IMAGE_URL_TTL_SEC).toBeLessThanOrEqual(3600);
    expect(FILE_URL_TTL_SEC).toBeLessThanOrEqual(60 * 60 * 24 * 7);
  });
});

describe('unread semantics', () => {
  function conversationStore(initial: any) {
    const row = { ...initial };
    return {
      row,
      from() {
        const ctx: any = {
          select() { return ctx; },
          eq() { return ctx; },
          update(patch: any) { Object.assign(row, patch); return ctx; },
          maybeSingle() { return Promise.resolve({ data: row, error: null }); },
          then(res: any) { return Promise.resolve({ data: null, error: null }).then(res); },
        };
        return ctx;
      },
    };
  }

  it('does not clear unread when an outbound message is sent', async () => {
    const admin = conversationStore({ id: 'c1', unread_count: 3 });
    await touchConversation(admin as any, 'c1', { preview: 'ตอบกลับ' });
    expect(admin.row.unread_count).toBe(3);
    expect(admin.row.last_message_preview).toBe('ตอบกลับ');
  });

  it('increments unread on inbound', async () => {
    const admin = conversationStore({ id: 'c1', unread_count: 1 });
    await touchConversation(admin as any, 'c1', { preview: 'ลูกค้าทัก', incrementUnread: true });
    expect(admin.row.unread_count).toBe(2);
  });

  it('clears unread only through the explicit mark-read action', () => {
    const hook = read('src/film-shop/hooks/useFilmInbox.ts');
    expect(hook).toContain('export async function markConversationRead');
    expect(hook).toContain('last_read_at');
    // the only place the client zeroes unread_count
    expect((hook.match(/unread_count: 0/g) ?? []).length).toBe(1);
  });
});

describe('retry uses the same row and key', () => {
  const src = read('supabase/functions/film-inbox-send-message/index.ts');

  it('accepts retry_message_id and reuses the stored idempotency key', () => {
    expect(src).toContain('retry_message_id');
    expect(src).toContain('prev.idempotency_key');
  });

  it('refuses to retry anything that is not a failed outbound message', () => {
    expect(src).toContain('retry_not_allowed');
    expect(src).toContain('prev.delivery_status !== "failed"');
    expect(src).toContain('prev.direction !== "outbound"');
  });

  it('never inserts a second row on retry — it updates the original', () => {
    const retryBlock = src.slice(src.indexOf('if (retryMessageId)'), src.indexOf('} else {'));
    expect(retryBlock).not.toContain('recordMessage(');
    expect(retryBlock).toContain('.update({ delivery_status: "pending"');
  });

  it('treats a duplicate idempotency key as a no-op instead of resending', () => {
    expect(src).toContain('duplicate: true');
  });

  it('sends the retry through the same LINE retry key', () => {
    expect(src).toContain('pushLineMessages(channel.token, to, messages, clientKey)');
  });

  it('front-end retry posts retry_message_id, not a fresh key', () => {
    const thread = read('src/film-shop/components/inbox/MessageThread.tsx');
    expect(thread).toContain('retry_message_id: messageId');
    expect(thread).toContain('data-testid="inbox-retry"');
  });
});

describe('per-store readiness', () => {
  const fn = read('supabase/functions/film-inbox-readiness/index.ts');
  const send = read('supabase/functions/film-inbox-send-message/index.ts');

  it('never falls back to another store token when replying', () => {
    expect(send).toContain('channels.find((c) => c.id === conv.store_id)');
    expect(send).not.toContain('channels.find((c) => c.token)');
  });

  it('is staff-gated and returns status only, no credentials', () => {
    expect(fn).toMatch(/rpc\("is_staff"/);
    expect(fn).toContain('has_secret');
    expect(fn).not.toMatch(/ch\.secret\s*[,}]/);
    expect(fn).not.toMatch(/token: ch\.token/);
  });

  it('reports webhook verification and missing config by NAME only', () => {
    expect(fn).toContain('webhook_unverified');
    expect(fn).toContain('LINE channel access token');
  });

  it('does not rotate or write any secret', () => {
    expect(fn).not.toMatch(/line_credentials.*update|update\(\{\s*channel_/s);
  });
});

describe('status, assignee and customer 360', () => {
  const hook = read('src/film-shop/hooks/useFilmInbox.ts');
  const thread = read('src/film-shop/components/inbox/MessageThread.tsx');
  const list = read('src/film-shop/components/inbox/ConversationList.tsx');
  const c360 = read('src/film-shop/components/inbox/Customer360.tsx');

  it('offers the five conversation statuses distinct from job status', () => {
    for (const id of ['open', 'quoting', 'waiting_customer', 'in_progress', 'closed']) {
      expect(hook).toContain(`id: '${id}'`);
    }
    expect(thread).toContain('ติดต่อผ่าน:');
  });

  it('reuses the existing employee table for assignees', () => {
    expect(hook).toContain("from('film_employees')");
    expect(hook).toContain('setConversationAssignee');
    expect(list).toContain('inbox-assignee-chip');
  });

  it('filters by the real in_progress status', () => {
    expect(hook).toContain("filter === 'in_progress' && c.status !== 'in_progress'");
  });

  it('lets staff link a customer manually and does not call 5 orders a lifetime total', () => {
    expect(c360).toContain('inbox-link-customer');
    expect(c360).toContain('linkConversationCustomer');
    expect(c360).toContain('ยอดซื้อรวม');
    expect(c360).toContain("count: 'exact'");
  });

  it('links the created order back onto the conversation', () => {
    expect(c360).toContain('last_order_id: order.id');
    expect(c360).toContain('inbox-last-order');
  });
});

describe('no secrets in the frontend bundle', () => {
  it('mobile nav surfaces the unread badge like the sidebar', () => {
    const nav = read('src/film-shop/components/layout/MobileNav.tsx');
    expect(nav).toContain('useInboxUnread');
    expect(nav).toContain('film-mobile-inbox-badge');
    expect(nav).toContain('film-mobile-inbox-item-badge');
  });

  it('inbox frontend never references LINE credentials or the API host', () => {
    const bundle = [
      'src/film-shop/components/inbox/FilmInboxPage.tsx',
      'src/film-shop/components/inbox/MessageThread.tsx',
      'src/film-shop/components/inbox/Customer360.tsx',
      'src/film-shop/components/inbox/ConversationList.tsx',
      'src/film-shop/hooks/useFilmInbox.ts',
    ].map(read).join('\n');
    expect(bundle).not.toMatch(/api\.line\.me/);
    expect(bundle).not.toMatch(/CHANNEL_ACCESS_TOKEN|channel_secret|Bearer /i);
  });
});