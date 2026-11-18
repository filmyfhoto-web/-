import { supabase } from '@/integrations/supabase/client';

/** บอทผู้ส่ง: ห้องรันคิวใช้ NATTA.Q AI เสมอ ที่เหลือใช้บอทของร้านนั้น */
export function botLabel(senderStoreId: string | null | undefined, storeName?: string): string {
  const id = String(senderStoreId ?? '').trim();
  if (id === 'runqueue') return 'NATTA.Q AI';
  return storeName || (id ? `บอทร้าน ${id}` : 'บอทของร้าน');
}

export function isNattaqBot(senderStoreId: string | null | undefined): boolean {
  return String(senderStoreId ?? '') === 'runqueue';
}

const REASONS: Record<string, string> = {
  bot_not_in_group: 'บอทไม่ได้อยู่ในกลุ่มนี้แล้ว — เชิญบอทเข้ากลุ่มแล้วพิมพ์ “เชื่อมห้องแอดมิน”',
  http_400: 'LINE ปฏิเสธข้อความ (400) — ตรวจว่าบอทยังอยู่ในห้องและโทเคนของร้านถูกต้อง',
  http_401: 'โทเคนของบอทใช้ไม่ได้ (401) — อัปเดต Channel Access Token',
  http_403: 'บอทไม่มีสิทธิ์ส่งไปห้องนี้ (403)',
  http_404: 'ไม่พบห้องปลายทาง (404) — บอทอาจถูกลบออกจากกลุ่ม',
  http_429: 'ส่งถี่เกินกำหนดของ LINE (429) — รอสักครู่แล้วลองใหม่',
  http_500: 'ระบบ LINE ขัดข้องชั่วคราว (500)',
  network_error: 'ต่อกับ LINE ไม่ได้ (เครือข่ายขัดข้อง)',
  no_active_admin_group: 'ยังไม่ได้เชื่อมห้องปลายทางของประเภทนี้',
  line_not_configured: 'ยังไม่ได้ตั้งค่าโทเคนของบอทผู้ส่ง',
};

/** เหตุผลของสถานะการส่งแบบอ่านเข้าใจง่าย */
export function deliveryReason(status: string, errorCode?: string | null): string {
  if (status === 'sent') return 'ส่งเข้ากลุ่ม LINE สำเร็จ';
  if (status === 'pending') return 'กำลังส่ง…';
  const code = String(errorCode ?? '').trim();
  if (!code) return 'ส่งไม่สำเร็จ (ไม่ทราบสาเหตุ)';
  return REASONS[code] ?? `ส่งไม่สำเร็จ (${code})`;
}

export interface RetryResult { ok: boolean; error?: string | null; errorCode?: string | null }

/** ลองส่งแจ้งเตือนเดิมซ้ำ (ข้าม dedup) */
export async function retryLineDelivery(params: {
  notificationId?: string | null;
  channelId?: string | null;
  channelType?: string | null;
  storeId?: string | null;
}): Promise<RetryResult> {
  const { data, error } = await supabase.functions.invoke('send-line-notification', {
    body: {
      notification_id: params.notificationId ?? null,
      channel_id: params.channelId ?? null,
      channel_type: params.channelType ?? undefined,
      store_id: params.storeId ?? undefined,
      force: true,
    },
  });
  if (error) return { ok: false, error: error.message };
  const res = (data ?? {}) as { ok?: boolean; error?: string | null; error_code?: string | null };
  return { ok: !!res.ok, error: res.error ?? null, errorCode: res.error_code ?? null };
}
