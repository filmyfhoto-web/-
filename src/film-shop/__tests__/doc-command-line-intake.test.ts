import { describe, expect, it, vi } from 'vitest';
import { ingestDocCommand } from '../../../supabase/functions/_shared/docCommandIntake.ts';

/** Minimal Supabase-like stub recording the rows the intake writes. */
function makeAdmin(existing: any = null) {
  const inserted: Record<string, any[]> = {};
  const admin = {
    inserted,
    from(table: string) {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: existing }),
        single: async () => ({ data: { id: 'draft-1' }, error: null }),
        insert(row: any) {
          (inserted[table] ||= []).push(row);
          return api;
        },
      };
      return api;
    },
  };
  return admin;
}

const NOW = new Date('2026-08-07T03:00:00Z');

describe('LINE document command intake', () => {
  it('creates a DRAFT only — never a final document', async () => {
    const admin = makeAdmin();
    const res = await ingestDocCommand(admin as any, {
      messageId: 'msg-1',
      lineUserId: 'U123',
      displayName: 'คุณสมชาย',
      text: 'ขอใบเสนอราคา ร้าน NATTAWORKS ป้ายไวนิล 2 ผืน ผืนละ 500',
      now: NOW,
    });
    expect(res.duplicate).toBe(false);
    const draft = admin.inserted['document_command_drafts'][0];
    expect(draft.status).toBe('draft');
    expect(draft.final_doc_no).toBeUndefined();
    expect(draft.doc_type).toBe('quotation');
    expect(draft.total).toBe(1000);
    expect(draft.temp_ref).toBe('line:msg-1');
    expect(admin.inserted['document_command_audit'][0].event).toBe('line_command_received');
  });

  it('is idempotent on the LINE message id', async () => {
    const admin = makeAdmin({ id: 'draft-1', doc_type: 'quotation', missing_fields: [] });
    const res = await ingestDocCommand(admin as any, {
      messageId: 'msg-1',
      text: 'ขอใบเสนอราคา ร้าน NATTAWORKS ป้ายไวนิล 2 ผืน ผืนละ 500',
      now: NOW,
    });
    expect(res.duplicate).toBe(true);
    expect(admin.inserted['document_command_drafts']).toBeUndefined();
  });

  it('records missing fields instead of guessing them', async () => {
    const admin = makeAdmin();
    const res = await ingestDocCommand(admin as any, {
      messageId: 'msg-2',
      text: 'ขอใบเสนอราคา สติกเกอร์ 10 แผ่น',
      now: NOW,
    });
    expect(res.missing).toContain('ร้าน');
    expect(res.missing).toContain('ราคาต่อหน่วย');
    expect(admin.inserted['document_command_drafts'][0].shop_key).toBeNull();
  });

  it('transcribes a LINE voice note through the server-side gateway', async () => {
    const { transcribeLineAudio } = await import('../../../supabase/functions/_shared/docCommandIntake.ts');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: 'ขอใบเสร็จ 500 บาท' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const text = await transcribeLineAudio(new Blob([new Uint8Array(4096)], { type: 'audio/m4a' }), 'test-key');
    expect(text).toBe('ขอใบเสร็จ 500 บาท');
    const [url, init] = fetchMock.mock.calls[0] as any[];
    expect(String(url)).toContain('ai.gateway.lovable.dev/v1/audio/transcriptions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    vi.unstubAllGlobals();
  });
});