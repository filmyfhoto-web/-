// Reports the LIFF app configuration currently registered with LINE and
// compares it to what the app has saved locally. Staff-only. Never returns
// secret values themselves.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

const APP_ORIGIN = "https://www.filmyynatta.com";
const ROOT_ORIGIN = "https://filmyynatta.com";
const CANONICAL_ENDPOINT = `${APP_ORIGIN}/l/shop`;

function extractLineTokenChannelId(errorText?: string | null): string | null {
  if (!errorText) return null;
  const match = /channel\s+(\d{8,15})/i.exec(errorText);
  return match?.[1] || null;
}

function describeLineAppError(errorText?: string | null): string | null {
  const tokenChannelId = extractLineTokenChannelId(errorText);
  if (tokenChannelId) {
    return `LINE_LOGIN_CHANNEL_TOKEN สำหรับ debug ตอนนี้เป็นของ channel ${tokenChannelId} จึงอ่าน LIFF app ผ่าน LINE API ไม่ได้ — ข้ามได้ถ้า LIFF ID, Endpoint URL และ Callback URL ถูกต้อง`;
  }
  const text = String(errorText || "").toLowerCase();
  if (text.includes("no liff app found") || text.includes("liff_id_not_found_in_channel")) {
    return "LINE API ไม่พบ LIFF app นี้ใน channel ของ token debug ที่ใช้อยู่ — ไม่กระทบการเปิด LIFF จริงหากตั้งค่า LIFF ID/Endpoint/Callback ถูกต้อง";
  }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims, error: authErr } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
    if (authErr || !claims?.claims) return json({ ok: false, error: "unauthorized" }, 401);
    const uid = (claims.claims as { sub?: string })?.sub || "";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
    const isStaff = (roles ?? []).some((r: { role: string }) =>
      ["owner", "admin", "staff"].includes(r.role),
    );
    if (!isStaff) return json({ ok: false, error: "forbidden" }, 403);

    // Read saved settings
    const { data: row } = await admin
      .from("line_oa_settings")
      .select("liff_id, liff_endpoint_url, liff_scopes, liff_callback_urls")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const dbLiffId = row?.liff_id || null;
    const dbEndpoint = row?.liff_endpoint_url || null;
    const dbCallbacks = (row?.liff_callback_urls as string[] | null) || [];
    const dbScopes = (row?.liff_scopes as string[] | null) || [];

    // Query LINE for the LIFF app's registered endpoint only when an optional
    // LINE Login channel token is configured. Some LINE Login/LIFF consoles do
    // not expose a channel access token, so missing LINE_LOGIN_CHANNEL_TOKEN is
    // not a readiness failure. The primary production checks are the saved LIFF
    // ID, endpoint URL, callback URLs, and channel-id match.
    const loginToken = Deno.env.get("LINE_LOGIN_CHANNEL_TOKEN") || "";
    const messagingTokenFallback = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
    const loginChannelId = Deno.env.get("LINE_LOGIN_CHANNEL_ID") || "";
    const usedFallback = false;
    const effectiveToken = loginToken;
    let tokenChannelIdFromLineError: string | null = null;

    let lineApp: {
      ok: boolean;
      status?: number;
      liffId?: string;
      view?: { type?: string; url?: string };
      features?: Record<string, unknown>;
      error?: string;
    } = { ok: false };

    let lineList: { ok: boolean; status?: number; count?: number; error?: string } = { ok: false };

    if (effectiveToken && dbLiffId) {
      try {
        const r = await fetch(`https://api.line.me/liff/v1/apps`, {
          headers: { Authorization: `Bearer ${effectiveToken}` },
        });
        if (r.ok) {
          const j = await r.json();
          const arr = Array.isArray(j?.apps) ? j.apps : [];
          lineList = { ok: true, status: 200, count: arr.length };
          const match = arr.find((a: any) => a.liffId === dbLiffId);
          if (match) {
            lineApp = { ok: true, status: 200, liffId: match.liffId, view: match.view, features: match.features };
          } else {
            lineApp = { ok: false, status: 404, error: "liff_id_not_found_in_channel" };
          }
        } else {
          const t = await r.text();
          tokenChannelIdFromLineError = extractLineTokenChannelId(t);
          lineList = { ok: false, status: r.status, error: t.slice(0, 300) };
          lineApp = { ok: false, status: r.status, error: t.slice(0, 300) };
        }
      } catch (e) {
        lineApp = { ok: false, error: String((e as Error)?.message || e) };
      }
    }

    // Diagnostics / recommendations
    const problems: string[] = [];
    if (!dbLiffId) problems.push("ยังไม่ได้บันทึก LIFF ID ในระบบ (หน้า ตั้งค่า LINE OA)");
    if (!dbEndpoint) {
      problems.push("ยังไม่ได้บันทึก LIFF Endpoint URL ในระบบ");
    } else {
      try {
        const u = new URL(dbEndpoint);
        if (u.hostname === "liff.line.me") problems.push("Endpoint ในระบบเป็นลิงก์ liff.line.me — ต้องเป็นโดเมนของร้าน");
        if (u.pathname !== "/l/shop") problems.push("Endpoint ในระบบไม่ได้ชี้ไปที่ /l/shop");
        if (u.origin !== APP_ORIGIN) problems.push(`แนะนำให้ Endpoint ใช้โดเมนหลัก ${APP_ORIGIN}`);
      } catch { problems.push("Endpoint URL ในระบบไม่เป็น URL ที่ถูกต้อง"); }
    }
    if (lineApp.ok && lineApp.view?.url && dbEndpoint && lineApp.view.url !== dbEndpoint) {
      problems.push(`ค่าที่ตั้งใน LINE Console (${lineApp.view.url}) ต่างจากที่บันทึกในระบบ (${dbEndpoint})`);
    }
    const lineApiWarning = !loginToken
      ? "ไม่มี LINE_LOGIN_CHANNEL_TOKEN จึงข้ามการอ่านค่า LIFF ผ่าน LINE API — ไม่ใช่ปัญหาการใช้งาน เพราะบางบัญชีไม่มีช่อง token นี้ ให้ทดสอบจริงด้วย LIFF URL แทน"
      : (lineList.status === 401 || lineApp.status === 401)
        ? "LINE API token สำหรับตรวจสอบ LIFF ใช้ไม่ได้ — เป็นข้อมูล debug เท่านั้น ไม่กระทบการเปิด LIFF หาก LIFF ID/Endpoint/Callback ถูกต้อง"
        : null;

    // Channel-ID cross-check: the prefix of a LIFF ID (before the "-") is the
    // numeric channel ID of the LINE Login channel that owns it. If that
    // prefix doesn't match LINE_LOGIN_CHANNEL_ID, id_token verify at
    // api.line.me/oauth2/v2.1/verify will fail with aud_mismatch and no login
    // will succeed. Surface this loudly so the operator fixes it immediately.
    let liffChannelId: string | null = null;
    let channelMatch: boolean | null = null;
    if (dbLiffId) {
      const m = /^(\d+)-[A-Za-z0-9]+$/.exec(dbLiffId);
      if (m) liffChannelId = m[1];
    }
    if (liffChannelId && loginChannelId) {
      channelMatch = liffChannelId === loginChannelId;
      if (!channelMatch) {
        problems.unshift(
          `LIFF ID ผูกกับ channel ${liffChannelId} แต่ LINE_LOGIN_CHANNEL_ID ในระบบคือ ${loginChannelId} — ต้องตรงกัน มิฉะนั้น verify id_token จะ fail (aud_mismatch) และล็อกอิน LINE ใช้งานไม่ได้`,
        );
      }
    } else if (dbLiffId && !liffChannelId) {
      problems.push(`LIFF ID "${dbLiffId}" มีรูปแบบไม่ถูกต้อง — ควรเป็น <channelId>-<random>`);
    } else if (dbLiffId && !loginChannelId) {
      problems.push("ยังไม่ได้ตั้ง LINE_LOGIN_CHANNEL_ID — ระบบตรวจไม่ได้ว่า LIFF ID ผูกกับ channel เดียวกันหรือไม่");
    }

    const tokenChannelMatchesLiff = tokenChannelIdFromLineError && liffChannelId
      ? tokenChannelIdFromLineError === liffChannelId
      : null;
    if (tokenChannelMatchesLiff !== false) {
      const thaiLineError = describeLineAppError(lineApp.error || lineList.error);
      if (thaiLineError && loginToken) problems.push(thaiLineError);
    }
    const requiredCallbacks = [
      `${APP_ORIGIN}/l/shop`,
      `${ROOT_ORIGIN}/l/shop`,
    ];
    const missingCb = requiredCallbacks.filter((u) => !dbCallbacks.includes(u));
    if (missingCb.length) problems.push(`Callback URL ที่ควรมีแต่ยังไม่ได้บันทึก: ${missingCb.join(", ")}`);

    return json({
      ok: true,
      checked_at: new Date().toISOString(),
      canonical_endpoint: CANONICAL_ENDPOINT,
      db: {
        liff_id: dbLiffId,
        endpoint_url: dbEndpoint,
        scopes: dbScopes,
        callback_urls: dbCallbacks,
      },
      line: {
        list: lineList,
        app: lineApp,
        endpoint_from_line: lineApp.view?.url || null,
        token_present: !!effectiveToken,
        login_token_present: !!loginToken,
        api_check_skipped: !loginToken,
        api_warning: lineApiWarning,
        used_messaging_fallback: usedFallback,
        messaging_token_present: !!messagingTokenFallback,
        token_channel_id_from_error: tokenChannelIdFromLineError,
        app_error_th: describeLineAppError(lineApp.error || lineList.error),
      },
      match: {
        endpoint_matches: !!(lineApp.ok && lineApp.view?.url && dbEndpoint && lineApp.view.url === dbEndpoint),
        endpoint_uses_our_domain: !!(dbEndpoint && (() => { try { return new URL(dbEndpoint).hostname !== "liff.line.me"; } catch { return false; } })()),
        callbacks_missing: missingCb,
        channel_id_matches: channelMatch,
        liff_channel_id: liffChannelId,
        login_channel_id: loginChannelId || null,
        token_channel_id_matches_liff: tokenChannelMatchesLiff,
      },
      problems,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});