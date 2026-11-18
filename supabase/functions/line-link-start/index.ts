// Start binding: generate OTP + push to LINE user via Messaging API.
import { pushLineText } from "../_shared/linePush.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineIdentity } from "../_shared/verifyLineIdentity.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string) {
  return (raw || "").replace(/\D+/g, "");
}

function generateOtp() {
  // CSPRNG with rejection sampling to avoid modulo bias.
  const buf = new Uint32Array(1);
  const LIMIT = 4_294_000_000; // largest multiple of 1_000_000 <= 2**32
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= LIMIT);
  return String(n % 1_000_000).padStart(6, "0");
}

async function pushLine(to: string, text: string) {
  // Synchronous auth flow (OTP): uses the single shared provider adapter.
  const r = await pushLineText(LINE_TOKEN, to, text);
  return r.ok ? { ok: true } : { ok: false, status: r.status, body: r.error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const { phone } = body || {};
    if (!phone) return ok({ ok: false, error: "missing_params" }, 400);

    // Require the caller to prove ownership of the LINE identity (LIFF id_token
    // or Supabase JWT with a linked line_user_id). The `line_user_id` from
    // the request body is IGNORED to prevent attackers from spamming OTP
    // pushes to arbitrary LINE users or probing which phone numbers exist.
    let identity;
    try {
      identity = await verifyLineIdentity(req, body || {});
    } catch (e) {
      return ok({ ok: false, error: "unauthorized", detail: String((e as Error).message || e) }, 401);
    }
    const line_user_id = identity.line_user_id;

    const normPhone = normalizePhone(phone);
    if (normPhone.length < 9 || normPhone.length > 15) {
      return ok({ ok: false, error: "invalid_phone" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // rate limit: 1 OTP per 30 seconds per line_user_id
    const { data: recent } = await supabase
      .from("line_link_otps")
      .select("created_at")
      .eq("line_user_id", line_user_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (recent && recent[0]) {
      const ageMs = Date.now() - new Date(recent[0].created_at).getTime();
      if (ageMs < 30_000) {
        return ok({ ok: false, error: "rate_limited", retry_in_sec: Math.ceil((30_000 - ageMs) / 1000) }, 429);
      }
    }

    const code = generateOtp();
    const { error: insErr } = await supabase.from("line_link_otps").insert({
      line_user_id,
      phone: normPhone,
      code,
    });
    if (insErr) return ok({ ok: false, error: insErr.message }, 500);

    const msg =
      `รหัสยืนยันการเชื่อมบัญชี: ${code}\n` +
      `เบอร์: ${normPhone}\n` +
      `รหัสหมดอายุใน 5 นาที หากไม่ได้เป็นผู้ขอ ให้เพิกเฉยข้อความนี้`;
    const push = await pushLine(line_user_id, msg);
    if (!push.ok) {
      return ok({ ok: false, error: "line_push_failed", detail: push }, 502);
    }

    return ok({ ok: true, expires_in_sec: 300 });
  } catch (e) {
    return ok({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});