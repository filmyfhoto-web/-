// Passwordless login via 6-digit LINE OTP.
// Public endpoint — rate-limited, no JWT required. Used by the Login page.

import { pushLineText } from "../_shared/linePush.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { logCallbackFailure } from "../_shared/logCallbackFailure.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
const MAX_STARTS_PER_WINDOW = 3;
const START_WINDOW_MINUTES = 10;
const CODE_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("66") && digits.length === 11) return "0" + digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) return digits;
  return digits;
}

function generateCode(): string {
  // Use CSPRNG. Reject values in the biased tail so every 6-digit code is
  // equally likely (2**32 mod 1_000_000 == 704).
  const buf = new Uint32Array(1);
  const LIMIT = 4_294_000_000; // largest multiple of 1_000_000 <= 2**32
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= LIMIT);
  return String(n % 1_000_000).padStart(6, "0");
}

function randomPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let s = "";
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 32; i++) s += chars[arr[i] % chars.length];
  return s;
}

async function pushLine(to: string, text: string) {
  // Login OTP: time-critical and not a notification event, so it is delivered
  // synchronously — but still only through the shared provider adapter.
  const r = await pushLineText(LINE_TOKEN, to, text);
  return r.ok ? { ok: true } : { ok: false, status: r.status, body: r.error, reason: r.error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const rawPhone = String(body?.phone || "").trim();

    if (!rawPhone) {
      await logCallbackFailure({ reason: "invalid_phone", source: "line-login-code", status: 400, error: "missing_phone", req });
      return json({ ok: false, error: "missing_phone", message_th: "กรุณากรอกเบอร์โทรศัพท์" }, 400);
    }

    const phone = normalizePhone(rawPhone);
    if (!/^0[0-9]{9}$/.test(phone)) {
      await logCallbackFailure({ reason: "invalid_phone", source: "line-login-code", status: 400, req });
      return json({
        ok: false,
        error: "invalid_phone",
        message_th: "เบอร์โทรไม่ถูกต้อง (ต้องเป็นเบอร์มือถือไทย 10 หลัก)",
      }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profileRows, error: profileErr } = await admin.rpc(
      "find_profile_by_phone_for_login",
      { p_phone: phone },
    );
    const profile = (profileRows as any[])?.[0];
    if (profileErr || !profile) {
      await logCallbackFailure({ reason: "not_found", source: "line-login-code", status: 404, error: profileErr?.message, req, detail: { action } });
      return json({
        ok: false,
        error: "not_found",
        message_th: "ไม่พบบัญชีที่ผูก LINE ด้วยเบอร์นี้ กรุณาตรวจสอบเบอร์โทรหรือผูก LINE ในหน้าบัญชีก่อน",
      }, 404);
    }

    if (action === "start") {
      // Rate limit: count recent start attempts for this user
      const windowStart = new Date(Date.now() - START_WINDOW_MINUTES * 60_000).toISOString();
      const { count: recentCount, error: countErr } = await admin
        .from("line_otp_codes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("purpose", "login")
        .gte("created_at", windowStart);

      if (countErr) {
        console.error("rate-limit count error", countErr);
        return json({ ok: false, error: "internal_error", message_th: "ตรวจสอบจำกัดการใช้ไม่สำเร็จ" }, 500);
      }
      if ((recentCount ?? 0) >= MAX_STARTS_PER_WINDOW) {
        await logCallbackFailure({ reason: "rate_limited", source: "line-login-code", status: 429, req, detail: { action: "start" } });
        return json({
          ok: false,
          error: "rate_limited",
          message_th: `ขอรหัสบ่อยเกินไป กรุณารอ ${START_WINDOW_MINUTES} นาทีแล้วลองใหม่`,
        }, 429);
      }

      const code = generateCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
      const { error: insertErr } = await admin.from("line_otp_codes").insert({
        user_id: profile.id,
        code,
        purpose: "login",
        sent_to_line_user_id: profile.line_user_id,
        expires_at: expiresAt,
      });
      if (insertErr) {
        console.error("insert otp error", insertErr);
        return json({ ok: false, error: "insert_failed", message_th: "สร้างรหัสไม่สำเร็จ" }, 500);
      }

      const pushText = `รหัสเข้าสู่ระบบของคุณ: ${code}\nใช้ได้ ${CODE_TTL_MINUTES} นาที\nหากไม่ได้ขอรหัส กรุณาละเว้นข้อความนี้`;
      const pushResult = await pushLine(profile.line_user_id, pushText);
      if (!pushResult.ok) {
        console.error("line push failed", pushResult);
        await logCallbackFailure({ reason: "line_push_failed", source: "line-login-code", status: 502, error: JSON.stringify(pushResult).slice(0, 400), req });
        return json({
          ok: false,
          error: "line_push_failed",
          message_th: "ส่งรหัสไป LINE ไม่สำเร็จ กรุณาลองใหม่",
        }, 502);
      }

      return json({ ok: true, message_th: "ส่งรหัสไปทาง LINE แล้ว" });
    }

    if (action === "verify") {
      const rawCode = String(body?.code || "").trim();
      if (!/^\d{6}$/.test(rawCode)) {
        await logCallbackFailure({ reason: "invalid_code", source: "line-login-code", status: 400, req });
        return json({
          ok: false,
          error: "invalid_code",
          message_th: "รหัสต้องเป็นตัวเลข 6 หลัก",
        }, 400);
      }

      const now = new Date().toISOString();
      const { data: rows, error: findErr } = await admin
        .from("line_otp_codes")
        .select("id, code, attempts, consumed_at")
        .eq("user_id", profile.id)
        .eq("purpose", "login")
        .is("consumed_at", null)
        .gt("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(1);

      if (findErr || !rows || rows.length === 0) {
        await logCallbackFailure({ reason: "code_expired", source: "line-login-code", status: 400, error: findErr?.message, req });
        return json({
          ok: false,
          error: "code_expired",
          message_th: "รหัสหมดอายุหรือไม่ถูกต้อง กรุณาขอรหัสใหม่",
        }, 400);
      }

      const row = rows[0];
      if (row.code !== rawCode) {
        // Increment attempts and lock after too many failures
        const newAttempts = (row.attempts || 0) + 1;
        const shouldConsume = newAttempts >= MAX_ATTEMPTS;
        await admin
          .from("line_otp_codes")
          .update({ attempts: newAttempts, consumed_at: shouldConsume ? now : null })
          .eq("id", row.id);
        await logCallbackFailure({ reason: "wrong_code", source: "line-login-code", status: 400, req, detail: { attempts: newAttempts, locked: shouldConsume } });
        return json({
          ok: false,
          error: "wrong_code",
          message_th: shouldConsume
            ? "ใส่รหัสผิดหลายครั้ง รหัสนี้ถูกล็อกแล้ว กรุณาขอรหัสใหม่"
            : "รหัสไม่ถูกต้อง กรุณาลองใหม่",
        }, 400);
      }

      // Mark consumed
      await admin.from("line_otp_codes").update({ consumed_at: now }).eq("id", row.id);

      // Get auth user email and create a temporary password to sign in
      const { data: userData, error: userErr } = await admin.auth.admin.getUserById(profile.id);
      if (userErr || !userData?.user?.email) {
        console.error("get user error", userErr);
        return json({
          ok: false,
          error: "user_email_missing",
          message_th: "ไม่พบอีเมลของบัญชี กรุณาติดต่อผู้ดูแล",
        }, 500);
      }

      const tempPassword = randomPassword();
      const { error: updateErr } = await admin.auth.admin.updateUserById(profile.id, {
        password: tempPassword,
      });
      if (updateErr) {
        console.error("update password error", updateErr);
        return json({
          ok: false,
          error: "password_update_failed",
          message_th: "ตั้งรหัสผ่านชั่วคราวไม่สำเร็จ กรุณาลองใหม่",
        }, 500);
      }

      const { data: signInData, error: signInErr } = await admin.auth.signInWithPassword({
        email: userData.user.email,
        password: tempPassword,
      });
      if (signInErr || !signInData?.session) {
        console.error("sign in error", signInErr);
        return json({
          ok: false,
          error: "sign_in_failed",
          message_th: "สร้างเซสชันเข้าสู่ระบบไม่สำเร็จ",
        }, 500);
      }

      return json({
        ok: true,
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        expires_at: signInData.session.expires_at,
      });
    }

    await logCallbackFailure({ reason: "invalid_action", source: "line-login-code", status: 400, req, detail: { action } });
    return json({ ok: false, error: "invalid_action", message_th: "action ต้องเป็น start หรือ verify" }, 400);
  } catch (e) {
    console.error("line-login-code error", e);
    await logCallbackFailure({ reason: "internal_error", source: "line-login-code", status: 500, error: String((e as Error)?.message || e), req });
    return json({
      ok: false,
      error: "internal_error",
      message_th: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่",
    }, 500);
  }
});
