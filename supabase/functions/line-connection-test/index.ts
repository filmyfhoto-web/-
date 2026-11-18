// Admin-only diagnostic that pings LINE Messaging API endpoints and reports
// per-check status. All checks are read-only or use LINE's built-in test
// endpoints (no real user messages). Every run is written to activity_logs.

import { pushLineText } from "../_shared/linePush.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

type Check = {
  name: string;
  label: string;
  ok: boolean;
  status: "ok" | "fail" | "skip" | "warn";
  detail?: string;
  hint?: string;
  latency_ms?: number;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ res?: T; err?: unknown; ms: number }> {
  const t0 = Date.now();
  try { return { res: await fn(), ms: Date.now() - t0 }; }
  catch (err) { return { err, ms: Date.now() - t0 }; }
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
    const only = String((body as any)?.only || "all"); // all | token | webhook | push

    const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
    const adminUserId = Deno.env.get("LINE_ADMIN_USER_ID") || "";
    const checks: Check[] = [];

    // 0) Identity check (LINE_LOGIN_CHANNEL_ID + LINE_ADMIN_USER_ID)
    if (only === "identity") {
      const loginId = Deno.env.get("LINE_LOGIN_CHANNEL_ID") || "";
      if (!loginId) {
        checks.push({ name: "login_channel_id", label: "LINE_LOGIN_CHANNEL_ID", ok: false, status: "fail",
          detail: "ยังไม่ได้ตั้งค่า", hint: "LINE Developers Console → LINE Login channel → Basic settings → Channel ID" });
      } else if (!/^\d{8,15}$/.test(loginId)) {
        checks.push({ name: "login_channel_id", label: "LINE_LOGIN_CHANNEL_ID", ok: false, status: "warn",
          detail: `ตั้งไว้แล้วแต่รูปแบบผิดปกติ (ควรเป็นตัวเลข 8–15 หลัก, ได้ยาว ${loginId.length})`,
          hint: "ตรวจว่า copy มาจากช่อง Channel ID จริง ไม่ใช่ Channel secret" });
      } else {
        checks.push({ name: "login_channel_id", label: "LINE_LOGIN_CHANNEL_ID", ok: true, status: "ok",
          detail: `ตั้งไว้แล้ว: ${loginId.slice(0, 4)}…${loginId.slice(-4)} (${loginId.length} หลัก)` });
      }
      if (!adminUserId) {
        checks.push({ name: "admin_user_id", label: "LINE_ADMIN_USER_ID", ok: false, status: "fail",
          detail: "ยังไม่ได้ตั้งค่า", hint: "ให้แอดมินทัก OA แล้วดู userId จาก /admin/line-webhook-events" });
      } else if (!/^U[0-9a-f]{32}$/.test(adminUserId)) {
        checks.push({ name: "admin_user_id", label: "LINE_ADMIN_USER_ID", ok: false, status: "fail",
          detail: `รูปแบบผิด (ต้องขึ้นต้น U + hex 32 ตัว, ได้ยาว ${adminUserId.length})`,
          hint: "คัดลอก userId ที่ขึ้นต้น 'U' จาก webhook events" });
      } else {
        checks.push({ name: "admin_user_id", label: "LINE_ADMIN_USER_ID", ok: true, status: "ok",
          detail: `ตั้งไว้แล้ว: ${adminUserId.slice(0, 5)}…${adminUserId.slice(-4)}` });
      }
    }

    // 1) Token check → GET /v2/bot/info
    if (only === "all" || only === "token") {
      if (!token) {
        checks.push({
          name: "token", label: "Channel access token",
          ok: false, status: "fail",
          detail: "LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า",
          hint: "ตั้ง secret ที่ /admin/line-secret-vault หรือขอ Lovable รัน update_secret",
        });
      } else {
        const r = await timed(async () => {
          const res = await fetch("https://api.line.me/v2/bot/info", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const text = await res.text();
          return { status: res.status, text };
        });
        if (r.err) {
          checks.push({ name: "token", label: "Channel access token", ok: false, status: "fail", detail: String((r.err as Error)?.message), latency_ms: r.ms });
        } else if (r.res!.status === 200) {
          let bot: any = {}; try { bot = JSON.parse(r.res!.text); } catch { /* noop */ }
          checks.push({
            name: "token", label: "Channel access token",
            ok: true, status: "ok",
            detail: `OA: ${bot.displayName || "?"} (basicId: ${bot.basicId || "—"})`,
            latency_ms: r.ms,
          });
        } else if (r.res!.status === 401) {
          checks.push({ name: "token", label: "Channel access token", ok: false, status: "fail",
            detail: `401 Unauthorized — token ผิดหรือถูก revoke`,
            hint: "ออก access token ใหม่ที่ LINE Developers Console → Messaging API",
            latency_ms: r.ms });
        } else {
          checks.push({ name: "token", label: "Channel access token", ok: false, status: "fail",
            detail: `HTTP ${r.res!.status}: ${r.res!.text.slice(0, 160)}`, latency_ms: r.ms });
        }
      }
    }

    // 2) Webhook endpoint check → GET /v2/bot/channel/webhook/endpoint
    if ((only === "all" || only === "webhook") && token) {
      const r = await timed(async () => {
        const res = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: res.status, text: await res.text() };
      });
      if (r.err) {
        checks.push({ name: "webhook_endpoint", label: "Webhook endpoint", ok: false, status: "fail", detail: String((r.err as Error)?.message), latency_ms: r.ms });
      } else if (r.res!.status === 200) {
        let ep: any = {}; try { ep = JSON.parse(r.res!.text); } catch { /* noop */ }
        checks.push({
          name: "webhook_endpoint", label: "Webhook endpoint",
          ok: !!ep.active,
          status: ep.active ? "ok" : "warn",
          detail: `URL: ${ep.endpoint || "(ยังไม่ตั้ง)"} · active=${ep.active ? "ON" : "OFF"}`,
          hint: !ep.active ? "เปิด 'Use webhook' ใน LINE Developers Console → Messaging API" : undefined,
          latency_ms: r.ms,
        });
      } else {
        checks.push({ name: "webhook_endpoint", label: "Webhook endpoint", ok: false, status: "fail",
          detail: `HTTP ${r.res!.status}: ${r.res!.text.slice(0, 160)}`, latency_ms: r.ms });
      }

      // 3) Webhook reachability → POST /v2/bot/channel/webhook/test
      const t = await timed(async () => {
        const res = await fetch("https://api.line.me/v2/bot/channel/webhook/test", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        return { status: res.status, text: await res.text() };
      });
      if (t.err) {
        checks.push({ name: "webhook_reach", label: "Webhook reachability", ok: false, status: "fail", detail: String((t.err as Error)?.message), latency_ms: t.ms });
      } else if (t.res!.status === 200) {
        let res: any = {}; try { res = JSON.parse(t.res!.text); } catch { /* noop */ }
        const success = res.success === true || res.statusCode === 200;
        checks.push({
          name: "webhook_reach", label: "Webhook reachability",
          ok: success, status: success ? "ok" : "fail",
          detail: `LINE รายงาน: HTTP ${res.statusCode ?? "?"} · success=${success ? "true" : "false"}${res.reason ? " · " + res.reason : ""}`,
          hint: !success ? "ตรวจว่า webhook URL ตอบ 200 ภายใน 1s และลายเซ็นถูกต้อง" : undefined,
          latency_ms: t.ms,
        });
      } else {
        checks.push({ name: "webhook_reach", label: "Webhook reachability", ok: false, status: "fail",
          detail: `HTTP ${t.res!.status}: ${t.res!.text.slice(0, 160)}`, latency_ms: t.ms });
      }
    }

    // 4) Push test — only if explicitly requested
    if (only === "push") {
      if (!token) {
        checks.push({ name: "push", label: "Push test", ok: false, status: "fail", detail: "ไม่มี LINE_CHANNEL_ACCESS_TOKEN" });
      } else if (!/^U[0-9a-f]{32}$/.test(adminUserId)) {
        checks.push({ name: "push", label: "Push test", ok: false, status: "fail",
          detail: "LINE_ADMIN_USER_ID ไม่ตรงรูปแบบ (ต้องขึ้นต้น U + hex 32)",
          hint: "คัดลอก userId ของแอดมินจาก /admin/line-webhook-events" });
      } else {
        const r = await timed(async () => {
          const r = await pushLineText(token, adminUserId, `[ทดสอบการเชื่อมต่อ] ${new Date().toISOString()}`);
          return { status: r.ok ? 200 : (r.status ?? 0), text: r.error ?? "" };
        });
        if (r.err) {
          checks.push({ name: "push", label: "Push test", ok: false, status: "fail", detail: String((r.err as Error)?.message), latency_ms: r.ms });
        } else if (r.res!.status === 200) {
          checks.push({ name: "push", label: "Push test", ok: true, status: "ok", detail: "ส่งข้อความหาแอดมินสำเร็จ — โปรดเช็คแอป LINE", latency_ms: r.ms });
        } else {
          checks.push({ name: "push", label: "Push test", ok: false, status: "fail",
            detail: `HTTP ${r.res!.status}: ${r.res!.text.slice(0, 160)}`, latency_ms: r.ms });
        }
      }
    }

    const allOk = checks.every((c) => c.ok || c.status === "skip");

    // Audit log (best-effort)
    try {
      await supa.from("activity_logs").insert({
        user_id: uid,
        action: only === "push" ? "line.admin_push_test" : only === "identity" ? "line.identity_check" : "line.connection_test",
        target_type: "line_settings",
        detail: { only, all_ok: allOk, checks: checks.map((c) => ({ name: c.name, ok: c.ok, status: c.status, latency_ms: c.latency_ms })) },
      });
    } catch { /* ignore */ }

    return json({ ok: allOk, checks });
  } catch (e) {
    console.error("line-connection-test error", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});