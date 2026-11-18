// Shared helper: derive a trusted LINE user id for the caller of an edge function.
// Two accepted proofs:
//   1. LIFF id_token (JWT) in body — verified at LINE's oauth2 verify endpoint
//      using LINE_LOGIN_CHANNEL_ID as client_id. `sub` claim = LINE userId.
//   2. Authorization: Bearer <supabase-jwt> — verified via supabase.auth.getClaims;
//      the caller's `profiles.line_user_id` (looked up with the service key)
//      is the trusted LINE userId.
// Callers must NEVER trust an unverified `line_user_id` from the request body.

import { createClient } from "npm:@supabase/supabase-js@2";

export type LineIdentity = {
  line_user_id: string;
  source: "id_token" | "supabase_jwt";
  user_id?: string; // Supabase auth user id when available
};

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export class LineVerifyError extends Error {
  code: string;
  status?: number;
  expected_client_id?: string;
  token_aud?: string;
  line_error?: string;
  line_error_description?: string;
  constructor(code: string, extra: Partial<LineVerifyError> = {}) {
    super(code);
    this.code = code;
    Object.assign(this, extra);
  }
  toDetail() {
    return {
      code: this.code,
      status: this.status ?? null,
      expected_client_id: this.expected_client_id ?? null,
      token_aud: this.token_aud ?? null,
      line_error: this.line_error ?? null,
      line_error_description: this.line_error_description ?? null,
    };
  }
}

export async function verifyLineIdentity(
  req: Request,
  body: Record<string, unknown>,
): Promise<LineIdentity> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOGIN_CHANNEL_ID = Deno.env.get("LINE_LOGIN_CHANNEL_ID") || "";

  // Path 1 — LIFF id_token
  const idToken = typeof body.id_token === "string" ? body.id_token : "";
  if (idToken) {
    if (!LOGIN_CHANNEL_ID) {
      throw new LineVerifyError("server_misconfigured_login_channel_id");
    }
    const form = new URLSearchParams();
    form.set("id_token", idToken);
    form.set("client_id", LOGIN_CHANNEL_ID);
    const r = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!r.ok) {
      // Parse LINE's structured error response so we can surface aud/client_id
      // mismatches to admins without ever logging the token itself.
      let lineErr: string | undefined;
      let lineDesc: string | undefined;
      try {
        const txt = await r.text();
        try {
          const j = JSON.parse(txt);
          lineErr = typeof j?.error === "string" ? j.error : undefined;
          lineDesc = typeof j?.error_description === "string" ? j.error_description : undefined;
        } catch {
          lineDesc = txt.slice(0, 300);
        }
      } catch { /* ignore */ }
      throw new LineVerifyError(`line_id_token_invalid_${r.status}`, {
        status: r.status,
        expected_client_id: LOGIN_CHANNEL_ID,
        line_error: lineErr,
        line_error_description: lineDesc,
      });
    }
    const claims = (await r.json()) as { sub?: string; aud?: string };
    if (!claims?.sub) throw new LineVerifyError("line_id_token_missing_sub");
    if (claims.aud && claims.aud !== LOGIN_CHANNEL_ID) {
      throw new LineVerifyError("line_id_token_aud_mismatch", {
        expected_client_id: LOGIN_CHANNEL_ID,
        token_aud: claims.aud,
      });
    }
    // Opportunistically extract the caller's Supabase uid from the
    // Authorization header (if any). LIFF callers who are also signed in
    // to Supabase can then have their profile backfilled with the
    // verified LINE identity. Best-effort — a missing/invalid token here
    // must not fail the id_token verification.
    let uidOpt: string | undefined;
    try {
      const auth = req.headers.get("Authorization") || "";
      if (auth.startsWith("Bearer ")) {
        const anon = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: auth } },
        });
        const { data } = await anon.auth.getClaims(auth.slice("Bearer ".length));
        if (data?.claims?.sub) uidOpt = data.claims.sub as string;
      }
    } catch { /* ignore — id_token proof already succeeded */ }
    return { line_user_id: claims.sub, source: "id_token", user_id: uidOpt };
  }

  // Path 2 — Supabase JWT
  const auth = req.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const token = auth.slice("Bearer ".length);
    const { data: claimsData, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      throw new Error("unauthorized");
    }
    const uid = claimsData.claims.sub as string;
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: profile, error: pErr } = await svc
      .from("profiles")
      .select("line_user_id")
      .eq("id", uid)
      .maybeSingle();
    if (pErr) throw new Error("profile_lookup_failed");
    if (!profile?.line_user_id) throw new Error("no_line_user_bound_to_account");
    return { line_user_id: profile.line_user_id, source: "supabase_jwt", user_id: uid };
  }

  throw new Error("unauthorized");
}