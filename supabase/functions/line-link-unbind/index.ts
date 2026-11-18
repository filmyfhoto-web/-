// Unbind: remove the caller's own LINE-user → customer link. The caller must
// prove ownership of the LINE identity via a LIFF id_token or a Supabase JWT
// whose profile.line_user_id matches. The `line_user_id` from the request
// body is ignored to prevent attackers from unbinding other users' accounts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineIdentity } from "../_shared/verifyLineIdentity.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    let identity;
    try {
      identity = await verifyLineIdentity(req, body || {});
    } catch (e) {
      return ok({ ok: false, error: String((e as Error).message || e) }, 401);
    }
    const line_user_id = identity.line_user_id;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error } = await supabase
      .from("line_account_links")
      .delete()
      .eq("line_user_id", line_user_id);
    if (error) return ok({ ok: false, error: error.message }, 500);
    return ok({ ok: true });
  } catch (e) {
    return ok({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});