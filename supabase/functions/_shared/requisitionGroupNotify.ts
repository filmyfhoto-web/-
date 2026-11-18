// แจ้งเตือน "ใบเขียนเบิกใหม่" เข้ากลุ่ม LINE รับออเดอร์ — กลุ่มเดียวกับออเดอร์
// (channel_type = 'order_group') และส่งจริงโดย notify-dispatch ผ่าน
// notification_outbox เดิม พร้อม idempotency key ที่คงที่ต่อใบ 1 ใบ 1 ปลายทาง
import { enqueueNotification, kickDispatch } from "./notifyOutbox.ts";
import { ORDER_GROUP_CHANNEL_TYPE, loadOrderGroupDestinations } from "./orderGroupNotify.ts";

export type RequisitionPayload = {
  id: string;
  schoolName: string;
  projectName: string;
  preparedBy: string;
  itemCount: number;
  total: number;
  submittedAt: string;
};

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok",
    }).format(new Date(iso)) + " น.";
  } catch { return iso; }
}

export function shortRef(id: string): string {
  return `RQ-${String(id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function buildRequisitionText(p: RequisitionPayload, adminUrl: string): string {
  return [
    "📝 ใบเขียนเบิกใหม่",
    `เลขอ้างอิง: ${shortRef(p.id)}`,
    `โรงเรียน/หน่วยงาน: ${p.schoolName || "-"}`,
    `โครงการ: ${p.projectName || "-"}`,
    `ผู้จัดทำ: ${p.preparedBy || "-"}`,
    `จำนวนรายการ: ${p.itemCount}`,
    `ยอดรวม: ${Number(p.total || 0).toLocaleString("th-TH")} บาท`,
    `เวลา: ${fmtTime(p.submittedAt)}`,
    "เอกสารประมาณการ · ไม่ตัดสต๊อก",
    `เปิดในระบบ: ${adminUrl}`,
  ].join("\n");
}

export function requisitionIdempotencyKey(id: string, dest: string): string {
  return `requisition:${id}:submitted:${dest}`.slice(0, 200);
}

export async function notifyRequisitionGroups(
  admin: any,
  p: RequisitionPayload,
): Promise<{ queued: number; configured: boolean }> {
  const env = (globalThis as any).Deno?.env;
  const base = (env?.get?.("PUBLIC_APP_URL") || "https://www.filmyynatta.com").replace(/\/$/, "");
  const adminUrl = `${base}/admin/school-requisitions?id=${encodeURIComponent(p.id)}`;

  const dests = await loadOrderGroupDestinations(admin);
  if (dests.length === 0) {
    console.warn("[requisition] no active order-notification group configured");
    return { queued: 0, configured: false };
  }


  const text = buildRequisitionText(p, adminUrl);
  let queued = 0;
  for (const { dest, storeId } of dests) {
    const res = await enqueueNotification(admin, {
      event_type: "requisition_submitted",
      ref_type: "school_requisition",
      ref_id: p.id,
      recipient: dest,
      text,
      audience: "admin",
      channel: "line",
      idempotency_key: requisitionIdempotencyKey(p.id, dest),
      meta: {
        channel_type: ORDER_GROUP_CHANNEL_TYPE,
        requisition_ref: shortRef(p.id),
        ...(storeId ? { store_id: storeId } : {}),
      },
    });
    if ((res as any)?.queued) queued += 1;
  }
  if (queued > 0) await kickDispatch(admin);
  return { queued, configured: true };
}
