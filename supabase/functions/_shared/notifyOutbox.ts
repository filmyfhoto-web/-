// Central enqueue helper. EVERY order-related LINE message is queued here and
// delivered later by `notify-dispatch`. Nothing in the browser is allowed to
// push to LINE, and nothing else may call the LINE push API for order events.

export type OutboxEvent = {
  event_type: string;
  ref_type?: string;
  ref_id?: string | null;
  recipient: string | null;
  text: string;
  /** Extra bits carried to the dispatcher (e.g. legacy log row id). */
  meta?: Record<string, unknown>;
  /** Distinguishes the same event sent to admin vs customer. */
  audience?: "admin" | "customer";
  /** Order status / document version that makes this event unique. */
  version?: string | null;
  created_by?: string | null;
  client_request_id?: string | null;
  binding_id?: string | null;
  channel?: string;
  /** Explicit identity, used by the order-event contract. */
  idempotency_key?: string | null;
};

/**
 * Deterministic idempotency key: ref + event + version/status + recipient.
 * The same logical event replayed (webhook retry, realtime reconnect, double
 * click, duplicate callback) always produces the same key, and the unique
 * index on `notification_outbox.idempotency_key` collapses it to one row.
 */
export function buildIdempotencyKey(e: OutboxEvent): string {
  return [
    e.ref_type || "order",
    e.ref_id || "none",
    e.event_type,
    e.version || "",
    e.audience || "",
    e.recipient || "none",
  ]
    .join(":")
    .slice(0, 200);
}

/**
 * GROUP-ONLY POLICY — เหตุการณ์ออเดอร์/ใบเขียนเบิก/ใบสั่งซื้อ ที่ส่งถึงทีมงาน
 * ต้องมีปลายทางเป็นกลุ่ม LINE (C…/R…) เท่านั้น ห้าม fan-out เข้าแชทส่วนตัว
 * (ฐานข้อมูลมี trigger บล็อกไว้อีกชั้น)
 */
const GROUP_ONLY_ADMIN_EVENTS = new Set([
  "order_created",
  "order_status_changed",
  "requisition_submitted",
  "po_review_confirmed",
  "po_review_revision",
]);

export function violatesGroupOnlyPolicy(e: OutboxEvent): boolean {
  if ((e.channel || "line") !== "line") return false;
  if (e.audience !== "admin") return false;
  if (!GROUP_ONLY_ADMIN_EVENTS.has(e.event_type)) return false;
  return !/^[CR][0-9a-f]{10,}$/i.test(String(e.recipient || ""));
}

export async function enqueueNotification(admin: any, e: OutboxEvent) {
  const key = e.idempotency_key || buildIdempotencyKey(e);
  if (violatesGroupOnlyPolicy(e)) {
    console.error("[outbox] group_only_policy_blocked", e.event_type, String(e.recipient || "").slice(0, 6));
    return { queued: false, error: "group_only_policy", idempotency_key: key };
  }
  const { data, error } = await admin.rpc("notification_outbox_enqueue", {
    p_event_type: e.event_type,
    p_ref_type: e.ref_type || "order",
    p_ref_id: e.ref_id || null,
    p_recipient: e.recipient,
    p_payload: {
      text: String(e.text || "").slice(0, 4900),
      ...(e.audience ? { audience: e.audience } : {}),
      ...(e.meta || {}),
    },
    p_idempotency_key: key,
    p_channel: e.channel || "line",
    p_binding_id: e.binding_id || null,
    p_created_by: e.created_by || null,
    p_client_request_id: e.client_request_id || null,
  });

  if (error) {
    console.error("[outbox] enqueue_failed", error.message);
    return { queued: false, error: error.message, idempotency_key: key };
  }
  return { queued: true, id: data as string | null, idempotency_key: key };
}

/**
 * Nudge the dispatcher so a freshly queued message goes out in seconds
 * instead of waiting for the next cron tick. Fire-and-forget and always
 * safe: the worker claims jobs atomically, so a concurrent cron run can
 * never send the same row twice.
 */
export async function kickDispatch(admin: any) {
  try {
    // Guarded lookup: this module is also imported by Vitest (node) tests,
    // where `Deno` does not exist. Runtime behaviour in edge functions is
    // unchanged.
    const env = (globalThis as any).Deno?.env;
    const url = env?.get?.("SUPABASE_URL");
    const key = env?.get?.("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const { data } = await admin
      .from("internal_worker_tokens")
      .select("token")
      .eq("name", "notify_dispatch")
      .maybeSingle();
    if (!data?.token) return;
    await fetch(`${url}/functions/v1/notify-dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env?.get?.("SUPABASE_ANON_KEY") || "",
        "x-worker-token": data.token,
      },
      body: JSON.stringify({ action: "drain", limit: 20, source: "kick" }),
    });
  } catch (e) {
    // Never fail the caller because of a nudge — cron picks the job up.
    console.warn("[outbox] kick_failed", String((e as Error)?.message || e));
  }
}