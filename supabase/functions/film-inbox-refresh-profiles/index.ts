// Film Shop Inbox — staff-triggered refresh of LINE customer profiles.
//
// Fetches displayName/pictureUrl from the LINE Messaging API for conversations
// whose avatar is still missing (or for one conversation when an id is given)
// and caches it in line_store_customers / line_account_links /
// film_conversations. Tokens stay server-side.
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadLineChannels } from "../_shared/lineChannels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const REASON_TH: Record<string, string> = {
  unauthorized: "กรุณาเข้าสู่ระบบอีกครั้ง",
  forbidden: "ไม่มีสิทธิ์ดึงข้อมูลโปรไฟล์ลูกค้า",
  not_configured: "ยังไม่ได้ตั้งค่า LINE OA",
  nothing_to_do: "ไม่มีลูกค้าที่ต้องดึงรูปโปรไฟล์",
  exception: "เกิดข้อผิดพลาดชั่วคราว",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (reason: string, extra: Record<string, unknown> = {}) =>
  json({ ok: false, reason, message_th: REASON_TH[reason] ?? reason, ...extra });

const MAX_TARGETS = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("forbidden");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return fail("unauthorized");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });

  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user) return fail("unauthorized");
  const { data: isStaff } = await admin.rpc("is_staff", { _user_id: user.id });
  if (!isStaff) return fail("forbidden");

  const body = await req.json().catch(() => ({}));
  const conversationId = String((body as any)?.conversation_id || "");
  const storeId = String((body as any)?.store_id || "");
  const force = Boolean((body as any)?.force);

  try {
    let q = admin
      .from("film_conversations")
      .select("id, store_id, external_user_id, avatar_url, display_name")
      .eq("channel", "line")
      .not("external_user_id", "is", null)
      .limit(MAX_TARGETS);
    if (conversationId) q = q.eq("id", conversationId);
    else if (storeId && storeId !== "all") q = q.eq("store_id", storeId);
    if (!conversationId && !force) q = q.is("avatar_url", null);

    const { data: convs, error } = await q;
    if (error) throw error;
    const targets = (convs ?? []) as Array<{ id: string; store_id: string; external_user_id: string; avatar_url: string | null }>;
    if (!targets.length) return json({ ok: true, checked: 0, updated: 0, message_th: REASON_TH.nothing_to_do });

    const channels = await loadLineChannels(admin);
    if (!channels.some((c) => c.token)) return fail("not_configured");

    const tokenFor = (sid: string) =>
      channels.find((c) => c.id === sid && c.token)?.token
      ?? channels.find((c) => c.id === `${sid}:env` && c.token)?.token
      ?? channels.find((c) => c.token)?.token
      ?? "";

    let updated = 0;
    const now = new Date().toISOString();

    for (const conv of targets) {
      const token = tokenFor(conv.store_id);
      if (!token) continue;
      let prof: { displayName?: string; pictureUrl?: string; statusMessage?: string } | null = null;
      // Try this store's token first, then any other configured token — a
      // conversation may have been stored under a different channel id.
      const tokens = Array.from(new Set([token, ...channels.map((c) => c.token).filter(Boolean)]));
      for (const t of tokens) {
        try {
          const r = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(conv.external_user_id)}`, {
            headers: { Authorization: `Bearer ${t}` },
          });
          if (r.ok) { prof = await r.json(); break; }
          await r.text().catch(() => "");
        } catch { /* try next token */ }
      }
      if (!prof?.pictureUrl && !prof?.displayName) continue;

      const picture = prof.pictureUrl && /^https:\/\//i.test(prof.pictureUrl) ? prof.pictureUrl : null;
      await admin.from("line_store_customers").upsert({
        store_id: conv.store_id,
        line_user_id: conv.external_user_id,
        display_name: prof.displayName ?? null,
        picture_url: picture,
        status_message: prof.statusMessage ?? null,
        updated_at: now,
      }, { onConflict: "store_id,line_user_id" });

      if (picture || prof.displayName) {
        await admin.from("line_account_links").upsert({
          line_user_id: conv.external_user_id,
          display_name: prof.displayName ?? null,
          picture_url: picture,
        }, { onConflict: "line_user_id" });
      }

      const patch: Record<string, unknown> = {};
      if (picture) patch.avatar_url = picture;
      if (prof.displayName) patch.display_name = prof.displayName;
      if (Object.keys(patch).length) {
        await admin.from("film_conversations").update(patch).eq("id", conv.id);
        updated++;
      }
    }

    return json({
      ok: true,
      checked: targets.length,
      updated,
      message_th: updated > 0
        ? `อัปเดตรูปโปรไฟล์ ${updated} รายการ`
        : "ยังดึงรูปไม่ได้ (ลูกค้าอาจไม่ได้เป็นเพื่อนกับ LINE OA)",
    });
  } catch (e) {
    console.error("film-inbox-refresh-profiles error", e);
    return fail("exception", { detail: String((e as Error)?.message || e) });
  }
});
