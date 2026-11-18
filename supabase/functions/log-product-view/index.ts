// Silent product-view tracker. Public endpoint (no JWT) — writes only, never reads.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseUA(ua: string) {
  const u = (ua || "").toLowerCase();
  let device = "Desktop";
  if (u.includes("mobile")) device = "Mobile";
  else if (u.includes("tablet") || u.includes("ipad")) device = "Tablet";
  let browser = "Unknown";
  if (u.includes("line/")) browser = "LINE";
  else if (u.includes("edg/")) browser = "Edge";
  else if (u.includes("chrome/") && !u.includes("edg/")) browser = "Chrome";
  else if (u.includes("firefox/")) browser = "Firefox";
  else if (u.includes("safari/") && !u.includes("chrome/")) browser = "Safari";
  return { device, browser };
}

function detectSource(referrer: string, ua: string, source?: string) {
  if (source && typeof source === "string" && source.length <= 40) return source;
  const u = (ua || "").toLowerCase();
  if (u.includes("line/")) return "LINE OA";
  const r = (referrer || "").toLowerCase();
  if (r.includes("line.me") || r.includes("liff")) return "LINE";
  if (r) return "web";
  return "direct";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const productId: string | null = body?.product_id || null;
    const sessionId: string | null = body?.session_id || null;
    if (!productId || !sessionId) {
      return new Response(JSON.stringify({ ok: false, error: "missing product_id/session_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Optional: identified user via forwarded JWT
    let userId: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      try {
        const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: auth } },
        });
        const { data: claims } = await anon.auth.getClaims(auth.replace("Bearer ", ""));
        userId = (claims?.claims?.sub as string) || null;
      } catch (_) { /* ignore */ }
    }

    // Look up product snapshot (never trust client-supplied names)
    const { data: prod } = await supa
      .from("products")
      .select("id, code, name")
      .eq("id", productId)
      .maybeSingle();
    if (!prod) {
      return new Response(JSON.stringify({ ok: false, error: "product not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identity from server-side profile (never from client body)
    let lineUserId: string | null = null;
    if (userId) {
      const { data: prof } = await supa.from("profiles").select("line_user_id").eq("id", userId).maybeSingle();
      lineUserId = prof?.line_user_id || null;
    }

    // Guest identity: only accept if it matches an existing order/customer record
    let guestName: string | null = null;
    let guestPhone: string | null = null;
    let guestId: string | null = null;
    const rawPhone = typeof body?.guest_phone === "string" ? body.guest_phone.replace(/\D/g, "").slice(0, 15) : "";
    if (rawPhone.length >= 8) {
      const { data: cust } = await supa
        .from("customers")
        .select("id, name, phone")
        .eq("phone", rawPhone)
        .maybeSingle();
      if (cust) {
        guestPhone = cust.phone;
        guestName = cust.name;
        guestId = cust.id;
      } else {
        // Only phone provided — accept phone, but do NOT invent a name
        guestPhone = rawPhone;
      }
    }

    const xff = req.headers.get("x-forwarded-for") || "";
    const ip = xff.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || null;
    const ua = (req.headers.get("user-agent") || "").slice(0, 500);
    const { device, browser } = parseUA(ua);
    const referrer: string = typeof body?.referrer === "string" ? body.referrer.slice(0, 500) : "";
    const path: string = typeof body?.path === "string" ? body.path.slice(0, 500) : "";
    const source = detectSource(referrer, ua, body?.source);

    // One row per (session_id, product_id); increment view_count on repeats.
    const { data: existing } = await supa
      .from("product_view_logs")
      .select("id, view_count")
      .eq("session_id", sessionId)
      .eq("product_id", productId)
      .maybeSingle();

    if (existing) {
      await supa.from("product_view_logs").update({
        view_count: (existing.view_count || 1) + 1,
        last_at: new Date().toISOString(),
        // refresh identity if we learned more this hit
        user_id: userId ?? undefined,
        line_user_id: lineUserId ?? undefined,
        guest_id: guestId ?? undefined,
        guest_name: guestName ?? undefined,
        guest_phone: guestPhone ?? undefined,
      }).eq("id", existing.id);
    } else {
      await supa.from("product_view_logs").insert({
        session_id: sessionId,
        product_id: prod.id,
        product_code: prod.code,
        product_name: prod.name,
        path, referrer, source,
        user_id: userId,
        line_user_id: lineUserId,
        guest_id: guestId,
        guest_name: guestName,
        guest_phone: guestPhone,
        ip, user_agent: ua, device, browser,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("log-product-view error", e);
    // Swallow errors silently — never disturb the customer UX
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});