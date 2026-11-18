// Public endpoint that stores external LIFF error reports.
// Called from the LiffShop error UI ("send diagnostic") and from external tools.
// Rate limited by IP+UA hash via best-effort in-memory bucket.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function maskUrl(raw: string): string {
  try { const u = new URL(raw); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return "invalid_url"; }
}

// Only these diagnostic event names may be written by untrusted clients.
const ALLOWED_EVENTS = new Set([
  "external_liff_report",
  "liff_init_fail",
  "liff_login_loop",
  "link_verify_fail",
  "liff_redirect",
  "liff_config_fallback",
  "liff_auto_bind_ok",
  "liff_auto_bind_fail",
]);

// Clamp arbitrary client detail into a small, string-only object.
function safeDetail(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= 15) break;
    if (v == null || typeof v === "object") continue;
    out[k.slice(0, 40)] = String(v).slice(0, 300);
    n++;
  }
  return out;
}

const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, limit = 6, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const rawEvent = String(body?.event ?? "external_liff_report");
    const event = ALLOWED_EVENTS.has(rawEvent) ? rawEvent : "external_liff_report";
    const from = String(body?.from ?? "").slice(0, 300);
    const endpoint = String(body?.endpoint ?? "").slice(0, 300);
    const liff_id = String(body?.liff_id ?? "").slice(0, 80);
    const code = body?.code != null ? String(body.code).slice(0, 40) : null;
    const message = body?.message != null ? String(body.message).slice(0, 500) : null;
    const ua = String(req.headers.get("user-agent") ?? body?.ua ?? "").slice(0, 400);
    const ip = req.headers.get("cf-connecting-ip")
      ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim()
      ?? "unknown";
    const rlKey = `${ip}|${ua.slice(0, 60)}`;
    if (!rateLimit(rlKey)) return json({ ok: false, error: "rate_limited" }, 429);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await admin.from("line_login_diagnostics").insert({
      event,
      detail: {
        ...safeDetail(body?.detail),
        from: maskUrl(from),
        endpoint: maskUrl(endpoint),
        liff_id,
        code,
        message,
        ua,
        ip: ip.slice(0, 45),
        at: new Date().toISOString(),
      },
    });
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});