// Central notification dispatcher.
//
// This is the ONLY place that pushes LINE messages for order events. Jobs are
// claimed atomically from `public.notification_outbox` (FOR UPDATE SKIP
// LOCKED) so several concurrent invocations can never send the same row
// twice, and each row's `idempotency_key` guarantees one event = one message.
//
// Modes (POST body):
//   { action: "drain", limit?: number }   – cron worker token OR owner/admin
//   { action: "enqueue", ... }            – staff: queue a deliberate resend
//
// Duplicate protection is two-layered:
//   1. DB — `idempotency_key` makes one event exactly one row.
//   2. Provider — every push carries `X-Line-Retry-Key` set to the row's UUID,
//      identical on the first try and every retry. If the first request
//      actually reached LINE but the response was lost (timeout), the retry
//      comes back 409 and LINE does NOT deliver a second message. DB
//      idempotency alone cannot protect against that case.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveLineToken, resolveStoreLineToken } from "../_shared/lineToken.ts";
import { pushLineText, type PushResult } from "../_shared/linePush.ts";
import { callerKey, checkRateLimit, tooManyRequests } from "../_shared/rateLimit.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Delivery goes through the one shared provider adapter. Re-exported so the
 *  contract tests can drive it with a stubbed fetch. */
export const pushLine = (
  token: string,
  to: string,
  text: string,
  retryKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> => pushLineText(token, to, text, retryKey, fetchImpl);
export type { PushResult };

/** Channel used by the admin self-test: the worker simulates delivery and
 *  never touches LINE, so a health check can never message a real customer. */
export const SELFTEST_CHANNEL = "test";
/** ref_type used by every self-test row so the UI can hide them. */
export const SELFTEST_REF_TYPE = "system_self_test";

/** Service-role client type — avoids `any` while staying schema-agnostic. */
type Admin = ReturnType<typeof createClient>;

type OutboxJob = {
  id: string;
  recipient: string | null;
  channel: string | null;
  payload: { text?: string; log_id?: string } | null;
};

async function isStaff(admin: Admin, uid: string): Promise<boolean> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", uid);
  return (data ?? []).some((r: { role?: string }) => r.role === "owner" || r.role === "admin");
}

/** Cron/internal caller proof — a random token stored in the database and
 *  readable only by service_role and the cron job owner. */
async function hasWorkerToken(admin: Admin, req: Request): Promise<boolean> {
  const presented = req.headers.get("x-worker-token") || "";
  if (!presented) return false;
  const { data } = await admin
    .from("internal_worker_tokens").select("token").eq("name", "notify_dispatch").maybeSingle();
  const expected = String(data?.token || "");
  if (!expected || presented.length !== expected.length) return false;
  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
  return diff === 0;
}

async function authUser(admin: Admin, req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const supa = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: claims, error } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
  const uid = claims?.claims?.sub as string | undefined;
  return error || !uid ? null : uid;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  // Edge-level throttle on top of the per-user DB rate check below: blunts
  // repeated drain/enqueue calls from one caller (60 requests / minute).
  const gate = checkRateLimit(callerKey(req, "notify-dispatch"), { limit: 60, windowMs: 60_000 });
  if (!gate.ok) return tooManyRequests(gate, cors);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "drain");

    if (action === "enqueue") {
      // Deliberate, staff-initiated resend. Creates a NEW event row rather
      // than replaying an old one, so history stays auditable.
      const uid = await authUser(admin, req);
      if (!uid) return json({ error: "unauthorized" }, 401);
      if (!(await isStaff(admin, uid))) return json({ error: "forbidden" }, 403);

      const { data: rateOk } = await admin.rpc("notification_manual_rate_ok", {
        p_user_id: uid, p_max: 10, p_window_seconds: 60,
      });
      if (rateOk === false) return json({ error: "rate_limited" }, 429);

      // The recipient is NEVER taken from the client. The caller may only
      // point at an existing outbox row; everything that decides where the
      // message goes is re-read from the server-side row.
      const outboxId = body?.outbox_id ? String(body.outbox_id) : null;
      if (!outboxId) return json({ error: "missing_fields" }, 400);
      const { data: src, error: srcErr } = await admin
        .from("notification_outbox")
        .select("id, ref_type, ref_id, recipient, channel, payload")
        .eq("id", outboxId)
        .maybeSingle();
      if (srcErr) return json({ error: srcErr.message }, 500);
      if (!src) return json({ error: "outbox_row_not_found" }, 404);
      const recipient = String((src as { recipient: string | null }).recipient || "");
      if (!/^U[0-9a-f]{32}$/.test(recipient)) return json({ error: "invalid_recipient" }, 400);
      const srcRow = src as { ref_type: string | null; ref_id: string | null; payload: { text?: string } | null };
      const text = String(srcRow.payload?.text || "").slice(0, 4900);
      const refId = srcRow.ref_id;
      if (!text) return json({ error: "missing_fields" }, 400);

      // A client_request_id makes a double-click a no-op: the second call
      // returns the row the first call created.
      const clientReqId = body?.client_request_id
        ? String(body.client_request_id).slice(0, 100).replace(/[^A-Za-z0-9:_-]/g, "")
        : null;
      const key = `manual_resend:${outboxId}:${clientReqId || Date.now()}`;
      const { data: id, error } = await admin.rpc("notification_outbox_enqueue", {
        p_event_type: "manual_resend",
        p_ref_type: String(srcRow.ref_type || "order"),
        p_ref_id: refId,
        p_recipient: recipient,
        p_payload: { text, manual_resend: true, requested_by: uid, source_outbox_id: outboxId },
        p_idempotency_key: key,
        p_channel: "line",
        p_binding_id: null,
        p_created_by: uid,
        p_client_request_id: clientReqId,
      });
      if (error) return json({ error: error.message }, 500);
      await admin.from("activity_logs").insert({
        user_id: uid, action: "notification_manual_resend",
        detail: { ref_id: refId, source_outbox_id: outboxId, outbox_id: id },
      }).then(() => {}, () => {});
      return json({ ok: true, id, idempotency_key: key });
    }

    if (action === "selftest" || action === "self_test" || action === "dry_run") {
      // Safe end-to-end health check: enqueue → claim → complete, entirely on
      // the `selftest` channel. It never calls LINE, never touches a real
      // order and is idempotent per client_request_id, so a double click
      // produces exactly one row.
      const uid = await authUser(admin, req);
      if (!uid) return json({ error: "unauthorized" }, 401);
      if (!(await isStaff(admin, uid))) return json({ error: "forbidden" }, 403);

      const clientReqId = String(body?.client_request_id || `selftest:${uid}:${new Date().toISOString().slice(0, 16)}`)
        .slice(0, 100).replace(/[^A-Za-z0-9:_-]/g, "");
      const key = `selftest:${uid}:${clientReqId}`;
      const { data: id, error: encErr } = await admin.rpc("notification_outbox_enqueue", {
        p_event_type: "system_self_test",
        p_ref_type: SELFTEST_REF_TYPE,
        p_ref_id: null,
        p_recipient: "SELFTEST",
        p_payload: { text: "ทดสอบระบบคิวแจ้งเตือน (ไม่ได้ส่งออก LINE)", selftest: true },
        p_idempotency_key: key,
        p_channel: SELFTEST_CHANNEL,
        p_binding_id: null,
        p_created_by: uid,
        p_client_request_id: clientReqId,
      });
      if (encErr || !id) return json({ error: encErr?.message || "enqueue_failed" }, 500);

      // Proof of deterministic idempotency: enqueueing the very same event a
      // second time must return the same row instead of creating a duplicate.
      const { data: dupId } = await admin.rpc("notification_outbox_enqueue", {
        p_event_type: "system_self_test",
        p_ref_type: SELFTEST_REF_TYPE,
        p_ref_id: null,
        p_recipient: "SELFTEST",
        p_payload: { text: "ทดสอบระบบคิวแจ้งเตือน (ไม่ได้ส่งออก LINE)", selftest: true },
        p_idempotency_key: key,
        p_channel: SELFTEST_CHANNEL,
        p_binding_id: null,
        p_created_by: uid,
        p_client_request_id: clientReqId,
      });
      const duplicateSuppressed = !!dupId && String(dupId) === String(id);
      const { count: rowCount } = await admin
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("idempotency_key", key);

      const { data: runRow } = await admin
        .from("notification_dispatch_runs").insert({ trigger_source: "self_test" }).select("id").single();
      // Targeted atomic claim of just this row — a concurrent cron drain can
      // only win it once because of the `status = pending` predicate.
      const { data: claimedRows } = await admin
        .from("notification_outbox")
        .update({
          status: "processing", claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        })
        .eq("id", id).eq("status", "pending").select("id");
      const claimed = (claimedRows ?? []).length;
      if (claimed > 0) {
        await admin.rpc("notification_outbox_complete", {
          p_id: id, p_ok: true, p_error: null, p_provider_message_id: "selftest",
          p_skipped: false, p_permanent: false, p_deduplicated: false,
        });
      }
      if (runRow?.id) {
        await admin.from("notification_dispatch_runs").update({
          finished_at: new Date().toISOString(), claimed, sent: claimed, failed: 0, skipped: 0, dead: 0,
        }).eq("id", runRow.id);
      }
      return json({
        ok: true,
        id,
        claimed,
        sent: claimed,
        simulated: true,
        dry_run: true,
        duplicate_suppressed: duplicateSuppressed,
        rows: rowCount ?? 1,
      });
    }

    if (action !== "drain") return json({ error: "unknown_action" }, 400);

    // Drain is privileged: the cron worker token, or a signed-in owner/admin.
    // A plain authenticated customer must never be able to run the worker.
    let source = "cron";
    if (!(await hasWorkerToken(admin, req))) {
      const uid = await authUser(admin, req);
      if (!uid) return json({ error: "unauthorized" }, 401);
      if (!(await isStaff(admin, uid))) return json({ error: "forbidden" }, 403);
      source = "admin";
    } else {
      source = String(body?.source || "cron").slice(0, 20);
    }

    const limit = Math.max(1, Math.min(Number(body?.limit) || 10, 50));
    const { data: runRow } = await admin
      .from("notification_dispatch_runs")
      .insert({ trigger_source: source })
      .select("id")
      .single();
    const runId = runRow?.id as string | undefined;
    const finishRun = async (patch: Record<string, unknown>) => {
      if (!runId) return;
      await admin.from("notification_dispatch_runs")
        .update({ finished_at: new Date().toISOString(), ...patch })
        .eq("id", runId);
    };

    const { data: jobs, error } = await admin.rpc("notification_outbox_claim", {
      p_limit: limit, p_lease_seconds: 120,
    });
    if (error) {
      await finishRun({ error: error.message });
      return json({ error: error.message }, 500);
    }
    const rows = (jobs ?? []) as OutboxJob[];
    if (rows.length === 0) {
      await finishRun({ claimed: 0 });
      return json({ ok: true, claimed: 0, sent: 0 });
    }

    const token = await resolveLineToken(admin);
    // Cache per-store tokens so a batch only hits the DB once per store.
    const storeTokens = new Map<string, string | undefined>();
    const tokenFor = async (storeId: string | null | undefined) => {
      const id = (storeId || "").trim();
      if (!id || id === "default") return token;
      if (!storeTokens.has(id)) storeTokens.set(id, await resolveStoreLineToken(admin, id));
      return storeTokens.get(id) || token;
    };
    // A group push only works with the token of the OA that is a member of that
    // group. When the queued row carries no (or the fallback "default") store,
    // look the store up from the notification channel that owns the recipient.
    const recipientStores = new Map<string, string | null>();
    const storeForRecipient = async (recipient: string) => {
      if (!recipientStores.has(recipient)) {
        let resolved: string | null = null;
        try {
          const { data } = await admin
            .from("line_notification_channels")
            .select("store_id")
            .eq("line_destination_id", recipient)
            .eq("is_active", true)
            .limit(1);
          resolved = (data?.[0]?.store_id as string | null) || null;
        } catch (e) {
          console.warn("[dispatch] channel store lookup failed", String((e as Error)?.message || e));
        }
        recipientStores.set(recipient, resolved);
      }
      return recipientStores.get(recipient) ?? null;
    };
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let dead = 0;
    let deduped = 0;

    for (const job of rows) {
      const to = String(job.recipient || "");
      const text = String(job?.payload?.text || "");
      const payloadStore = String((job?.payload as any)?.store_id || "").trim();
      const effectiveStore = payloadStore && payloadStore !== "default"
        ? payloadStore
        : (await storeForRecipient(to)) || payloadStore;
      const jobToken = await tokenFor(effectiveStore);
      // Self-test rows exercise enqueue → claim → complete without a provider
      // call. They are never on the `line` channel, so no customer is touched.
      if (String(job.channel || "line") === SELFTEST_CHANNEL) {
        sent += 1;
        await admin.rpc("notification_outbox_complete", {
          p_id: job.id, p_ok: true, p_error: null,
          p_provider_message_id: "selftest", p_skipped: false,
          p_permanent: false, p_deduplicated: false,
        });
        continue;
      }
      if (!jobToken || !to || !text) {
        skipped += 1;
        await admin.rpc("notification_outbox_complete", {
          p_id: job.id, p_ok: false, p_error: !jobToken ? "no_channel_token" : "no_recipient_or_text",
          p_provider_message_id: null, p_skipped: true, p_permanent: false, p_deduplicated: false,
        });
        continue;
      }
      // job.id is stable for the row across every attempt — that IS the retry key.
      const r = await pushLine(jobToken, to, text, job.id);
      if (r.ok) {
        sent += 1;
        if (r.deduplicated) deduped += 1;
        await admin.rpc("notification_outbox_complete", {
          p_id: job.id, p_ok: true, p_error: null,
          p_provider_message_id: r.providerMessageId ?? null, p_skipped: false,
          p_permanent: false, p_deduplicated: !!r.deduplicated,
        });
        await finalizeLegacyLog(admin, job, true, null);
      } else if (r.permanent) {
        dead += 1;
        await admin.rpc("notification_outbox_complete", {
          p_id: job.id, p_ok: false, p_error: r.error, p_provider_message_id: null,
          p_skipped: false, p_permanent: true, p_deduplicated: false,
        });
        await finalizeLegacyLog(admin, job, false, r.error ?? null);
      } else {
        failed += 1;
        await admin.rpc("notification_outbox_complete", {
          p_id: job.id, p_ok: false, p_error: r.error, p_provider_message_id: null,
          p_skipped: false, p_permanent: false, p_deduplicated: false,
        });
      }
    }

    await finishRun({ claimed: rows.length, sent, failed, skipped, dead });
    return json({ ok: true, claimed: rows.length, sent, failed, skipped, dead, deduped });
  } catch (e) {
    console.error("[notify-dispatch] unhandled", String((e as Error)?.message || e));
    return json({ error: "internal_error" }, 500);
  }
});

/** Keep the legacy `line_notifications` log row in sync so the existing admin
 *  LINE log page never shows a message stuck on "pending". */
async function finalizeLegacyLog(admin: Admin, job: OutboxJob, ok: boolean, error: string | null) {
  const logId = job?.payload?.log_id;
  if (!logId) return;
  try {
    await admin.from("line_notifications").update({
      sent_status: ok ? "sent" : "failed",
      sent_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      error_message: error ? String(error).slice(0, 500) : null,
    }).eq("id", logId);
  } catch { /* best effort */ }
}