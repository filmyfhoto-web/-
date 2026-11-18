// Lookup: return the current LINE binding for the caller. The caller must
// prove they own the LINE identity via a LIFF id_token or a Supabase JWT.
// The `line_user_id` from the request body is ignored to prevent PII
// harvesting by attackers who can guess or enumerate LINE user IDs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineIdentity } from "../_shared/verifyLineIdentity.ts";
import { checkFriendshipViaMessagingApi } from "./_friend.ts";
import { customerNameColumn, customerNameTable, isBoundLink } from "../_shared/lineBinding.ts";

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
      // Unauthenticated callers get a boolean-only response with no PII.
      const msg = String((e as Error).message || e);
      console.warn("[line-link-lookup] identity_verify_failed", msg);
      if (msg === "no_line_user_bound_to_account") {
        return ok({ bound: false, friend_confirmed: false, friend_status: "unknown" });
      }
      return ok({ bound: false, friend_confirmed: false, friend_status: "unknown", error: "unauthorized", error_reason: msg, error_status: 401 });
    }
    const line_user_id = identity.line_user_id;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await supabase
      .from("line_account_links")
      .select("line_user_id, phone, display_name, picture_url, customer_id, customer_source, verified_at")
      .eq("line_user_id", line_user_id)
      .maybeSingle();
    if (error) {
      // Never leak raw db error text; log server-side only.
      console.error("[line-link-lookup] db_lookup_failed", error.message);
      return ok({ bound: false, friend_confirmed: false, friend_status: "unknown", error: "lookup_failed", error_status: 500 });
    }
    // Display-only profile fallback: LINE OAuth writes the verified name and
    // picture onto `profiles`, so the account page can render them even
    // before/without a `line_account_links` row. Never affects `bound`.
    const { data: prof } = await supabase
      .from("profiles")
      .select("line_display_name, line_picture_url")
      .eq("line_user_id", line_user_id)
      .maybeSingle();

    // Server truth: a revoked binding (admin unbind) is NOT bound, even
    // though the row still exists for audit purposes.
    if (!isBoundLink(data)) {
      return ok({
        bound: false,
        friend_confirmed: false,
        friend_status: "unknown",
        line_user_id,
        display_name: data?.display_name ?? prof?.line_display_name ?? null,
        picture_url: data?.picture_url ?? prof?.line_picture_url ?? null,
        unbound_by_admin: data?.customer_source === "admin_unbound",
      });
    }

    // touch last_seen_at
    await supabase
      .from("line_account_links")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("line_user_id", line_user_id);

    // enrich with customer name if available (rds / guest / profile+admin_manual)
    let customer_name: string | null = null;
    const nameTable = customerNameTable(data.customer_source);
    const nameColumn = customerNameColumn(data.customer_source);
    if (nameTable && nameColumn && data.customer_id) {
      const { data: c } = await supabase
        .from(nameTable)
        .select(nameColumn)
        .eq("id", data.customer_id)
        .maybeSingle();
      customer_name = ((c as Record<string, unknown> | null)?.[nameColumn] as string) ?? null;
    }

    // Server-side friendship check — the ONLY authorization signal the gate
    // trusts. Client-supplied flags are never accepted.
    const CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
    const friend = await checkFriendshipViaMessagingApi(CHANNEL_ACCESS_TOKEN, line_user_id);

    return ok({
      bound: true,
      // Verified caller identity (derived server-side from the LIFF id_token
      // or Supabase JWT — never the client-supplied line_user_id). The
      // client uses this to populate the customer account menu without
      // having to re-derive the id from local storage.
      line_user_id,
      phone: data.phone,
      display_name: data.display_name ?? prof?.line_display_name ?? null,
      picture_url: data.picture_url ?? prof?.line_picture_url ?? null,
      customer_id: data.customer_id,
      customer_source: data.customer_source,
      customer_name,
      verified_at: data.verified_at,
      friend_confirmed: friend.confirmed,
      friend_status: friend.status,
    });
  } catch (e) {
    // Do not echo raw exception text — could contain PII/token fragments.
    console.error("[line-link-lookup] unhandled_error", String((e as Error)?.message || e));
    return ok({ bound: false, friend_confirmed: false, friend_status: "unknown", error: "lookup_failed", error_status: 500 });
  }
});