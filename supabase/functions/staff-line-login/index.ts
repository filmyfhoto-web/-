// Staff-only LINE login: verifies a LIFF id_token, looks up
// staff_line_bindings, and (when approved) mints a one-shot magic-link
// hashed token that the client exchanges via supabase.auth.verifyOtp.
//
// Response shapes:
//   { status: "pending",  binding_id, display_name, picture_url }
//   { status: "revoked",  binding_id }
//   { status: "not_staff", binding_id }  // approved but user_roles empty
//   { status: "approved", email, token_hash }
//   { ok: false, error, detail? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineIdentity } from "../_shared/verifyLineIdentity.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOGIN_CH_ID = Deno.env.get("LINE_LOGIN_CHANNEL_ID") || "";
const LOGIN_CH_SECRET = Deno.env.get("LINE_LOGIN_CHANNEL_SECRET") || "";

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function fetchLineProfile(accessToken: string) {
  if (!accessToken) return null;
  try {
    const r = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    return (await r.json()) as { displayName?: string; pictureUrl?: string };
  } catch { return null; }
}

// Exchange an OAuth "code" (LINE Login web flow) for tokens.
async function exchangeCode(code: string, redirect_uri: string) {
  if (!LOGIN_CH_ID || !LOGIN_CH_SECRET) {
    throw new Error("server_misconfigured_login_channel");
  }
  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", code);
  form.set("redirect_uri", redirect_uri);
  form.set("client_id", LOGIN_CH_ID);
  form.set("client_secret", LOGIN_CH_SECRET);
  const r = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`line_token_exchange_failed:${j?.error_description || j?.error || r.status}`);
  return j as { access_token: string; id_token: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // 1a) OAuth web-flow: exchange `code` for id_token first, then verify.
    let mutableBody: Record<string, unknown> = { ...body };
    let lineAccessToken = typeof body.access_token === "string" ? body.access_token : "";
    if (typeof body.code === "string" && typeof body.redirect_uri === "string") {
      try {
        const tok = await exchangeCode(body.code as string, body.redirect_uri as string);
        mutableBody.id_token = tok.id_token;
        lineAccessToken = tok.access_token;
      } catch (e: any) {
        return ok({ ok: false, error: "code_exchange_failed", detail: String(e?.message || e) }, 401);
      }
    }

    // 1b) Verify LINE identity (id_token now guaranteed if we reached here via OAuth or LIFF).
    let identity;
    try {
      identity = await verifyLineIdentity(req, mutableBody);
    } catch (e: any) {
      return ok({ ok: false, error: "unauthorized", detail: String(e?.message || e) }, 401);
    }
    const line_user_id = identity.line_user_id;

    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    // 2) Lookup existing binding.
    const { data: rows, error: lookupErr } = await svc
      .from("staff_line_bindings")
      .select("id,user_id,status,display_name,picture_url")
      .eq("line_user_id", line_user_id)
      .limit(1);
    if (lookupErr) return ok({ ok: false, error: lookupErr.message }, 500);

    let binding = rows?.[0] || null;

    // 3) First sighting → create pending row (best-effort profile).
    if (!binding) {
      const profile = await fetchLineProfile(lineAccessToken);
      const { data: inserted, error: insErr } = await svc
        .from("staff_line_bindings")
        .insert({
          line_user_id,
          status: "pending",
          display_name: profile?.displayName ?? null,
          picture_url: profile?.pictureUrl ?? null,
        })
        .select("id,user_id,status,display_name,picture_url")
        .single();
      if (insErr) return ok({ ok: false, error: insErr.message }, 500);
      binding = inserted;
      return ok({
        status: "pending",
        binding_id: binding!.id,
        display_name: binding!.display_name,
        picture_url: binding!.picture_url,
      });
    }

    // Refresh profile if we captured a token and previous row missed it.
    if (lineAccessToken && (!binding.display_name || !binding.picture_url)) {
      const profile = await fetchLineProfile(lineAccessToken);
      if (profile) {
        await svc.from("staff_line_bindings").update({
          display_name: binding.display_name || profile.displayName || null,
          picture_url: binding.picture_url || profile.pictureUrl || null,
        }).eq("id", binding.id);
      }
    }

    if (binding.status === "revoked") {
      return ok({ status: "revoked", binding_id: binding.id });
    }
    if (binding.status !== "approved" || !binding.user_id) {
      return ok({
        status: "pending",
        binding_id: binding.id,
        display_name: binding.display_name,
        picture_url: binding.picture_url,
      });
    }

    // 4) Approved — verify user still has a staff role.
    const { data: roles } = await svc
      .from("user_roles")
      .select("role")
      .eq("user_id", binding.user_id);
    const hasStaff = (roles ?? []).some((r: any) =>
      ["owner", "admin", "stock_staff", "photo_staff"].includes(r.role),
    );
    if (!hasStaff) return ok({ status: "not_staff", binding_id: binding.id });

    // 5) Resolve email for the user and mint a magic-link hashed token.
    const { data: userData, error: userErr } = await svc.auth.admin.getUserById(binding.user_id);
    if (userErr || !userData?.user?.email) {
      return ok({ ok: false, error: "user_email_missing" }, 500);
    }
    const email = userData.user.email;

    const { data: link, error: linkErr } = await svc.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return ok({ ok: false, error: linkErr?.message || "link_failed" }, 500);
    }

    return ok({
      status: "approved",
      email,
      token_hash: link.properties.hashed_token,
    });
  } catch (e) {
    return ok({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});