// Film Shop Inbox — per-store readiness diagnostics (staff only).
//
// Returns booleans, counts and timestamps ONLY. No channel secret, access
// token or message body ever leaves this function. Nothing is mutated: this
// endpoint never rotates a secret and never sends a customer-visible message.
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type StoreState = "ready" | "setup_required" | "token_invalid" | "webhook_unverified";

async function probe(url: string, token: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    const payload = res.ok ? await res.json().catch(() => ({})) : null;
    return { ok: res.ok, status: res.status, payload };
  } catch {
    return { ok: false, status: 0, payload: null };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ ok: false, reason: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });

  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ ok: false, reason: "unauthorized" }, 401);
  const { data: isStaff } = await admin.rpc("is_staff", { _user_id: user.id });
  if (!isStaff) return json({ ok: false, reason: "forbidden" }, 403);

  try {
    // ช่อง env ที่ซ้ำกับร้านใน DB ใช้ตรวจลายเซ็นเท่านั้น ไม่ต้องรายงานเป็นร้าน
    const channels = (await loadLineChannels(admin)).filter((c) => !c.signatureOnly);

    const stores = await Promise.all(channels.map(async (ch) => {
      const hasSecret = Boolean(ch.secret);
      const hasToken = Boolean(ch.token);
      let state: StoreState = "setup_required";
      let botName: string | null = null;
      let webhookActive: boolean | null = null;

      if (hasSecret && hasToken) {
        const info = await probe("https://api.line.me/v2/bot/info", ch.token);
        if (!info.ok) {
          state = "token_invalid";
        } else {
          botName = (info.payload as any)?.displayName ?? null;
          const hook = await probe("https://api.line.me/v2/bot/channel/webhook/endpoint", ch.token);
          webhookActive = hook.ok ? Boolean((hook.payload as any)?.active) : null;
          state = webhookActive === false ? "webhook_unverified" : "ready";
        }
      }

      const [{ count: convCount }, { data: lastEvent }] = await Promise.all([
        admin.from("film_conversations").select("id", { count: "exact", head: true })
          .eq("channel", "line").eq("store_id", ch.id),
        admin.from("line_webhook_events").select("received_at, signature_ok")
          .order("received_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      return {
        id: ch.id,
        label: ch.label ?? ch.id,
        has_secret: hasSecret,
        has_token: hasToken,
        state,
        bot_display_name: botName,
        webhook_active: webhookActive,
        conversation_count: convCount ?? 0,
        last_webhook_at: (lastEvent as any)?.received_at ?? null,
        last_webhook_signature_ok: (lastEvent as any)?.signature_ok ?? null,
        missing: [!hasSecret && "LINE channel secret", !hasToken && "LINE channel access token"].filter(Boolean),
      };
    }));

    const [inbound, outbound, failed, conv] = await Promise.all([
      admin.from("film_messages").select("created_at").eq("direction", "inbound")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("film_messages").select("sent_at").eq("direction", "outbound").eq("delivery_status", "sent")
        .order("sent_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("film_messages").select("id", { count: "exact", head: true }).eq("delivery_status", "failed"),
      admin.from("film_conversations").select("id, last_order_id, customer_id").limit(500),
    ]);

    const rows = (conv.data ?? []) as any[];
    return json({
      ok: true,
      stores,
      inbox: {
        conversations: rows.length,
        linked_customers: rows.filter((r) => r.customer_id).length,
        with_order: rows.filter((r) => r.last_order_id).length,
        last_inbound_at: (inbound.data as any)?.created_at ?? null,
        last_outbound_sent_at: (outbound.data as any)?.sent_at ?? null,
        failed_outbound: failed.count ?? 0,
      },
      checked_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("film-inbox-readiness error", String((e as Error)?.message || e));
    return json({ ok: false, reason: "exception" }, 500);
  }
});