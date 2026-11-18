// "กลุ่มแจ้งเตือนคำสั่งซื้อ" (channel_type = 'order_group')
//
// ห้องประเภทนี้เป็นปลายทางแจ้งเตือนอย่างเดียว: ไม่รับคำสั่งคิว ไม่เข้า AI intake
// และไม่เกี่ยวกับ queue_group / doc_group เดิม การส่งจริงเป็นหน้าที่ของ
// notify-dispatch ผ่าน notification_outbox เดิม (idempotent ตาม order+event+ปลายทาง)
import { notifyOrderEvent, kickDispatch } from "./orderEvents.ts";

export const ORDER_GROUP_CHANNEL_TYPE = "order_group";

export type OrderGroupPayload = {
  orderId: string;
  orderNo: string;
  customerName: string;
  itemCount: number;
  /** null = ยังไม่มีราคา (รอเสนอราคา) */
  total: number | null;
  source: string;
  createdAt: string;
};

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok",
    }).format(new Date(iso)) + " น.";
  } catch { return iso; }
}

export function buildOrderGroupText(p: OrderGroupPayload, adminUrl: string): string {
  return [
    "🛒 คำสั่งซื้อใหม่",
    `เลขออเดอร์: ${p.orderNo}`,
    `ลูกค้า: ${p.customerName || "-"}`,
    `จำนวนรายการ: ${p.itemCount}`,
    `ยอดรวม: ${p.total && p.total > 0 ? `${p.total.toLocaleString("th-TH")} บาท` : "รอเสนอราคา"}`,
    `ช่องทาง: ${p.source} · ${fmtTime(p.createdAt)}`,
    `เปิดออเดอร์ในระบบ: ${adminUrl}`,
  ].join("\n");
}

/**
 * ปลายทางต้องเป็นกลุ่ม LINE (C…/R…) และเปิดใช้งานอยู่เท่านั้น
 * ส่งได้ "กลุ่มเดียว" — กลุ่มแรกในรายการ (ผู้เรียกเรียงตาม linked_at ล่าสุด)
 * เพื่อกันข้อความซ้ำเมื่อมีหลายกลุ่มเปิดอยู่
 */
export function pickOrderGroupDestinations(
  rows: Array<{ line_destination_id: string | null; is_active?: boolean | null; store_id?: string | null }> | null | undefined,
): Array<{ dest: string; storeId: string | null }> {
  for (const r of rows ?? []) {
    const dest = String(r?.line_destination_id ?? "").trim();
    if (r?.is_active === false) continue;
    if (!/^[CR][0-9a-f]{10,}$/i.test(dest)) continue;
    return [{ dest, storeId: (r?.store_id ?? null) as string | null }];
  }
  return [];
}

/** ปลายทางกลุ่มรับออเดอร์ที่ใช้ร่วมกันทุกระบบ (ออเดอร์ / ใบเขียนเบิก / ใบสั่งซื้อ) */
export async function loadOrderGroupDestinations(
  admin: any,
): Promise<Array<{ dest: string; storeId: string | null }>> {
  const { data, error } = await admin
    .from("line_notification_channels")
    .select("line_destination_id, is_active, store_id, linked_at")
    .eq("channel_type", ORDER_GROUP_CHANNEL_TYPE)
    .eq("is_active", true)
    .order("linked_at", { ascending: false });
  if (error) {
    console.warn("[order_group] channel lookup failed", error.message);
    return [];
  }
  return pickOrderGroupDestinations(data as any[]);
}


export async function notifyOrderGroups(
  admin: any,
  p: OrderGroupPayload,
): Promise<{ queued: number; configured: boolean }> {
  const env = (globalThis as any).Deno?.env;
  const base = (env?.get?.("PUBLIC_APP_URL") || "https://www.filmyynatta.com").replace(/\/$/, "");
  // ลิงก์แอดมิน — หน้าเหล่านี้อยู่หลัง RequireStaff อยู่แล้ว
  // ใช้ตัวแก้ปลายทาง /admin/orders/:id — รองรับทั้งออเดอร์เว็บ (orders)
  // และใบสั่งซื้อลูกค้า (customer_purchase_orders) จึงไม่เจอ "ไม่มีในระบบ" อีก
  const adminUrl = `${base}/admin/orders/${encodeURIComponent(p.orderId)}`;

  const dests = await loadOrderGroupDestinations(admin);
  if (dests.length === 0) {
    // ยังไม่ตั้งค่ากลุ่ม — ออเดอร์ต้องไม่ล้ม แค่บันทึกเตือนไว้
    console.warn("[order_group] no active order-notification group configured");
    return { queued: 0, configured: false };
  }


  const text = buildOrderGroupText(p, adminUrl);
  let queued = 0;
  for (const { dest: to, storeId } of dests) {
    const res = await notifyOrderEvent(admin, {
      event: "order_created",
      refType: "order",
      orderId: p.orderId,
      recipient: to,
      text,
      audience: "admin",
      transition: "new",
      channel: "line",
      // store_id ทำให้ dispatcher เลือก token ของ LINE OA ที่เป็นเจ้าของกลุ่มนั้นจริง ๆ
      meta: { channel_type: ORDER_GROUP_CHANNEL_TYPE, order_no: p.orderNo, ...(storeId ? { store_id: storeId } : {}) },
    });
    if ((res as any)?.queued) queued += 1;
  }
  if (queued > 0) await kickDispatch(admin);
  return { queued, configured: true };
}
