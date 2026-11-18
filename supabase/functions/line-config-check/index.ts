// Reports configuration status of the LINE Messaging API integration without
// exposing secret values. Checks LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET,
// LINE_ADMIN_USER_ID, and webhook health. Never returns secret values themselves.

import { createClient } from "npm:@supabase/supabase-js@2";
import { pickPublicOrigin, guestShopUrl, DEFAULT_PUBLIC_APP_URL } from "./_urls.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims, error: authErr } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
    if (authErr || !claims?.claims) return json({ ok: false, error: "unauthorized" }, 401);

    // Staff-only gate — non-staff callers get a minimal, non-sensitive response.
    const uid = (claims.claims as { sub?: string })?.sub || "";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    let isStaff = false;
    try {
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      isStaff = (roles ?? []).some((r: { role: string }) =>
        ["owner", "admin", "staff"].includes(r.role),
      );
    } catch (_e) {
      isStaff = false;
    }

    const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
    const adminUserId = Deno.env.get("LINE_ADMIN_USER_ID") || "";
    const messagingChannelSecret = Deno.env.get("LINE_CHANNEL_SECRET") || "";
    const loginChannelId = Deno.env.get("LINE_LOGIN_CHANNEL_ID") || "";
    const loginChannelSecret = Deno.env.get("LINE_LOGIN_CHANNEL_SECRET") || "";
    const loginChannelToken = Deno.env.get("LINE_LOGIN_CHANNEL_TOKEN") || "";

    const loginChannelIdShape = /^\d{8,15}$/.test(loginChannelId)
      ? "digits_ok"
      : loginChannelId ? "set_but_unexpected_shape" : "missing";
    const loginChannelSecretShape = /^[0-9a-f]{32}$/i.test(loginChannelSecret)
      ? "hex32_ok"
      : loginChannelSecret ? "set_but_unexpected_shape" : "missing";
    const loginChannelTokenShape = loginChannelToken.length > 100
      ? "set_long"
      : loginChannelToken ? "set_short" : "missing";

    // Shape diagnostics — never echo the value itself
    const messagingChannelSecretShape = /^[0-9a-f]{32}$/i.test(messagingChannelSecret)
      ? "hex32_ok"
      : messagingChannelSecret ? "set_but_unexpected_shape" : "missing";
    const accessTokenShape = accessToken.length > 100 ? "set_long" : accessToken ? "set_short" : "missing";

    const adminShape = !adminUserId
      ? "missing"
      : /^U[0-9a-f]{32}$/.test(adminUserId)
      ? "u_hex32_ok"
      : "set_but_unexpected_shape";
    const adminRemediation: string[] = [];
    if (adminShape === "missing") {
      adminRemediation.push(
        "ตั้งค่า secret LINE_ADMIN_USER_ID — ให้แอดมินทักหา OA แล้วเปิด /admin/line-webhook-events เพื่อ copy userId",
      );
    } else if (adminShape === "set_but_unexpected_shape") {
      adminRemediation.push(
        "รูปแบบไม่ถูกต้อง: ต้องขึ้นต้นด้วย 'U' ตามด้วย hex 32 ตัว (รวม 33 ตัวอักษร)",
        "อย่าใช้ basicId (@xxxxx) หรือ displayName ของ OA — ต้องเป็น userId ของแอดมินคนนั้น",
      );
    }
    const secretRemediation: string[] = [];
    if (messagingChannelSecretShape === "missing") {
      secretRemediation.push("ตั้งค่า secret LINE_CHANNEL_SECRET จาก Messaging API channel → Basic settings → Channel secret");
    } else if (messagingChannelSecretShape === "set_but_unexpected_shape") {
      secretRemediation.push(
        "รูปแบบไม่ใช่ hex 32 ตัว — ตรวจว่าคัดลอกครบทั้ง 32 ตัว ไม่มีช่องว่าง/บรรทัดใหม่",
        "ค่านี้ต้องมาจาก channel เดียวกับที่ตั้ง Webhook URL ไว้",
      );
    }

    // Try fetching admin profile to verify userId is real (only when token + admin set)
    let adminProfile: { ok: boolean; status?: number; displayName?: string; error?: string } = { ok: false };
    if (accessToken && adminUserId && adminShape === "u_hex32_ok") {
      try {
        const r = await fetch(`https://api.line.me/v2/bot/profile/${adminUserId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (r.ok) {
          const j = await r.json();
          adminProfile = { ok: true, status: 200, displayName: j.displayName };
        } else {
          const t = await r.text();
          adminProfile = { ok: false, status: r.status, error: t.slice(0, 300) };
          if (r.status === 404) {
            adminRemediation.push("LINE ตอบ 404 — userId นี้ยังไม่ได้เพิ่ม OA เป็นเพื่อน (ให้แอดมินทักหา OA ก่อน)");
          }
        }
      } catch (e) {
        adminProfile = { ok: false, error: String((e as Error)?.message || e) };
      }
    }

    // Validate the access token by calling LINE bot info
    let oa: { ok: boolean; status?: number; basicId?: string; displayName?: string; userId?: string; pictureUrl?: string; premiumId?: string | null; chatMode?: string; markAsReadMode?: string; error?: string } = { ok: false };
    if (accessToken) {
      try {
        const r = await fetch("https://api.line.me/v2/bot/info", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (r.ok) {
          const j = await r.json();
          oa = {
            ok: true,
            status: 200,
            basicId: j.basicId,
            displayName: j.displayName,
            userId: j.userId,
            pictureUrl: j.pictureUrl,
            premiumId: j.premiumId ?? null,
            chatMode: j.chatMode,
            markAsReadMode: j.markAsReadMode,
          };
        } else {
          const text = await r.text();
          oa = { ok: false, status: r.status, error: text.slice(0, 300) };
        }
      } catch (e) {
        oa = { ok: false, error: String((e as Error)?.message || e) };
      }
    }

    const webhookSecretOk = messagingChannelSecretShape === "hex32_ok";
    const adminReady = adminShape === "u_hex32_ok" && adminProfile.ok;
    const modeBReady = oa.ok && webhookSecretOk && adminReady;

    // Non-staff callers (regular customers on /account) only need to know if
    // Mode B code linking is available. Do NOT expose admin/OA identity,
    // webhook URL, or diagnostic remediation strings.
    if (!isStaff) {
      return json({
        ok: true,
        checked_at: new Date().toISOString(),
        mode_b_ready: modeBReady,
      });
    }

    // Public URL diagnostics — this is what LINE messages will link to.
    const envPublicUrl = Deno.env.get("PUBLIC_APP_URL") || "";
    const picked = pickPublicOrigin(envPublicUrl, req);
    console.log(
      `[line-config-check] link origin resolved: ${picked.origin || "<empty>"} (source=${picked.source}${picked.reason ? ", reason=" + picked.reason : ""})`,
    );
    const sampleSlug = "school-demo";
    const publicUrl = {
      env_value_set: envPublicUrl ? "set" : "missing",
      resolved_origin: picked.origin,
      source: picked.source,
      reason: picked.reason || null,
      default_url: DEFAULT_PUBLIC_APP_URL,
      sample_links: {
        guest_shop: guestShopUrl(picked.origin, sampleSlug),
        admin_customers: picked.origin ? `${picked.origin}/admin/customers` : null,
      },
    };

    return json({
      ok: true,
      checked_at: new Date().toISOString(),
      env: {
        messaging_access_token: accessTokenShape,
        messaging_channel_secret: messagingChannelSecretShape,
        admin_user_id: adminUserId ? "set" : "missing",
        admin_user_id_shape: adminShape,
        login_channel_id: loginChannelIdShape,
        login_channel_secret: loginChannelSecretShape,
        login_channel_token: loginChannelTokenShape,
      },
      // Presence-only view used by the "ห้องแอดมิน" settings card. Booleans
      // only — never the values themselves.
      server_config: {
        LINE_CHANNEL_ID: Boolean(Deno.env.get("LINE_CHANNEL_ID")),
        LINE_CHANNEL_SECRET: Boolean(messagingChannelSecret),
        LINE_CHANNEL_ACCESS_TOKEN: Boolean(accessToken),
      },
      // Public (non-secret) LINE Login channel id — safe to expose to staff
      // so admin UI can build authorize URLs without pasting the value again.
      login_channel_id_value: loginChannelIdShape === "digits_ok" ? loginChannelId : "",
      mode_b_ready: modeBReady,
      webhook_secret_ok: webhookSecretOk,
      webhook_secret_remediation: secretRemediation,
      admin_ready: adminReady,
      admin_profile: adminProfile,
      admin_remediation: adminRemediation,
      messaging_ready: oa.ok,
      webhook_url: "https://fdgxvgtmzcgakofswtty.supabase.co/functions/v1/line-webhook",
      oa,
      public_url: publicUrl,
    });
  } catch (e) {
    console.error("line-config-check error", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
