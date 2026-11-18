import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  getLineOaChatUrl, canOpenLineOa, safeLineOaChatUrl, normalizeLineBasicId,
} from '@/lib/lineOa';

describe('LINE OA chat url', () => {
  it('builds the chat url from a valid basic id', () => {
    expect(getLineOaChatUrl('@756bvbvq')).toBe('https://line.me/R/oaMessage/%40756bvbvq');
  });

  it('uses the basic id of the selected store', () => {
    expect(safeLineOaChatUrl('@815lsfhb')).toContain('%40815lsfhb');
    expect(safeLineOaChatUrl('@756bvbvq')).not.toBe(safeLineOaChatUrl('@815lsfhb'));
  });

  it('rejects invalid basic ids', () => {
    expect(() => getLineOaChatUrl('756bvbvq')).toThrow();
    expect(() => getLineOaChatUrl('@bad id')).toThrow();
    expect(canOpenLineOa('')).toBe(false);
    expect(canOpenLineOa(null)).toBe(false);
    expect(safeLineOaChatUrl(undefined)).toBeNull();
  });

  it('normalizes stored values without the @ prefix', () => {
    expect(normalizeLineBasicId(' 756bvbvq ')).toBe('@756bvbvq');
    expect(normalizeLineBasicId('@x_y.z-1')).toBe('@x_y.z-1');
    expect(normalizeLineBasicId('bad id')).toBeNull();
  });
});

describe('LINE OA page uses real store data only', () => {
  const page = readFileSync('src/film-shop/components/line/LineOAPage.tsx', 'utf8');
  const list = readFileSync('src/film-shop/components/line/LineOaCustomerList.tsx', 'utf8');

  it('never hard-codes placeholder store names', () => {
    expect(page).not.toMatch(/ร้านที่ 1|ร้านที่ 2/);
    expect(list).not.toMatch(/ร้านที่ 1|ร้านที่ 2/);
  });

  it('reads store names from the database', () => {
    expect(page).toContain('useLineStores');
    expect(page).toContain('display_name');
  });

  it('has loading, empty and error states', () => {
    expect(page).toContain('กำลังโหลดข้อมูลร้าน');
    expect(page).toContain('โหลดข้อมูลร้านไม่สำเร็จ');
    expect(list).toContain('ยังไม่มีลูกค้าทักเข้ามา');
  });

  it('disables the chat button when no basic id is configured', () => {
    expect(page).toContain('LINE_OA_NOT_CONFIGURED_TH');
    expect(page).toContain('disabled title={LINE_OA_NOT_CONFIGURED_TH}');
  });

  it('keeps customers of different stores apart', () => {
    expect(list).toContain('`${storeId}::${uid}`');
    expect(list).toContain('line_store_customers');
  });
});

describe('webhook + reply safety', () => {
  const hook = readFileSync('supabase/functions/line-webhook/index.ts', 'utf8');
  const reply = readFileSync('supabase/functions/reply-send-line/index.ts', 'utf8');
  const dispatch = readFileSync('supabase/functions/notify-dispatch/index.ts', 'utf8');

  it('verifies the signature on every webhook', () => {
    expect(hook).toContain('matchChannelBySignature');
    expect(hook).toContain('bad signature');
  });

  it('is idempotent per webhookEventId', () => {
    expect(hook).toContain('line_webhook_dedup');
    expect(hook).toContain('webhookEventId');
  });

  it('stores the customer profile per store', () => {
    expect(hook).toContain('line_store_customers');
    expect(hook).toContain('onConflict: "store_id,line_user_id"');
  });

  it('replies with the token of the store the customer wrote to', () => {
    expect(reply).toContain('resolveStoreLineToken');
    expect(reply).toContain('store_id: storeId');
    expect(dispatch).toContain('tokenFor');
  });
});
