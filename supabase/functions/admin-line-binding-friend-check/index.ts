// Admin-only helper: batch-check LINE friendship status for a set of line_user_ids.
// Auth: caller must have a Supabase JWT and be marked staff (is_staff_any).
// Never logs or echoes the LINE channel access token.
import { createClient } from "npm:@supabase/supabase-js@2";

// Tri-state kept in sync with supabase/functions/line-link-lookup/_friend.ts.
// Duplicated locally because edge-function bundling doesn't share files across
// function folders during deploy. If you extend this list, update the shared
// helper too so the customer gate stays consistent.
type FriendStatus = "confirmed" | "not_friend" | "unknown" | "config_missing";

// Local wrapper that mirrors the shared friend-check but also reports the raw
// LINE HTTP status and a short reason code. The shared helper intentionally
// collapses everything to a tri-state (confirmed/not_friend/unknown) because
// the gate must fail-closed; here we need extra detail to explain failures
// to staff in the admin UI without leaking any secret.
type ReasonCode =
  | "ok" | "not_friend" | "config_missing" | "invalid_id"
  | "line_api_401" | "line_api_403" | "line_api_429"
  | "line_api_5xx" | "line_api_other" | "network_error";

async function checkWithReason(
  token: string,
  id: string,
): Promise<{ status: FriendStatus; reason: ReasonCode; http_status?: number }> {
  if (!token) return { status: "config_missing", reason: "config_missing" };
  try {
    const r = await fetch(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    try { await r.text(); } catch { /* ignore */ }
    const s = r.status;
    if (s === 200) return { status: "confirmed", reason: "ok", http_status: 200 };
    if (s === 404) return { status: "not_friend", reason: "not_friend", http_status: 404 };
    if (s === 401) return { status: "unknown", reason: "line_api_401", http_status: 401 };
    if (s === 403) return { status: "unknown", reason: "line_api_403", http_status: 403 };
    if (s === 429) return { status: "unknown", reason: "line_api_429", http_status: 429 };
    if (s >= 500) return { status: "unknown", reason: "line_api_5xx", http_status: s };
    return { status: "unknown", reason: "line_api_other", http_status: s };
  } catch {
    return { status: "unknown", reason: "network_error" };
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function assertStaff(req: Request): Promise<string> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("unauthorized");
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await anon.auth.getClaims(auth.slice("Bearer ".length));
  if (error || !data?.claims?.sub) throw new Error("unauthorized");
  const uid = data.claims.sub as string;
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: staff, error: rErr } = await svc.rpc("is_staff_any", { _uid: uid });
  if (rErr || staff !== true) throw new Error("forbidden");
  return uid;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    let adminUid = "";
    try {
      adminUid = await assertStaff(req);
    } catch (e) {
      const msg = String((e as Error).message || e);
      return ok({ error: msg === "forbidden" ? "forbidden" : "unauthorized" }, msg === "forbidden" ? 403 : 401);
    }

    const body = await req.json().catch(() => ({}));
    const rawIds = Array.isArray(body?.line_user_ids) ? body.line_user_ids : [];
    const ids: string[] = [];
    for (const v of rawIds) {
      if (typeof v !== "string") continue;
      const t = v.trim();
      if (!t || t.length > 100) continue;
      // LINE user ids look like "U" + 32 hex; keep the check loose but non-empty.
      if (!/^U[0-9a-f]{20,64}$/i.test(t)) continue;
      if (!ids.includes(t)) ids.push(t);
      if (ids.length >= 50) break;
    }

    const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
    const now = new Date().toISOString();
    const results: Record<
      string,
      { status: FriendStatus; checked_at: string; reason: ReasonCode; http_status?: number }
    > = {};
    // Flag any raw IDs that failed the format check so the UI can explain why.
    const invalidIds: string[] = [];
    for (const v of rawIds) {
      if (typeof v !== "string") continue;
      const t = v.trim();
      if (!t) continue;
      if (!ids.includes(t) && !invalidIds.includes(t)) invalidIds.push(t);
    }
    for (const bad of invalidIds) {
      results[bad] = { status: "unknown", checked_at: now, reason: "invalid_id" };
    }
    // Sequential to be gentle on LINE rate limits; 50 max keeps it fast.
    for (const id of ids) {
      const r = await checkWithReason(token, id);
      results[id] = {
        status: r.status,
        reason: r.reason,
        http_status: r.http_status,
        checked_at: now,
      };
      // Log only status/reason — never the token or profile body.
      console.log("friend-check", { id_prefix: id.slice(0, 5), reason: r.reason, http: r.http_status ?? null });
    }

    // Persist an audit trail so staff can review historical results.
    // Best-effort — a logging failure must not fail the check itself.
    try {
      const svc = createClient(SUPABASE_URL, SERVICE_KEY);
      const rows = Object.entries(results).map(([lineId, r]) => ({
        user_id: adminUid || null,
        action: "line_friend_check",
        target_type: "line_user",
        target_id: null as string | null,
        detail: {
          line_user_id: lineId,
          status: r.status,
          reason: r.reason,
          http_status: r.http_status ?? null,
          checked_at: r.checked_at,
        },
      }));
      if (rows.length) {
        await svc.from("activity_logs").insert(rows);
      }
    } catch (e) {
      console.warn("friend-check activity_log_failed", String((e as Error)?.message || e));
    }

    return ok({ results });
  } catch {
    console.warn("admin-line-binding-friend-check unhandled error");
    return ok({ error: "internal_error" }, 500);
  }
});