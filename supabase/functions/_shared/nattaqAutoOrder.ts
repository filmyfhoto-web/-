/**
 * NATTA.Q — สร้างงานเข้าคิวอัตโนมัติจากข้อความยืนยันในแชท
 *
 * แนวคิด: ข้อความ "คอนเฟิร์ม" มักไม่มีรายละเอียดครบในตัวเอง จึงรวมบริบท
 * ข้อความก่อนหน้าของห้องแชทเดียวกันมาให้ตัวแยกข้อมูลเดิม (filmJobParser)
 * อ่าน แล้วจะสร้างออเดอร์อัตโนมัติก็ต่อเมื่อข้อมูลครบเท่านั้น (ready)
 * ถ้ายังขาด → ไม่สร้างงานผี แต่ส่งรายการที่ขาดให้แอดมินแทน
 */
import { ingestFilmJobMessage, type IntakeResult } from "./filmJobIntake.ts";

export interface ChatContextMessage {
  text?: string | null;
  direction?: string | null;
  created_at?: string | null;
}

/** จำนวนข้อความย้อนหลังสูงสุดที่นำมาเป็นบริบท */
export const CONTEXT_MESSAGE_LIMIT = 12;

/**
 * รวมข้อความลูกค้าย้อนหลัง (เก่า → ใหม่) กับข้อความยืนยันล่าสุด
 * ให้เป็นข้อความเดียวสำหรับตัวแยกข้อมูล
 */
export function buildAutoOrderText(
  history: ChatContextMessage[],
  confirmText: string,
): string {
  const lines: string[] = [];
  for (const m of history) {
    if ((m.direction ?? "inbound") !== "inbound") continue;
    const t = String(m.text ?? "").trim();
    if (!t) continue;
    if (lines.includes(t)) continue;
    lines.push(t);
  }
  const confirm = String(confirmText ?? "").trim();
  if (confirm && !lines.includes(confirm)) lines.push(confirm);
  return lines.slice(-CONTEXT_MESSAGE_LIMIT).join("\n");
}

export interface AutoOrderInput {
  conversationId: string;
  messageId?: string | null;
  lineUserId?: string | null;
  displayName?: string | null;
  channelId?: string | null;
  confirmText: string;
  now?: Date;
}

export interface AutoOrderResult extends IntakeResult {
  autoCreated: boolean;
}

export async function autoCreateJobFromChat(
  admin: any,
  input: AutoOrderInput,
): Promise<AutoOrderResult> {
  const { data: history } = await admin
    .from("film_messages")
    .select("text,direction,created_at")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(CONTEXT_MESSAGE_LIMIT);

  const ordered = [...(history ?? [])].reverse() as ChatContextMessage[];
  const text = buildAutoOrderText(ordered, input.confirmText);

  const res = await ingestFilmJobMessage(admin, {
    // idempotent ต่อข้อความยืนยันหนึ่งครั้ง (LINE ส่งซ้ำได้)
    eventId: `nattaq:${input.messageId ?? input.conversationId}`,
    messageId: input.messageId ? `nattaq-msg:${input.messageId}` : null,
    lineUserId: input.lineUserId ?? null,
    displayName: input.displayName ?? null,
    channelId: input.channelId ?? null,
    text,
    now: input.now,
  });

  return { ...res, autoCreated: res.intakeStatus === "created" && !res.duplicate };
}
