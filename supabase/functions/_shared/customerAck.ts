// ข้อความ "ได้รับรายการแล้ว" ที่ส่งถึงลูกค้าอัตโนมัติทันทีที่กดสั่งซื้อ/ขอใบราคา
//
// ใช้ notification_type = "received_ack" ร่วมกับปุ่ม "ยืนยันรับ" ในหน้างานและ
// เอกสาร (send-work-doc-notify) เพื่อให้ unique (order_id, notification_type,
// recipient_type) กันส่งซ้ำได้จริง — ลูกค้าจะได้ข้อความนี้ครั้งเดียว
import { pushLineMessages } from "./linePush.ts";
import { resolveLineToken } from "./lineToken.ts";

export type AckIntent = "order" | "quote";

/** ข้อความ ack แยกตามปุ่มที่ลูกค้ากดในตะกร้า */
export function customerAckText(intent: AckIntent, code: string, itemCount: number): string {
  const head = intent === "quote"
    ? "🧾 ได้รับคำขอใบเสนอราคาแล้วค่ะ"
    : "✅ ได้รับคำสั่งซื้อเรียบร้อยแล้วค่ะ";
  const tail = intent === "quote"
    ? "ทางร้านจะจัดทำใบเสนอราคาและแจ้งกลับให้เร็วที่สุดค่ะ"
    : "ทางร้านจะดำเนินการจัดทำ และส่งไฟล์ใบส่งของให้เร็วที่สุดค่ะ";
  return [
    head,
    code ? `เลขที่รายการ: ${code}` : "",
    itemCount > 0 ? `จำนวนรายการ: ${itemCount}` : "",
    tail,
  ].filter(Boolean).join("\n");
}

/** ปลายทางจริงเท่านั้น — รหัสจำลอง "guest:<uuid>" ไม่ใช่ LINE user id */
export function realLineTarget(raw: string | null | undefined): string | null {
  const v = String(raw || "").trim();
  if (!v || v.startsWith("guest:")) return null;
  return v;
}

export type SendAckInput = {
  orderId: string;
  orderNo: string;
  intent: AckIntent;
  lineUserId: string | null;
  itemCount: number;
  /** ลิงก์ให้ลูกค้ากดดูรายละเอียดคำสั่งซื้อ */
  detailUrl?: string | null;
};

export type SendAckResult = { status: "sent" | "skipped" | "failed" | "deduplicated"; error?: string };

/**
 * ส่ง ack + บันทึกผลลง order_notification_logs (best-effort — ผู้เรียกต้อง
 * ครอบ try/catch อีกชั้น ไม่ให้กระทบการสร้างออเดอร์)
 */
export async function sendCustomerAck(admin: any, input: SendAckInput): Promise<SendAckResult> {
  const target = realLineTarget(input.lineUserId);
  const notificationType = "received_ack";

  const { data: existing } = await admin
    .from("order_notification_logs")
    .select("id, status, attempts")
    .eq("order_id", input.orderId)
    .eq("notification_type", notificationType)
    .eq("recipient_type", "customer")
    .maybeSingle();
  if (existing && existing.status === "sent") return { status: "deduplicated" };

  const base = {
    order_id: input.orderId,
    notification_type: notificationType,
    recipient_type: "customer",
    target_id: target,
    attempts: (existing?.attempts ?? 0) + 1,
    payload: { kind: "web_order", code: input.orderNo, intent: input.intent },
  };
  const save = async (patch: Record<string, unknown>) => {
    const payload = { ...base, ...patch };
    if (existing?.id) await admin.from("order_notification_logs").update(payload).eq("id", existing.id);
    else await admin.from("order_notification_logs").insert(payload);
  };

  if (!target) {
    await save({ status: "failed", error_message: "ลูกค้ายังไม่ได้เชื่อม LINE — รอจับคู่ลูกค้า", sent_at: null });
    return { status: "skipped", error: "no_line_link" };
  }

  const text = customerAckText(input.intent, input.orderNo, input.itemCount);
  const messages: unknown[] = [{
    type: "text",
    text,
    ...(input.detailUrl
      ? {
        quickReply: {
          items: [{
            type: "action",
            action: { type: "uri", label: "ดูรายละเอียดคำสั่งซื้อ", uri: input.detailUrl },
          }],
        },
      }
      : {}),
  }];

  const token = await resolveLineToken(admin);
  const res = await pushLineMessages(token, target, messages, `ack:${input.orderId}:${notificationType}`);
  if (res.ok) {
    await save({ status: "sent", error_message: null, sent_at: new Date().toISOString() });
    return { status: "sent" };
  }
  const msg = String(res.error || `line_http_${Number(res.status) || 0}`).slice(0, 500);
  await save({ status: "failed", error_message: msg, sent_at: null });
  return { status: "failed", error: msg };
}
