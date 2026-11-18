// ข้อความ "ติดต่อร้าน" จากหน้าลูกค้า → ส่งเข้ากลุ่ม LINE ของร้านจริง
//
// - รับได้ทั้งลูกค้าที่ล็อกอิน (Supabase JWT) และลูกค้าที่ผูก LINE แล้ว (LIFF id_token)
// - บันทึกลง public.customer_messages เมื่อรู้ว่าเป็นผู้ใช้คนไหน (user_id NOT NULL)
// - แจ้งเตือนร้านผ่าน notification_outbox → notify-dispatch (ห้ามยิง LINE API ตรงจากหน้าเว็บ)
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineIdentity } from "../_shared/verifyLineIdentity.ts";
import { loadOrderGroupDestinations } from "../_shared/orderGroupNotify.ts";
import { enqueueNotification, kickDispatch } from "../_shared/notifyOutbox.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TOPICS = new Set([
  "สอบถามราคา",
  "สถานะงาน",
  "แก้ไขงาน",
  "ขอใบเสร็จ / ใบกำกับภาษี",
  "เรื่องอื่น ๆ",
]);

export function buildContactText(p: {
  topic: string;
  name: string;
  contact: string;
  orderNo: string | null;
  message: string;
  adminUrl: string;
}): string {
  return [
    "💬 ข้อความจากลูกค้า (ติดต่อร้าน)",
    `เรื่อง: ${p.topic}`,
    `ลูกค้า: ${p.name || "-"}${p.contact ? ` (${p.contact})` : ""}`,
    p.orderNo ? `อ้างอิงงาน: ${p.orderNo}` : "",
    "———",
    p.message,
    `เปิดกล่องข้อความ: ${p.adminUrl}`,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const message = String((body as any)?.message ?? "").trim();
    if (message.length < 5) return json(400, { ok: false, error: "message_too_short" });
    if (message.length > 1000) return json(400, { ok: false, error: "message_too_long" });
    const topicRaw = String((body as any)?.topic ?? "").trim();
    const topic = TOPICS.has(topicRaw) ? topicRaw : "เรื่องอื่น ๆ";
    const orderId = typeof (body as any)?.order_id === "string" && (body as any).order_id
      ? String((body as any).order_id) : null;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ตัวตนผู้ส่ง — JWT หรือ LIFF id_token เท่านั้น (ไม่เชื่อค่าที่ส่งมาในบอดี้)
    let userId: string | null = null;
    let lineUserId: string | null = null;
    try {
      const identity = await verifyLineIdentity(req, (body as Record<string, unknown>) || {});
      lineUserId = identity.line_user_id || null;
      userId = identity.user_id ?? null;
    } catch {
      // ไม่มี id_token — ลองอ่านจาก Supabase JWT ตรง ๆ
    }
    if (!userId) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (authHeader.startsWith("Bearer ")) {
        const asUser = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
        const { data } = await asUser.auth.getUser();
        userId = data?.user?.id ?? null;
      }
    }
    if (!userId && lineUserId) {
      const { data: prof } = await admin.from("profiles").select("id").eq("line_user_id", lineUserId).maybeSingle();
      userId = (prof?.id as string | null) ?? null;
    }
    if (!userId && !lineUserId) return json(401, { ok: false, error: "unauthorized" });

    // ชื่อ/ช่องทางติดต่อของผู้ส่ง (ไว้ให้ร้านตอบกลับได้)
    let name = "";
    let contact = "";
    if (userId) {
      const { data: prof } = await admin
        .from("profiles")
        .select("full_name, phone, line_display_name")
        .eq("id", userId)
        .maybeSingle();
      name = String(prof?.full_name || prof?.line_display_name || "");
      contact = String(prof?.phone || "");
    }
    if (!name && lineUserId) {
      const { data: link } = await admin
        .from("line_account_links")
        .select("display_name, phone")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      name = String(link?.display_name || "");
      contact = contact || String(link?.phone || "");
    }

    // บันทึกข้อความไว้ในระบบ (เฉพาะเมื่อรู้ผู้ใช้ — คอลัมน์ user_id เป็น NOT NULL)
    let savedId: string | null = null;
    if (userId) {
      const { data: row, error } = await admin
        .from("customer_messages")
        .insert({ user_id: userId, order_id: orderId, topic, message })
        .select("id")
        .maybeSingle();
      if (error) console.warn("[contact-shop-message] insert_failed", error.message);
      savedId = (row?.id as string | null) ?? null;
    }

    let orderNo: string | null = null;
    if (orderId) {
      const { data: o } = await admin.from("orders").select("order_no").eq("id", orderId).maybeSingle();
      orderNo = (o?.order_no as string | null) ?? null;
    }

    const base = (Deno.env.get("PUBLIC_APP_URL") || "https://www.filmyynatta.com").replace(/\/$/, "");
    const text = buildContactText({
      topic, name, contact, orderNo, message,
      adminUrl: `${base}/admin/messages`,
    });

    const dests = await loadOrderGroupDestinations(admin);
    let queued = 0;
    for (const { dest, storeId } of dests) {
      const res = await enqueueNotification(admin, {
        event_type: "customer_contact_message",
        ref_type: "customer_message",
        ref_id: savedId,
        recipient: dest,
        text,
        audience: "admin",
        version: savedId || `${Date.now()}`,
        meta: { topic, order_id: orderId, ...(storeId ? { store_id: storeId } : {}) },
      });
      if (res.queued) queued += 1;
    }
    if (queued > 0) await kickDispatch(admin);

    return json(200, { ok: true, saved: !!savedId, notified: queued, group_configured: dests.length > 0 });
  } catch (e) {
    console.error("[contact-shop-message]", String((e as Error)?.message || e));
    return json(500, { ok: false, error: "send_failed" });
  }
});
