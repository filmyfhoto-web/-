import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseDevice(ua: string): string {
  const u = ua.toLowerCase();
  let os = "Unknown";
  if (u.includes("iphone") || u.includes("ipad")) os = "iOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("windows")) os = "Windows";
  else if (u.includes("mac os") || u.includes("macintosh")) os = "macOS";
  else if (u.includes("linux")) os = "Linux";
  let browser = "Unknown";
  if (u.includes("edg/")) browser = "Edge";
  else if (u.includes("chrome/") && !u.includes("edg/")) browser = "Chrome";
  else if (u.includes("firefox/")) browser = "Firefox";
  else if (u.includes("safari/") && !u.includes("chrome/")) browser = "Safari";
  const kind = u.includes("mobile") ? "Mobile" : (u.includes("tablet") || u.includes("ipad")) ? "Tablet" : "Desktop";
  return `${kind} · ${os} · ${browser}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
    if (error || !claims?.claims) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    const xff = req.headers.get("x-forwarded-for") || "";
    const ip = xff.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
    const ua = req.headers.get("user-agent") || "";
    const device = parseDevice(ua);

    let country: string | null = null;
    let city: string | null = null;
    let region: string | null = null;
    if (ip && !ip.startsWith("127.") && !ip.startsWith("10.") && !ip.startsWith("192.168.")) {
      try {
        const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) });
        if (geoRes.ok) {
          const g = await geoRes.json();
          country = g.country_name || null;
          city = g.city || null;
          region = g.region || null;
        }
      } catch (_) { /* ignore geo failures */ }
    }

    await supa.from("login_events").insert({
      user_id: userId, ip: ip || null, user_agent: ua.slice(0, 500),
      device, country, city, region,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("log-login error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});