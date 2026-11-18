// Records an audit entry when an admin submits a proposed new value for a LINE
// secret. Edge functions cannot mutate Lovable-managed secrets, so this
// function only (a) authorizes the caller, (b) validates the shape client-
// safely and (c) logs a masked record (last-4 + length + sha256 prefix) to
// activity_logs so the change trail is preserved even before the value is
// applied through the Lovable secrets tool.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const ALLOWED = new Set([
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_LOGIN_CHANNEL_TOKEN",
  "LINE_LOGIN_CHANNEL_SECRET",
  "LINE_CHANNEL_SECRET",
  "LINE_LOGIN_CHANNEL_ID",
  "LINE_ADMIN_USER_ID",
  "LIFF_ID",
]);

function validate(name: string, value: string): { ok: boolean; reason: string } {
  if (!value || value.length === 0) return { ok: false, reason: "ค่าว่าง" };
  if (value !== value.trim()) return { ok: false, reason: "มี whitespace หัว/ท้าย" };
  if (name === "LINE_CHANNEL_ACCESS_TOKEN" || name === "LINE_LOGIN_CHANNEL_TOKEN") {
    if (/^Bearer\s/i.test(value)) return { ok: false, reason: "อย่ารวมคำว่า 'Bearer '" };
    if (/^[0-9a-f]{32}$/i.test(value)) return { ok: false, reason: "ค่านี้เป็น hex 32 ตัว — น่าจะเป็น Channel Secret ไม่ใช่ Access Token" };
    if (value.length < 80) return { ok: false, reason: `ยาว ${value.length} — access token มักยาว ~172` };
    return { ok: true, reason: "รูปแบบผ่าน (token ยาว)" };
  }
  if (name === "LINE_LOGIN_CHANNEL_SECRET" || name === "LINE_CHANNEL_SECRET") {
    if (!/^[0-9a-f]{32}$/i.test(value)) return { ok: false, reason: `ต้องเป็น hex 32 ตัว (ได้ ${value.length})` };
    return { ok: true, reason: "รูปแบบผ่าน (hex 32)" };
  }
  if (name === "LINE_LOGIN_CHANNEL_ID") {
    if (/^[0-9a-f]{32}$/i.test(value)) return { ok: false, reason: "ค่านี้เป็น hex 32 ตัว — น่าจะเป็น Channel Secret ไม่ใช่ Channel ID" };
    if (!/^\d{8,15}$/.test(value)) return { ok: false, reason: `ต้องเป็นตัวเลข 8–15 หลัก (ได้ ${value.length})` };
    return { ok: true, reason: "รูปแบบผ่าน (Channel ID)" };
  }
  if (name === "LINE_ADMIN_USER_ID") {
    if (!/^U[0-9a-f]{32}$/i.test(value)) return { ok: false, reason: "ต้องขึ้นต้นด้วย U ตามด้วย hex 32 ตัว" };
    return { ok: true, reason: "รูปแบบผ่าน (LINE userId)" };
  }
  if (name === "LIFF_ID") {
    if (!/^\d+-[a-zA-Z0-9]+$/.test(value)) return { ok: false, reason: "รูปแบบ LIFF ID ควรเป็น 1234567890-abcdefg" };
    return { ok: true, reason: "รูปแบบผ่าน (LIFF ID)" };
  }
  return { ok: false, reason: "ชื่อ secret ไม่ได้รับอนุญาต" };
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
    const { data: userData } = await supa.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ ok: false, error: "unauthorized" }, 401);
    const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
      supa.rpc("has_role", { _user_id: uid, _role: "admin" }),
      supa.rpc("has_role", { _user_id: uid, _role: "owner" }),
    ]);
    if (!isAdmin && !isOwner) return json({ ok: false, error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const name = String((body as any)?.name || "");
    const value = String((body as any)?.value || "");
    if (!ALLOWED.has(name)) return json({ ok: false, error: "invalid_secret_name" }, 400);

    const v = validate(name, value);
    if (!v.ok) return json({ ok: false, error: "invalid_shape", reason: v.reason }, 400);

    const last4 = value.slice(-4);
    const length = value.length;
    const sha256_prefix8 = createHash("sha256").update(value).digest("hex").slice(0, 8);

    await supa.from("activity_logs").insert({
      user_id: uid,
      action: "line.secret_update_request",
      target_type: "secret",
      detail: { name, last4, length, sha256_prefix8, submitted_at: new Date().toISOString() },
    });

    return json({
      ok: true,
      requires_manual_update: true,
      message: "บันทึกคำขออัปเดตแล้ว — Lovable Cloud secret ต้องอัปเดตผ่านผู้พัฒนา (เครื่องมือ Lovable) เพื่อความปลอดภัย ค่าที่คุณส่งไม่ได้ถูกจัดเก็บ",
      fingerprint: { name, last4, length, sha256_prefix8 },
    });
  } catch (e) {
    console.error("line-secret-update error", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});