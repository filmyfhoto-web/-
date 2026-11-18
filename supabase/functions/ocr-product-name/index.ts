// Edge function: OCR product name + barcode from a captured image using Lovable AI Gateway.
// Requires authenticated user to prevent AI quota abuse.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsErr } =
      await authClient.auth.getClaims(authHeader.slice(7));
    if (claimsErr || !claimsData?.claims) {
      return json({ error: "unauthorized" }, 401);
    }
    const uid = claimsData.claims.sub as string;
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: staffOk, error: staffErr } = await svc.rpc("is_staff_any", { _uid: uid });
    if (staffErr || !staffOk) {
      return json({ error: "forbidden" }, 403);
    }
    const { image_base64, mime = "image/jpeg" } = await req.json();
    if (!image_base64 || typeof image_base64 !== "string") {
      return json({ error: "image_base64 required" }, 400);
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "ai_not_configured" }, 500);

    const dataUrl = image_base64.startsWith("data:")
      ? image_base64
      : `data:${mime};base64,${image_base64}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "คุณคือผู้ช่วยอ่านฉลากสินค้า ตอบกลับเป็น JSON เท่านั้น รูปแบบ " +
              "{\"name\":string,\"barcode\":string,\"raw_text\":string,\"confidence\":number}. " +
              "name = ชื่อสินค้าหลักที่อ่านได้ (ภาษาไทยหรืออังกฤษ ตัดยี่ห้อ/น้ำหนักออกหากชื่อยาวเกิน). " +
              "barcode = เลขบาร์โค้ดถ้าเห็นชัด (EAN/UPC) ไม่เห็นให้ใส่ \"\". " +
              "raw_text = ข้อความทั้งหมดที่อ่านได้จากภาพ (รวมยี่ห้อ น้ำหนัก รุ่น ฯลฯ) ไม่ต้องจัดรูปแบบ. " +
              "confidence = ตัวเลขระหว่าง 0 ถึง 1 บอกความมั่นใจของชื่อสินค้าที่ตอบ. " +
              "ห้ามมีข้อความอื่นนอก JSON",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "อ่านชื่อสินค้าและบาร์โค้ดจากรูปนี้" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: "ai_error", status: r.status, detail: t.slice(0, 500) }, 502);
    }
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    const cleaned = text.replace(/```json|```/g, "").trim();
    let parsed: { name?: string; barcode?: string } = {};
    try { parsed = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const conf = Number((parsed as any).confidence);
    return json({
      name: (parsed.name ?? "").trim(),
      barcode: (parsed.barcode ?? "").trim(),
      raw_text: ((parsed as any).raw_text ?? "").toString().trim(),
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : null,
    });
  } catch (e: any) {
    return json({ error: "unexpected", detail: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}