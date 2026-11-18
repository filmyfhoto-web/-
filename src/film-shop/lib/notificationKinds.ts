/**
 * แคตตาล็อกประเภทแจ้งเตือนของ Film Shop + ตัวช่วยอ่าน/เขียนการตั้งค่าแบบละเอียด
 * (เก็บใน film_notification_prefs.kinds = เปิด/ปิดรายประเภท,
 *  channels.per_kind = ช่องทางรายประเภท)
 */
export type NotifyChannel = 'in_app' | 'sound' | 'push' | 'line';

export const CHANNEL_LABELS: Record<NotifyChannel, string> = {
  in_app: 'ในแอป',
  sound: 'เสียง',
  push: 'แจ้งเตือนถาวร',
  line: 'LINE',
};

export type NotifyKind = {
  id: string;
  label: string;
  desc: string;
  group: 'orders' | 'work' | 'docs' | 'stock' | 'chat';
};

export const NOTIFY_GROUP_LABELS: Record<NotifyKind['group'], string> = {
  orders: 'ออเดอร์และการชำระเงิน',
  work: 'คิวงาน / การผลิต',
  docs: 'เอกสาร',
  stock: 'สินค้าและสต๊อก',
  chat: 'แชตและข้อความ',
};

export const NOTIFY_KINDS: NotifyKind[] = [
  { id: 'web_app_order', label: 'ออเดอร์เข้าใหม่ (เว็บแอป)', desc: 'ลูกค้าสั่งงานผ่านเว็บแอปหรือหน้าร้านออนไลน์', group: 'orders' },
  { id: 'new_job', label: 'งานเข้าใหม่ (LINE / หน้าร้าน)', desc: 'มีใบงานใหม่เข้าคิวรับงาน', group: 'orders' },
  { id: 'deposit_missing', label: 'มัดจำไม่ครบก่อนผลิต', desc: 'งานเข้าสู่การผลิตแต่ยังรับเงินไม่ครบตามเงื่อนไข', group: 'orders' },
  { id: 'payment_received', label: 'รับชำระเงิน', desc: 'มีการบันทึกรับเงิน/ปิดยอดออเดอร์', group: 'orders' },

  { id: 'pending_approval', label: 'รออนุมัติ', desc: 'งานหรือแบบที่รอการอนุมัติจากแอดมิน/ลูกค้า', group: 'work' },
  { id: 'unassigned', label: 'งานใหม่ยังไม่มีผู้รับผิดชอบ', desc: 'ยังไม่มอบหมายงานให้ใคร', group: 'work' },
  { id: 'missing_info', label: 'ข้อมูล/ไฟล์ไม่ครบ', desc: 'ต้องขอไฟล์หรือรายละเอียดเพิ่มจากลูกค้า', group: 'work' },
  { id: 'sla_soon', label: 'ใกล้ครบกำหนดส่ง', desc: 'งานใกล้ถึงกำหนดส่งมอบ', group: 'work' },
  { id: 'overdue', label: 'เลยกำหนดส่ง', desc: 'งานเลยกำหนดแล้วแต่ยังไม่เสร็จ', group: 'work' },
  { id: 'stalled', label: 'งานหยุดนิ่ง', desc: 'ไม่มีความเคลื่อนไหวเกินเวลาที่กำหนด', group: 'work' },
  { id: 'outsource_late', label: 'ร้านใหญ่ส่งช้า', desc: 'งานส่งออกผลิตภายนอกเกินกำหนด', group: 'work' },
  { id: 'qc_fail', label: 'QC ไม่ผ่าน', desc: 'งานถูกตีกลับจากการตรวจสอบ', group: 'work' },

  { id: 'document_issued', label: 'ส่งเอกสารให้ลูกค้า', desc: 'ออก/ส่งใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ หรือใบส่งของ', group: 'docs' },
  { id: 'document_viewed', label: 'ลูกค้าเปิดดูเอกสาร', desc: 'ลูกค้ากดเปิดลิงก์เอกสารที่ส่งไป', group: 'docs' },

  { id: 'low_stock', label: 'สินค้าใกล้หมด', desc: 'สต๊อกต่ำกว่าจุดสั่งซื้อ', group: 'stock' },
  { id: 'out_of_stock', label: 'สินค้าหมด', desc: 'สต๊อกเหลือศูนย์', group: 'stock' },

  { id: 'customer_message', label: 'ลูกค้าทักเข้ามาใหม่', desc: 'ข้อความใหม่ใน Inbox LINE OA', group: 'chat' },
  { id: 'message_failed', label: 'ส่งข้อความลูกค้าไม่สำเร็จ', desc: 'ส่ง LINE หรือแจ้งเตือนไม่ผ่าน', group: 'chat' },
];

export const DEFAULT_KIND_CHANNELS: Record<NotifyChannel, boolean> = {
  in_app: true, sound: true, push: true, line: false,
};

export type PerKindChannels = Record<string, Partial<Record<NotifyChannel, boolean>>>;

/** อ่านค่าช่องทางของประเภทหนึ่ง โดยยึดค่าเริ่มต้นเมื่อยังไม่เคยตั้ง */
export function kindChannels(perKind: PerKindChannels | undefined, kind: string): Record<NotifyChannel, boolean> {
  const saved = perKind?.[kind] ?? {};
  return {
    in_app: saved.in_app ?? DEFAULT_KIND_CHANNELS.in_app,
    sound: saved.sound ?? DEFAULT_KIND_CHANNELS.sound,
    push: saved.push ?? DEFAULT_KIND_CHANNELS.push,
    line: saved.line ?? DEFAULT_KIND_CHANNELS.line,
  };
}

/** เปิดใช้งานประเภทนี้อยู่หรือไม่ (ค่าเริ่มต้น = เปิด) */
export function kindEnabled(kinds: Record<string, boolean> | undefined, kind: string): boolean {
  return kinds?.[kind] !== false;
}

/** ควรแจ้งเตือนผ่านช่องทางนี้หรือไม่ — รวมสวิตช์หลัก + ช่องทางรายประเภท */
export function shouldNotify(
  prefs: { kinds?: Record<string, boolean>; perKind?: PerKindChannels; master?: Partial<Record<NotifyChannel, boolean>> },
  kind: string,
  channel: NotifyChannel,
): boolean {
  if (!kindEnabled(prefs.kinds, kind)) return false;
  if (prefs.master?.[channel] === false) return false;
  return kindChannels(prefs.perKind, kind)[channel];
}

/** อยู่ในช่วงเวลาห้ามรบกวนหรือไม่ (รองรับช่วงข้ามเที่ยงคืน) */
export function inQuietHours(start: string | null, end: string | null, now = new Date()): boolean {
  if (!start || !end) return false;
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(start);
  const b = toMin(end);
  if (a === b) return false;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}
