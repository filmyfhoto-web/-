// Re-sync the signed-in customer's LINE display name / picture.
//
// Identity is proven by `verifyLineIdentity` (LIFF id_token or Supabase JWT)
// — the request body can never choose which LINE user to sync. Fresh values
// come from the LINE Messaging API profile endpoint when the customer is a
// friend of the OA; otherwise the stored values are returned unchanged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineIdentity } from "../_shared/verifyLineIdentity.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let identity;
  try {
    const body = await req.json().catch(() => ({}));
    identity = await verifyLineIdentity(req, body as Record<string, unknown>);
  } catch (e) {
    const msg = String((e as Error)?.message || "unauthorized");
    // No LINE bound to this account is a normal state — respond 200 so the
    // client can show "not linked" instead of a runtime error.
    if (msg === "no_line_user_bound_to_account") {
      return json({ ok: false, source: "not_linked", line_linked: false, display_name: null, picture_url: null });
    }
    return json({ error: msg }, 401);
  }

  const lineUserId = identity.line_user_id;

  const { data: profile } = await svc
    .from("profiles")
    .select("id, line_display_name, line_picture_url")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  let displayName = profile?.line_display_name ?? null;
  let pictureUrl = profile?.line_picture_url ?? null;
  let source: "line_api" | "stored" | "config_missing" = "stored";

  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) {
    source = "config_missing";
  } else {
    try {
      const r = await fetch(
        `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (r.ok) {
        const p = await r.json() as { displayName?: string; pictureUrl?: string };
        if (p.displayName) displayName = p.displayName;
        if (p.pictureUrl && /^https:\/\//i.test(p.pictureUrl)) pictureUrl = p.pictureUrl;
        source = "line_api";
      } else {
        try { await r.text(); } catch { /* ignore */ }
      }
    } catch { /* keep stored values */ }
  }

  if (source === "line_api") {
    const patch = {
      line_display_name: displayName,
      line_picture_url: pictureUrl,
      line_verified_at: new Date().toISOString(),
    };
    if (profile?.id) {
      await svc.from("profiles").update(patch).eq("id", profile.id);
    }
    await svc
      .from("line_account_links")
      .update({ display_name: displayName, picture_url: pictureUrl })
      .eq("line_user_id", lineUserId);
  }

  return json({
    ok: true,
    source,
    line_user_id: lineUserId,
    display_name: displayName,
    picture_url: pictureUrl,
  });
});
