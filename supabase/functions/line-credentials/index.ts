// Admin self-service LINE credentials manager.
// - status: masked info only (last4 / updated_at / bot name). Never returns raw values.
// - save:   validates shape, verifies the token against the LINE API, then stores
//           it in public.line_credentials (service-role only table).
// - test:   pushes a test message to every enabled admin recipient.
import { pushLineText } from "../_shared/linePush.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UID = /^U[0-9a-f]{32}$/;

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
    const body = await req.json().catch(() => ({} as any));
    const action = String((body as any)?.action || "status");
    // Each shop has its own LINE OA. `channel` selects which credential row we
    // read/write ("default" = ร้านที่ 1, "shop2" = ร้านที่ 2).
    const CHANNEL_IDS = ["default", "shop2", "runqueue"] as const;
    const rawChannel = String((body as any)?.channel || "default");
    const channel = (CHANNEL_IDS as readonly string[]).includes(rawChannel) ? rawChannel : "default";

    // Environment always wins over the database copy. DB values remain only as
    // a migration fallback and can be purged from this page.
    const envKeys = (id: string) => {
      const k = id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      return { token: `LINE_TOKEN_${k}`, secret: `LINE_SECRET_${k}` };
    };
    const envCreds = (id: string) => {
      const k = envKeys(id);
      let token = Deno.env.get(k.token) || "";
      let secret = Deno.env.get(k.secret) || "";
      if (id === "default") {
        token ||= Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
        secret ||= Deno.env.get("LINE_CHANNEL_SECRET") || "";
      }
      if (id === "shop2") {
        token ||= Deno.env.get("NW_LINE_CHANNEL_ACCESS_TOKEN") || "";
        secret ||= Deno.env.get("NW_LINE_CHANNEL_SECRET") || "";
      }
      return { token, secret };
    };

    const { data: row } = await admin.from("line_credentials").select("*").eq("id", channel).maybeSingle();
    const { token: envToken, secret: envSecret } = envCreds(channel);

    async function statusPayload() {
      const { data: r } = await admin.from("line_credentials").select("*").eq("id", channel).maybeSingle();
      const token = envToken || (r?.channel_access_token as string) || "";
      let bot: any = null;
      if (token) {
        try {
          const res = await fetch("https://api.line.me/v2/bot/info", { headers: { Authorization: `Bearer ${token}` } });
          bot = res.ok ? await res.json() : { error: `HTTP ${res.status}`, detail: (await res.text()).slice(0, 300) };
        } catch (e) { bot = { error: String((e as Error).message) }; }
      }
      const { count } = await admin
        .from("admin_line_recipients")
        .select("id", { count: "exact", head: true })
        .eq("enabled", true);
      return {
        ok: true,
        channel,
        source: envToken ? "env" : r?.channel_access_token ? "database" : "none",
        env_keys: envKeys(channel),
        env_ready: Boolean(envToken && envSecret),
        db_has_secrets: Boolean(r?.channel_access_token || r?.channel_secret),
        token_last4: (envToken ? envToken.slice(-4) : null) || (r?.token_last4 as string) || null,
        secret_last4: (envSecret ? envSecret.slice(-4) : null) || (r?.secret_last4 as string) || null,
        has_token: Boolean(r?.channel_access_token || envToken),
        has_secret: Boolean(r?.channel_secret || envSecret),
        updated_at: r?.updated_at || null,
        bot_valid: Boolean(bot && !bot.error),
        bot,
        recipients_enabled: count ?? 0,
      };
    }

    if (action === "status") return json(await statusPayload());

    // ลบค่า token/secret ออกจากฐานข้อมูล — ทำได้เฉพาะเมื่อมีค่าใน environment แล้ว
    if (action === "purge_db") {
      if (!envToken || !envSecret) {
        return json({ ok: false, error: "env_missing", env_keys: envKeys(channel) }, 400);
      }
      const { error } = await admin
        .from("line_credentials")
        .update({ channel_access_token: null, channel_secret: null, updated_at: new Date().toISOString(), updated_by: uid })
        .eq("id", channel);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, purged: channel });
    }

    if (action === "channels") {
      const { data: rows } = await admin
        .from("line_credentials")
        .select("id, bot_display_name, bot_basic_id, token_last4, secret_last4, updated_at");
      const map = new Map((rows ?? []).map((r: any) => [String(r.id), r]));
      const list = CHANNEL_IDS.map((id) => {
        const r: any = map.get(id);
        const { token: envT, secret: envS } = envCreds(id);
        return {
          id,
          label: id === "default" ? "ร้านที่ 1 (หลัก)" : id === "shop2" ? "ร้านที่ 2" : "รันคิว (NATTA.Q AI)",
          bot_display_name: r?.bot_display_name ?? null,
          bot_basic_id: r?.bot_basic_id ?? null,
          token_last4: r?.token_last4 ?? (envT ? envT.slice(-4) : null),
          secret_last4: r?.secret_last4 ?? (envS ? envS.slice(-4) : null),
          has_token: Boolean(r?.token_last4 || envT),
          has_secret: Boolean(r?.secret_last4 || envS),
          updated_at: r?.updated_at ?? null,
          env_keys: envKeys(id),
          env_ready: Boolean(envT && envS),
        };
      });
      return json({ ok: true, channels: list });
    }

    // ---- Easy enrollment helpers -------------------------------------------
    if (action === "gen_code") {
      const label = String((body as any)?.label || "").trim().slice(0, 60) || null;
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error } = await admin.from("admin_line_enroll_codes").insert({
        code, label, created_by: uid, expires_at,
      });
      if (error) return json({ ok: false, error: error.message }, 400);
      const { data: oa } = await admin
        .from("line_oa_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      const basicId = (oa as any)?.basic_id || (oa as any)?.line_id || null;
      return json({
        ok: true,
        code,
        expires_at,
        oa_url: basicId ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}` : null,
      });
    }

    if (action === "recent_senders") {
      const { data: evs } = await admin
        .from("line_webhook_events")
        .select("source_user_id, created_at")
        .not("source_user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      const { data: existing } = await admin.from("admin_line_recipients").select("line_user_id");
      const have = new Set((existing ?? []).map((r: any) => r.line_user_id));
      const seen = new Map<string, string>();
      for (const e of (evs ?? []) as any[]) {
        const u = String(e.source_user_id || "");
        if (!UID.test(u) || have.has(u) || seen.has(u)) continue;
        seen.set(u, e.created_at);
      }
      const token = (row?.channel_access_token as string) || envToken;
      const list = await Promise.all(Array.from(seen.entries()).slice(0, 12).map(async ([u, at]) => {
        let name: string | null = null;
        if (token) {
          try {
            const r = await fetch(`https://api.line.me/v2/bot/profile/${u}`, { headers: { Authorization: `Bearer ${token}` } });
            if (r.ok) name = (await r.json())?.displayName ?? null;
          } catch { /* ignore */ }
        }
        return { line_user_id: u, display_name: name, last_seen: at };
      }));
      return json({ ok: true, senders: list });
    }

    if (action === "add_recipient") {
      const to = String((body as any)?.line_user_id || "").trim();
      if (!UID.test(to)) return json({ ok: false, error: "รูปแบบ LINE User ID ไม่ถูกต้อง" }, 400);
      const label = String((body as any)?.label || "").trim().slice(0, 60) || null;
      const { error } = await admin
        .from("admin_line_recipients")
        .upsert({ line_user_id: to, label, enabled: true, notify_orders: true }, { onConflict: "line_user_id" });
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "save") {
      const token = String((body as any)?.channel_access_token || "").trim();
      const secret = String((body as any)?.channel_secret || "").trim();
      if (!token && !secret) return json({ ok: false, error: "ไม่มีค่าที่จะบันทึก" }, 400);
      if (token) {
        if (/^Bearer\s/i.test(token)) return json({ ok: false, error: "อย่ารวมคำว่า 'Bearer ' มาด้วย" }, 400);
        if (token.length < 80) return json({ ok: false, error: `Access token สั้นเกินไป (${token.length} ตัว) — ปกติยาว ~172 ตัว` }, 400);
        const res = await fetch("https://api.line.me/v2/bot/info", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          return json({ ok: false, error: "LINE ปฏิเสธ token นี้ (ตรวจสอบว่าคัดลอกจาก Messaging API → Channel access token long-lived)", status: res.status }, 400);
        }
        const info = await res.json().catch(() => ({}));
        await admin.from("line_credentials").upsert({
          id: channel,
          channel_access_token: token,
          token_last4: token.slice(-4),
          bot_basic_id: info?.basicId ?? null,
          bot_display_name: info?.displayName ?? null,
          updated_at: new Date().toISOString(),
          updated_by: uid,
        });
      }
      if (secret) {
        if (!/^[0-9a-f]{32}$/i.test(secret)) return json({ ok: false, error: `Channel secret ต้องเป็น hex 32 ตัว (ได้ ${secret.length} ตัว)` }, 400);
        await admin.from("line_credentials").upsert({
          id: channel,
          channel_secret: secret,
          secret_last4: secret.slice(-4),
          updated_at: new Date().toISOString(),
          updated_by: uid,
        });
      }
      await admin.from("activity_logs").insert({
        user_id: uid,
        action: "line.credentials_updated",
        target_type: "secret",
        detail: { channel, token: token ? `••••${token.slice(-4)}` : null, secret: secret ? `••••${secret.slice(-4)}` : null },
      });
      return json(await statusPayload());
    }

    if (action === "test") {
      const token = (row?.channel_access_token as string) || envToken;
      if (!token) return json({ ok: false, error: "ยังไม่มี Channel access token" }, 400);
      const targets = new Set<string>();
      const envAdmin = (Deno.env.get("LINE_ADMIN_USER_ID") || "").trim();
      if (UID.test(envAdmin)) targets.add(envAdmin);
      const { data: recips } = await admin
        .from("admin_line_recipients")
        .select("line_user_id, label")
        .eq("enabled", true);
      for (const r of (recips ?? []) as any[]) {
        const u = String(r.line_user_id || "").trim();
        if (UID.test(u)) targets.add(u);
      }
      const only = String((body as any)?.to || "").trim();
      const list = UID.test(only) ? [only] : Array.from(targets);
      if (list.length === 0) return json({ ok: false, error: "ยังไม่มีผู้รับแจ้งเตือน — เพิ่มอุปกรณ์/บัญชีก่อน" }, 400);
      const text = `🔔 ทดสอบแจ้งเตือนจากระบบ\nเวลา: ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}\nถ้าคุณเห็นข้อความนี้ แสดงว่าตั้งค่าถูกต้องแล้ว`;
      const results = await Promise.all(list.map(async (to) => {
        const r = await pushLineText(token, to, text);
        return { to, ok: r.ok, status: r.status ?? 0, body: r.ok ? null : String(r.error || "").slice(0, 300) };
      }));
      return json({ ok: results.every((r) => r.ok), results });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("line-credentials error", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
