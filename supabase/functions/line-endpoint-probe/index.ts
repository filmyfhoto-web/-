// Probes LIFF endpoint / LINE webhook URLs from the server to bypass browser CORS.
// Staff-only. Never echoes secrets. Masks query strings before logging.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Kind = "webhook" | "liff";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "invalid_url";
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
        : { "user-agent": "line-endpoint-probe/1.0" },
      body: kind === "webhook" ? "{}" : undefined,
    });
    // consume body so no leaks
    try { await res.text(); } catch { /* ignore */ }
    const status = res.status;
    // Interpretation
    let ok = false;
    let hint = "";
    if (kind === "webhook") {
      // LINE webhook returns 200 on valid signature / 401-403 on bad signature — both mean reachable
      ok = status < 500 && status !== 404;
      if (status === 404) hint = "ไม่พบ endpoint — path อาจสะกดผิด";
      else if (status >= 500) hint = `edge function error (${status})`;
    } else {
      // LIFF endpoint should return an HTML page — 2xx or 3xx acceptable
      ok = status >= 200 && status < 400;
      if (status === 404) hint = "หน้า LIFF ไม่พบ — ตรวจว่า path มีจริงในแอป";
      else if (status >= 500) hint = `เซิร์ฟเวอร์ปลายทาง error (${status})`;
    }
    return {
      ok,
      status,
      latency_ms: Date.now() - started,
      redirected: [301, 302, 303, 307, 308].includes(status),
      hint,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latency_ms: Date.now() - started,
      redirected: false,
      hint: (err as Error).name === "AbortError" ? "timeout เกิน 5 วินาที" : (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
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

    const body = await req.json().catch(() => ({}));
    const url = String(body?.url ?? "").trim();
    const kind = body?.kind === "webhook" ? "webhook" : "liff";
    if (!/^https:\/\//i.test(url)) {
      return json({ ok: false, error: "invalid_url", hint: "ต้องเป็น https://" });
    }

    const result = await probe(url, kind as Kind);

    try {
      const alert = result.status === 404 || result.status >= 500;
      await admin.from("line_login_diagnostics").insert({
        event: `endpoint_probe:${kind}`,
        detail: { url: maskUrl(url), ...result, alert, by: uid, source: "manual" },
      });
      if (alert) {
        await admin.from("line_login_diagnostics").insert({
          event: "line_endpoint_unreachable",
          detail: {
            kind,
            url: maskUrl(url),
            status: result.status,
            hint: result.hint,
            by: uid,
            at: new Date().toISOString(),
          },
        });
      }
    } catch (_e) { /* best-effort */ }

    return json(result);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});