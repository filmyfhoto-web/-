import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  messagePreview, recordMessage, touchConversation, upsertConversation,
} from '../../supabase/functions/_shared/inboxStore';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** Minimal in-memory stand-in for the supabase admin client used by inboxStore. */
function makeAdmin() {
  const messages: any[] = [];
  const conversations: any[] = [];
  const api = {
    messages,
    conversations,
    from(table: string) {
      const rows = table === 'film_messages' ? messages : conversations;
      const filters: Array<[string, unknown]> = [];
      const ctx: any = {
        insert(row: any) {
          const dupe = rows.find((r) =>
            (row.idempotency_key && r.idempotency_key === row.idempotency_key) ||
            (row.external_message_id && r.external_message_id === row.external_message_id && r.channel === row.channel));
          if (dupe) { ctx._error = { code: '23505', message: 'duplicate key' }; return ctx; }
          ctx._row = { id: `m${rows.length + 1}`, ...row };
          rows.push(ctx._row);
          return ctx;
        },
        upsert(patch: any) {
          const found = conversations.find((c) =>
            c.channel === patch.channel && c.store_id === patch.store_id && c.external_thread_id === patch.external_thread_id);
          if (found) { Object.assign(found, patch); ctx._row = found; }
          else { ctx._row = { id: `c${conversations.length + 1}`, unread_count: 0, ...patch }; conversations.push(ctx._row); }
          return ctx;
        },
        update(patch: any) { ctx._update = patch; return ctx; },
        select() { return ctx; },
        eq(col: string, val: unknown) { filters.push([col, val]); return ctx; },
        maybeSingle() {
          if (ctx._error) return Promise.resolve({ data: null, error: ctx._error });
          if (ctx._update) {
            rows.filter((r) => filters.every(([c, v]) => r[c] === v)).forEach((r) => Object.assign(r, ctx._update));
            return Promise.resolve({ data: null, error: null });
          }
          if (ctx._row) return Promise.resolve({ data: { id: ctx._row.id, ...ctx._row }, error: null });
          const hit = rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
          return Promise.resolve({ data: hit, error: null });
        },
        then(res: any) {
          if (ctx._update) rows.filter((r) => filters.every(([c, v]) => r[c] === v)).forEach((r) => Object.assign(r, ctx._update));
          return Promise.resolve({ data: null, error: null }).then(res);
        },
      };
      return ctx;
    },
  };
  return api;
}

describe('inbox normalization', () => {
  it('creates one conversation per external thread and reuses it', async () => {
    const admin = makeAdmin();
    const key = { channel: 'line', storeId: 'store-1', externalThreadId: 'U123', externalUserId: 'U123' };
    const a = await upsertConversation(admin as any, key);
    const b = await upsertConversation(admin as any, { ...key, displayName: 'ลูกค้า A' });
    expect(a).toBe(b);
    expect(admin.conversations).toHaveLength(1);
  });

  it('records an inbound message and increments unread', async () => {
    const admin = makeAdmin();
    const convId = await upsertConversation(admin as any, { channel: 'line', storeId: 's', externalThreadId: 'U1' });
    const rec = await recordMessage(admin as any, {
      conversationId: convId!, direction: 'inbound', channel: 'line', externalMessageId: 'msg-1', text: 'สวัสดีค่ะ',
    });
    expect(rec.duplicate).toBe(false);
    await touchConversation(admin as any, convId!, { preview: messagePreview('สวัสดีค่ะ'), incrementUnread: true });
    expect(admin.conversations[0].unread_count).toBe(1);
    expect(admin.conversations[0].last_message_preview).toBe('สวัสดีค่ะ');
  });

  it('treats a replayed webhook message id as a duplicate, not a new message', async () => {
    const admin = makeAdmin();
    const input = { conversationId: 'c1', direction: 'inbound' as const, channel: 'line', externalMessageId: 'msg-9', text: 'ซ้ำ' };
    await recordMessage(admin as any, input);
    const again = await recordMessage(admin as any, input);
    expect(again.duplicate).toBe(true);
    expect(admin.messages).toHaveLength(1);
  });

  it('treats a repeated outbound idempotency key as a duplicate', async () => {
    const admin = makeAdmin();
    const input = {
      conversationId: 'c1', direction: 'outbound' as const, channel: 'line',
      text: 'ตอบกลับ', idempotencyKey: 'c1:abc', deliveryStatus: 'pending' as const,
    };
    await recordMessage(admin as any, input);
    const again = await recordMessage(admin as any, input);
    expect(again.duplicate).toBe(true);
    expect(admin.messages).toHaveLength(1);
  });

  it('previews attachments when there is no text', () => {
    expect(messagePreview('', 2)).toContain('ไฟล์แนบ');
    expect(messagePreview('  a\n b ')).toBe('a b');
  });
});

describe('outbound edge function contract', () => {
  const src = read('supabase/functions/film-inbox-send-message/index.ts');

  it('requires an authenticated staff user', () => {
    expect(src).toContain('auth.getUser');
    expect(src).toMatch(/rpc\("is_staff"/);
    expect(src).toContain('fail("forbidden")');
  });

  it('records pending first, then marks sent or failed', () => {
    expect(src).toContain('deliveryStatus: "pending"');
    expect(src).toMatch(/delivery_status: res\.ok \? "sent" : "failed"/);
    expect(src).toContain('line_api_error');
  });

  it('reports setup required instead of crashing when LINE is unconfigured', () => {
    expect(src).toContain('setup_required: true');
  });

  it('reuses the idempotency key as the LINE retry key', () => {
    expect(src).toContain('pushLineMessages(channel.token, to, messages, clientKey)');
  });
});

describe('webhook wiring', () => {
  const src = read('supabase/functions/line-webhook/index.ts');
  it('normalizes inbound messages only after signature verification', () => {
    const sigIdx = src.indexOf('reason: "signature_mismatch"');
    const inboxIdx = src.indexOf('await upsertConversation(admin');
    expect(sigIdx).toBeGreaterThan(-1);
    expect(inboxIdx).toBeGreaterThan(sigIdx);
  });
  it('keeps the existing LINE intake flow', () => {
    expect(src).toContain('lineIntakeFlow');
  });
});

describe('inbox frontend', () => {
  const page = read('src/film-shop/components/inbox/FilmInboxPage.tsx');
  const hook = read('src/film-shop/hooks/useFilmInbox.ts');
  const c360 = read('src/film-shop/components/inbox/Customer360.tsx');
  const thread = read('src/film-shop/components/inbox/MessageThread.tsx');

  it('subscribes to realtime and removes channels on cleanup', () => {
    expect(hook).toContain("table: 'film_conversations'");
    expect(hook).toContain("table: 'film_messages'");
    expect((hook.match(/removeChannel/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('uses short-lived signed URLs for private attachments', () => {
    expect(hook).toContain('createSignedUrl');
  });

  it('sends through the server function only — never a LINE token in the client', () => {
    expect(thread).toContain("invoke('film-inbox-send-message'");
    const bundle = page + hook + c360 + thread;
    expect(bundle).not.toMatch(/api\.line\.me/);
    expect(bundle).not.toMatch(/CHANNEL_ACCESS_TOKEN|channel_secret/i);
  });

  it('shows a LINE connection status badge without exposing credentials', () => {
    expect(thread).toContain('inbox-line-status');
    expect(page).not.toContain('useInboxReadiness');
  });

  it('does not guess the customer link', () => {
    expect(c360).toContain('ยังไม่ผูกลูกค้า');
    expect(c360).toContain("eq('line_user_id', conversation.external_user_id)");
  });

  it('creates work from chat by reusing the existing intake flow', () => {
    expect(c360).toContain('WorkIntakePage');
    expect(c360).toContain('prefill');
  });

  it('canned replies fill the composer instead of auto-sending', () => {
    expect(thread).toContain('CANNED_REPLIES');
    expect(thread).toContain('setText((prev)');
  });

  it('is reachable from the Film Shop menu', () => {
    expect(read('src/film-shop/FilmShopApp.tsx')).toContain("case 'inbox':");
    expect(read('src/film-shop/components/layout/Sidebar.tsx')).toContain("id: 'inbox'");
    expect(read('src/film-shop/components/layout/MobileNav.tsx')).toContain("id: 'inbox'");
  });
});
