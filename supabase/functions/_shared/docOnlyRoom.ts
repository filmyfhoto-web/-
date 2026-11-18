/**
 * "ห้องบอทเอกสาร" (document-only room)
 *
 * กลุ่ม LINE ที่ผูกไว้เป็น channel_type = 'doc_group' มีหน้าที่เดียวคือ
 * รับคำสั่งเอกสาร → พรีวิว → ใบเสนอราคา → เอกสารถัดไปจากใบเสนอราคาที่ออกเลขแล้ว
 * ห้ามมีระบบรันคิวงาน / เปิดงาน / เปลี่ยนสถานะงานผลิตในห้องเหล่านี้
 * (กลุ่มอื่น เช่น queue_group / admin_group ยังทำงานคิวได้ตามเดิม)
 */
export const DOC_ONLY_CHANNEL_TYPE = "doc_group";

export interface DocOnlyRoom {
  id: string;
  storeId: string | null;
  label: string | null;
}

/** ห้องที่ “เปิดคำสั่งเอกสาร” ได้ — รวมทั้งห้องเอกสารล้วน และห้องรันคิวที่เปิดสิทธิ์เอกสารเพิ่ม */
export interface DocBotRoom extends DocOnlyRoom {
  /** true = ห้องเอกสารล้วน (ห้ามรันคิว) · false = ห้องรันคิวที่เปิดคำสั่งเอกสารด้วย */
  docOnly: boolean;
}

export const DOC_ONLY_NOTICE = [
  "ห้องนี้เป็น “ห้องบอทเอกสาร” — โหมดออกเอกสารเท่านั้น ไม่มีระบบรันคิวงานค่ะ",
  "พิมพ์ “ตัวอย่างคำสั่ง” เพื่อคัดลอกคำสั่งไปแก้ได้เลย",
].join("\n");

/** ห้องนี้เป็นห้องเอกสารหรือไม่ (อ่านจาก mapping ที่มีอยู่จริง ห้ามเดา) */
export async function loadDocOnlyRoom(admin: any, groupId: string | null | undefined): Promise<DocOnlyRoom | null> {
  if (!groupId) return null;
  const { data } = await admin
    .from("line_notification_channels")
    .select("id, store_id, display_name")
    .eq("line_destination_id", groupId)
    .eq("channel_type", DOC_ONLY_CHANNEL_TYPE)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    storeId: (data.store_id as string | null) ?? null,
    label: (data.display_name as string | null) ?? null,
  };
}

/**
 * ห้องที่ใช้คำสั่งเอกสารได้: channel_type = 'doc_group' หรือห้องอื่นที่ตั้ง doc_commands_enabled = true
 * (ห้องรันคิวที่เปิดสิทธิ์เอกสารจะยังรันคิวได้ตามเดิม)
 */
export async function loadDocBotRoom(admin: any, groupId: string | null | undefined): Promise<DocBotRoom | null> {
  if (!groupId) return null;
  const { data } = await admin
    .from("line_notification_channels")
    .select("id, store_id, display_name, channel_type, doc_commands_enabled")
    .eq("line_destination_id", groupId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const docOnly = String(data.channel_type) === DOC_ONLY_CHANNEL_TYPE;
  if (!docOnly && data.doc_commands_enabled !== true) return null;
  return {
    id: String(data.id),
    storeId: (data.store_id as string | null) ?? null,
    label: (data.display_name as string | null) ?? null,
    docOnly,
  };
}

/** ห้องเอกสารที่ยังไม่ได้ผูกร้าน — ห้าม fallback ข้ามร้าน ให้แจ้ง error ชัดเจน */
export function docOnlyStoreMissingText(roomLabel?: string | null): string {
  const where = roomLabel ? ` (${roomLabel})` : "";
  return [
    `❌ ห้องบอทเอกสารนี้${where} ยังไม่ได้ผูกกับร้านในระบบค่ะ`,
    "ระบบไม่อนุญาตให้ใช้ค่าของร้านอื่นแทน — กรุณาผูกห้องกับร้านที่ถูกต้องก่อน แล้วสั่งใหม่อีกครั้ง",
  ].join("\n");
}

import { computeDocBotMissing, type DocBotCommand } from "./docBotCommands.ts";

/**
 * ล็อกคำสั่งให้ใช้ร้านของห้องนี้เสมอ — แม้ผู้ใช้จะพิมพ์ชื่อร้านอื่นมาในข้อความ
 * (ห้ามข้ามร้านเด็ดขาด: การพิมพ์ = การพิมพ์, คัลเลอร์แล็ป = คัลเลอร์แล็ป)
 */
export function lockCommandToRoomShop(
  command: DocBotCommand,
  shopKey: "film" | "colorlab" | "printing",
): { command: DocBotCommand; overridden: boolean } {
  const current = command.fields.shopKey ?? null;
  if (current === shopKey) return { command, overridden: false };
  const fields = { ...command.fields, shopKey };
  const missing = computeDocBotMissing(command.docType, fields);
  fields.missing = missing;
  return { command: { ...command, fields, missing }, overridden: Boolean(current) };
}
