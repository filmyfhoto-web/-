/**
 * Customer-facing LINE bot for the shop OA (1:1 chats only).
 *
 * Three capabilities, all deterministic — no AI call, no pricing decision:
 *   1. FAQ replies for a small set of exact Thai questions.
 *   2. Order status lookup, scoped to the orders bound to that LINE account.
 *   3. Automatic order intake from a numbered purchase list in chat.
 *
 * Everything the bot writes stays a zero-priced order in `orders` so staff
 * still quote it in Work Docs exactly like a web order.
 */
import { detectChatOrder, type ChatOrderLine } from "./chatOrderDetector.ts";

export const FAQ_MENU = [
  "สวัสดีค่ะ 🙏 พิมพ์คำสั่งสั้น ๆ ได้เลยค่ะ",
  "",
  "• เมนู — ดูรายการคำสั่งนี้",
  "• สถานะ — เช็กสถานะออเดอร์ล่าสุดของคุณ",
  "• เวลาทำการ — ดูวันและเวลาเปิดร้าน",
  "• ที่อยู่ — ดูที่ตั้งร้านและช่องทางติดต่อ",
  "• วิธีสั่งของ — ดูวิธีส่งรายการสั่งซื้อ",
  "",
  "ส่งรายการสั่งของเป็นข้อ ๆ ได้เลย เช่น",
  "1. กระดาษ A4 2 รีม",
  "2. ปากกาน้ำเงิน 12 ด้าม",
].join("\n");

export const FAQ_HOW_TO_ORDER = [
  "วิธีสั่งของผ่าน LINE ค่ะ 📝",
  "",
  "พิมพ์รายการเป็นข้อ ๆ พร้อมจำนวนและหน่วย เช่น",
  "1. กระดาษ A4 2 รีม",
  "2. แฟ้มสันกว้าง 5 เล่ม",
  "",
  "ระบบจะเปิดใบงานให้อัตโนมัติ แล้วร้านจะเสนอราคากลับมาให้ยืนยันก่อนทำงานทุกครั้งค่ะ",
].join("\n");

export type FaqKind = "menu" | "hours" | "address" | "how_to_order" | "status";

/** อ่านคำสั่งสั้น ๆ ของลูกค้า — ต้องตรงรูปแบบเท่านั้น กันตอบมั่ว */
export function parseCustomerCommand(text: string): FaqKind | null {
  const t = String(text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!t || t.length > 40) return null;
  if (/^(เมนู|ช่วยเหลือ|help|เริ่ม|start|menu)$/.test(t)) return "menu";
  if (/^(สถานะ|เช็คสถานะ|เช็กสถานะ|ติดตามงาน|ออเดอร์ของฉัน|status)$/.test(t)) return "status";
  if (/^(เวลาทำการ|เปิดกี่โมง|ร้านเปิดกี่โมง|เวลาเปิด|เปิดปิดกี่โมง)$/.test(t)) return "hours";
  if (/^(ที่อยู่|ร้านอยู่ไหน|แผนที่|พิกัด|เบอร์ร้าน|ติดต่อร้าน)$/.test(t)) return "address";
  if (/^(วิธีสั่งของ|สั่งของยังไง|สั่งยังไง|วิธีสั่งซื้อ|วิธีสั่ง)$/.test(t)) return "how_to_order";
  return null;
}

export interface ShopInfo {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  hours?: string | null;
}

export function buildFaqReply(kind: Exclude<FaqKind, "status">, shop: ShopInfo = {}): string {
  if (kind === "menu") return FAQ_MENU;
  if (kind === "how_to_order") return FAQ_HOW_TO_ORDER;
  if (kind === "hours") {
    return [
      "🕘 เวลาทำการ",
      shop.hours?.trim() || "จันทร์–เสาร์ 08:30–18:00 น. (หยุดวันอาทิตย์และวันหยุดนักขัตฤกษ์)",
      "",
      "นอกเวลาทำการยังส่งรายการเข้ามาได้ ทางร้านจะตอบกลับในวันทำการถัดไปค่ะ",
    ].join("\n");
  }
  const lines = ["📍 ข้อมูลติดต่อร้าน"];
  if (shop.name?.trim()) lines.push(shop.name.trim());
  if (shop.address?.trim()) lines.push(shop.address.trim());
  if (shop.phone?.trim()) lines.push(`โทร ${shop.phone.trim()}`);
  if (lines.length === 1) lines.push("ติดต่อผ่าน LINE นี้ได้เลยค่ะ ทางร้านจะตอบกลับโดยเร็วที่สุด");
  return lines.join("\n");
}

const STATUS_LABEL: Record<string, string> = {
  pending_quote: "รอเสนอราคา",
  quoted: "เสนอราคาแล้ว รอยืนยัน",
  approved: "ยืนยันแล้ว",
  preparing: "กำลังจัดเตรียม",
  ready: "พร้อมรับ/พร้อมส่ง",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export interface StatusOrderRow {
  order_no?: string | null;
  status?: string | null;
  total?: number | string | null;
  created_at?: string | null;
  doc_intent?: string | null;
}

function thaiDateTime(iso?: string | null): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "-";
  const d = new Date(ms + 7 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`;
}

export function buildStatusReply(orders: StatusOrderRow[], trackUrl?: string): string {
  if (!orders.length) {
    return [
      "ยังไม่พบออเดอร์ที่ผูกกับ LINE นี้ค่ะ",
      "",
      "ส่งรายการสั่งของเป็นข้อ ๆ เข้ามาได้เลย หรือพิมพ์ “วิธีสั่งของ” เพื่อดูตัวอย่างค่ะ",
    ].join("\n");
  }
  const lines = ["📦 ออเดอร์ล่าสุดของคุณ"];
  for (const o of orders.slice(0, 5)) {
    const label = STATUS_LABEL[String(o.status ?? "")] ?? String(o.status ?? "-");
    const kind = o.doc_intent === "quote" ? "ใบเสนอราคา" : "คำสั่งซื้อ";
    lines.push(`• ${o.order_no ?? "-"} (${kind}) — ${label} · ${thaiDateTime(o.created_at)}`);
  }
  if (trackUrl) lines.push("", `ดูรายละเอียดทั้งหมด: ${trackUrl}`);
  return lines.join("\n");
}

export function buildOrderCreatedReply(orderNo: string, items: ChatOrderLine[], trackUrl?: string): string {
  const lines = [
    "รับรายการเรียบร้อยแล้วค่ะ 🙏",
    `เลขที่คำสั่งซื้อ: ${orderNo}`,
    "",
    "รายการที่อ่านได้",
  ];
  items.slice(0, 15).forEach((item, i) => {
    lines.push(`${i + 1}. ${item.name} — ${item.qty} ${item.unit || "ชิ้น"}${item.hasQty ? "" : " (ไม่พบจำนวน ใช้ 1)"}`);
  });
  if (items.length > 15) lines.push(`… และอีก ${items.length - 15} รายการ`);
  lines.push("", "ทางร้านจะตรวจสอบและเสนอราคากลับมาให้ยืนยันก่อนดำเนินการค่ะ");
  if (trackUrl) lines.push(`ติดตามสถานะ: ${trackUrl}`);
  return lines.join("\n");
}

export function genChatOrderNo(now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const tail = String(now.getTime()).slice(-4);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SO-${yy}${mm}-${tail}${rand}`;
}

export interface ChatOrderIntakeInput {
  lineUserId: string;
  displayName?: string | null;
  messageId: string;
  conversationId?: string | null;
  text: string;
  now?: Date;
}

export interface ChatOrderIntakeResult {
  created: boolean;
  duplicate: boolean;
  orderId?: string;
  orderNo?: string;
  items: ChatOrderLine[];
  /** เหตุผลที่ไม่สร้าง (ใช้ตรวจสอบย้อนหลัง) */
  skipped?: string;
}

/**
 * สร้างคำสั่งซื้อจากข้อความรายการในแชท — สร้างเฉพาะเมื่อผ่านเกณฑ์ตรวจจับ
 * ราคาเป็น 0 เสมอ เพื่อให้ร้านเสนอราคาเองเหมือนออเดอร์ทางเว็บ
 */
export async function ingestChatOrder(
  admin: any,
  input: ChatOrderIntakeInput,
): Promise<ChatOrderIntakeResult> {
  const detection = detectChatOrder(input.text);
  if (!detection.looksLikeOrder) {
    return { created: false, duplicate: false, items: detection.lines, skipped: detection.reasons.join(" · ") || "ไม่เข้าเกณฑ์รายการสั่งของ" };
  }

  const idempotencyKey = `linechat-${String(input.messageId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48)}`;
  const { data: existing } = await admin
    .from("orders")
    .select("id, order_no")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing?.id) {
    return { created: false, duplicate: true, orderId: existing.id, orderNo: existing.order_no ?? "", items: detection.lines };
  }

  const now = input.now ?? new Date();
  const orderNo = genChatOrderNo(now);
  const { data: order, error } = await admin
    .from("orders")
    .insert({
      order_no: orderNo,
      status: "pending_quote",
      line_user_id: input.lineUserId,
      guest_name: input.displayName || "ลูกค้า LINE",
      note: "รายการสั่งซื้อจากข้อความ LINE",
      subtotal: 0,
      total: 0,
      idempotency_key: idempotencyKey,
      doc_intent: "order",
      customer_snapshot: {
        source: "line_chat",
        line_user_id: input.lineUserId,
        display_name: input.displayName ?? null,
        conversation_id: input.conversationId ?? null,
        message_id: input.messageId,
        detection_confidence: detection.confidence,
        raw_text: String(input.text).slice(0, 2000),
        captured_at: now.toISOString(),
      },
    })
    .select("id, order_no")
    .single();
  if (error || !order) {
    return { created: false, duplicate: false, items: detection.lines, skipped: `สร้างออเดอร์ไม่สำเร็จ: ${error?.message ?? "unknown"}` };
  }

  const itemRows = detection.lines.map((line) => ({
    order_id: order.id,
    product_name: line.name.slice(0, 200),
    qty: line.qty > 0 ? line.qty : 1,
    unit: line.unit || null,
    price: 0,
    total: 0,
    note: line.hasQty ? null : "ไม่พบจำนวนในข้อความ ใช้ค่าเริ่มต้น 1",
  }));
  if (itemRows.length) await admin.from("order_items").insert(itemRows);

  // กันการ์ด "น่าจะเป็นรายการสั่งของ" ในหน้างานและเอกสารเด้งซ้ำกับงานที่สร้างแล้ว
  if (input.conversationId) {
    try {
      await admin.from("line_order_hints").upsert({
        message_id: input.messageId,
        conversation_id: input.conversationId,
        state: "converted",
        converted_to: "order",
        converted_id: order.id,
      }, { onConflict: "message_id" });
    } catch { /* hint bookkeeping must never break intake */ }
  }

  return { created: true, duplicate: false, orderId: order.id, orderNo: order.order_no, items: detection.lines };
}
