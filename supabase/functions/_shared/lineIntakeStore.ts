/**
 * Film Shop — LINE intake persistence layer.
 *
 * Talks to Supabase/LINE for the conversational job intake. All pure decision
 * logic lives in `lineIntakeFlow.ts`; this module only reads/writes rows,
 * downloads attachments server-side into a PRIVATE bucket and enqueues admin
 * notifications through the existing outbox (retry + backoff + dead-letter is
 * handled by notify-dispatch — we never push directly from here).
 */
import {
  emptySession, rateWindowStart, isRateLimited, validateAttachment, safeAttachmentName,
  type IntakeSession,
} from "./lineIntakeFlow.ts";

export const ATTACHMENT_BUCKET = "film-line-attachments";

/* ------------------------------ rate limiting ---------------------------- */

export async function hitRateLimit(admin: any, lineUserId: string, now = new Date()): Promise<boolean> {
  const window_start = rateWindowStart(now);
  try {
    const { data } = await admin.from("film_line_rate_limits")
      .select("id,hits").eq("line_user_id", lineUserId).eq("window_start", window_start).maybeSingle();
    if (!data) {
      await admin.from("film_line_rate_limits").insert({ line_user_id: lineUserId, window_start, hits: 1 });
      return false;
    }
    const hits = Number(data.hits) + 1;
    await admin.from("film_line_rate_limits").update({ hits }).eq("id", data.id);
    return isRateLimited(hits);
  } catch (e) {
    console.warn("rate limit check failed", String((e as Error)?.message || e));
    return false; // fail-open: ห้ามให้ระบบรับงานล่มเพราะตัวนับ
  }
}

/* --------------------------------- session ------------------------------- */

function toSession(row: any): IntakeSession & { id: string } {
  return {
    id: row.id,
    state: row.state,
    status: row.status,
    isTest: !!row.is_test,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    items: Array.isArray(row.items) ? row.items : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    dueAt: row.due_at ?? null,
    notes: row.notes ?? null,
  };
}

export async function loadOpenSession(admin: any, lineUserId: string) {
  const { data } = await admin.from("film_line_intake_sessions")
    .select("*").eq("line_user_id", lineUserId).eq("status", "draft")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toSession(data) : null;
}

export async function loadSessionById(admin: any, id: string) {
  const { data } = await admin.from("film_line_intake_sessions").select("*").eq("id", id).maybeSingle();
  return data ? toSession(data) : null;
}

export async function persistSession(
  admin: any,
  session: IntakeSession & { id?: string },
  ctx: { lineUserId: string; storeId: string; sourceType?: string; roomId?: string | null; displayName?: string | null; eventId?: string | null },
): Promise<IntakeSession & { id: string }> {
  const row = {
    store_id: ctx.storeId,
    line_user_id: ctx.lineUserId,
    source_type: ctx.sourceType ?? "user",
    line_room_id: ctx.roomId ?? null,
    display_name: ctx.displayName ?? null,
    state: session.state,
    status: session.status,
    is_test: session.isTest,
    customer_name: session.customerName,
    customer_phone: session.customerPhone,
    items: session.items,
    attachments: session.attachments,
    due_at: session.dueAt,
    notes: session.notes,
    last_event_id: ctx.eventId ?? null,
  };
  if (session.id) {
    const { data } = await admin.from("film_line_intake_sessions").update(row).eq("id", session.id).select("*").maybeSingle();
    return data ? toSession(data) : { ...session, id: session.id };
  }
  const { data, error } = await admin.from("film_line_intake_sessions").insert(row).select("*").single();
  if (error) throw new Error(`intake session insert failed: ${error.message}`);
  return toSession(data);
}

export function newSession(isTest: boolean): IntakeSession {
  return emptySession(isTest);
}

/* ------------------------------- attachments ----------------------------- */

/**
 * ดาวน์โหลดไฟล์จาก LINE ฝั่งเซิร์ฟเวอร์ ตรวจชนิด/ขนาด แล้วเก็บใน bucket ส่วนตัว
 * ไม่ log token และไม่คืน URL สาธารณะ
 */
export async function storeLineAttachment(
  admin: any,
  token: string,
  input: { messageId: string; sessionId: string; seq: number; fileName?: string | null },
): Promise<{ ok: true; name: string; path: string } | { ok: false; reason: string }> {
  if (!token) return { ok: false, reason: "ยังไม่ได้ตั้งค่า LINE access token" };
  let res: Response;
  try {
    res = await fetch(`https://api-data.line.me/v2/bot/message/${input.messageId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, reason: "ดาวน์โหลดไฟล์จาก LINE ไม่สำเร็จ" };
  }
  if (!res.ok) return { ok: false, reason: `ดาวน์โหลดไฟล์ไม่สำเร็จ (${res.status})` };
  const mime = (res.headers.get("content-type") || "").split(";")[0];
  const buf = new Uint8Array(await res.arrayBuffer());
  const check = validateAttachment({ mime, bytes: buf.byteLength });
  if (!check.ok) return { ok: false, reason: (check as { reason?: string }).reason ?? "ไฟล์ไม่ถูกต้อง" };

  const name = safeAttachmentName(input.fileName, mime, input.seq);
  const path = `${input.sessionId}/${name}`;
  const { error } = await admin.storage.from(ATTACHMENT_BUCKET).upload(path, buf, { contentType: mime, upsert: true });
  if (error) return { ok: false, reason: "บันทึกไฟล์ไม่สำเร็จ" };
  return { ok: true, name, path };
}

/** signed URL อายุสั้นสำหรับหน้าจอพนักงานเท่านั้น */
export async function signedAttachmentUrl(admin: any, path: string, seconds = 900): Promise<string | null> {
  const { data } = await admin.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/* --------------------------------- confirm ------------------------------- */

const DEPT_BY_CATEGORY: Record<string, string> = {
  stationery: "front",
  sign: "sign",
  photo: "photo",
  doc: "doc",
  print: "print",
  other: "front",
};

export interface ConfirmResult {
  duplicate: boolean;
  orderId: string;
  orderNo: string;
  jobs: { jobNo: string; title: string; status: string }[];
}

/**
 * ยืนยันใบรับงานชั่วคราว → สร้างออเดอร์ 1 ใบ + งานย่อยตามจำนวนรายการ แล้วเรียก
 * film_confirm_order (idempotent) เพื่อ auto-route ฝ่าย/priority/คิว
 */
export async function confirmIntakeSession(
  admin: any,
  session: IntakeSession & { id: string },
): Promise<ConfirmResult> {
  // กดยืนยันซ้ำ: ใช้ออเดอร์เดิม ไม่สร้างใหม่
  const { data: existing } = await admin.from("film_line_intake_sessions")
    .select("order_id, order_no, status").eq("id", session.id).maybeSingle();
  if (existing?.order_id) {
    const jobs = await loadJobs(admin, existing.order_id);
    return { duplicate: true, orderId: existing.order_id, orderNo: existing.order_no ?? "", jobs };
  }

  const { data: orderNoRaw } = await admin.rpc("film_next_order_number");
  const orderNo = typeof orderNoRaw === "string" && orderNoRaw ? orderNoRaw : `OR-${Date.now().toString().slice(-8)}`;

  const attachments = session.attachments.map((a) => ({ name: a.name, path: a.path }));
  const { data: order, error: oErr } = await admin.from("film_orders").insert({
    order_no: orderNo,
    customer_name: session.customerName || "ลูกค้า LINE",
    customer_phone: session.customerPhone,
    channel: "line",
    title: session.items[0]?.title || "งานจาก LINE",
    due_at: session.dueAt,
    is_urgent: false,
    status: "in_progress",
    payment_status: "unpaid",
    subtotal: 0, discount: 0, deposit: 0, total: 0,
    notes: session.notes,
    is_draft: false,
    is_test: session.isTest,
  }).select("id, order_no").single();
  if (oErr || !order) throw new Error(`สร้างออเดอร์ไม่สำเร็จ: ${oErr?.message}`);

  for (const [idx, it] of session.items.entries()) {
    await admin.from("film_order_items").insert({
      order_id: order.id,
      description: [it.title, it.size].filter(Boolean).join(" "),
      title: it.title,
      category: it.category,
      size: it.size,
      quantity: it.quantity,
      unit: "ชิ้น",
      unit_price: 0, cost_price: 0, total: 0,
      notes: it.note,
      dept: DEPT_BY_CATEGORY[it.category] ?? "front",
      is_outsourced: it.outsource,
      due_at: session.dueAt,
      attachments: idx === 0 ? attachments : [],
      sort_order: idx,
    });
  }

  const { error: cErr } = await admin.rpc("film_confirm_order", { p_order_id: order.id });
  if (cErr) throw new Error(`เข้าคิวไม่สำเร็จ: ${cErr.message}`);

  await admin.from("film_order_events").insert({
    order_id: order.id,
    to_status: "in_progress",
    note: `รับงานผ่าน LINE OA (${session.items.length} รายการ)${session.isTest ? " [TEST]" : ""}`,
  });

  await admin.from("film_line_intake_sessions").update({
    status: "confirmed", state: "review", order_id: order.id, order_no: order.order_no,
  }).eq("id", session.id);

  return { duplicate: false, orderId: order.id, orderNo: order.order_no, jobs: await loadJobs(admin, order.id) };
}

async function loadJobs(admin: any, orderId: string) {
  const { data } = await admin.from("film_order_jobs")
    .select("job_no,title,status").eq("order_id", orderId).order("job_no");
  return (data ?? []).map((j: any) => ({ jobNo: j.job_no ?? "-", title: j.title ?? "", status: j.status ?? "" }));
}

/* ------------------------------ notifications ---------------------------- */

/**
 * แจ้งห้องแอดมินที่ active ทุกห้อง ผ่าน notification_outbox
 * (ถ้ายังไม่มีห้อง/ยังไม่ตั้งค่า token งานจะค้างเป็น pending ไม่ทำให้ระบบร้านพัง)
 */
export async function notifyAdminRooms(
  admin: any,
  input: {
    storeId: string;
    eventType: string;
    refId?: string | null;
    text: string;
    url?: string | null;
    idemSuffix: string;
    /** ห้องปลายทาง: admin_group = แจ้งเตือนออเดอร์, queue_group = NATTA.Q รันคิว */
    channelType?: "admin_group" | "queue_group";
  },
): Promise<{ queued: number; setupRequired: boolean }> {
  const wanted = input.channelType ?? "admin_group";
  let rooms: any[] = [];
  try {
    const { data } = await admin.from("line_notification_channels")
      .select("id, line_destination_id")
      .eq("store_id", input.storeId).eq("channel_type", wanted).eq("is_active", true);
    rooms = data ?? [];
    // กลุ่มรันคิวยังไม่ได้ตั้ง → ส่งเข้ากลุ่มแจ้งเตือนออเดอร์แทน (ไม่ทำให้แจ้งเตือนหาย)
    if (rooms.length === 0 && wanted !== "admin_group") {
      const { data: fb } = await admin.from("line_notification_channels")
        .select("id, line_destination_id")
        .eq("store_id", input.storeId).eq("channel_type", "admin_group").eq("is_active", true);
      rooms = fb ?? [];
    }
    // แจ้งเตือนเฉพาะ "ห้องกลุ่ม" เท่านั้น (C/R) — ไม่ส่งเข้าแชทส่วนตัวของ OA (U...)
    rooms = rooms.filter((r: any) => /^[CR]/.test(String(r?.line_destination_id ?? "")));
  } catch (e) {
    console.warn("load admin rooms failed", String((e as Error)?.message || e));
  }
  if (rooms.length === 0) return { queued: 0, setupRequired: true };

  let queued = 0;
  for (const r of rooms) {
    try {
      await admin.rpc("notification_outbox_enqueue", {
        p_event_type: input.eventType,
        p_ref_type: "film_order",
        p_ref_id: input.refId ?? null,
        p_recipient: r.line_destination_id,
        p_payload: { text: input.text, url: input.url ?? null, store_id: input.storeId },
        p_idempotency_key: `film_line:${input.eventType}:${input.idemSuffix}:${r.id}`,
        p_channel: "line",
        p_binding_id: null,
      });
      queued += 1;
    } catch (e) {
      console.warn("enqueue admin notification failed", String((e as Error)?.message || e));
    }
  }
  return { queued, setupRequired: false };
}

/* -------------------------------- lookups -------------------------------- */

export async function lookupJob(admin: any, code: string) {
  const { data: job } = await admin.from("film_order_jobs")
    .select("job_no,title,status,stage,film_orders(order_no,due_at,customer_name)")
    .eq("job_no", code).maybeSingle();
  if (job) return job;
  const { data: order } = await admin.from("film_orders")
    .select("order_no,due_at,customer_name,status").eq("order_no", code).maybeSingle();
  return order ? { order_only: true, ...order } : null;
}
