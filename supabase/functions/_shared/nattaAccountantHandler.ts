/**
 * ม่วงจดให้ — ตัวจัดการคำสั่งบัญชีจาก LINE (เฉพาะแชทส่วนตัวของแอดมิน Film Shop, ช่อง `natta`)
 *
 * ความปลอดภัย / กติกาสำคัญ
 *  - เรียกได้เฉพาะเมื่อผู้ส่งผ่านการตรวจสิทธิ์ owner/admin มาแล้ว (isAuthorized)
 *  - **ยืนยันก่อนบันทึกทุกครั้ง**: บันทึกรายรับ/รายจ่าย/มัดจำ จะสร้าง "ร่างรอยืนยัน" ก่อน
 *    ยังไม่เขียน film_transactions / film_order_payments จนกว่าจะกดยืนยัน
 *  - ยกเลิก = ไม่แตะข้อมูลจริงเลย
 *  - แก้ไข/ยกเลิกรายการ ต้องยืนยันอีกครั้ง และแตะได้เฉพาะรายการของ line_user_id เดียวกัน
 *  - "ล่าสุด" = วันนี้ (เวลาไทย) + ผู้ใช้ LINE คนเดียวกัน + ยังไม่ถูกยกเลิก
 *  - ยกเลิกรายการ = soft void (voided_at) ไม่ลบข้อมูลจริง
 *  - ยืนยันซ้ำ/LINE ส่งซ้ำ เขียนได้ครั้งเดียว (consumed_at + reference/line_message_id)
 */
import {
  BRAND,
  NATTA_ATTACH_NO_DRAFT,
  NATTA_DEPOSIT_HELP,
  NATTA_HELP_TEXT,
  NATTA_NO_PERMISSION,
  PAYMENT_LABEL,
  VOID_REASON,
  bangkokDate,
  buildListText,
  buildSummaryText,
  formatBaht,
  parseNattaCommand,
  type NattaCommand,
  type NattaPostback,
  type PaymentMethod,
} from "./nattaAccountant.ts";
import { nattaFlexMessage, type NattaCardButton } from "./nattaAccountantFlex.ts";
import { storeLineAttachment } from "./lineIntakeStore.ts";
import { aiConfigured, downloadLineContent, extractReceipt, transcribeAudio } from "./nattaAI.ts";


export interface NattaAcctContext {
  admin: any;
  lineUserId: string;
  messageId: string | null;
  eventId: string | null;
  isAuthorized: boolean;
  /** LINE channel access token ของช่อง natta — ใช้ดาวน์โหลดไฟล์แนบ */
  lineToken?: string;
  now?: Date;
}

export interface NattaAcctResult {
  handled: boolean;
  reply?: string;
  /** การ์ด Flex (ถ้ามี webhook จะส่งการ์ดแทนข้อความล้วน) */
  flex?: unknown;
  info?: string;
}

const PENDING_TTL_MS = 8 * 60 * 1000;

type Attachment = { name: string; path: string };

/** ร่างที่รับไฟล์แนบได้ */
export const ATTACHABLE_ACTIONS = ["create", "edit_amount", "edit_desc", "add_evidence"];

/* ------------------------------ pending store ----------------------------- */

interface PendingRow {
  id: string;
  action: string;
  payload: Record<string, any>;
  expires_at: string;
  consumed_at?: string | null;
}

async function loadPending(admin: any, lineUserId: string, now: Date): Promise<PendingRow | null> {
  const { data } = await admin
    .from("film_line_pending_actions")
    .select("id, action, payload, expires_at, consumed_at")
    .eq("line_user_id", lineUserId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as PendingRow | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < now.getTime()) return null;
  return row;
}

async function savePending(
  admin: any,
  lineUserId: string,
  action: string,
  payload: Record<string, unknown>,
  now: Date,
): Promise<string | null> {
  // ร่างค้างเก่าใช้ไม่ได้อีก — กันการยืนยันผิดใบ
  await admin
    .from("film_line_pending_actions")
    .update({ consumed_at: now.toISOString() })
    .eq("line_user_id", lineUserId)
    .is("consumed_at", null);
  const { data } = await admin
    .from("film_line_pending_actions")
    .insert({
      line_user_id: lineUserId,
      action,
      payload,
      expires_at: new Date(now.getTime() + PENDING_TTL_MS).toISOString(),
    })
    .select("id");
  return ((data ?? [])[0]?.id as string | undefined) ?? null;
}

/** อัปเดต payload ของร่างที่ยังไม่ถูกยืนยัน (ใช้ตอนแนบหลักฐาน) */
async function updatePendingPayload(admin: any, id: string, lineUserId: string, payload: Record<string, unknown>) {
  await admin
    .from("film_line_pending_actions")
    .update({ payload })
    .eq("id", id)
    .eq("line_user_id", lineUserId)
    .is("consumed_at", null);
}

/**
 * ปิดร่างแบบ atomic — ยืนยันซ้ำจะได้ null (เขียนได้ครั้งเดียวเท่านั้น)
 * และแนบเงื่อนไข line_user_id เพื่อกันการยืนยันร่างของคนอื่น
 */
async function consumePending(
  admin: any,
  id: string,
  lineUserId: string,
  now: Date,
): Promise<(PendingRow & { expired?: boolean }) | null> {
  const { data } = await admin
    .from("film_line_pending_actions")
    .update({ consumed_at: now.toISOString() })
    .eq("id", id)
    .eq("line_user_id", lineUserId)
    .is("consumed_at", null)
    .select("id, action, payload, expires_at");
  const row = (data ?? [])[0] as PendingRow | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < now.getTime()) return { ...row, expired: true };
  return row;
}

/* -------------------------------- quick list ------------------------------ */

interface NattaQuickEntry {
  label: string;
  tx_type: string;
  category: string | null;
  default_amount: number | null;
}

const DEFAULT_QUICK_ENTRIES: NattaQuickEntry[] = [
  { label: "ขายรูป", tx_type: "income", category: "งานถ่ายรูป", default_amount: null },
  { label: "งานป้าย", tx_type: "income", category: "งานพิมพ์/ป้าย", default_amount: null },
  { label: "ขายสินค้า", tx_type: "income", category: "ขายสินค้า", default_amount: null },
  { label: "ซื้อกระดาษ", tx_type: "expense", category: "วัสดุงานพิมพ์", default_amount: null },
  { label: "ค่าส่ง", tx_type: "expense", category: "ค่าขนส่ง", default_amount: null },
];

/** รายการลัดที่เจ้าของตั้งเองในหน้าตั้งค่า — ถ้ายังไม่ตั้ง ใช้ชุดเริ่มต้น */
async function loadQuickEntries(admin: any): Promise<NattaQuickEntry[]> {
  try {
    const { data } = await admin
      .from("film_natta_quick_entries")
      .select("label, tx_type, category, default_amount")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(8);
    const rows = (data ?? []) as NattaQuickEntry[];
    return rows.length ? rows : DEFAULT_QUICK_ENTRIES;
  } catch {
    return DEFAULT_QUICK_ENTRIES;
  }
}

/** รายการล่าสุด = วันนี้ (เวลาไทย) + ผู้ใช้ LINE คนเดียวกัน + ยังไม่ถูกยกเลิก */
async function latestTodayTx(admin: any, lineUserId: string, today: string) {
  const { data } = await admin
    .from("film_transactions")
    .select("id, type, amount, description, category, date, evidence, payment_method, created_at")
    .eq("line_user_id", lineUserId)
    .eq("date", today)
    .is("voided_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data ?? [])[0] ?? null;
}

export function paymentLabel(pm?: string | null): string {
  if (!pm) return "ยังไม่ระบุ";
  return PAYMENT_LABEL[pm as PaymentMethod] ?? "อื่นๆ";
}

/** ปุ่มเลือกวิธีจ่ายของรายการล่าสุด */
function paymentButtons(): NattaCardButton[] {
  return (["cash", "transfer", "promptpay", "card", "ewallet"] as PaymentMethod[]).map((m) => ({
    label: PAYMENT_LABEL[m],
    text: `วิธีจ่าย ${PAYMENT_LABEL[m]}`,
    data: `natta:text:วิธีจ่าย ${PAYMENT_LABEL[m]}`,
    style: "secondary" as const,
  }));
}

/* ---------------------------------- cards -------------------------------- */

function afterSaveButtons(): NattaCardButton[] {
  return [
    { label: "รายการล่าสุด", text: "รายการล่าสุด", style: "secondary" },
    { label: "สรุปวันนี้", text: "สรุปวันนี้", style: "secondary" },
    { label: "✏️ แก้ไขล่าสุด", text: "แก้ไขล่าสุด", data: "natta:text:แก้ไขล่าสุด", style: "secondary" },
    { label: "🗑️ ยกเลิกล่าสุด", text: "ยกเลิกล่าสุด", data: "natta:text:ยกเลิกล่าสุด", style: "secondary" },
  ];
}

function reviewButtons(pendingId: string): NattaCardButton[] {
  return [
    { label: "✅ ยืนยันบันทึก", text: "ยืนยัน", data: `natta:confirm:${pendingId}` },
    { label: "📎 แนบสลิป/หลักฐาน", text: "แนบสลิป", data: `natta:attach:${pendingId}`, style: "secondary" },
    { label: "💳 วิธีจ่าย", text: "วิธีจ่าย", data: "natta:text:วิธีจ่าย", style: "secondary" },
    { label: "❌ ยกเลิก", text: "ยกเลิก", data: `natta:cancel:${pendingId}`, style: "secondary" },
  ];
}

function buildReviewCard(
  pendingId: string,
  p: { type: string; amount: number; description: string; category: string; note?: string; date: string; attachments?: Attachment[]; payment?: string | null },
) {
  const isIncome = p.type === "income";
  const count = (p.attachments ?? []).length;
  return nattaFlexMessage({
    title: isIncome ? "🟢 รอยืนยัน — รายรับ" : "🔴 รอยืนยัน — รายจ่าย",
    tone: isIncome ? "income" : "expense",
    altText: `รอยืนยัน ${p.description} ${formatBaht(p.amount)} บาท`,
    rows: [
      { label: "รายการ", value: p.description || "-" },
      { label: "ประเภท", value: isIncome ? "รายรับ" : "รายจ่าย" },
      { label: "หมวด", value: p.category || "อื่นๆ" },
      { label: "จำนวนเงิน", value: `${formatBaht(p.amount)} บาท` },
      { label: "วิธีจ่าย", value: paymentLabel(p.payment) },
      ...(p.note ? [{ label: "หมายเหตุ", value: p.note }] : []),
      { label: "วันที่", value: p.date },
      { label: "หลักฐาน", value: count ? `${count} ไฟล์` : "ยังไม่มี" },
    ],
    note: `ยังไม่บันทึกลงบัญชีนะคะ — กด “ยืนยันบันทึก” ก่อน (ร่างหมดอายุใน 8 นาที)`,
    buttons: reviewButtons(pendingId),
  });
}

function reviewText(p: { type: string; amount: number; description: string; category: string; date: string; attachments?: Attachment[] }) {
  return [
    p.type === "income" ? "🟢 รอยืนยัน — รายรับ" : "🔴 รอยืนยัน — รายจ่าย",
    `${p.description} ${formatBaht(p.amount)} บาท`,
    `หมวด: ${p.category}`,
    `หลักฐาน: ${(p.attachments ?? []).length} ไฟล์`,
    "",
    "ตอบ “ยืนยัน” เพื่อบันทึก หรือ “ยกเลิก” เพื่อไม่บันทึก",
  ].join("\n");
}

/* --------------------------------- handler -------------------------------- */

export async function handleNattaAccountant(
  ctx: NattaAcctContext,
  text: string,
): Promise<NattaAcctResult> {
  const cmd: NattaCommand | null = parseNattaCommand(text);
  if (!cmd) return { handled: false };
  if (!ctx.isAuthorized) return { handled: true, reply: NATTA_NO_PERMISSION, info: "natta:denied" };

  const { admin, lineUserId } = ctx;
  const now = ctx.now ?? new Date();
  const today = bangkokDate(now);

  switch (cmd.kind) {
    case "today_menu": {
      const items = await loadQuickEntries(admin);
      const menuButtons: NattaCardButton[] = items.slice(0, 8).map((it) => ({
        label: it.label.slice(0, 20),
        text: it.label,
        style: it.tx_type === "income" ? "primary" : "secondary",
        // กดแล้วเปิดคีย์บอร์ดพร้อมข้อความตั้งต้น — พิมพ์แค่ตัวเลขก็ส่งได้
        fillInText: `${it.label}${it.default_amount ? ` ${Number(it.default_amount)}` : ""} `,
      }));
      menuButtons.push({ label: "สรุปวันนี้", text: "สรุปวันนี้", style: "secondary" });
      const helpNote = "กดปุ่ม → พิมพ์ยอดเงินต่อท้าย แล้วส่งได้เลย\nระบบจะขึ้นการ์ด “รอยืนยัน” ก่อนบันทึกทุกครั้ง";
      return {
        handled: true,
        reply: [`🗓️ บันทึกงานวันนี้ (${today})`, ...items.map((i) => `• ${i.label}`), "", helpNote].join("\n"),
        flex: nattaFlexMessage({
          title: `บันทึกงานวันนี้ · ${today}`,
          tone: "info",
          altText: "เมนูบันทึกงานวันนี้",
          rows: items.length
            ? items.map((i) => ({
                label: i.tx_type === "income" ? "รายรับ" : "รายจ่าย",
                value: `${i.label}${i.category ? ` · ${i.category}` : ""}${i.default_amount ? ` · ${formatBaht(Number(i.default_amount))} บาท` : ""}`,
              }))
            : [{ value: "ยังไม่ได้ตั้งรายการลัด — ตั้งได้ที่หน้าตั้งค่า Film Shop" }],
          note: helpNote,
          buttons: menuButtons,
        }),
        info: "natta:today_menu",
      };
    }

    case "help":
      return { handled: true, reply: NATTA_HELP_TEXT, info: "natta:help" };

    /* ---------------- บันทึกรายรับ/รายจ่าย → ร่างรอยืนยัน ---------------- */
    case "add": {
      // LINE ส่งซ้ำ (message id เดิม) → ไม่สร้างร่างซ้ำ
      if (ctx.messageId) {
        const { data: dupPending } = await admin
          .from("film_line_pending_actions")
          .select("id")
          .eq("line_user_id", lineUserId)
          .eq("payload->>message_id", ctx.messageId)
          .limit(1);
        if ((dupPending ?? []).length) return { handled: true, info: "natta:add duplicate" };
      }
      const noteText = (cmd as any).note as string | undefined;
      const payload = {
        type: cmd.type,
        amount: cmd.amount,
        description: cmd.description,
        category: cmd.category,
        ...((cmd as any).payment ? { payment: (cmd as any).payment } : {}),
        ...(noteText ? { note: noteText } : {}),
        date: today,
        attachments: [] as Attachment[],
        message_id: ctx.messageId,
        event_id: ctx.eventId,
      };
      const pendingId = await savePending(admin, lineUserId, "create", payload, now);
      if (!pendingId) return { handled: true, reply: "เปิดรายการรอยืนยันไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ", info: "natta:add pending failed" };
      return {
        handled: true,
        reply: reviewText(payload),
        flex: buildReviewCard(pendingId, payload),
        info: `natta:add pending ${cmd.type}`,
      };
    }

    case "attach_request": {
      const pending = await loadPending(admin, lineUserId, now);
      if (!pending || !ATTACHABLE_ACTIONS.includes(pending.action)) {
        // ไม่มีร่างรอยืนยัน → แนบหลักฐานเพิ่มให้ "รายการล่าสุดของวันนี้" (ของผู้ส่งเอง)
        const row = await latestTodayTx(admin, lineUserId, today);
        if (!row) return { handled: true, reply: NATTA_ATTACH_NO_DRAFT, info: "natta:attach no draft" };
        const existing = Array.isArray(row.evidence) ? (row.evidence as Attachment[]) : [];
        const pendingId = await savePending(admin, lineUserId, "add_evidence", {
          id: row.id,
          description: row.description ?? null,
          amount: Number(row.amount ?? 0),
          date: String(row.date ?? today),
          existing_count: existing.length,
          newAttachments: [] as Attachment[],
        }, now);
        if (!pendingId) return { handled: true, reply: "เปิดรายการแนบหลักฐานไม่สำเร็จค่ะ", info: "natta:attach pending failed" };
        return {
          handled: true,
          reply: [
            `📎 แนบหลักฐานเพิ่มให้รายการล่าสุด`,
            `${row.description ?? "-"} ${formatBaht(Number(row.amount ?? 0))} บาท`,
            `หลักฐานเดิม: ${existing.length} ไฟล์`,
            "",
            "ส่งรูปสลิปหรือไฟล์เข้ามาในแชทนี้เลยค่ะ (รูปภาพหรือ PDF ไม่เกิน 10MB)",
          ].join("\n"),
          info: "natta:attach existing ready",
        };
      }
      return {
        handled: true,
        reply: "ส่งรูปสลิปหรือไฟล์หลักฐานเข้ามาในแชทนี้เลยค่ะ (รูปภาพหรือ PDF ไม่เกิน 10MB)",
        info: "natta:attach ready",
      };
    }

    /* ------------- ไม่แน่ใจว่ารายรับหรือรายจ่าย → ถามก่อน ไม่เดา ------------ */
    case "ask_type": {
      const pay = (cmd as any).payment as PaymentMethod | undefined;
      const suffix = `${cmd.description} ${cmd.amount}${pay ? ` ${PAYMENT_LABEL[pay]}` : ""}`;
      const askText = [
        `❓ “${cmd.description} ${formatBaht(cmd.amount)} บาท” เป็นรายรับหรือรายจ่ายคะ`,
        "เลือกปุ่มด้านล่าง หรือพิมพ์ว่า “รายรับ ...” / “รายจ่าย ...” ได้เลยค่ะ",
      ].join("\n");
      return {
        handled: true,
        reply: askText,
        flex: nattaFlexMessage({
          title: "ยังไม่แน่ใจว่าเป็นรายรับหรือรายจ่าย",
          tone: "warn",
          altText: askText,
          rows: [
            { label: "รายการ", value: cmd.description },
            { label: "จำนวนเงิน", value: `${formatBaht(cmd.amount)} บาท` },
            ...(pay ? [{ label: "วิธีจ่าย", value: PAYMENT_LABEL[pay] }] : []),
          ],
          note: "ยังไม่บันทึกอะไรลงบัญชีนะคะ",
          buttons: [
            { label: "🟢 รายรับ", text: `รายรับ ${suffix}`, data: `natta:text:รายรับ ${suffix}` },
            { label: "🔴 รายจ่าย", text: `รายจ่าย ${suffix}`, data: `natta:text:รายจ่าย ${suffix}`, style: "secondary" },
            { label: "❌ ไม่บันทึก", text: "ยกเลิก", data: "natta:text:ยกเลิก", style: "secondary" },
          ],
        }),
        info: "natta:ask_type",
      };
    }

    /* ----------------------------- วิธีจ่าย ----------------------------- */
    case "payment_menu": {
      const draft = await loadPending(admin, lineUserId, now);
      const onDraft = draft && (draft.action === "create" || draft.action === "deposit");
      return {
        handled: true,
        reply: onDraft
          ? "เลือกวิธีจ่ายของรายการที่รอยืนยันได้เลยค่ะ: เงินสด / โอน / พร้อมเพย์ / บัตร / e-wallet"
          : "เลือกวิธีจ่ายของรายการล่าสุดได้เลยค่ะ: เงินสด / โอน / พร้อมเพย์ / บัตร / e-wallet",
        flex: nattaFlexMessage({
          title: "💳 เลือกวิธีจ่าย",
          tone: "info",
          altText: "เลือกวิธีจ่าย",
          rows: [{ value: onDraft ? "ใช้กับรายการที่รอยืนยันอยู่ตอนนี้" : "ใช้กับรายการล่าสุดของวันนี้ที่คุณบันทึกไว้" }],
          buttons: paymentButtons(),
        }),
        info: onDraft ? "natta:payment menu draft" : "natta:payment menu",
      };
    }

    case "edit_latest_payment": {
      // ถ้ามีร่างที่ยังไม่ยืนยันอยู่ → แก้วิธีจ่ายในร่าง ไม่ไปแตะรายการเก่า
      const draft = await loadPending(admin, lineUserId, now);
      if (draft && (draft.action === "create" || draft.action === "deposit")) {
        const payload = { ...((draft.payload ?? {}) as Record<string, unknown>), payment: cmd.payment };
        await updatePendingPayload(admin, draft.id, lineUserId, payload);
        if (draft.action === "create") {
          const view = payload as any;
          return {
            handled: true,
            reply: `💳 ตั้งวิธีจ่ายเป็น ${PAYMENT_LABEL[cmd.payment]} แล้วค่ะ\n${reviewText(view)}`,
            flex: buildReviewCard(draft.id, view),
            info: "natta:payment set on draft",
          };
        }
        return {
          handled: true,
          reply: `💳 ตั้งวิธีจ่ายของรายการมัดจำที่รอยืนยันเป็น ${PAYMENT_LABEL[cmd.payment]} แล้วค่ะ\nตอบ “ยืนยัน” เพื่อบันทึก หรือ “ยกเลิก”`,
          info: "natta:payment set on deposit draft",
        };
      }
      const row = await latestTodayTx(admin, lineUserId, today);
      if (!row) return { handled: true, reply: "วันนี้ยังไม่มีรายการที่คุณบันทึกผ่าน LINE ค่ะ", info: "natta:edit none" };
      const pendingId = await savePending(admin, lineUserId, "edit_payment", { id: row.id, payment: cmd.payment }, now);

      return {
        handled: true,
        reply: `จะเปลี่ยนวิธีจ่ายของ “${row.description ?? "-"}” เป็น ${PAYMENT_LABEL[cmd.payment]}\nตอบ “ยืนยัน” เพื่อบันทึก หรือ “ยกเลิก”`,
        flex: nattaFlexMessage({
          title: "ยืนยันเปลี่ยนวิธีจ่าย",
          tone: "warn",
          rows: [
            { label: "รายการ", value: row.description ?? "-" },
            { label: "เดิม", value: paymentLabel(row.payment_method) },
            { label: "ใหม่", value: PAYMENT_LABEL[cmd.payment] },
          ],
          note: "ร่างนี้หมดอายุใน 8 นาที",
          buttons: [
            { label: "✅ ยืนยัน", text: "ยืนยัน", ...(pendingId ? { data: `natta:confirm:${pendingId}` } : {}) },
            { label: "❌ ยกเลิก", text: "ยกเลิก", style: "secondary", ...(pendingId ? { data: `natta:cancel:${pendingId}` } : {}) },
          ],
        }),
        info: "natta:edit payment pending",
      };
    }

    /* --------------------------- สรุปเดือน / หมวด --------------------------- */
    case "summary_month": {
      const month = today.slice(0, 7);
      const { data } = await admin
        .from("film_transactions")
        .select("type, amount")
        .gte("date", `${month}-01`)
        .lte("date", `${month}-31`)
        .is("voided_at", null);
      const rowsM = (data ?? []) as Array<{ type: string; amount: number | string }>;
      const income = rowsM.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
      const expense = rowsM.filter((r) => r.type !== "income").reduce((a, r) => a + Number(r.amount || 0), 0);
      const txt = [
        `📆 สรุปเดือนนี้ (${month})`,
        `รายรับ ${formatBaht(income)} บาท`,
        `รายจ่าย ${formatBaht(expense)} บาท`,
        `คงเหลือ ${formatBaht(income - expense)} บาท`,
      ].join("\n");
      return {
        handled: true,
        reply: txt,
        flex: nattaFlexMessage({
          title: `สรุปเดือนนี้ ${month}`,
          tone: income >= expense ? "income" : "expense",
          altText: txt,
          rows: [
            { label: "รายรับ", value: `${formatBaht(income)} บาท` },
            { label: "รายจ่าย", value: `${formatBaht(expense)} บาท` },
            { label: "คงเหลือ", value: `${formatBaht(income - expense)} บาท` },
            { label: "จำนวนรายการ", value: `${rowsM.length} รายการ` },
          ],
          buttons: afterSaveButtons(),
        }),
        info: "natta:summary month",
      };
    }

    case "category_today": {
      const { data } = await admin
        .from("film_transactions")
        .select("type, amount, category")
        .eq("date", today)
        .is("voided_at", null);
      const rowsC = (data ?? []) as Array<{ type: string; amount: number | string; category: string | null }>;
      const buckets = new Map<string, { income: number; expense: number }>();
      for (const r of rowsC) {
        const key = r.category || "อื่นๆ";
        const cur = buckets.get(key) ?? { income: 0, expense: 0 };
        if (r.type === "income") cur.income += Number(r.amount || 0);
        else cur.expense += Number(r.amount || 0);
        buckets.set(key, cur);
      }
      const list = [...buckets.entries()].sort((a, b) =>
        (b[1].income + b[1].expense) - (a[1].income + a[1].expense));
      const txt = list.length
        ? [`🗂️ สรุปหมวดวันนี้ (${today})`, ...list.map(([k, v]) =>
            `• ${k}: รับ ${formatBaht(v.income)} / จ่าย ${formatBaht(v.expense)}`)].join("\n")
        : `วันนี้ (${today}) ยังไม่มีรายการค่ะ`;
      return {
        handled: true,
        reply: txt,
        flex: nattaFlexMessage({
          title: `สรุปหมวดวันนี้ · ${today}`,
          tone: "info",
          altText: txt,
          rows: list.length
            ? list.slice(0, 10).map(([k, v]) => ({
                label: k,
                value: `รับ ${formatBaht(v.income)} · จ่าย ${formatBaht(v.expense)} บาท`,
              }))
            : [{ value: "วันนี้ยังไม่มีรายการค่ะ" }],
          buttons: afterSaveButtons(),
        }),
        info: "natta:category today",
      };
    }

    /* ------------- เปลี่ยนประเภทของร่างที่รอยืนยัน (ใช้กับสลิปที่อ่านจากรูป) ------------- */
    case "draft_type": {
      const pending = await loadPending(admin, lineUserId, now);
      if (!pending || pending.action !== "create") {
        return { handled: true, reply: "ตอนนี้ไม่มีร่างรอยืนยันค่ะ", info: "natta:draft_type none" };
      }
      const payload = { ...(pending.payload ?? {}), type: cmd.type } as Record<string, any>;
      await updatePendingPayload(admin, pending.id, lineUserId, payload);
      const view = {
        type: payload.type,
        amount: Number(payload.amount ?? 0),
        description: String(payload.description ?? "-"),
        category: String(payload.category ?? "อื่นๆ"),
        note: payload.note,
        date: String(payload.date ?? today),
        attachments: (payload.attachments ?? []) as Attachment[],
        payment: payload.payment ?? null,
      };
      return {
        handled: true,
        reply: reviewText(view),
        flex: buildReviewCard(pending.id, view),
        info: "natta:draft_type updated",
      };
    }

    case "summary_today": {
      const { data } = await admin
        .from("film_transactions")
        .select("type, amount")
        .eq("date", today)
        .is("voided_at", null);
      const rowsS = (data ?? []) as Array<{ type: string; amount: number | string }>;
      const income = rowsS.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
      const expense = rowsS.filter((r) => r.type !== "income").reduce((a, r) => a + Number(r.amount || 0), 0);
      const summaryText = buildSummaryText(rowsS as any[], today);
      return {
        handled: true,
        reply: summaryText,
        flex: nattaFlexMessage({
          title: `สรุปวันนี้ ${today}`,
          tone: income >= expense ? "income" : "expense",
          altText: summaryText,
          rows: [
            { label: "รายรับ", value: `${formatBaht(income)} บาท` },
            { label: "รายจ่าย", value: `${formatBaht(expense)} บาท` },
            { label: "คงเหลือ", value: `${formatBaht(income - expense)} บาท` },
            { label: "จำนวนรายการ", value: `${rowsS.length} รายการ` },
          ],
          buttons: afterSaveButtons(),
        }),
        info: "natta:summary",
      };
    }

    case "list_recent": {
      const { data } = await admin
        .from("film_transactions")
        .select("type, amount, description, category, created_at")
        .is("voided_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      const rows = (data ?? []) as any[];
      const listText = buildListText(rows);
      return {
        handled: true,
        reply: listText,
        flex: nattaFlexMessage({
          title: "📋 รายการล่าสุด",
          tone: "info",
          altText: listText,
          rows: rows.length
            ? rows.slice(0, 8).map((r) => ({
                label: r.type === "income" ? "รายรับ" : "รายจ่าย",
                value: `${r.description ?? "-"} · ${formatBaht(Number(r.amount) || 0)} บาท`,
              }))
            : [{ value: "ยังไม่มีรายการบัญชีในระบบค่ะ" }],
          buttons: afterSaveButtons(),
        }),
        info: "natta:list",
      };
    }

    /* --------------------------- แก้ไขล่าสุด --------------------------- */
    case "edit_latest_menu": {
      const row = await latestTodayTx(admin, lineUserId, today);
      if (!row) return { handled: true, reply: "วันนี้ยังไม่มีรายการที่คุณบันทึกผ่าน LINE ค่ะ", info: "natta:edit none" };
      const count = Array.isArray(row.evidence) ? row.evidence.length : 0;
      return {
        handled: true,
        reply: [
          `✏️ แก้ไขรายการล่าสุด`,
          `${row.description ?? "-"} ${formatBaht(Number(row.amount))} บาท`,
          "เลือก: แก้ยอด / แก้รายละเอียด / แนบหลักฐานเพิ่ม / ยกเลิก",
        ].join("\n"),
        flex: nattaFlexMessage({
          title: "✏️ แก้ไขรายการล่าสุด",
          tone: "warn",
          altText: "เมนูแก้ไขรายการล่าสุด",
          rows: [
            { label: "รายการ", value: row.description ?? "-" },
            { label: "จำนวนเงิน", value: `${formatBaht(Number(row.amount))} บาท` },
            { label: "หลักฐาน", value: count ? `${count} ไฟล์` : "ยังไม่มี" },
            { label: "วันที่", value: String(row.date ?? today) },
          ],
          note: "ทุกการแก้ไขต้องยืนยันอีกครั้งก่อนบันทึก",
          buttons: [
            { label: "แก้ยอด", text: "แก้ล่าสุดเป็น", fillInText: "แก้ล่าสุดเป็น " },
            { label: "แก้รายละเอียด", text: "แก้รายละเอียดล่าสุด", fillInText: "แก้รายละเอียดล่าสุด " },
            { label: "📎 แนบหลักฐานเพิ่ม", text: "แนบหลักฐานเพิ่ม", data: "natta:text:แนบหลักฐานเพิ่ม", style: "secondary" },
            { label: "❌ ยกเลิก", text: "ยกเลิก", data: "natta:text:ยกเลิก", style: "secondary" },
          ],
        }),
        info: "natta:edit menu",
      };
    }

    case "edit_latest": {
      const row = await latestTodayTx(admin, lineUserId, today);
      if (!row) return { handled: true, reply: "วันนี้ยังไม่มีรายการที่คุณบันทึกผ่าน LINE ค่ะ", info: "natta:edit none" };
      const pendingId = await savePending(admin, lineUserId, "edit_amount", { id: row.id, amount: cmd.amount }, now);
      return {
        handled: true,
        reply: `จะแก้ “${row.description ?? "-"}” จาก ${formatBaht(Number(row.amount))} เป็น ${formatBaht(cmd.amount)} บาท\nตอบ “ยืนยัน” เพื่อบันทึก หรือ “ยกเลิก”`,
        flex: nattaFlexMessage({
          title: "ยืนยันการแก้ยอด",
          tone: "warn",
          rows: [
            { label: "รายการ", value: row.description ?? "-" },
            { label: "ยอดเดิม", value: `${formatBaht(Number(row.amount))} บาท` },
            { label: "ยอดใหม่", value: `${formatBaht(cmd.amount)} บาท` },
          ],
          note: "ร่างนี้หมดอายุใน 8 นาที",
          buttons: [
            { label: "✅ ยืนยัน", text: "ยืนยัน", ...(pendingId ? { data: `natta:confirm:${pendingId}` } : {}) },
            { label: "❌ ยกเลิก", text: "ยกเลิก", style: "secondary", ...(pendingId ? { data: `natta:cancel:${pendingId}` } : {}) },
          ],
        }),
        info: "natta:edit pending",
      };
    }

    case "edit_latest_desc": {
      const row = await latestTodayTx(admin, lineUserId, today);
      if (!row) return { handled: true, reply: "วันนี้ยังไม่มีรายการที่คุณบันทึกผ่าน LINE ค่ะ", info: "natta:edit none" };
      const pendingId = await savePending(admin, lineUserId, "edit_desc", { id: row.id, description: cmd.description }, now);
      return {
        handled: true,
        reply: `จะแก้รายละเอียดเป็น “${cmd.description}”\nตอบ “ยืนยัน” เพื่อบันทึก หรือ “ยกเลิก”`,
        flex: nattaFlexMessage({
          title: "ยืนยันการแก้รายละเอียด",
          tone: "warn",
          rows: [
            { label: "เดิม", value: row.description ?? "-" },
            { label: "ใหม่", value: cmd.description },
            { label: "จำนวนเงิน", value: `${formatBaht(Number(row.amount))} บาท` },
          ],
          note: "ร่างนี้หมดอายุใน 8 นาที",
          buttons: [
            { label: "✅ ยืนยัน", text: "ยืนยัน", ...(pendingId ? { data: `natta:confirm:${pendingId}` } : {}) },
            { label: "❌ ยกเลิก", text: "ยกเลิก", style: "secondary", ...(pendingId ? { data: `natta:cancel:${pendingId}` } : {}) },
          ],
        }),
        info: "natta:edit desc pending",
      };
    }

    case "delete_latest": {
      const row = await latestTodayTx(admin, lineUserId, today);
      if (!row) return { handled: true, reply: "วันนี้ยังไม่มีรายการที่คุณบันทึกผ่าน LINE ค่ะ", info: "natta:delete none" };
      const pendingId = await savePending(admin, lineUserId, "void", { id: row.id }, now);
      return {
        handled: true,
        reply: `จะยกเลิกรายการ “${row.description ?? "-"}” ${formatBaht(Number(row.amount))} บาท\nตอบ “ยืนยัน” เพื่อยกเลิกรายการ หรือ “ยกเลิก” เพื่อไม่ทำ`,
        flex: nattaFlexMessage({
          title: "🗑️ ยืนยันยกเลิกรายการล่าสุด",
          tone: "warn",
          rows: [
            { label: "รายการ", value: row.description ?? "-" },
            { label: "จำนวนเงิน", value: `${formatBaht(Number(row.amount))} บาท` },
            { label: "วันที่", value: String(row.date ?? today) },
          ],
          note: "ระบบจะเก็บประวัติไว้ ไม่ลบข้อมูลจริง — ร่างหมดอายุใน 8 นาที",
          buttons: [
            { label: "✅ ยืนยัน", text: "ยืนยัน", ...(pendingId ? { data: `natta:confirm:${pendingId}` } : {}) },
            { label: "❌ ไม่ยกเลิก", text: "ยกเลิก", style: "secondary", ...(pendingId ? { data: `natta:cancel:${pendingId}` } : {}) },
          ],
        }),
        info: "natta:delete pending",
      };
    }

    /* ------------------------- ค้างรับ & ติดตามงาน ------------------------ */
    case "outstanding": {
      const { data } = await admin
        .from("film_orders")
        .select("order_no, customer_name, total, paid_amount, status, payment_status, due_at, is_test, is_draft")
        .neq("payment_status", "paid")
        .order("created_at", { ascending: false })
        .limit(40);
      const rows = ((data ?? []) as any[])
        .filter((o) => !o.is_test && !o.is_draft)
        .map((o) => ({
          ...o,
          outstanding: Math.max(0, Number(o.total || 0) - Number(o.paid_amount || 0)),
        }))
        .filter((o) => o.outstanding > 0)
        .slice(0, 10);
      const totalOut = rows.reduce((a, o) => a + o.outstanding, 0);
      const lines = rows.length
        ? rows.map((o) => `• ${o.order_no} · ${o.customer_name || "-"} · ค้าง ${formatBaht(o.outstanding)} บาท`)
        : ["ไม่มียอดค้างรับค่ะ 🎉"];
      const replyText = ["📌 ค้างรับ & ติดตามงาน", ...lines, "", `รวมค้างรับ: ${formatBaht(totalOut)} บาท`].join("\n");
      return {
        handled: true,
        reply: replyText,
        flex: nattaFlexMessage({
          title: "📌 ค้างรับ & ติดตามงาน",
          tone: totalOut > 0 ? "warn" : "income",
          altText: replyText,
          rows: rows.length
            ? rows.map((o) => ({
                label: o.order_no,
                value: `${o.customer_name || "-"} · ค้าง ${formatBaht(o.outstanding)} บาท`,
              }))
            : [{ value: "ไม่มียอดค้างรับค่ะ 🎉" }],
          note: rows.length ? `รวมค้างรับ ${formatBaht(totalOut)} บาท · รับมัดจำ: พิมพ์ “มัดจำ ${rows[0].order_no} 500”` : undefined,
          buttons: [
            { label: "สรุปวันนี้", text: "สรุปวันนี้", style: "secondary" },
            { label: "รายการล่าสุด", text: "รายการล่าสุด", style: "secondary" },
          ],
        }),
        info: "natta:outstanding",
      };
    }

    /* ------------------------------- ยกเลิกร่าง ------------------------------ */
    case "cancel": {
      const pending = await loadPending(admin, lineUserId, now);
      if (!pending) return { handled: false };
      await admin.from("film_line_pending_actions")
        .update({ consumed_at: now.toISOString() }).eq("id", pending.id);
      return { handled: true, reply: "ยกเลิกแล้วค่ะ ไม่มีอะไรถูกบันทึกลงบัญชี", info: "natta:cancelled" };
    }

    /* ------------------------------- ยืนยันร่าง ----------------------------- */
    case "confirm": {
      const pending = await loadPending(admin, lineUserId, now);
      if (!pending) return { handled: false };
      return await confirmPending(ctx, pending.id, now, today);
    }

    case "deposit_help":
      return { handled: true, reply: NATTA_DEPOSIT_HELP, info: "natta:deposit help" };

    /* -------------------------- มัดจำ → ร่างรอยืนยัน ------------------------- */
    case "deposit": {
      const { data: order } = await admin
        .from("film_orders")
        .select("id, order_no, customer_name, total, paid_amount, is_test")
        .eq("order_no", cmd.orderNo)
        .maybeSingle();
      if (!order || order.is_test) {
        return { handled: true, reply: `ไม่พบงานเลขที่ ${cmd.orderNo} ค่ะ ลองตรวจเลขที่งานอีกครั้งนะคะ`, info: "natta:deposit missing" };
      }
      const outstanding = Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0));
      if (outstanding <= 0) {
        return { handled: true, reply: `งาน ${order.order_no} ชำระครบแล้วค่ะ`, info: "natta:deposit settled" };
      }
      if (cmd.amount > outstanding) {
        return {
          handled: true,
          reply: `ยอดมัดจำเกินยอดคงค้างค่ะ (คงเหลือ ${formatBaht(outstanding)} บาท)`,
          info: "natta:deposit over",
        };
      }
      const pendingId = await savePending(admin, lineUserId, "deposit", {
        order_id: order.id,
        order_no: order.order_no,
        customer_name: order.customer_name ?? null,
        amount: cmd.amount,
        outstanding,
        message_id: ctx.messageId,
      }, now);
      const replyText = [
        `💵 รอยืนยัน — รับมัดจำงาน ${order.order_no}`,
        `ลูกค้า: ${order.customer_name || "-"}`,
        `มัดจำ: ${formatBaht(cmd.amount)} บาท`,
        `คงค้างก่อนรับ: ${formatBaht(outstanding)} บาท`,
        "",
        "ตอบ “ยืนยัน” เพื่อบันทึกมัดจำ หรือ “ยกเลิก”",
      ].join("\n");
      return {
        handled: true,
        reply: replyText,
        flex: nattaFlexMessage({
          title: `รอยืนยัน — รับมัดจำ ${order.order_no}`,
          tone: "warn",
          altText: replyText,
          rows: [
            { label: "ลูกค้า", value: order.customer_name || "-" },
            { label: "มัดจำ", value: `${formatBaht(cmd.amount)} บาท` },
            { label: "คงค้าง", value: `${formatBaht(outstanding)} บาท` },
          ],
          note: "ยังไม่บันทึกการรับเงินนะคะ — ร่างหมดอายุใน 8 นาที",
          buttons: [
            { label: "✅ ยืนยันบันทึก", text: "ยืนยัน", ...(pendingId ? { data: `natta:confirm:${pendingId}` } : {}) },
            { label: "❌ ยกเลิก", text: "ยกเลิก", style: "secondary", ...(pendingId ? { data: `natta:cancel:${pendingId}` } : {}) },
          ],
        }),
        info: "natta:deposit pending",
      };
    }
  }
  return { handled: false };
}

/* --------------------- แจ้งเตือนแอดมิน (กระดิ่งหน้างานและเอกสาร) -------------------- */

/** เขียนแจ้งเตือนให้ทีมงานเห็นบนกระดิ่งหน้า "งานและเอกสาร" (best-effort, ไม่ขัดขวางการบันทึก) */

/* ------------------------------ confirm engine ---------------------------- */

export async function confirmPending(
  ctx: NattaAcctContext,
  pendingId: string,
  now: Date,
  today: string,
): Promise<NattaAcctResult> {
  const { admin, lineUserId } = ctx;
  const pending = await consumePending(admin, pendingId, lineUserId, now);
  if (!pending) {
    return { handled: true, reply: "รายการนี้ถูกยืนยันหรือยกเลิกไปแล้วค่ะ", info: "natta:confirm consumed" };
  }
  if ((pending as any).expired) {
    return { handled: true, reply: "ร่างนี้หมดอายุแล้วค่ะ กรุณาพิมพ์รายการใหม่อีกครั้ง", info: "natta:confirm expired" };
  }
  const payload = (pending.payload ?? {}) as Record<string, any>;

  if (pending.action === "create") {
    const attachments = (payload.attachments ?? []) as Attachment[];
    const fullDescription = payload.note
      ? `${payload.description} (หมายเหตุ: ${payload.note})`
      : payload.description;
    const { error } = await admin.from("film_transactions").insert({
      type: payload.type,
      category: payload.category,
      description: fullDescription,
      amount: payload.amount,
      date: payload.date ?? today,
      source: "line",
      payment_method: payload.payment ?? null,
      evidence: attachments,
      line_user_id: lineUserId,
      // ผูกกับร่าง → ยืนยันซ้ำ/ส่งซ้ำ เขียนได้ครั้งเดียว
      line_message_id: `confirm:${pending.id}`,
      line_webhook_event_id: payload.event_id ?? ctx.eventId,
    });
    if (error) {
      if (String(error.code) === "23505" || String(error.code) === "23505") {
        return { handled: true, info: "natta:add duplicate" };
      }
      return { handled: true, reply: "บันทึกไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ", info: "natta:add failed" };
    }
    const isIncome = payload.type === "income";
    const replyText = [
      isIncome ? "✅ บันทึกแล้ว — รายรับ" : "✅ บันทึกแล้ว — รายจ่าย",
      `${payload.description} ${formatBaht(Number(payload.amount))} บาท`,
      `หมวด: ${payload.category}`,
      attachments.length ? `หลักฐาน: ${attachments.length} ไฟล์` : "",
    ].filter(Boolean).join("\n");
    return {
      handled: true,
      reply: replyText,
      flex: nattaFlexMessage({
        title: "✅ บันทึกแล้ว",
        tone: isIncome ? "income" : "expense",
        altText: replyText,
        rows: [
          { label: "รายการ", value: payload.description || "-" },
          { label: "ประเภท", value: isIncome ? "รายรับ" : "รายจ่าย" },
          { label: "จำนวนเงิน", value: `${formatBaht(Number(payload.amount))} บาท` },
          { label: "หมวด", value: payload.category || "อื่นๆ" },
          { label: "วิธีจ่าย", value: paymentLabel(payload.payment) },
          { label: "หลักฐาน", value: attachments.length ? `${attachments.length} ไฟล์` : "ไม่มี" },
          { label: "วันที่", value: String(payload.date ?? today) },
        ],
        buttons: afterSaveButtons(),
      }),
      info: "natta:add done",
    };
  }

  if (pending.action === "edit_payment") {
    const { error } = await admin
      .from("film_transactions")
      .update({ payment_method: payload.payment })
      .eq("id", payload.id)
      .eq("line_user_id", lineUserId)
      .is("voided_at", null);
    if (error) return { handled: true, reply: "แก้วิธีจ่ายไม่สำเร็จค่ะ", info: "natta:edit payment failed" };
    const label = paymentLabel(payload.payment);
    return {
      handled: true,
      reply: `✅ เปลี่ยนวิธีจ่ายเป็น ${label} แล้วค่ะ`,
      flex: nattaFlexMessage({
        title: "✅ แก้วิธีจ่ายแล้ว",
        tone: "info",
        rows: [{ label: "วิธีจ่าย", value: label }],
        buttons: afterSaveButtons(),
      }),
      info: "natta:edit payment done",
    };
  }

  if (pending.action === "edit_amount") {
    const { error } = await admin
      .from("film_transactions")
      .update({ amount: payload.amount })
      .eq("id", payload.id)
      .eq("line_user_id", lineUserId)
      .is("voided_at", null);
    if (error) return { handled: true, reply: "แก้ไขไม่สำเร็จค่ะ", info: "natta:edit failed" };
    return {
      handled: true,
      reply: `✅ แก้ยอดเป็น ${formatBaht(Number(payload.amount))} บาท แล้วค่ะ`,
      flex: nattaFlexMessage({
        title: "✅ แก้ยอดแล้ว",
        tone: "info",
        rows: [{ label: "ยอดใหม่", value: `${formatBaht(Number(payload.amount))} บาท` }],
        buttons: afterSaveButtons(),
      }),
      info: "natta:edit done",
    };
  }

  if (pending.action === "edit_desc") {
    const { error } = await admin
      .from("film_transactions")
      .update({ description: payload.description })
      .eq("id", payload.id)
      .eq("line_user_id", lineUserId)
      .is("voided_at", null);
    if (error) return { handled: true, reply: "แก้ไขไม่สำเร็จค่ะ", info: "natta:edit desc failed" };
    return {
      handled: true,
      reply: `✅ แก้รายละเอียดเป็น “${payload.description}” แล้วค่ะ`,
      flex: nattaFlexMessage({
        title: "✅ แก้รายละเอียดแล้ว",
        tone: "info",
        rows: [{ label: "รายละเอียด", value: String(payload.description ?? "-") }],
        buttons: afterSaveButtons(),
      }),
      info: "natta:edit desc done",
    };
  }

  if (pending.action === "void") {
    const { error } = await admin
      .from("film_transactions")
      .update({
        voided_at: now.toISOString(),
        voided_by: lineUserId,
        void_reason: VOID_REASON,
      })
      .eq("id", payload.id)
      .eq("line_user_id", lineUserId)
      .is("voided_at", null);
    if (error) return { handled: true, reply: "ยกเลิกรายการไม่สำเร็จค่ะ", info: "natta:void failed" };
    return {
      handled: true,
      reply: "🗑️ ยกเลิกรายการล่าสุดแล้วค่ะ (เก็บประวัติไว้ในระบบ)",
      flex: nattaFlexMessage({
        title: "🗑️ ยกเลิกรายการแล้ว",
        tone: "warn",
        rows: [{ value: "ระบบเก็บประวัติไว้ ไม่ได้ลบข้อมูลจริง" }],
        buttons: afterSaveButtons(),
      }),
      info: "natta:void done",
    };
  }

  if (pending.action === "add_evidence") {
    const newFiles = (payload.newAttachments ?? []) as Attachment[];
    if (!newFiles.length) {
      return { handled: true, reply: "ยังไม่ได้ส่งไฟล์หลักฐานเข้ามาค่ะ", info: "natta:evidence empty" };
    }
    // อ่านรายการซ้ำตอนยืนยัน — ต้องเป็นของผู้ส่งเอง วันนี้ และยังไม่ถูกยกเลิก
    const { data: rows } = await admin
      .from("film_transactions")
      .select("id, evidence, description, amount")
      .eq("id", payload.id)
      .eq("line_user_id", lineUserId)
      .eq("date", today)
      .is("voided_at", null)
      .limit(1);
    const row = (rows ?? [])[0];
    if (!row) return { handled: true, reply: "ไม่พบรายการนี้แล้วค่ะ (อาจถูกยกเลิกหรือข้ามวันไปแล้ว)", info: "natta:evidence missing" };
    const current = Array.isArray(row.evidence) ? (row.evidence as Attachment[]) : [];
    const merged = [...current];
    for (const f of newFiles) {
      if (!merged.some((m) => m.path === f.path)) merged.push(f);
    }
    const { error } = await admin
      .from("film_transactions")
      .update({ evidence: merged })
      .eq("id", row.id)
      .eq("line_user_id", lineUserId)
      .is("voided_at", null);
    if (error) return { handled: true, reply: "แนบหลักฐานไม่สำเร็จค่ะ", info: "natta:evidence failed" };
    return {
      handled: true,
      reply: `📎 แนบหลักฐานเข้ารายการแล้ว (รวม ${merged.length} ไฟล์)`,
      flex: nattaFlexMessage({
        title: "📎 แนบหลักฐานแล้ว",
        tone: "info",
        rows: [
          { label: "รายการ", value: String(row.description ?? "-") },
          { label: "หลักฐานรวม", value: `${merged.length} ไฟล์` },
        ],
        buttons: afterSaveButtons(),
      }),
      info: "natta:evidence done",
    };
  }

  if (pending.action === "deposit") {
    // ตรวจยอดคงค้างอีกครั้งตอนยืนยัน — กันกรณีมีคนรับเงินไปก่อนแล้ว
    const { data: order } = await admin
      .from("film_orders")
      .select("id, order_no, customer_name, total, paid_amount")
      .eq("id", payload.order_id)
      .maybeSingle();
    if (!order) return { handled: true, reply: "ไม่พบงานนี้แล้วค่ะ", info: "natta:deposit missing" };
    const outstanding = Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0));
    if (outstanding <= 0) {
      return { handled: true, reply: `งาน ${order.order_no} ชำระครบแล้วค่ะ ไม่ได้บันทึกมัดจำซ้ำ`, info: "natta:deposit settled" };
    }
    if (Number(payload.amount) > outstanding) {
      return {
        handled: true,
        reply: `ยอดคงค้างเปลี่ยนไปแล้วค่ะ (เหลือ ${formatBaht(outstanding)} บาท) กรุณาพิมพ์ยอดมัดจำใหม่นะคะ`,
        info: "natta:deposit recheck failed",
      };
    }
    const reference = `line:confirm:${pending.id}`;
    const { data: dup } = await admin
      .from("film_order_payments")
      .select("id").eq("reference", reference).maybeSingle();
    if (dup) return { handled: true, info: "natta:deposit duplicate" };
    const { error } = await admin.from("film_order_payments").insert({
      order_id: order.id,
      kind: "deposit",
      amount: payload.amount,
      method: (payload as any).payment ?? "cash",
      reference,
      note: `รับมัดจำผ่าน LINE (${BRAND})`,
      received_by: lineUserId,
    });
    if (error) return { handled: true, reply: "บันทึกมัดจำไม่สำเร็จค่ะ", info: "natta:deposit failed" };
    const left = outstanding - Number(payload.amount);
    const replyText = [
      `✅ บันทึกมัดจำงาน ${order.order_no}`,
      `ลูกค้า: ${order.customer_name || "-"}`,
      `มัดจำ: ${formatBaht(Number(payload.amount))} บาท`,
      `คงเหลือ: ${formatBaht(left)} บาท`,
    ].join("\n");
    return {
      handled: true,
      reply: replyText,
      flex: nattaFlexMessage({
        title: `✅ รับมัดจำงาน ${order.order_no}`,
        tone: "income",
        altText: replyText,
        rows: [
          { label: "ลูกค้า", value: order.customer_name || "-" },
          { label: "มัดจำ", value: `${formatBaht(Number(payload.amount))} บาท` },
          { label: "คงเหลือ", value: `${formatBaht(left)} บาท` },
        ],
        buttons: [
          { label: "ค้างรับ & ติดตามงาน", text: "ค้างรับ" },
          { label: "สรุปวันนี้", text: "สรุปวันนี้", style: "secondary" },
        ],
      }),
      info: "natta:deposit ok",
    };
  }

  return { handled: true, reply: "ไม่มีรายการที่รอยืนยันค่ะ", info: "natta:confirm noop" };
}

/* -------------------------------- postback ------------------------------- */

export async function handleNattaPostback(
  ctx: NattaAcctContext,
  pb: NattaPostback,
): Promise<NattaAcctResult> {
  if (!ctx.isAuthorized) return { handled: true, reply: NATTA_NO_PERMISSION, info: "natta:denied" };
  const now = ctx.now ?? new Date();
  const today = bangkokDate(now);

  if (pb.kind === "text") return await handleNattaAccountant(ctx, pb.text);
  if (pb.kind === "fill") return { handled: true, info: "natta:fill" };

  if (pb.kind === "confirm") return await confirmPending(ctx, pb.pendingId, now, today);

  if (pb.kind === "cancel") {
    const { data } = await ctx.admin
      .from("film_line_pending_actions")
      .update({ consumed_at: now.toISOString() })
      .eq("id", pb.pendingId)
      .eq("line_user_id", ctx.lineUserId)
      .is("consumed_at", null)
      .select("id");
    const ok = ((data ?? []) as any[]).length > 0;
    return {
      handled: true,
      reply: ok ? "ยกเลิกแล้วค่ะ ไม่มีอะไรถูกบันทึกลงบัญชี" : "รายการนี้ถูกยืนยันหรือยกเลิกไปแล้วค่ะ",
      info: ok ? "natta:cancelled" : "natta:cancel consumed",
    };
  }

  if (pb.kind === "attach") {
    const pending = await loadPending(ctx.admin, ctx.lineUserId, now);
    if (!pending || pending.id !== pb.pendingId) {
      return { handled: true, reply: NATTA_ATTACH_NO_DRAFT, info: "natta:attach no draft" };
    }
    return {
      handled: true,
      reply: "ส่งรูปสลิปหรือไฟล์หลักฐานเข้ามาในแชทนี้เลยค่ะ (รูปภาพหรือ PDF ไม่เกิน 10MB)",
      info: "natta:attach ready",
    };
  }
  return { handled: false };
}

/* ------------------------------- attachments ----------------------------- */

/**
 * รับรูป/ไฟล์จากแชท → เก็บลงบัคเก็ตส่วนตัว film-line-attachments
 * แนบได้เฉพาะร่างของผู้ส่งเองที่ยังรอยืนยันอยู่ (create / edit_*)
 */
export async function handleNattaAttachment(
  ctx: NattaAcctContext,
  input: { messageId: string; fileName?: string | null },
): Promise<NattaAcctResult> {
  if (!ctx.isAuthorized) return { handled: true, reply: NATTA_NO_PERMISSION, info: "natta:denied" };
  const now = ctx.now ?? new Date();
  const today = bangkokDate(now);
  const pending = await loadPending(ctx.admin, ctx.lineUserId, now);
  if (!pending || !ATTACHABLE_ACTIONS.includes(pending.action)) {
    // ไม่มีร่างรอยืนยัน → ลองอ่านสลิป/ใบเสร็จจากรูปเป็นร่างให้ (ยังไม่บันทึก)
    return await draftFromReceiptImage(ctx, input, now, today);
  }
  const payloadIn = (pending.payload ?? {}) as Record<string, any>;
  const prev = (payloadIn.attachments ?? []) as Attachment[];
  const stored = await storeLineAttachment(ctx.admin, ctx.lineToken ?? "", {
    messageId: input.messageId,
    sessionId: `acct/${pending.id}`,
    seq: prev.length + 1,
    fileName: input.fileName ?? null,
  });
  if (!stored.ok) {
    const reason = (stored as { reason?: string }).reason ?? "ไม่ทราบสาเหตุ";
    return { handled: true, reply: `แนบไฟล์ไม่สำเร็จ: ${reason}`, info: "natta:attach failed" };
  }
  const newFile = { name: stored.name, path: stored.path };

  // แนบหลักฐานเพิ่มให้รายการที่บันทึกแล้ว — เก็บไว้ในร่างก่อน ยังไม่แตะรายการจริง
  if (pending.action === "add_evidence") {
    const pendingNew = [...((payloadIn.newAttachments ?? []) as Attachment[]), newFile];
    await updatePendingPayload(ctx.admin, pending.id, ctx.lineUserId, {
      ...payloadIn,
      newAttachments: pendingNew,
    });
    const existingCount = Number(payloadIn.existing_count ?? 0);
    return {
      handled: true,
      reply: [
        `📎 รับไฟล์แล้ว ${pendingNew.length} ไฟล์ (ยังไม่บันทึกเข้ารายการ)`,
        `รายการ: ${payloadIn.description ?? "-"} ${formatBaht(Number(payloadIn.amount ?? 0))} บาท`,
        `หลักฐานเดิม: ${existingCount} ไฟล์`,
        "",
        "ตอบ “ยืนยัน” เพื่อแนบเข้ารายการ หรือ “ยกเลิก” เพื่อไม่แนบ",
      ].join("\n"),
      flex: nattaFlexMessage({
        title: "📎 รอยืนยัน — แนบหลักฐานเพิ่ม",
        tone: "info",
        altText: `รอยืนยันแนบหลักฐาน ${pendingNew.length} ไฟล์`,
        rows: [
          { label: "รายการ", value: String(payloadIn.description ?? "-") },
          { label: "จำนวนเงิน", value: `${formatBaht(Number(payloadIn.amount ?? 0))} บาท` },
          { label: "หลักฐานเดิม", value: `${existingCount} ไฟล์` },
          { label: "ไฟล์ใหม่", value: `${pendingNew.length} ไฟล์` },
        ],
        note: "ยังไม่แนบเข้ารายการนะคะ — ส่งไฟล์เพิ่มได้ หรือกดยืนยัน (ร่างหมดอายุใน 8 นาที)",
        buttons: [
          { label: "✅ ยืนยัน", text: "ยืนยัน", data: `natta:confirm:${pending.id}` },
          { label: "❌ ยกเลิก", text: "ยกเลิก", data: `natta:cancel:${pending.id}`, style: "secondary" },
        ],
      }),
      info: "natta:attach evidence pending",
    };
  }

  const attachments = [...prev, newFile];
  const payload: Record<string, any> = { ...payloadIn, attachments };
  await updatePendingPayload(ctx.admin, pending.id, ctx.lineUserId, payload);

  if (pending.action === "create") {
    const view = {
      type: payload.type,
      amount: Number(payload.amount),
      description: String(payload.description ?? "-"),
      category: String(payload.category ?? "อื่นๆ"),
      note: payload.note,
      date: String(payload.date ?? today),
      attachments,
      payment: payload.payment ?? null,
    };
    return {
      handled: true,
      reply: `📎 รับหลักฐานแล้ว ${attachments.length} ไฟล์\n${reviewText(view)}`,
      flex: buildReviewCard(pending.id, view),
      info: "natta:attach stored",
    };
  }
  return {
    handled: true,
    reply: `📎 รับหลักฐานแล้ว ${attachments.length} ไฟล์ — ตอบ “ยืนยัน” เพื่อบันทึกการแก้ไขค่ะ`,
    info: "natta:attach stored",
  };
}

/** มีร่างรอยืนยันอยู่ไหม — ใช้ตัดสินว่ารูป/ไฟล์ที่ส่งเข้ามาเป็นหลักฐานของบัญชีหรือไม่ */
export async function hasOpenNattaDraft(admin: any, lineUserId: string, now: Date = new Date()): Promise<boolean> {
  const pending = await loadPending(admin, lineUserId, now);
  return !!pending && ATTACHABLE_ACTIONS.includes(pending.action);
}


/* --------------------- อ่านสลิป/ใบเสร็จจากรูป → ร่างรอยืนยัน --------------------- */

export async function draftFromReceiptImage(
  ctx: NattaAcctContext,
  input: { messageId: string; fileName?: string | null },
  now: Date,
  today: string,
): Promise<NattaAcctResult> {
  if (!aiConfigured()) {
    return { handled: true, reply: NATTA_ATTACH_NO_DRAFT, info: "natta:attach no draft" };
  }
  const dl = await downloadLineContent(ctx.lineToken ?? "", input.messageId);
  if (!dl.ok || !dl.mime.startsWith("image/")) {
    return { handled: true, reply: NATTA_ATTACH_NO_DRAFT, info: "natta:attach no draft" };
  }
  const read = await extractReceipt(dl.bytes, dl.mime);
  if (!read.ok || !read.data.amount) {
    return {
      handled: true,
      reply: [
        "📎 รับรูปแล้วค่ะ แต่ยังอ่านยอดเงินจากรูปไม่ชัด",
        "พิมพ์รายการพร้อมยอด เช่น “ซื้อกระดาษ 625 โอน” แล้วส่งรูปนี้อีกครั้งเพื่อแนบเป็นหลักฐานได้เลยค่ะ",
      ].join("\n"),
      info: "natta:receipt unreadable",
    };
  }
  const stored = await storeLineAttachment(ctx.admin, ctx.lineToken ?? "", {
    messageId: input.messageId,
    sessionId: `acct/receipt/${input.messageId}`,
    seq: 1,
    fileName: input.fileName ?? null,
  });
  const attachments: Attachment[] = stored.ok ? [{ name: stored.name, path: stored.path }] : [];
  const g = read.data;
  const type = g.type ?? "expense";
  const description = g.description || "สลิป/ใบเสร็จ";
  const payload: Record<string, any> = {
    type,
    amount: g.amount,
    description,
    category: type === "income" ? "อื่นๆ" : "อื่นๆ",
    date: g.date ?? today,
    payment: g.payment_method ?? null,
    attachments,
    from_image: true,
    message_id: input.messageId,
    event_id: ctx.eventId,
  };
  const pendingId = await savePending(ctx.admin, ctx.lineUserId, "create", payload, now);
  if (!pendingId) return { handled: true, reply: "เปิดรายการรอยืนยันไม่สำเร็จค่ะ", info: "natta:receipt pending failed" };
  const view = { ...payload, amount: Number(payload.amount) } as any;
  const card: any = buildReviewCard(pendingId, view);
  return {
    handled: true,
    reply: [
      "🧾 อ่านสลิปให้แล้วค่ะ (ยังไม่บันทึก)",
      reviewText(view),
      g.type ? "" : "ถ้าเป็นรายรับ พิมพ์ “ประเภทรายรับ” ได้เลยค่ะ",
    ].filter(Boolean).join("\n"),
    flex: card,
    info: "natta:receipt draft",
  };
}

/* ------------------------- ข้อความเสียงใน LINE ------------------------- */

export async function handleNattaAudio(
  ctx: NattaAcctContext,
  input: { messageId: string },
): Promise<NattaAcctResult> {
  if (!ctx.isAuthorized) return { handled: true, reply: NATTA_NO_PERMISSION, info: "natta:denied" };
  if (!aiConfigured()) {
    return {
      handled: true,
      reply: "ตอนนี้ยังฟังข้อความเสียงไม่ได้ค่ะ พิมพ์รายการมาได้เลย เช่น “ขายรูป 360 เงินสด”",
      info: "natta:audio unconfigured",
    };
  }
  const dl = await downloadLineContent(ctx.lineToken ?? "", input.messageId);
  if (!dl.ok) {
    return { handled: true, reply: "โหลดไฟล์เสียงไม่สำเร็จค่ะ ลองพิมพ์รายการแทนได้นะคะ", info: "natta:audio download failed" };
  }
  const tr = await transcribeAudio(dl.bytes, dl.mime);
  if (!tr.ok) {
    const why = (tr as { reason?: string }).reason ?? "ถอดเสียงไม่สำเร็จ";
    return { handled: true, reply: `${why} — พิมพ์รายการมาได้เลยค่ะ เช่น “ขายรูป 360 เงินสด”`, info: "natta:audio failed" };
  }
  const res = await handleNattaAccountant({ ...ctx, messageId: input.messageId }, tr.text);
  if (!res.handled) {
    return {
      handled: true,
      reply: [`🎧 ได้ยินว่า: “${tr.text}”`, "ยังจับรายการไม่ได้ค่ะ ลองพูด/พิมพ์แบบนี้ดูนะคะ เช่น “ขายรูป 360 เงินสด”"].join("\n"),
      info: "natta:audio unparsed",
    };
  }
  return { ...res, reply: `🎧 ได้ยินว่า: “${tr.text}”\n\n${res.reply ?? ""}`.trim(), info: `${res.info ?? ""} (audio)` };
}
