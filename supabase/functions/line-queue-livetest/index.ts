// Admin-only "ยิงจริงในกลุ่ม LINE": สร้าง event ข้อความกลุ่มจริง เซ็นด้วย channel
// secret ของช่องนั้น แล้วส่งเข้า line-webhook ตัวจริง เพื่อให้บอทตอบกลับในกลุ่มจริง
//
// ไม่มีการคืนค่า secret ใด ๆ ผู้เรียกต้องเป็น admin/owner เท่านั้น
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { loadLineChannels } from "../_shared/lineChannels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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

  const body = await req.json().catch(() => ({}));
  const groupId = String((body as any)?.group_id || "").trim();
  const text = String((body as any)?.text || "").trim();
  const channelId = String((body as any)?.channel_id || "runqueue").trim();
  const lineUserId = String((body as any)?.line_user_id || "").trim();
  if (!groupId || !text || !lineUserId) return json({ ok: false, error: "missing_params" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ห้องต้องผูกไว้จริง และผู้ส่งต้องเป็นบัญชี LINE ที่ผูกกับพนักงาน/แอดมินแล้ว
  const { data: room } = await admin
    .from("line_notification_channels")
    .select("id, display_name")
    .eq("line_destination_id", groupId)
    .eq("is_active", true)
    .maybeSingle();
  if (!room) return json({ ok: false, error: "room_not_bound" }, 400);
  const { data: binding } = await admin
    .from("staff_line_bindings")
    .select("line_user_id")
    .eq("line_user_id", lineUserId)
    .eq("status", "approved")
    .maybeSingle();
  if (!binding) return json({ ok: false, error: "sender_not_bound" }, 400);

  const channels = await loadLineChannels(admin);
  const ch = channels.find((c) => c.id === channelId && c.secret);
  if (!ch) return json({ ok: false, error: "no_channel_secret" }, 400);

  const stamp = Date.now();
  const nonce = crypto.randomUUID().slice(0, 8);
  const payload = {
    destination: "livetest",
    events: [{
      type: "message",
      mode: "active",
      timestamp: stamp,
      webhookEventId: `livetest-${nonce}`,
      deliveryContext: { isRedelivery: false },
      source: { type: "group", groupId, userId: lineUserId },
      replyToken: "00000000000000000000000000000000",
      message: { type: "text", id: `livetest-${stamp}`, text },
    }],
  };
  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", ch.secret).update(raw).digest("base64");
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/line-webhook`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-line-signature": signature },
    body: raw,
  });
  const detail = (await res.text()).slice(0, 300);

  await new Promise((r) => setTimeout(r, 1500));
  const { data: log } = await admin
    .from("line_webhook_events")
    .select("handler_result, created_at")
    .eq("webhook_event_id", `livetest-${nonce}`)
    .maybeSingle();

  return json({
    ok: res.ok,
    status: res.status,
    room: room.display_name,
    sent_text: text,
    webhook_response: detail,
    handler_result: log?.handler_result ?? null,
  });
});
