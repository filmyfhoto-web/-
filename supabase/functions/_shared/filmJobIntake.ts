/**
 * Film Shop — LINE job intake.
 *
 * Records every incoming customer job message as a film_job_requests row
 * (idempotent on the LINE event id / message id), parses it
 * deterministically, and only auto-creates a film_order when nothing is
 * missing. Replies are prepared as drafts — never sent automatically.
 */
import {
  parseFilmJobMessage,
  intakeStatusFor,
  buildDraftReply,
} from "./filmJobParser.ts";

export interface IntakeInput {
  eventId?: string | null;
  messageId?: string | null;
  lineUserId?: string | null;
  displayName?: string | null;
  /** Which LINE OA (shop) the message arrived on. */
  channelId?: string | null;
  text: string;
  now?: Date;
}

export interface IntakeResult {
  duplicate: boolean;
  requestId?: string;
  intakeStatus: string;
  orderId?: string | null;
  orderNo?: string | null;
  missing: string[];
}

function bkkText(iso?: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 7 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`;
}

export async function ingestFilmJobMessage(admin: any, input: IntakeInput): Promise<IntakeResult> {
  const now = input.now ?? new Date();
  const parsed = parseFilmJobMessage(input.text, now);
  const intakeStatus = intakeStatusFor(parsed);

  // --- idempotency: LINE retries the same event/message id
  const dedupKeys = [input.eventId, input.messageId].filter(Boolean) as string[];
  if (dedupKeys.length) {
    const or = [
      input.eventId ? `line_event_id.eq.${input.eventId}` : "",
      input.messageId ? `line_message_id.eq.${input.messageId}` : "",
    ].filter(Boolean).join(",");
    const { data: existing } = await admin
      .from("film_job_requests")
      .select("id,intake_status,linked_order_id,missing_fields")
      .or(or)
      .maybeSingle();
    if (existing) {
      return {
        duplicate: true,
        requestId: existing.id,
        intakeStatus: existing.intake_status,
        orderId: existing.linked_order_id,
        missing: existing.missing_fields ?? [],
      };
    }
  }

  const customerName = parsed.customerName || input.displayName || "ลูกค้า LINE";
  const row = {
    title: parsed.title || (parsed.isJobRequest ? "งานจาก LINE" : "ข้อความจาก LINE"),
    description: input.text.slice(0, 4000),
    raw_text: input.text.slice(0, 4000),
    customer_name: customerName,
    quantity: parsed.quantity ?? null,
    job_type: parsed.jobType ?? null,
    size_text: parsed.sizeText ?? null,
    has_design: parsed.hasDesign ?? null,
    is_urgent: parsed.isUrgent,
    requested_due_at: parsed.dueAtISO ?? null,
    notes: parsed.notes ?? null,
    source: "line",
    status: "new",
    intake_status: intakeStatus,
    parsed: { ...(parsed as unknown as Record<string, unknown>), channel_id: input.channelId ?? null },
    missing_fields: parsed.missing,
    line_event_id: input.eventId ?? null,
    line_message_id: input.messageId ?? null,
    line_user_id: input.lineUserId ?? null,
    line_display_name: input.displayName ?? null,
    received_at: now.toISOString(),
    draft_reply: buildDraftReply({ missing: parsed.missing }),
  };

  const { data: req, error: reqErr } = await admin
    .from("film_job_requests")
    .insert(row)
    .select("id")
    .single();
  if (reqErr || !req) {
    // Unique-index race: another retry inserted the same event first.
    if (String(reqErr?.code) === "23505") {
      return { duplicate: true, intakeStatus, missing: parsed.missing };
    }
    throw new Error(`film job request insert failed: ${reqErr?.message}`);
  }

  if (intakeStatus !== "ready") {
    return { duplicate: false, requestId: req.id, intakeStatus, missing: parsed.missing };
  }

  // --- auto-create the order (all required data present)
  let orderNo = "";
  const { data: nextNo } = await admin.rpc("film_next_order_number");
  orderNo = typeof nextNo === "string" && nextNo ? nextNo : `OR-${Date.now().toString().slice(-8)}`;

  const status = parsed.hasDesign ? "waiting_print" : "waiting_design";
  const { data: order, error: oErr } = await admin
    .from("film_orders")
    .insert({
      order_no: orderNo,
      customer_name: customerName || "",
      channel: "line",
      title: parsed.title || "งานจาก LINE",
      due_at: parsed.dueAtISO ?? null,
      is_urgent: parsed.isUrgent,
      has_design: !!parsed.hasDesign,
      status,
      payment_status: "unpaid",
      subtotal: 0,
      discount: 0,
      deposit: 0,
      total: 0,
      notes: parsed.notes ?? null,
      is_draft: false,
      source_job_request_id: req.id,
    })
    .select("id,order_no")
    .single();
  if (oErr || !order) {
    await admin.from("film_job_requests")
      .update({ intake_status: "needs_review", missing_fields: ["สร้างออเดอร์อัตโนมัติไม่สำเร็จ"] })
      .eq("id", req.id);
    return { duplicate: false, requestId: req.id, intakeStatus: "needs_review", missing: ["สร้างออเดอร์อัตโนมัติไม่สำเร็จ"] };
  }

  const { data: item } = await admin
    .from("film_order_items")
    .insert({
      order_id: order.id,
      description: [parsed.title, parsed.sizeText].filter(Boolean).join(" ") || "งานจาก LINE",
      quantity: parsed.quantity ?? 1,
      unit: parsed.unit || "ชิ้น",
      unit_price: 0,
      total: 0,
      sort_order: 0,
    })
    .select("id")
    .single();

  // Standard duration per job type (falls back to "other").
  const { data: durations } = await admin
    .from("film_job_type_durations")
    .select("job_type,setup_minutes,minutes_per_unit");
  const d = (durations ?? []).find((x: any) => x.job_type === (parsed.jobType || "")) ||
    (durations ?? []).find((x: any) => x.job_type === "other");
  const estimated = Math.max(
    5,
    Math.round((d?.setup_minutes ?? 15) + Number(d?.minutes_per_unit ?? 10) * Math.max(1, parsed.quantity ?? 1)),
  );

  // สถานะงานย่อยตามต้นแบบ: มีไฟล์ออกแบบแล้ว → รอตรวจสอบออเดอร์, ยังไม่มี → รอคิวออกแบบ
  const jobStatus = parsed.hasDesign ? "order_review" : "design_queue";

  await admin.from("film_order_jobs").insert({
    order_id: order.id,
    order_item_id: item?.id ?? null,
    title: parsed.title || "งานจาก LINE",
    status: jobStatus,
    sort_order: 0,
    job_type: parsed.jobType ?? null,
    quantity: parsed.quantity ?? 1,
    estimated_minutes: estimated,
    priority: parsed.isUrgent ? 10 : 100,
  });

  await admin.from("film_order_events").insert({
    order_id: order.id,
    to_status: status,
    note: [
      `รับงานจาก LINE เมื่อ ${bkkText(now.toISOString())} (เวลาไทย)`,
      input.displayName ? `ผู้ส่ง: ${input.displayName}` : "",
      "",
      "ข้อความต้นฉบับ:",
      input.text.slice(0, 1500),
    ].filter(Boolean).join("\n"),
  });

  await admin.from("film_job_requests").update({
    intake_status: "created",
    linked_order_id: order.id,
    draft_reply: buildDraftReply({ orderNo: order.order_no, finishAtText: bkkText(parsed.dueAtISO) }),
  }).eq("id", req.id);

  return {
    duplicate: false,
    requestId: req.id,
    intakeStatus: "created",
    orderId: order.id,
    orderNo: order.order_no,
    missing: [],
  };
}
