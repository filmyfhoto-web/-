// Film Shop — เปิดดูหลักฐานแนบของรายการบัญชี (owner/admin เท่านั้น)
//
// ความปลอดภัย:
// - ต้องเป็นผู้ใช้ที่ล็อกอิน และมีบทบาท owner/admin (ตรวจผ่าน RPC has_role)
// - รับเฉพาะ transaction_id — ไม่รับ path จากผู้เรียกเด็ดขาด
// - อ่าน evidence จากฐานข้อมูลด้วย service role แล้วออก signed URL อายุสั้น (10 นาที)
// - ไม่คืน public URL และไม่เปิดเผยคีย์ service role
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "film-line-attachments" as const;
const EXPIRES_SEC = 600;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** path ที่ยอมรับ: อยู่ในบัคเก็ตส่วนตัวเท่านั้น ไม่ใช่ URL และไม่มีการย้อนไดเรกทอรี */
export function isSafeEvidencePath(path: unknown): path is string {
  const p = String(path ?? "").trim();
  if (!p || p.length > 300) return false;
  if (p.startsWith("/") || p.includes("..") || /^https?:/i.test(p)) return false;
  return /^[A-Za-z0-9_\-./ก-๙()@+ ]+$/.test(p);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await supa.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ ok: false, error: "unauthorized" }, 401);

    const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
      supa.rpc("has_role", { _user_id: uid, _role: "admin" }),
      supa.rpc("has_role", { _user_id: uid, _role: "owner" }),
    ]);
    if (!isAdmin && !isOwner) return json({ ok: false, error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const txId = String((body as any)?.transaction_id ?? "").trim();
    if (!/^[0-9a-f-]{32,40}$/i.test(txId)) return json({ ok: false, error: "invalid_transaction_id" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row, error } = await admin
      .from("film_transactions")
      .select("id, evidence")
      .eq("id", txId)
      .maybeSingle();
    if (error) return json({ ok: false, error: "lookup_failed" }, 500);
    if (!row) return json({ ok: false, error: "not_found" }, 404);

    const list = Array.isArray(row.evidence) ? (row.evidence as Array<{ name?: string; path?: string }>) : [];
    const files: Array<{ name: string; url: string }> = [];
    for (const f of list) {
      if (!isSafeEvidencePath(f?.path)) continue;
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(String(f.path), EXPIRES_SEC);
      if (signed?.signedUrl) files.push({ name: String(f?.name || "หลักฐาน"), url: signed.signedUrl });
    }
    return json({ ok: true, files, expires_in: EXPIRES_SEC });
  } catch (_e) {
    return json({ ok: false, error: "server_error" }, 500);
  }
});
