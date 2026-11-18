// ตั้งค่า Rich Menu "น้องนัตต้า" ของ Film Shop (เจ้าของ/แอดมินเท่านั้น)
//
// - ใช้ channel access token ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งโทเคนออกไปที่เบราว์เซอร์
// - สร้าง rich menu ใหม่ → อัปโหลดรูป → ตั้งเป็นเมนูเริ่มต้นของ OA
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveStoreLineToken } from "../_shared/lineToken.ts";

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

import { buildRichMenuBody } from "../_shared/nattaRichMenu.ts";
export { buildRichMenuBody };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

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

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const storeId = String((body as any)?.store_id || "default").trim() || "default";
  const token = await resolveStoreLineToken(admin, storeId);
  if (!token) return json({ ok: false, error: "no_token", message_th: "ยังไม่ได้ตั้งค่า Access Token ของ LINE OA" }, 400);

  const origin = Deno.env.get("PUBLIC_APP_ORIGIN") || "https://filmyynatta.com";
  const imageUrl = String((body as any)?.image_url || "").trim();
  const storagePath = String((body as any)?.storage_path || "richmenu/richmenu-muang.jpg").trim();

  // 1) สร้างเมนู
  const created = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildRichMenuBody()),
  });
  if (!created.ok) {
    return json({ ok: false, step: "create", status: created.status, detail: (await created.text()).slice(0, 300) }, 502);
  }
  const richMenuId = (await created.json())?.richMenuId as string;

  // 2) โหลดรูป — ใช้ไฟล์ในสตอเรจก่อน (ไม่ต้องพึ่งเว็บสาธารณะ) แล้วค่อย fallback ไป URL
  let bytes: Uint8Array | null = null;
  let contentType = "image/jpeg";
  if (!imageUrl) {
    const dl = await admin.storage.from("product-images").download(storagePath);
    if (dl.data) {
      bytes = new Uint8Array(await dl.data.arrayBuffer());
      contentType = storagePath.endsWith(".png") ? "image/png" : "image/jpeg";
    }
  }
  if (!bytes) {
    const url = imageUrl || `${origin}/film-shop/richmenu-muang.jpg`;
    const img = await fetch(url);
    if (!img.ok) return json({ ok: false, step: "image_fetch", status: img.status }, 502);
    contentType = (img.headers.get("content-type") || "").includes("png") ? "image/png" : "image/jpeg";
    bytes = new Uint8Array(await img.arrayBuffer());
  }
  if (bytes.byteLength > 1024 * 1024) {
    return json({ ok: false, step: "image_size", message_th: "ไฟล์รูปเมนูใหญ่เกิน 1MB" }, 400);
  }

  const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: bytes,
  });
  if (!up.ok) {
    return json({ ok: false, step: "upload", status: up.status, detail: (await up.text()).slice(0, 300) }, 502);
  }


  // 3) ตั้งเป็นเมนูเริ่มต้น
  const setDefault = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!setDefault.ok) {
    return json({ ok: false, step: "set_default", status: setDefault.status, detail: (await setDefault.text()).slice(0, 300) }, 502);
  }

  return json({ ok: true, rich_menu_id: richMenuId, store_id: storeId, message_th: "ตั้งค่าเมนู “น้องนัตต้า” เรียบร้อยแล้ว" });
});
