/**
 * ผู้ช่วยค้นหาสินค้า AI — optional natural-language product search.
 *
 * Contract (POST JSON):
 *   { query: string }
 * Response:
 *   { ok: true, mode: "ai" | "keyword", terms: string[], note?: string }
 *
 * `terms` are plain keywords the client feeds into the EXISTING catalogue
 * search. The function never returns products itself, never receives
 * customer or order data, and degrades to keyword mode (HTTP 200) when
 * OPENAI_API_KEY is not configured — so normal shopping never breaks.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Deterministic fallback: strip filler words, keep meaningful tokens. */
export function keywordTerms(query: string): string[] {
  return query
    .replace(/[?？!！,，.]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !["ขอ", "หา", "อยาก", "ได้", "ไหม", "ครับ", "ค่ะ", "หน่อย"].includes(t))
    .slice(0, 6);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let query = "";
  try {
    const body = await req.json();
    query = String(body?.query ?? "").trim().slice(0, 300);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!query) return json({ ok: false, error: "empty_query" }, 400);

  const fallback = keywordTerms(query);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json({
      ok: true,
      mode: "keyword",
      terms: fallback,
      note: "ยังไม่ได้ตั้งค่าผู้ช่วย AI — ใช้การค้นหาปกติแทน",
    });
  }

  // Paid AI calls are for signed-in users only; anonymous visitors still get
  // the deterministic keyword search so shopping is never blocked.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  let authed = false;
  if (token) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
      });
      if (res.ok) {
        const user = await res.json();
        authed = Boolean(user?.id);
      } else {
        await res.text().catch(() => "");
      }
    } catch (_e) {
      authed = false;
    }
  }
  if (!authed) {
    return json({
      ok: true,
      mode: "keyword",
      terms: fallback,
      note: "เข้าสู่ระบบเพื่อใช้ผู้ช่วยค้นหา AI — ตอนนี้ใช้การค้นหาปกติให้ก่อน",
    });
  }

  try {
    // OpenAI Responses API — streamed, per platform guidance for reasoning models.
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-5.1-mini",
        stream: true,
        instructions:
          "คุณช่วยแปลงคำถามภาษาไทยเกี่ยวกับเครื่องเขียน/อุปกรณ์สำนักงาน เป็นคำค้นหาสั้น ๆ " +
          "ตอบกลับเป็นคำค้นคั่นด้วยเครื่องหมายจุลภาคเท่านั้น ไม่เกิน 6 คำ",
        input: query,
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      console.error(`ai-product-search upstream [${res.status}]: ${detail}`);
      return json({ ok: true, mode: "keyword", terms: fallback, note: "ผู้ช่วย AI ไม่พร้อมใช้งาน ใช้การค้นหาปกติแทน" });
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          if (evt?.type === "response.output_text.delta" && typeof evt.delta === "string") text += evt.delta;
        } catch { /* ignore partial frames */ }
      }
    }
    const terms = text
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 6);
    return json({ ok: true, mode: terms.length ? "ai" : "keyword", terms: terms.length ? terms : fallback });
  } catch (e) {
    console.error("ai-product-search failed:", e);
    return json({ ok: true, mode: "keyword", terms: fallback, note: "ผู้ช่วย AI ขัดข้อง ใช้การค้นหาปกติแทน" });
  }
});
