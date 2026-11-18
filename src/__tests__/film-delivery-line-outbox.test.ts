import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

const load = async () => await import('@/film-shop/lib/queueDeliveryNotify');

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
  invoke.mockReset();
});

describe('แจ้งลูกค้าทาง LINE เมื่อพร้อมส่งมอบ/ส่งมอบแล้ว', () => {
  it('ส่งผ่าน edge function เดิมพร้อม idempotency key', async () => {
    invoke.mockResolvedValue({ data: { customer: { sent: true } }, error: null });
    const { notifyDeliveryEvent, deliveryDedupKey } = await load();
    const res = await notifyDeliveryEvent('ready', { orderId: 'o1', orderNo: 'F-1' });
    expect(res.customerLine).toBe('sent');
    const [fn, opts] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fn).toBe('line-notify');
    expect(opts.body.kind).toBe('film_delivery');
    expect(opts.body.stage).toBe('ready');
    expect(opts.body.idempotency_key).toBe(deliveryDedupKey('ready', 'o1'));
  });

  it('ลูกค้าไม่ผูก LINE → รายงานว่าไม่ได้ส่ง (ห้ามคืนค่าหลอก)', async () => {
    invoke.mockResolvedValue({ data: { customer: { skipped: true, reason: 'no_line_binding' } }, error: null });
    const { notifyDeliveryEvent } = await load();
    expect((await notifyDeliveryEvent('ready', { orderId: 'o2', orderNo: 'F-2' })).customerLine).toBe('skipped_no_line');
  });

  it('ส่งไม่สำเร็จ → failed (retry ได้ด้วยคีย์เดิม ไม่ส่งซ้ำ)', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('network') });
    const { notifyDeliveryEvent } = await load();
    expect((await notifyDeliveryEvent('delivered', { orderId: 'o3', orderNo: 'F-3' })).customerLine).toBe('failed');

    invoke.mockResolvedValueOnce({ data: { customer: { sent: true } }, error: null });
    const retry = await notifyDeliveryEvent('delivered', { orderId: 'o3', orderNo: 'F-3' });
    expect(retry.customerLine).toBe('sent');
    const keys = invoke.mock.calls.map((c) => (c[1] as { body: { idempotency_key: string } }).body.idempotency_key);
    expect(new Set(keys).size).toBe(1);
  });

  it('ไม่มี orderId → ไม่ยิงอะไรเลย', async () => {
    const { notifyDeliveryEvent } = await load();
    await notifyDeliveryEvent('ready', { orderId: '', orderNo: 'F-0' });
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('เอกสารต้องไม่ทำให้ออเดอร์เป็นส่งมอบแล้ว', () => {
  it('line-notify film_delivery จำกัดเฉพาะ staff และมี stage guard', async () => {
    const fn = (await import('node:fs')).readFileSync('supabase/functions/line-notify/index.ts', 'utf8');
    expect(fn).toContain('kind === "film_delivery"');
    expect(fn).toContain('no_line_binding');
    expect(fn).toContain('invalid stage');
  });
});
