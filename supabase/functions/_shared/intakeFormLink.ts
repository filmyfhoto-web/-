/**
 * ฟอร์ม “รับงานใหม่” บนมือถือสำหรับกลุ่ม LINE ของร้าน
 *
 * ลิงก์ที่ส่งเข้ากลุ่มผูกกับ groupId / lineUserId / ร้านของห้อง ผ่าน token
 * อายุสั้นที่สร้างจากฝั่ง backend เท่านั้น — ไม่เชื่อค่าใน query string
 */
export const INTAKE_FORM_PATH = "/film-intake";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IntakeRoomRow {
  channel_type?: string | null;
  queue_commands_enabled?: boolean | null;
  store_id?: string | null;
  is_active?: boolean | null;
}

/**
 * ห้องที่อนุญาตให้ AI อ่านไฟล์แล้วสร้างการ์ด "รับงานใหม่"
 * ต้องเป็นกลุ่มรันคิวจริง (queue_group) + เปิดคำสั่งคิว + ผูกร้านด้วย UUID
 * ห้อง doc_group แม้เปิด queue_commands_enabled ก็ต้องไหลไป docFileIntake เดิม
 */
export function isQueueIntakeRoom(room: IntakeRoomRow | null | undefined): boolean {
  if (!room) return false;
  if (room.is_active === false) return false;
  if (String(room.channel_type || "") !== "queue_group") return false;
  if (!room.queue_commands_enabled) return false;
  return UUID_RE.test(String(room.store_id || ""));
}

/**
 * ยกเลิกการ์ดรับงาน — ผูกกับ card_key + กลุ่ม + ผู้กด + LINE channel เดิมเท่านั้น
 * คืน false เมื่อไม่พบ row (การ์ดหมดอายุ/ใช้ไปแล้ว/ไม่ใช่ของผู้ใช้/ข้ามกลุ่ม)
 */
export async function cancelIntakeCardToken(
  admin: any,
  input: { cardKey: string; groupId: string; lineUserId: string; channelKey: string },
): Promise<boolean> {
  if (!input.cardKey || !input.groupId || !input.lineUserId || !input.channelKey) return false;
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("film_intake_form_tokens")
    .update({ cancelled_at: now, expires_at: now })
    .eq("card_key", input.cardKey)
    .eq("group_id", input.groupId)
    .eq("line_user_id", input.lineUserId)
    .eq("channel_key", input.channelKey)
    .is("used_at", null)
    .select("id");
  if (error) return false;
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

export function intakeFormUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${INTAKE_FORM_PATH}?t=${encodeURIComponent(token)}`;
}

function randomToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export interface IntakeTokenInput {
  channelKey: string;
  channelId?: string | null;
  groupId: string;
  lineUserId: string;
  storeLabel?: string | null;
  ttlMinutes?: number;
  /** ข้อมูลที่อ่านได้จากไฟล์ (รูปแบบ ExtractedIntake) ใช้เติมฟอร์มล่วงหน้า */
  prefill?: unknown;
  /** ที่มาของการ์ด: command = พิมพ์/กดปุ่ม, file = ส่งไฟล์เข้ากลุ่ม */
  source?: "command" | "file";
  /** messageId ของ LINE — กันอ่านไฟล์เดิมซ้ำ (replay) */
  sourceMessageId?: string | null;
}

export interface IntakeTokenResult {
  token: string;
  /** รหัสสั้นไว้อ้างในปุ่ม postback (ไม่เปิดเผย token จริง) */
  cardKey: string;
  /** true เมื่อไฟล์นี้เคยสร้างการ์ดไปแล้ว (ใช้ใบเดิม) */
  duplicate: boolean;
}

/** สร้าง token อายุสั้น (ค่าเริ่มต้น 120 นาที) คืนค่า token ที่ใช้เปิดฟอร์ม */
export async function createIntakeFormToken(admin: any, input: IntakeTokenInput): Promise<IntakeTokenResult> {
  const token = randomToken();
  const cardKey = randomToken().slice(0, 24);
  const ttl = Math.max(5, Math.min(720, input.ttlMinutes ?? 120));

  if (input.sourceMessageId) {
    const { data: existing } = await admin
      .from("film_intake_form_tokens")
      .select("token, card_key, expires_at, cancelled_at, used_at")
      .eq("source_message_id", input.sourceMessageId)
      .maybeSingle();
    if (existing && !existing.cancelled_at && !existing.used_at && Date.parse(existing.expires_at) > Date.now()) {
      return { token: existing.token as string, cardKey: String(existing.card_key ?? ""), duplicate: true };
    }
    if (existing) return { token: existing.token as string, cardKey: String(existing.card_key ?? ""), duplicate: true };
  }

  const { error } = await admin.from("film_intake_form_tokens").insert({
    token,
    card_key: cardKey,
    channel_key: input.channelKey,
    channel_id: input.channelId ?? null,
    group_id: input.groupId,
    line_user_id: input.lineUserId,
    store_label: input.storeLabel ?? null,
    prefill: input.prefill ?? null,
    source: input.source ?? "command",
    source_message_id: input.sourceMessageId ?? null,
    expires_at: new Date(Date.now() + ttl * 60_000).toISOString(),
  });
  if (error) throw new Error(`intake token insert failed: ${error.message}`);
  return { token, cardKey, duplicate: false };
}

/** การ์ดสั้น ๆ พร้อมปุ่มใหญ่ “เปิดแบบฟอร์มรับงาน” (ไม่โชว์ URL ดิบ) */
export function buildIntakeFormFlex(url: string, storeLabel?: string | null) {
  return {
    type: "flex",
    altText: "เปิดแบบฟอร์มรับงานใหม่",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          { type: "text", text: "รับงานใหม่", weight: "bold", size: "lg", color: "#0F766E" },
          { type: "text", text: storeLabel || "กรอกในฟอร์มมือถือ 3 ขั้นตอน", size: "sm", color: "#6B7280", wrap: true },
          {
            type: "button", style: "primary", height: "sm", color: "#0F766E", margin: "md",
            action: { type: "uri", label: "เปิดแบบฟอร์มรับงาน", uri: url },
          },
        ],
      },
    },
  };
}

export interface IntakeSummary {
  orderNo: string;
  customerName: string;
  items: Array<{ title: string; quantity?: number | string | null; unit?: string | null }>;
  dueText?: string | null;
  queueUrl: string;
  docsUrl: string;
}

/** การ์ดสรุปส่งกลับ “กลุ่มเดิม” หลังยืนยัน */
export function buildIntakeSummaryFlex(s: IntakeSummary) {
  const itemLines = s.items.slice(0, 8).map((it) => ({
    type: "text",
    text: `• ${it.title}${it.quantity ? ` × ${it.quantity} ${it.unit || "ชิ้น"}` : ""}`,
    size: "sm", color: "#374151", wrap: true,
  }));
  return {
    type: "flex",
    altText: `รับงานแล้ว ${s.orderNo}`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          { type: "text", text: "✅ รับงานเข้าคิวแล้ว", weight: "bold", size: "md", color: "#0F766E" },
          { type: "text", text: s.orderNo, weight: "bold", size: "xl" },
          { type: "text", text: `ลูกค้า: ${s.customerName}`, size: "sm", color: "#374151", wrap: true },
          ...itemLines,
          ...(s.items.length > 8 ? [{ type: "text", text: `และอีก ${s.items.length - 8} รายการ`, size: "xs", color: "#9CA3AF" }] : []),
          ...(s.dueText ? [{ type: "text", text: `กำหนดรับ: ${s.dueText}`, size: "sm", color: "#B45309" }] : []),
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "button", style: "primary", height: "sm", color: "#0F766E", action: { type: "uri", label: "ดูคิวงาน", uri: s.queueUrl } },
          { type: "button", style: "secondary", height: "sm", action: { type: "uri", label: "ดูใบเสร็จ", uri: s.docsUrl } },
        ],
      },
    },
  };
}
