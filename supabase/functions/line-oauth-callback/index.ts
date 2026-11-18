// Finish the customer LINE Login web flow.
//
// GET  ?code&state   — called by LINE. Consumes the one-time state, exchanges
//                      the code server-side (PKCE), validates the id_token
//                      (issuer / audience / expiry / nonce / signature via
//                      LINE's official verify endpoint), links the LINE
//                      identity to a customer account and redirects back to
//                      the app with a one-time handoff code (never a token).
// POST { handoff }   — the app exchanges the handoff code for the one-shot
//                      magic-link token_hash used by supabase.auth.verifyOtp.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  LINE_TOKEN_URL,
  LINE_VERIFY_URL,
  allowedOrigin,
  safeNextPath,
  validateIdTokenClaims,
  randomToken,
  type LineIdTokenClaims,
} from "../_shared/lineOauth.ts";
import { logCallbackFailure } from "../_shared/logCallbackFailure.ts";
import { logLineStep, maskLineUserId, newTraceId, stopwatch } from "../_shared/logLineStep.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOGIN_CHANNEL_ID = Deno.env.get("LINE_LOGIN_CHANNEL_ID") || "";
const LOGIN_CHANNEL_SECRET = Deno.env.get("LINE_LOGIN_CHANNEL_SECRET") || "";
const PUBLIC_APP_ORIGIN = Deno.env.get("PUBLIC_APP_ORIGIN") || Deno.env.get("PUBLIC_APP_URL") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function svcClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

/** Split the stored "<origin><path>" target back into its parts. */
function splitTarget(stored: string): { origin: string; path: string } {
  try {
    const u = new URL(stored);
    const origin = allowedOrigin(u.origin) || allowedOrigin(PUBLIC_APP_ORIGIN) || "";
    return { origin, path: safeNextPath(`${u.pathname}${u.search}${u.hash}`) };
  } catch {
    return { origin: allowedOrigin(PUBLIC_APP_ORIGIN) || "", path: "/account" };
  }
}

async function alertFailure(
  reason: string,
  detail?: Record<string, unknown>,
  traceId?: string | null,
) {
  try {
    // Writes the activity log AND a rate-limited (10 min) staff alert.
    const trace = traceId ? ` · trace ${traceId}` : "";
    await logCallbackFailure({
      reason,
      source: "line-oauth-callback",
      detail: { ...(detail || {}), trace_id: traceId || null },
      alertBody: `${reason}${trace}`,
      alertLink: "/admin/line-login-logs?failed=1",
    });
  } catch {
    /* alerting must never break the login redirect */
  }
}

function fail(origin: string, code: string) {
  const base = origin || allowedOrigin(PUBLIC_APP_ORIGIN) || "";
  const url = `${base}/customer/login?error=${encodeURIComponent(code)}`;
  return new Response(null, { status: 302, headers: { ...cors, Location: url } });
}

/** Failure redirect that stays on the page the flow started from (link mode). */
function failTo(origin: string, path: string, code: string) {
  const base = origin || allowedOrigin(PUBLIC_APP_ORIGIN) || "";
  const safe = safeNextPath(path, "/account");
  const sep = safe.includes("?") ? "&" : "?";
  const url = `${base}${safe}${sep}error=${encodeURIComponent(code)}`;
  return new Response(null, { status: 302, headers: { ...cors, Location: url } });
}

async function exchangeCode(code: string, redirectUri: string, verifier: string) {
  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", code);
  form.set("redirect_uri", redirectUri);
  form.set("client_id", LOGIN_CHANNEL_ID);
  form.set("client_secret", LOGIN_CHANNEL_SECRET);
  form.set("code_verifier", verifier);
  const r = await fetch(LINE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.id_token) {
    const err = new Error("token_exchange_failed") as Error & {
      lineStatus?: number;
      lineError?: string;
      lineErrorDescription?: string;
    };
    err.lineStatus = r.status;
    err.lineError = String((j as Record<string, unknown>)?.error || "");
    err.lineErrorDescription = String((j as Record<string, unknown>)?.error_description || "");
    throw err;
  }
  return j as { access_token?: string; id_token: string };
}

async function verifyIdToken(idToken: string): Promise<LineIdTokenClaims> {
  const form = new URLSearchParams();
  form.set("id_token", idToken);
  form.set("client_id", LOGIN_CHANNEL_ID);
  const r = await fetch(LINE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!r.ok) throw new Error("id_token_invalid");
  return (await r.json()) as LineIdTokenClaims;
}

/** Find (or create) the customer account owning this verified LINE identity. */
async function resolveUser(claims: LineIdTokenClaims) {
  const svc = svcClient();
  const lineUserId = claims.sub!;

  const { data: existing } = await svc
    .from("profiles")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  let userId = existing?.id as string | undefined;
  const created_new = !userId;

  if (!userId) {
    const email = `line.${lineUserId.toLowerCase()}@line-login.local`;
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      email_confirm: true,
      password: randomToken(24),
      user_metadata: { full_name: claims.name || null, line_login: true },
    });
    if (createErr || !created?.user) throw new Error("account_create_failed");
    userId = created.user.id;
  }

  // Server-side (service_role) write of the verified LINE identity.
  await svc
    .from("profiles")
    .update({
      line_user_id: lineUserId,
      line_display_name: claims.name ?? null,
      line_picture_url: claims.picture ?? null,
      line_verified_at: new Date().toISOString(),
    })
    .eq("id", userId);

  const { data: userData } = await svc.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (!email) throw new Error("account_email_missing");
  return { userId, email, created_new };
}

/**
 * Link mode: attach this verified LINE identity to the profile the caller was
 * already signed in as (`link_user_id`, captured server-side at start time).
 * Never creates a second account. Enforces one LINE ↔ one profile.
 */
async function linkToExistingUser(claims: LineIdTokenClaims, userId: string) {
  const svc = svcClient();
  const lineUserId = claims.sub!;

  const { data: owner } = await svc
    .from("profiles")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (owner?.id && owner.id !== userId) {
    return { error: "line_already_linked" as const };
  }

  const { data: mine } = await svc
    .from("profiles")
    .select("id, line_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (!mine?.id) return { error: "profile_missing" as const };
  if (mine.line_user_id && mine.line_user_id !== lineUserId) {
    return { error: "profile_already_linked" as const };
  }

  const { error: updErr } = await svc
    .from("profiles")
    .update({
      line_user_id: lineUserId,
      line_display_name: claims.name ?? null,
      line_picture_url: claims.picture ?? null,
      line_verified_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (updErr) return { error: "link_failed" as const };

  const { data: userData } = await svc.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (!email) return { error: "account_email_missing" as const };
  return { userId, email };
}

/**
 * Legacy/direct browser return from LINE (redirect_uri pointing at this
 * function). Consumes state, exchanges the code and 302s back to the app with
 * a one-time handoff code.
 */
async function handleAuthReturn(req: Request): Promise<Response> {
  return await runAuthReturn(req);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // --- app exchanges the one-time handoff code for the magic-link token ----
  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));

      // Client-side step report (session created / failed) — no secrets accepted.
      if (body.action === "log") {
        const reportedTrace = typeof body.trace_id === "string" ? body.trace_id : null;
        const reportedStep = String(body.step || "session_created");
        await logLineStep({
          step: reportedStep,
          ok: body.ok !== false,
          traceId: reportedTrace,
          flow: body.flow === "link" ? "link" : "login",
          source: "line-oauth-client",
          req,
          error: typeof body.error === "string" ? body.error : null,
          detail: { next_path: typeof body.next === "string" ? body.next : null },
        });
        if (reportedStep === "session_failed" && body.ok === false && reportedTrace) {
          const svc = svcClient();
          const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          const { data: knownTrace } = await svc
            .from("activity_logs")
            .select("id")
            .eq("action", "line.login_step")
            .contains("detail", { trace_id: reportedTrace })
            .gte("created_at", cutoff)
            .limit(1)
            .maybeSingle();
          if (knownTrace?.id) {
            await alertFailure(
              "session_create_failed",
              { client_error: typeof body.error === "string" ? body.error : null },
              reportedTrace,
            );
          }
        }
        return json({ ok: true });
      }

      const handoff = typeof body.handoff === "string" ? body.handoff : "";
      if (!handoff) return json({ ok: false, error: "missing_handoff" }, 400);
      const svc = svcClient();
      const { data, error } = await svc.rpc("line_oauth_consume_handoff", { p_handoff: handoff });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.handoff_payload) {
        await logLineStep({
          step: "handoff_invalid", ok: false, traceId: (row?.trace_id as string) ?? null,
          source: "line-oauth-callback", req, error: error?.message || "no_row",
        });
        return json({ ok: false, error: "handoff_invalid" }, 401);
      }
      const payload = row.handoff_payload as { email?: string; token_hash?: string };
      if (!payload?.email || !payload?.token_hash) {
        await logLineStep({
          step: "handoff_invalid", ok: false, traceId: (row.trace_id as string) ?? null,
          source: "line-oauth-callback", req, error: "payload_incomplete",
        });
        return json({ ok: false, error: "handoff_invalid" }, 401);
      }
      const { path } = splitTarget(String(row.next_path || ""));
      await logLineStep({
        step: "handoff_consumed", ok: true, traceId: (row.trace_id as string) ?? null,
        source: "line-oauth-callback", req, detail: { next_path: path },
      });
      return json({
        ok: true,
        email: payload.email,
        token_hash: payload.token_hash,
        next: path,
        trace_id: (row.trace_id as string) ?? null,
      });
    } catch (e) {
      return json({ ok: false, error: String((e as Error).message || e) }, 500);
    }
  }

  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return await handleAuthReturn(req);
});

async function runAuthReturn(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const oauthError = url.searchParams.get("error") || "";
  const fallbackOrigin = allowedOrigin(PUBLIC_APP_ORIGIN) || "";
  let traceId: string | null = null;
  const lap = stopwatch();

  await logLineStep({
    step: "callback_received", ok: !oauthError && Boolean(code && state), traceId: null,
    source: "line-oauth-callback", req, error: oauthError || null, stageMs: lap(),
    detail: { has_code: Boolean(code), has_state: Boolean(state) },
  });

  if (!LOGIN_CHANNEL_ID || !LOGIN_CHANNEL_SECRET) {
    await alertFailure("server_misconfigured_login_channel");
    return fail(fallbackOrigin, "server_error");
  }
  if (!state) return fail(fallbackOrigin, "state_missing");

  const svc = svcClient();
  // One-time, expiry-checked consumption — replay returns no row.
  const { data: stateRows, error: stateErr } = await svc.rpc("line_oauth_consume_state", { p_state: state });
  const stateRow = Array.isArray(stateRows) ? stateRows[0] : stateRows;
  if (stateErr || !stateRow) {
    await alertFailure("state_invalid_or_expired");
    await logLineStep({
      step: "state_invalid", ok: false, source: "line-oauth-callback", req,
      error: stateErr?.message || "no_row", stageMs: lap(),
    });
    return fail(fallbackOrigin, "state_invalid");
  }

  traceId = (stateRow.trace_id as string) || newTraceId();
  const target = splitTarget(String(stateRow.next_path || ""));
  const origin = target.origin || fallbackOrigin;
  const flow = stateRow.link_user_id ? ("link" as const) : ("login" as const);

  await logLineStep({
    step: "state_consumed", ok: true, traceId, flow, source: "line-oauth-callback", req,
    stageMs: lap(), detail: { origin, next_path: target.path },
  });

  if (oauthError) {
    return fail(origin, oauthError === "access_denied" ? "access_denied" : "line_error");
  }
  if (!code) return fail(origin, "code_missing");

  try {
    let tok: { id_token: string; access_token?: string };
    try {
      tok = await exchangeCode(code, String(stateRow.redirect_uri), String(stateRow.code_verifier));
    } catch (te) {
      const err = te as Error & { lineStatus?: number; lineError?: string; lineErrorDescription?: string };
      await logLineStep({
        step: "token_exchange_failed", ok: false, traceId, flow, source: "line-oauth-callback", req,
        error: err.message, stageMs: lap(),
        detail: {
          line_status: err.lineStatus ?? null,
          line_error: err.lineError ?? null,
          line_error_description: err.lineErrorDescription ?? null,
          redirect_uri: String(stateRow.redirect_uri),
        },
      });
      await alertFailure(
        "token_exchange_failed",
        {
          line_status: err.lineStatus ?? null,
          line_error: err.lineError ?? null,
          line_error_description: err.lineErrorDescription ?? null,
        },
        traceId,
      );
      throw te;
    }
    await logLineStep({
      step: "token_exchanged", ok: true, traceId, flow, source: "line-oauth-callback", req,
      stageMs: lap(),
    });
    const claims = await verifyIdToken(tok.id_token);
    const valid = validateIdTokenClaims(claims, {
      channelId: LOGIN_CHANNEL_ID,
      nonce: String(stateRow.nonce),
    });
    if (!valid.ok) {
      await alertFailure(valid.error);
      await logLineStep({
        step: "id_token_rejected", ok: false, traceId, flow, source: "line-oauth-callback", req,
        error: valid.error, stageMs: lap(),
      });
      return fail(origin, "verify_failed");
    }
    await logLineStep({
      step: "id_token_verified", ok: true, traceId, flow, source: "line-oauth-callback", req,
      stageMs: lap(), detail: { line_user: maskLineUserId(claims.sub) },
    });

    const linkUserId =
      typeof stateRow.link_user_id === "string" && stateRow.link_user_id
        ? stateRow.link_user_id
        : null;

    let email: string;
    if (linkUserId) {
      const linked = await linkToExistingUser(claims, linkUserId);
      if ("error" in linked) {
        await alertFailure(linked.error);
        await logLineStep({
          step: "link_rejected", ok: false, traceId, flow, source: "line-oauth-callback", req,
          error: linked.error, stageMs: lap(),
        });
        return failTo(origin, target.path, linked.error);
      }
      email = linked.email;
      await logLineStep({
        step: "line_linked", ok: true, traceId, flow, source: "line-oauth-callback", req,
        stageMs: lap(), detail: { line_user: maskLineUserId(claims.sub) },
      });
    } else {
      const resolved = await resolveUser(claims);
      email = resolved.email;
      await logLineStep({
        step: "user_resolved", ok: true, traceId, flow, source: "line-oauth-callback", req,
        stageMs: lap(),
        detail: { created_new: resolved.created_new, line_user: maskLineUserId(claims.sub) },
      });
    }

    const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: "magiclink", email });
    if (linkErr || !link?.properties?.hashed_token) {
      await alertFailure("magiclink_failed");
      await logLineStep({
        step: "magiclink_failed", ok: false, traceId, flow, source: "line-oauth-callback", req,
        error: linkErr?.message || "no_hashed_token", stageMs: lap(),
      });
      return fail(origin, "session_failed");
    }
    await logLineStep({
      step: "magiclink_generated", ok: true, traceId, flow, source: "line-oauth-callback", req,
      stageMs: lap(),
    });

    const handoff = randomToken(32);
    const { error: updErr } = await svc
      .from("line_oauth_states")
      .update({
        handoff,
        handoff_payload: { email, token_hash: link.properties.hashed_token },
        expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      })
      .eq("id", stateRow.id);
    if (updErr) {
      await alertFailure("handoff_persist_failed");
      await logLineStep({
        step: "handoff_persisted", ok: false, traceId, flow, source: "line-oauth-callback", req,
        error: updErr.message, stageMs: lap(),
      });
      return fail(origin, "session_failed");
    }
    await logLineStep({
      step: "handoff_persisted", ok: true, traceId, flow, source: "line-oauth-callback", req,
      stageMs: lap(),
    });

    const dest = `${origin}/auth/line/callback?c=${encodeURIComponent(handoff)}&next=${encodeURIComponent(target.path)}`;
    await logLineStep({
      step: "redirected_to_app", ok: true, traceId, flow, source: "line-oauth-callback", req,
      stageMs: lap(), detail: { origin, next_path: target.path },
    });
    return new Response(null, { status: 302, headers: { ...cors, Location: dest } });
  } catch (e) {
    await alertFailure(String((e as Error).message || e));
    await logLineStep({
      step: "session_failed", ok: false, traceId, flow, source: "line-oauth-callback", req,
      error: String((e as Error).message || e), stageMs: lap(),
    });
    return fail(origin, "login_failed");
  }
}