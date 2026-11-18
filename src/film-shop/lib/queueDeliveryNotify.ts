/**
 * แจ้งเตือนสถานะส่งมอบของออเดอร์ Film Shop ผ่าน pipeline เดิม (outbox ฝั่งเซิร์ฟเวอร์)
 *
 * - ไม่ยิงข้อความ LINE ตรงจากเบราว์เซอร์ และไม่แตะ token/secret ใด ๆ
 * - idempotent ด้วย dedup key ต่อ (ออเดอร์ + เหตุการณ์) — retry/กดซ้ำจะไม่ส่งซ้ำ
 * - การออกเอกสารไม่เรียกฟังก์ชันนี้: แจ้ง “พร้อมส่งมอบ” เมื่อสถานะงานพร้อมจริงเท่านั้น
 */
import { supabase } from '@/integrations/supabase/client';

export type DeliveryEvent = 'ready' | 'delivered';

const TITLE: Record<DeliveryEvent, string> = {
  ready: '📦 งานพร้อมส่งมอบ',
  delivered: '✅ ส่งมอบงานเรียบร้อย',
};

export interface DeliveryNotifyInput {
  orderId: string;
  orderNo: string;
  customerName?: string | null;
  storeKey?: string | null;
}

/** คีย์กันส่งซ้ำ — เหตุการณ์เดียวกันของออเดอร์เดียวกันได้แถวเดียวตลอด */
export const deliveryDedupKey = (event: DeliveryEvent, orderId: string) =>
  `film_delivery:${event}:${orderId}`;

export type CustomerLineResult = 'sent' | 'skipped_no_line' | 'failed';

export async function notifyDeliveryEvent(
  event: DeliveryEvent,
  info: DeliveryNotifyInput,
): Promise<{ app: boolean; ops: boolean; customerLine: CustomerLineResult }> {
  if (!info.orderId) return { app: false, ops: false, customerLine: 'failed' };
  const title = `${TITLE[event]}: ${info.orderNo}`;
  const body = [
    `ออเดอร์: ${info.orderNo}`,
    `ลูกค้า: ${info.customerName || '-'}`,
    event === 'ready' ? 'สถานะ: รอส่งมอบ (พร้อมให้ลูกค้ารับงาน)' : 'สถานะ: ส่งมอบแล้ว/เสร็จสิ้น',
  ].join('\n');
  const dedup = deliveryDedupKey(event, info.orderId);

  const [app, ops, cust] = await Promise.all([
    supabase.rpc('enqueue_app_notification', {
      p_user_id: null,
      p_for_staff: true,
      p_type: 'order_status_change',
      p_title: title,
      p_body: body,
      p_ref_id: info.orderId,
      p_link: '/film-shop/app?p=group-queue',
      p_dedup_key: dedup,
    } as never),
    supabase.rpc('film_raise_ops_notification', {
      p_kind: event === 'ready' ? 'order_ready' : 'order_delivered',
      p_severity: 'info',
      p_title: title,
      p_body: body,
      p_store_id: info.storeKey ?? null,
      p_group_no: 1,
      p_dedup_key: dedup,
      p_cooldown_minutes: 0,
    } as never),
    // แจ้งลูกค้าที่ผูก LINE ผ่าน pipeline server-side เดิม (idempotent ด้วย idempotency_key)
    supabase.functions.invoke('line-notify', {
      body: {
        kind: 'film_delivery',
        stage: event,
        order_id: info.orderId,
        idempotency_key: dedup.replace(/[^A-Za-z0-9:_-]/g, ''),
      },
    }),
  ]);

  let customerLine: CustomerLineResult = 'failed';
  if (!cust.error) {
    const c = (cust.data as { customer?: { skipped?: boolean } } | null)?.customer;
    customerLine = c?.skipped ? 'skipped_no_line' : 'sent';
  }
  return { app: !app.error, ops: !ops.error, customerLine };
}
