import { supabase } from '@/integrations/supabase/client';

export interface AdminGroupOrderContext {
  orderId: string;
  orderNo?: string | null;
  title?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  total?: number | null;
  storeId?: string | null;
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const NA = '-';

/**
 * ข้อความบริบทออเดอร์ที่ส่งเข้ากลุ่มแอดมิน
 * รูปแบบคงที่เสมอ: เลขงาน / ชื่องาน / ลูกค้า / ยอดรวม (ข้อมูลที่ไม่มีแสดงเป็น "-")
 */
export function adminGroupOrderText(o: AdminGroupOrderContext): string {
  const orderNo = (o.orderNo || '').trim() || o.orderId.slice(0, 8);
  const title = (o.title || '').trim() || NA;
  const name = (o.customerName || '').trim();
  const phone = (o.customerPhone || '').trim();
  const customer = name ? (phone ? `${name} (${phone})` : name) : NA;
  const total =
    typeof o.total === 'number' && Number.isFinite(o.total)
      ? `${o.total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`
      : NA;

  return [
    `📌 ออเดอร์ ${orderNo}`,
    `งาน: ${title}`,
    `ลูกค้า: ${customer}`,
    `ยอดรวม: ${total}`,
    'แอดมินเปิดคุยงานนี้ในกลุ่มได้เลย',
  ].join('\n');
}

/** หา destination ของกลุ่มแอดมินที่ผูกไว้ (คืน null เมื่อยังไม่ได้เชื่อมกลุ่ม) */
export async function findAdminGroup(storeId?: string | null) {
  let q = supabase
    .from('line_notification_channels')
    .select('id, store_id, display_name, line_destination_id, channel_type, is_active')
    .eq('channel_type', 'admin_group')
    .eq('is_active', true)
    // เฉพาะกลุ่ม/ห้องที่เชิญบอทเข้าไป (C.../R...) ไม่ใช้แชทส่วนตัวของ OA
    .or('line_destination_id.like.C%,line_destination_id.like.R%')
    .order('linked_at', { ascending: false })
    .limit(1);
  if (storeId && storeId !== 'all') q = q.eq('store_id', storeId);
  const { data } = await q.maybeSingle();
  return data ?? null;
}

export interface AdminGroupChatResult {
  ok: boolean;
  groupName?: string | null;
  reason?: 'no_group' | 'failed';
}

/**
 * ส่งบริบทออเดอร์เข้ากลุ่มแอดมินของร้าน แล้วเปิดแอป LINE ให้ทันที
 * (LINE ไม่มีลิงก์เปิดห้องกลุ่มโดยตรง จึงส่งข้อความนำร่องเข้ากลุ่มก่อน)
 */
export async function openAdminGroupChat(o: AdminGroupOrderContext): Promise<AdminGroupChatResult> {
  const group = await findAdminGroup(o.storeId);
  if (!group) return { ok: false, reason: 'no_group' };

  const { error } = await supabase.rpc('film_raise_ops_notification', {
    p_kind: 'admin_group_order_context',
    p_severity: 'info',
    p_title: `💬 คุยงานในกลุ่มแอดมิน (${o.orderNo || o.orderId.slice(0, 8)})`,
    p_body: adminGroupOrderText(o),
    p_order_id: o.orderId,
    p_store_id: group.store_id,
    p_group_no: 1,
    p_dedup_key: `admin_group_order_context:${o.orderId}:${Date.now()}`,
    p_cooldown_minutes: 0,
  });
  if (error) return { ok: false, reason: 'failed' };

  if (typeof window !== 'undefined') {
    if (isMobile()) window.location.href = 'line://';
    else window.open('https://line.me/R/', '_blank', 'noopener,noreferrer');
  }
  return { ok: true, groupName: group.display_name ?? null };
}