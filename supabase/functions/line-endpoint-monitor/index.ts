// Scheduled probe that pulls the current LIFF endpoint + webhook URL from settings
// and probes both. Writes results to line_login_diagnostics and, on 404/5xx,
// raises a security_audit_log warning so admins get an alert. Called by pg_cron.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
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

type Kind = "webhook" | "liff";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Admin = ReturnType<typeof createClient>;

/** Cron/internal caller proof — random token stored in a service-role-only table. */
async function hasWorkerToken(admin: Admin, req: Request): Promise<boolean> {
  const presented = req.headers.get("x-worker-token") || "";
  if (!presented) return false;
  const { data } = await admin
    .from("internal_worker_tokens").select("token").eq("name", "line_endpoint_monitor").maybeSingle();
  const expected = String(data?.token || "");
  if (!expected || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
  return diff === 0;
}

/** Signed-in owner/admin caller (admin dashboard manual refresh). */
async function isStaffCaller(admin: Admin, req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.replace("Bearer ", "");
  if (!token || token === ANON_KEY) return false;
  try {
    const supa = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: claims, error } = await supa.auth.getClaims(token);
    const uid = claims?.claims?.sub as string | undefined;
    if (error || !uid) return false;
    const { data } = await admin.from("user_roles").select("role").eq("user_id", uid);
    return (data ?? []).some((r: { role?: string }) => r.role === "owner" || r.role === "admin");
  } catch {
    return false;
  }
}

async function probe(url: string, kind: Kind) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const method = kind === "webhook" ? "POST" : "GET";
  try {
    const res = await fetch(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: kind === "webhook"
        ? { "content-type": "application/json", "x-line-signature": "probe" }
        : { "user-agent": "line-endpoint-monitor/1.0" },
      body: kind === "webhook" ? "{}" : undefined,
    });
    try { await res.text(); } catch { /* ignore */ }
    const status = res.status;
    let ok = false;
    let hint = "";
    if (kind === "webhook") {
      ok = status < 500 && status !== 404;
      if (status === 404) hint = "webhook 404 — path หายไป";
      else if (status >= 500) hint = `edge function error ${status}`;
    } else {
      ok = status >= 200 && status < 400;
      if (status === 404) hint = "LIFF endpoint 404 — path หายไปใน SPA";
      else if (status >= 500) hint = `origin ${status}`;
    }
    return { ok, status, latency_ms: Date.now() - started, hint };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latency_ms: Date.now() - started,
      hint: (err as Error).name === "AbortError" ? "timeout" : (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth: cron worker token OR signed-in owner/admin. No anonymous probing.
    const allowed = (await hasWorkerToken(admin, req)) || (await isStaffCaller(admin, req));
    if (!allowed) return json({ ok: false, error: "unauthorized" }, 401);

    const { data: oa } = await admin
      .from("line_oa_settings")
      .select("liff_endpoint_url")
      .limit(1)
      .maybeSingle();

    const projectRef = (Deno.env.get("SUPABASE_URL") || "").match(/https:\/\/([^.]+)\./)?.[1] || "";
    const webhookUrl = projectRef ? `https://${projectRef}.functions.supabase.co/line-webhook` : "";
    const liffUrl = (oa?.liff_endpoint_url as string | null) || "https://www.filmyynatta.com/l/shop";

    const results: Array<{ kind: Kind; url: string; result: Awaited<ReturnType<typeof probe>> }> = [];
    if (webhookUrl) results.push({ kind: "webhook", url: webhookUrl, result: await probe(webhookUrl, "webhook") });
    if (liffUrl) results.push({ kind: "liff", url: liffUrl, result: await probe(liffUrl, "liff") });

    for (const r of results) {
      const alert = r.result.status === 404 || r.result.status >= 500;
      await admin.from("line_login_diagnostics").insert({
        event: `endpoint_probe:${r.kind}`,
        detail: { url: maskUrl(r.url), ...r.result, alert, source: "cron" },
      });
      if (alert) {
        await admin.from("line_login_diagnostics").insert({
          event: "line_endpoint_unreachable",
          detail: {
            kind: r.kind,
            url: maskUrl(r.url),
            status: r.result.status,
            hint: r.result.hint,
            at: new Date().toISOString(),
          },
        });
        try {
          await admin.from("security_audit_log").insert({
            event_type: "line_endpoint_unreachable",
            severity: "warning",
            target_type: "line_endpoint",
            detail: {
              kind: r.kind,
              url: maskUrl(r.url),
              status: r.result.status,
              hint: r.result.hint,
            },
          });
        } catch { /* best-effort */ }
      }
    }

    return json({ ok: true, checked: results.length, results: results.map(r => ({ kind: r.kind, ...r.result })) });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});