// Verify OTP, then bind LINE userId to a customer record.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineIdentity } from "../_shared/verifyLineIdentity.ts";
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
    const { phone, otp, display_name, picture_url } = body || {};
    if (!phone || !otp) {
      await logCallbackFailure({ reason: "invalid_action", source: "line-link-verify", status: 400, error: "missing_params", req });
      return ok({ ok: false, error: "missing_params" }, 400);
    }

    // Derive a trusted line_user_id from the caller's proof — never from body.
    let identity;
    try {
      identity = await verifyLineIdentity(req, body || {});
    } catch (e) {
      await logCallbackFailure({
        reason: reasonFromIdentityError(e),
        source: "line-link-verify",
        status: 401,
        error: String((e as Error)?.message || e),
        req,
      });
      return ok({ ok: false, error: String((e as Error).message || e) }, 401);
    }
    const line_user_id = identity.line_user_id;

    const normPhone = normalizePhone(phone);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // pick most recent unconsumed OTP for this line_user_id
    const { data: otpRow, error: fetchErr } = await supabase
      .from("line_link_otps")
      .select("id, code, attempts, expires_at, consumed_at, phone")
      .eq("line_user_id", line_user_id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fetchErr) {
      await logCallbackFailure({ reason: "internal_error", source: "line-link-verify", status: 500, error: fetchErr.message, req });
      return ok({ ok: false, error: fetchErr.message }, 500);
    }
    if (!otpRow) {
      await logCallbackFailure({ reason: "otp_not_found", source: "line-link-verify", status: 400, req });
      return ok({ ok: false, error: "otp_not_found" }, 400);
    }

    if (new Date(otpRow.expires_at).getTime() < Date.now()) {
      await logCallbackFailure({ reason: "otp_expired", source: "line-link-verify", status: 400, req });
      return ok({ ok: false, error: "otp_expired" }, 400);
    }
    if (otpRow.attempts >= 5) {
      await logCallbackFailure({ reason: "otp_too_many_attempts", source: "line-link-verify", status: 429, req });
      return ok({ ok: false, error: "otp_too_many_attempts" }, 429);
    }
    if (otpRow.phone !== normPhone) {
      await supabase.from("line_link_otps").update({ attempts: otpRow.attempts + 1 }).eq("id", otpRow.id);
      await logCallbackFailure({ reason: "phone_mismatch", source: "line-link-verify", status: 400, req });
      return ok({ ok: false, error: "phone_mismatch" }, 400);
    }
    if (String(otpRow.code).trim() !== String(otp).trim()) {
      await supabase.from("line_link_otps").update({ attempts: otpRow.attempts + 1 }).eq("id", otpRow.id);
      await logCallbackFailure({ reason: "wrong_code", source: "line-link-verify", status: 400, req, detail: { attempts_left: Math.max(0, 5 - (otpRow.attempts + 1)) } });
      return ok({ ok: false, error: "otp_incorrect", attempts_left: Math.max(0, 5 - (otpRow.attempts + 1)) }, 400);
    }

    // Consume OTP
    await supabase
      .from("line_link_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otpRow.id);

    // Find matching customer — prefer rds_customers, then guest_customers
    let customer_id: string | null = null;
    let customer_source: "rds" | "guest" | null = null;

    const { data: rds } = await supabase
      .from("rds_customers")
      .select("id")
      .eq("phone", normPhone)
      .limit(1)
      .maybeSingle();
    if (rds) {
      customer_id = rds.id;
      customer_source = "rds";
    } else {
      const { data: guest } = await supabase
        .from("guest_customers")
        .select("id")
        .eq("phone", normPhone)
        .limit(1)
        .maybeSingle();
      if (guest) {
        customer_id = guest.id;
        customer_source = "guest";
      } else {
        // Create a guest_customers row so this LINE user has an anchor record
        const { data: created, error: insErr } = await supabase
          .from("guest_customers")
          .insert({
            phone: normPhone,
            name: display_name || `LINE ${line_user_id.slice(-6)}`,
          })
          .select("id")
          .single();
        if (insErr) return ok({ ok: false, error: "customer_create_failed", detail: insErr.message }, 500);
        customer_id = created.id;
        customer_source = "guest";
      }
    }

    // Upsert binding
    const now = new Date().toISOString();
    const { error: upErr } = await supabase.from("line_account_links").upsert(
      {
        line_user_id,
        phone: normPhone,
        display_name: display_name || null,
        picture_url: picture_url || null,
        customer_id,
        customer_source,
        verified_at: now,
        last_seen_at: now,
      },
      { onConflict: "line_user_id" },
    );
    if (upErr) {
      await logCallbackFailure({ reason: "binding_failed", source: "line-link-verify", status: 500, error: upErr.message, req });
      return ok({ ok: false, error: "binding_failed", detail: upErr.message }, 500);
    }

    return ok({
      ok: true,
      customer_id,
      customer_source,
      phone: normPhone,
    });
  } catch (e) {
    await logCallbackFailure({ reason: "internal_error", source: "line-link-verify", status: 500, error: String((e as Error)?.message || e), req });
    return ok({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});