// Start the customer LINE Login (normal OAuth web flow — no LIFF, no id_token
// from the client). Creates a one-time, short-lived state row holding the
// PKCE verifier + nonce and returns LINE's authorize URL.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  LINE_AUTHORIZE_URL,
  allowedOrigin,
  pkceChallenge,
  randomToken,
  safeNextPath,
} from "../_shared/lineOauth.ts";
import { logLineStep, newTraceId, stopwatch } from "../_shared/logLineStep.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOGIN_CHANNEL_ID = Deno.env.get("LINE_LOGIN_CHANNEL_ID") || "";
const PUBLIC_APP_ORIGIN = Deno.env.get("PUBLIC_APP_ORIGIN") || Deno.env.get("PUBLIC_APP_URL") || "";

const STATE_TTL_SECONDS = 10 * 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const traceId = newTraceId();
  const lap = stopwatch();

  try {
    if (!LOGIN_CHANNEL_ID) {
      await logLineStep({
        step: "start_rejected", ok: false, traceId, source: "line-oauth-start", req,
        error: "server_misconfigured_login_channel", stageMs: lap(),
      });
      return json({ ok: false, error: "server_misconfigured_login_channel" }, 500);
    }
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const origin =
      allowedOrigin(typeof body.origin === "string" ? body.origin : null) ||
      allowedOrigin(req.headers.get("origin")) ||
      allowedOrigin(PUBLIC_APP_ORIGIN);
    const nextPath = safeNextPath(body.next, "/account");
    const flow = body.mode === "link" ? "link" as const : "login" as const;

    await logLineStep({
      step: "start_requested", ok: true, traceId, flow, source: "line-oauth-start", req,
      stageMs: lap(),
      detail: { origin: origin ?? null, requested_origin: typeof body.origin === "string" ? body.origin : null, next_path: nextPath },
    });

    if (!origin) {
      await logLineStep({
        step: "start_rejected", ok: false, traceId, flow, source: "line-oauth-start", req,
        error: "origin_not_allowed", stageMs: lap(),
      });
      return json({ ok: false, error: "origin_not_allowed" }, 400);
    }

    // The ONE redirect_uri LINE must have registered. The code exchange needs
    // LINE_LOGIN_CHANNEL_SECRET + the PKCE verifier, so it stays server-side.
    const redirectUri = `${SUPABASE_URL}/functions/v1/line-oauth-callback`;

    const svcEarly = createClient(SUPABASE_URL, SERVICE_KEY);

    // --- link mode -------------------------------------------------------
    // "Attach LINE to the account I'm already signed in as." The user id is
    // derived from the caller's Supabase JWT ONLY — never from the body —
    // so nobody can bind a LINE identity onto someone else's profile.
    let linkUserId: string | null = null;
    if (body.mode === "link") {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : "";
      if (!jwt) return json({ ok: false, error: "not_authenticated" }, 200);
      const { data: userRes, error: userErr } = await svcEarly.auth.getUser(jwt);
      if (userErr || !userRes?.user?.id) {
        await logLineStep({
          step: "start_rejected", ok: false, traceId, flow, source: "line-oauth-start", req,
          error: "not_authenticated", stageMs: lap(),
        });
        return json({ ok: false, error: "not_authenticated" }, 200);
      }
      linkUserId = userRes.user.id;
    }

    const state = randomToken(32);
    const nonce = randomToken(24);
    const codeVerifier = randomToken(48);
    const codeChallenge = await pkceChallenge(codeVerifier);

    const svc = svcEarly;
    const { error } = await svc.from("line_oauth_states").insert({
      state,
      code_verifier: codeVerifier,
      nonce,
      next_path: `${origin}${nextPath}`,
      redirect_uri: redirectUri,
      link_user_id: linkUserId,
      trace_id: traceId,
      expires_at: new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString(),
    });
    if (error) {
      await logLineStep({
        step: "state_persist_failed", ok: false, traceId, flow, source: "line-oauth-start", req,
        error: error.message, stageMs: lap(),
      });
      return json({ ok: false, error: "state_persist_failed" }, 500);
    }
    await logLineStep({
      step: "state_created", ok: true, traceId, flow, source: "line-oauth-start", req,
      stageMs: lap(), detail: { link_mode: Boolean(linkUserId), redirect_uri: redirectUri },
    });

    const url = new URL(LINE_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", LOGIN_CHANNEL_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "openid profile");
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    // NOTE: never pre-flight (GET) the authorize URL here. LINE mints a
    // one-shot `loginState` for each authorize request, so a server-side probe
    // burns it and the user's real navigation lands on LINE's generic
    // "400 Bad Request" page. redirect_uri registration is verified in the
    // admin LINE callbacks page instead.

    await logLineStep({
      step: "authorize_url_issued", ok: true, traceId, flow, source: "line-oauth-start", req,
      stageMs: lap(), detail: { redirect_uri: redirectUri, next_path: nextPath },
    });
    return json({ ok: true, authorize_url: url.toString(), expires_in: STATE_TTL_SECONDS });
  } catch (e) {
    await logLineStep({
      step: "start_rejected", ok: false, traceId, source: "line-oauth-start", req,
      error: String((e as Error).message || e), stageMs: lap(),
    });
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});