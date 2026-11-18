// Bind the caller's verified LINE userId to a customer record using a phone
// number. The caller must prove they own the LINE identity via either
// (a) a LIFF id_token (verified at api.line.me) or (b) a Supabase JWT whose
// profile.line_user_id is already set. `line_user_id` in the request body is
// ignored — the trusted value comes from the verified proof.
import { createClient } from "npm:@supabase/supabase-js@2";
import { broadcastLineLinked } from "../_shared/lineLinkRealtime.ts";
import { verifyLineIdentity, LineVerifyError } from "../_shared/verifyLineIdentity.ts";
import { logCallbackFailure, reasonFromIdentityError } from "../_shared/logCallbackFailure.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string) {
  return (raw || "").replace(/\D+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json();
    const { phone, display_name, picture_url, auto } = body || {};

    // Derive a trusted line_user_id from the caller's proof — never from body.
    let identity;
    try {
      identity = await verifyLineIdentity(req, body || {});
    } catch (e) {
      const reason = reasonFromIdentityError(e);
      const errMsg = String((e as Error)?.message || e);
      const detail = e instanceof LineVerifyError ? e.toDetail() : null;
      // NOTE: never log the id_token itself; only structured metadata.
      console.error("[line-link-bind] identity_verify_failed", reason, errMsg, detail);
      await logCallbackFailure({
        reason,
        source: "line-link-bind",
        status: 401,
        error: errMsg,
        req,
      });
      return ok({ ok: false, error: errMsg, error_reason: reason, error_status: 401, detail });
    }
    const line_user_id = identity.line_user_id;

    // Auto-bind mode: no phone required (first LIFF entry). Just persists the
    // LINE identity → we treat the account as "linked" without a customer.
    const isAuto = auto === true || !phone;
    let normPhone: string | null = null;
    if (!isAuto) {
      normPhone = normalizePhone(phone);
      if (!/^0\d{8,9}$/.test(normPhone)) {
        console.error("[line-link-bind] invalid_phone");
        await logCallbackFailure({ reason: "invalid_phone", source: "line-link-bind", status: 400, req });
        return ok({ ok: false, error: "invalid_phone", error_status: 400 });
      }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find matching customer — prefer rds_customers, then guest_customers,
    // otherwise create a guest_customers anchor row. Skipped in auto-bind
    // mode: we don't have a phone to match with yet.
    let customer_id: string | null = null;
    let customer_source: "rds" | "guest" | null = null;
    let customer_name: string | null = display_name || null;

    if (!isAuto && normPhone) {
    const { data: rds } = await supabase
      .from("rds_customers")
      .select("id, name")
      .eq("phone", normPhone)
      .limit(1)
      .maybeSingle();
    if (rds) {
      customer_id = rds.id;
      customer_source = "rds";
      customer_name = rds.name || customer_name;
    } else {
      const { data: guest } = await supabase
        .from("guest_customers")
        .select("id, name")
        .eq("phone", normPhone)
        .limit(1)
        .maybeSingle();
      if (guest) {
        customer_id = guest.id;
        customer_source = "guest";
        customer_name = guest.name || customer_name;
      } else {
        const { data: created, error: insErr } = await supabase
          .from("guest_customers")
          .insert({
            phone: normPhone,
            name: display_name || `LINE ${String(line_user_id).slice(-6)}`,
          })
          .select("id, name")
          .single();
        if (insErr) {
          console.error("[line-link-bind] customer_create_failed", insErr.message);
          await logCallbackFailure({ reason: "customer_create_failed", source: "line-link-bind", status: 500, error: insErr.message, req });
          return ok({ ok: false, error: "customer_create_failed", detail: insErr.message, error_status: 500 });
        }
        customer_id = created.id;
        customer_source = "guest";
        customer_name = created.name || customer_name;
      }
    }
    }

    const now = new Date().toISOString();
    // In auto-bind mode, do NOT overwrite an existing phone/customer link if
    // one is already there — only fill in the LINE identity fields.
    const upsertPayload: Record<string, unknown> = {
      line_user_id,
      display_name: display_name || null,
      picture_url: picture_url || null,
      verified_at: now,
      last_seen_at: now,
    };
    if (!isAuto) {
      upsertPayload.phone = normPhone;
      upsertPayload.customer_id = customer_id;
      upsertPayload.customer_source = customer_source;
    }
    const { error: upErr } = await supabase
      .from("line_account_links")
      .upsert(upsertPayload, { onConflict: "line_user_id" });
    if (upErr) {
      console.error("[line-link-bind] binding_failed", upErr.message);
      await logCallbackFailure({ reason: "binding_failed", source: "line-link-bind", status: 500, error: upErr.message, req });
      return ok({ ok: false, error: "binding_failed", detail: upErr.message, error_status: 500 });
    }

    // Backfill the caller's Supabase profile with the verified LINE identity
    // so the customer header/account page shows their LINE name & picture
    // right after login. Best-effort: never fail the bind on this.
    if (identity.user_id) {
      try {
        await supabase
          .from("profiles")
          .update({
            line_user_id,
            line_display_name: display_name || null,
            line_picture_url: picture_url || null,
            line_verified_at: now,
          })
          .eq("id", identity.user_id);
      } catch (e) {
        console.warn("[line-link-bind] profile_backfill_failed", String((e as Error)?.message || e));
      }
    }

    // Realtime push: the browser tab that started this bind can unlock at
    // once instead of polling the lookup endpoint.
    await broadcastLineLinked(line_user_id, "linked");

    return ok({
      ok: true,
      auto: isAuto,
      customer_id,
      customer_source,
      customer_name,
      phone: normPhone,
    });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    console.error("[line-link-bind] internal_error", msg);
    await logCallbackFailure({ reason: "internal_error", source: "line-link-bind", status: 500, error: msg, req });
    return ok({ ok: false, error: msg, error_reason: "internal_error", error_status: 500 });
  }
});