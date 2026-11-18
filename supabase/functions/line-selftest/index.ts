// Admin/staff-only diagnostics for the LINE Messaging API webhook.
//   kind="webhook_signature" — locally computes HMAC-SHA256 over a mock body with
//                              LINE_CHANNEL_SECRET, plus reports signature stats from
//                              the last N real webhook events. Never mutates state.
// No secret values are ever returned in the response body.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims, error: authErr } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
    if (authErr || !claims?.claims) return json({ ok: false, error: "unauthorized" }, 401);

    // Role gate: admin or staff only.
    const uid = (claims.claims as any).sub as string | undefined;
    if (uid) {
      const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
        supa.rpc("has_role", { _user_id: uid, _role: "admin" }),
        supa.rpc("has_role", { _user_id: uid, _role: "owner" }),
      ]);
      if (!isAdmin && !isOwner) return json({ ok: false, error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const kind = String((body as any)?.kind || "");

    if (kind === "webhook_signature") return await testWebhookSignature();
    return json({ ok: false, error: "unknown_kind", reason_th: "kind ต้องเป็น 'webhook_signature'" }, 400);
  } catch (e) {
    console.error("line-selftest error", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});

async function testWebhookSignature() {
  const secret = Deno.env.get("LINE_CHANNEL_SECRET") || "";
  const shape = /^[0-9a-f]{32}$/i.test(secret) ? "hex32_ok" : secret ? "set_but_unexpected_shape" : "missing";

  if (shape !== "hex32_ok") {
    return json({
      ok: false,
      verdict: "shape_invalid",
      reason_th: shape === "missing"
        ? "ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET (Messaging API → Basic settings → Channel secret)"
        : "LINE_CHANNEL_SECRET รูปแบบไม่ตรง — ต้องเป็น hex 32 ตัว (a-f, 0-9) จาก Messaging API channel เท่านั้น",
      shape,
    });
  }

  // Compute HMAC locally over a canonical mock body. Same algorithm as line-webhook.
  const mockBody = JSON.stringify({ destination: "selftest", events: [] });
  const digest = createHmac("sha256", secret).update(mockBody).digest("base64");
  const digestOk = typeof digest === "string" && digest.length > 0;

  // Read recent real webhook events to see whether LINE-issued signatures pass locally.
  let recent: { total: number; ok: number; bad: number; latest_at?: string; latest_ok?: boolean } | null = null;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("line_webhook_events")
      .select("signature_ok, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = (data as any[]) || [];
    if (rows.length > 0) {
      const ok = rows.filter((r) => r.signature_ok === true).length;
      const bad = rows.filter((r) => r.signature_ok === false).length;
      recent = { total: rows.length, ok, bad, latest_at: rows[0].created_at, latest_ok: rows[0].signature_ok === true };
    }
  } catch (e) {
    console.warn("selftest: failed to read line_webhook_events", e);
  }

  if (!digestOk) {
    return json({
      ok: false,
      verdict: "hmac_failed",
      reason_th: "คำนวณ HMAC ไม่สำเร็จ — ลองใหม่",
    });
  }

  if (recent && recent.bad > 0 && recent.ok === 0) {
    return json({
      ok: false,
      verdict: "live_signature_mismatch",
      reason_th: "Webhook เข้ามาแล้วแต่ signature verify ไม่ผ่าน — LINE_CHANNEL_SECRET ไม่ตรงกับที่ Messaging API channel ใช้ ให้คัดลอก Channel secret ใหม่จาก channel เดียวกันกับที่ตั้ง Webhook URL ไว้",
      recent_events: recent,
    });
  }
  if (recent && recent.ok > 0) {
    return json({
      ok: true,
      verdict: "live_signature_ok",
      reason_th: `Webhook ล่าสุด verify ผ่าน (${recent.ok}/${recent.total} ครั้งใน 20 event ล่าสุด) — LINE_CHANNEL_SECRET ตรงกับที่ LINE ใช้`,
      recent_events: recent,
    });
  }
  return json({
    ok: true,
    verdict: "shape_ok_no_live_events",
    reason_th: "LINE_CHANNEL_SECRET รูปแบบถูก (hex 32) และคำนวณ HMAC ได้ปกติ — ยังไม่มี webhook จริงเข้ามาให้เทียบ กด 'Verify' ในหน้า Webhook URL ของ LINE Console เพื่อยิงตัวอย่างเข้ามาก่อน",
    recent_events: recent,
  });
}
