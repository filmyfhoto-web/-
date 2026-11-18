// Exchange a FS FILM SHOP share token for a real Supabase session.
// The token maps to one staff account chosen by an owner/admin; anyone
// holding the link acts as that account until the link expires or is revoked.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { token } = await req.json().catch(() => ({ token: "" }));
    if (!token || typeof token !== "string" || token.length < 12) {
      return json({ error: "invalid_token" }, 400);
    }
    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: link, error } = await db
      .from("fs_share_links")
      .select("id, user_id, revoked, expires_at, use_count")
      .eq("token", token)
      .maybeSingle();
    if (error) {
      console.error("[fs-share-open] lookup_failed", error.message);
      return json({ error: "lookup_failed" }, 500);
    }
    if (!link) return json({ error: "not_found" }, 404);
    if (link.revoked) return json({ error: "revoked" }, 403);
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return json({ error: "expired" }, 403);
    }

    const { data: userRes, error: uErr } = await db.auth.admin.getUserById(link.user_id);
    if (uErr || !userRes?.user?.email) {
      console.error("[fs-share-open] user_missing", uErr?.message);
      return json({ error: "user_missing" }, 500);
    }
    const email = userRes.user.email;

    const { data: linkRes, error: gErr } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (gErr || !linkRes?.properties?.hashed_token) {
      console.error("[fs-share-open] generate_failed", gErr?.message);
      return json({ error: "generate_failed" }, 500);
    }

    await db
      .from("fs_share_links")
      .update({ use_count: (link.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq("id", link.id);

    return json({ email, token_hash: linkRes.properties.hashed_token });
  } catch (e) {
    console.error("[fs-share-open] unexpected", (e as Error).message);
    return json({ error: "unexpected" }, 500);
  }
});
