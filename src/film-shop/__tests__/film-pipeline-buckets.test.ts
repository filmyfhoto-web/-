import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ORDER_STATUSES,
  PIPELINE_BUCKETS,
  PIPELINE_BUCKET_LABELS,
  pipelineBucketOf,
} from '@/film-shop/types/order';

const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');

describe('film shop pipeline buckets', () => {
  it('exposes the 6 dashboard buckets in Thai', () => {
    expect(PIPELINE_BUCKETS).toHaveLength(6);
    expect(PIPELINE_BUCKETS.map((b) => PIPELINE_BUCKET_LABELS[b])).toEqual([
      'งานใหม่', 'รอประเมิน', 'รอยืนยัน', 'กำลังผลิต', 'พร้อมรับ', 'ส่งแล้ว',
    ]);
  });

  it('maps every order status to exactly one bucket', () => {
    for (const s of ORDER_STATUSES) expect(PIPELINE_BUCKETS).toContain(pipelineBucketOf(s));
    expect(pipelineBucketOf('waiting_info')).toBe('new');
    expect(pipelineBucketOf('waiting_design')).toBe('evaluating');
    expect(pipelineBucketOf('waiting_customer')).toBe('confirming');
    expect(pipelineBucketOf('finishing')).toBe('producing');
    expect(pipelineBucketOf('ready')).toBe('ready');
    expect(pipelineBucketOf('delivered')).toBe('delivered');
  });


  it('order list keeps search plus bucket filters', () => {
    const mgr = read('src/film-shop/components/orders/OrderManager.tsx');
    expect(mgr).toContain('ค้นหาเลขที่ / ลูกค้า / เบอร์');
    expect(mgr).toContain('initialStatusBucket');
    expect(mgr).toContain('pipelineBucketOf(o.status) === filter');
  });
});
