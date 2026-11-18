// Film Shop — จัดการคีย์ LINE OA ของ "น้องนัตต้า" (แถว line_credentials id='natta')
//
// ความปลอดภัย:
// - เฉพาะผู้ใช้ที่ล็อกอินและมีบทบาท owner/admin (ผ่าน RPC has_role)
// - แตะได้เฉพาะแถว id='natta' เท่านั้น (ไม่รับ id จากผู้เรียก)
// - ไม่คืนค่า secret/token ดิบกลับไปเด็ดขาด — คืนเฉพาะ boolean + last4
import { createClient } from "npm:@supabase/supabase-js@2";

const CHANNEL_ID = "natta" as const;
const DISPLAY_NAME = "น้องนัตต้า";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const last4 = (v: string) => (v ? v.slice(-4) : null);

export function validateCredentials(input: {
  channel_id?: unknown;
  channel_secret?: unknown;
  channel_access_token?: unknown;
}): { ok: true; value: { channel_id: string; channel_secret: string; channel_access_token: string } } | { ok: false; reason: string } {
  const channelId = String(input.channel_id ?? "").trim();
  const secret = String(input.channel_secret ?? "").trim();
  const token = String(input.channel_access_token ?? "").trim();

  if (!/^\d{8,15}$/.test(channelId)) return { ok: false, reason: "Channel ID ต้องเป็นตัวเลข 8–15 หลัก" };
  if (!/^[0-9a-f]{32}$/i.test(secret)) return { ok: false, reason: "Channel Secret ต้องเป็นตัวอักษร hex 32 ตัว" };
  if (/^Bearer\s/i.test(token)) return { ok: false, reason: "อย่ารวมคำว่า 'Bearer ' ใน Access Token" };
  if (token.length < 80) return { ok: false, reason: `Access Token สั้นเกินไป (${token.length} ตัว) — ปกติยาวกว่า 150 ตัว` };
  return { ok: true, value: { channel_id: channelId, channel_secret: secret, channel_access_token: token } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await supa.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ ok: false, error: "unauthorized" }, 401);
    const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
      supa.rpc("has_role", { _user_id: uid, _role: "admin" }),
      supa.rpc("has_role", { _user_id: uid, _role: "owner" }),
    ]);
    if (!isAdmin && !isOwner) return json({ ok: false, error: "forbidden" }, 403);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String((body as any)?.action || "status");

    const readStatus = async () => {
      const { data: r } = await admin
        .from("line_credentials")
        .select("id, channel_id, channel_secret, channel_access_token, secret_last4, token_last4, bot_display_name, is_active, updated_at")
        .eq("id", CHANNEL_ID)
        .maybeSingle();
      const envSecret = Deno.env.get("LINE_SECRET_NATTA") || "";
      const envToken = Deno.env.get("LINE_TOKEN_NATTA") || "";
      const secret = envSecret || (r?.channel_secret as string) || "";
      const token = envToken || (r?.channel_access_token as string) || "";
      return {
        ok: true,
        channel: CHANNEL_ID,
        exists: Boolean(r),
        channel_id: (r?.channel_id as string) ?? null,
        display_name: (r?.bot_display_name as string) ?? DISPLAY_NAME,
        secret_configured: Boolean(secret),
        token_configured: Boolean(token),
        secret_last4: secret ? last4(secret) : ((r?.secret_last4 as string) ?? null),
        token_last4: token ? last4(token) : ((r?.token_last4 as string) ?? null),
        is_active: Boolean(r?.is_active),
        updated_at: (r?.updated_at as string) ?? null,
        webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/line-webhook?ch=${CHANNEL_ID}`,
      };
    };

    if (req.method === "GET" || action === "status") return json(await readStatus());

    if (action !== "save") return json({ ok: false, error: "invalid_action" }, 400);

    const v = validateCredentials(body as any);
    if (!v.ok) return json({ ok: false, error: "invalid_shape", reason: v.reason }, 400);

    const { error } = await admin.from("line_credentials").upsert({
      id: CHANNEL_ID,
      channel_id: v.value.channel_id,
      channel_secret: v.value.channel_secret,
      channel_access_token: v.value.channel_access_token,
      secret_last4: last4(v.value.channel_secret),
      token_last4: last4(v.value.channel_access_token),
      bot_display_name: DISPLAY_NAME,
      display_name: DISPLAY_NAME,
      is_active: true,
      updated_by: uid,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) return json({ ok: false, error: "save_failed", reason: error.message }, 500);

    try {
      await admin.from("activity_logs").insert({
      user_id: uid,
      action: "line.natta_credentials_saved",
      target_type: "line_credentials",
      detail: {
        channel: CHANNEL_ID,
        secret_last4: last4(v.value.channel_secret),
        token_last4: last4(v.value.channel_access_token),
        },
      });
    } catch { /* audit log is best-effort */ }

    return json({ ...(await readStatus()), saved: true });
  } catch (e) {
    console.error("film-natta-line-credentials error", (e as Error)?.message);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
