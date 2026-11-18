// Admin-only "ทดสอบ LINE Webhook": build a sample LINE text event, sign it with
// a real channel secret, POST it to the live line-webhook function, then verify
// the message landed in film_messages / film_conversations (the admin Inbox).
//
// No secret value is ever returned. The sample message is prefixed with [TEST]
// so the existing purge-test-data tool can clean it up.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { loadLineChannels } from "../_shared/lineChannels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error: authErr } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
    if (authErr || !claims?.claims) return json({ ok: false, error: "unauthorized" }, 401);
    const uid = (claims.claims as any).sub as string | undefined;
    if (uid) {
      const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
        supa.rpc("has_role", { _user_id: uid, _role: "admin" }),
        supa.rpc("has_role", { _user_id: uid, _role: "owner" }),
      ]);
      if (!isAdmin && !isOwner) return json({ ok: false, error: "forbidden" }, 403);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const wantedStore = String((body as any)?.store_id || "").trim();

    const channels = await loadLineChannels(admin);
    const usable = channels.filter((c) => c.secret);
    if (usable.length === 0) {
      return json({
        ok: false,
        verdict: "no_channel_secret",
        reason_th: "ยังไม่ได้ตั้งค่า Channel secret ของ LINE — ไปที่ ตั้งค่า LINE OA แล้วใส่ค่าก่อน",
        stores: channels.map((c) => ({ id: c.id, label: c.label, has_secret: false })),
      });
    }
    const channel = usable.find((c) => c.id === wantedStore) ?? usable[0];

    const stamp = Date.now();
    const nonce = crypto.randomUUID().slice(0, 8);
    const text = `[TEST] ทดสอบ webhook ${nonce}`;
    const lineUserId = `Utest${nonce.padEnd(28, "0")}`.slice(0, 33);
    const payload = {
      destination: "selftest",
      events: [
        {
          type: "message",
          mode: "active",
          timestamp: stamp,
          webhookEventId: `selftest-${nonce}`,
          deliveryContext: { isRedelivery: false },
          source: { type: "user", userId: lineUserId },
          replyToken: "00000000000000000000000000000000",
          message: { type: "text", id: `selftest-${stamp}`, text },
        },
      ],
    };
    const raw = JSON.stringify(payload);
    const signature = createHmac("sha256", channel.secret).update(raw).digest("base64");

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/line-webhook`;
    const t0 = Date.now();
    let httpStatus = 0;
    let httpBody = "";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-line-signature": signature },
        body: raw,
      });
      httpStatus = res.status;
      httpBody = (await res.text()).slice(0, 200);
    } catch (e) {
      return json({
        ok: false,
        verdict: "webhook_unreachable",
        reason_th: `เรียก webhook ไม่สำเร็จ: ${String((e as Error)?.message || e)}`,
        store: { id: channel.id, label: channel.label },
      });
    }
    const postMs = Date.now() - t0;

    if (httpStatus === 401) {
      return json({
        ok: false,
        verdict: "signature_rejected",
        reason_th: "webhook ปฏิเสธ signature — Channel secret ที่บันทึกไว้ไม่ตรงกับที่ระบบใช้ตรวจ",
        store: { id: channel.id, label: channel.label },
        http: { status: httpStatus, body: httpBody, latency_ms: postMs },
      });
    }

    // Poll for the inbox row (webhook writes are async-ish; give it ~6s).
    let message: any = null;
    for (let i = 0; i < 12 && !message; i++) {
      const { data } = await admin
        .from("film_messages")
        .select("id, conversation_id, text, direction, created_at")
        .eq("text", text)
        .order("created_at", { ascending: false })
        .limit(1);
      message = (data as any[])?.[0] ?? null;
      if (!message) await sleep(500);
    }

    let conversation: any = null;
    if (message?.conversation_id) {
      const { data } = await admin
        .from("film_conversations")
        .select("id, store_id, channel, display_name, last_message_preview, unread_count, last_message_at")
        .eq("id", message.conversation_id)
        .maybeSingle();
      conversation = data ?? null;
    }

    const { data: evRows } = await admin
      .from("line_webhook_events")
      .select("id, signature_ok, event_type, created_at")
      .order("created_at", { ascending: false })
      .limit(1);

    const totalMs = Date.now() - t0;
    if (!message) {
      return json({
        ok: false,
        verdict: "not_in_inbox",
        reason_th: "webhook รับข้อความแล้ว (HTTP " + httpStatus + ") แต่ยังไม่พบข้อความในตาราง Inbox ภายใน 6 วินาที",
        store: { id: channel.id, label: channel.label },
        sample: { text, line_user_id: lineUserId },
        http: { status: httpStatus, body: httpBody, latency_ms: postMs },
        latest_webhook_event: (evRows as any[])?.[0] ?? null,
      });
    }

    return json({
      ok: true,
      verdict: "delivered",
      reason_th: "ส่งข้อความตัวอย่างสำเร็จ — บันทึกลงฐานข้อมูลและขึ้นในกล่องข้อความแอดมินแล้ว",
      store: { id: channel.id, label: channel.label },
      sample: { text, line_user_id: lineUserId },
      http: { status: httpStatus, body: httpBody, latency_ms: postMs },
      total_ms: totalMs,
      message,
      conversation,
      latest_webhook_event: (evRows as any[])?.[0] ?? null,
      stores: usable.map((c) => ({ id: c.id, label: c.label })),
    });
  } catch (e) {
    console.error("line-webhook-selftest error", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
