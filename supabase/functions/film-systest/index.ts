// Film Shop — ศูนย์ทดสอบระบบ (staff only).
//
// รันเส้นทางจริงของระบบเพื่อทดสอบ:
//  1) web_order : สร้างออเดอร์ช่องทางเว็บแอปจริง → ทริกเกอร์แจ้งเตือน "กลุ่ม 1"
//  2) nattaq    : ส่งข้อความแชทเข้าตัวรับงาน NATTA.Q จริง → สร้างใบงาน + แจ้งเตือน "กลุ่ม 2"
//  3) purge     : ล้างข้อมูลทดสอบทั้งหมด
// ทุกเรคคอร์ดที่สร้างจากที่นี่ถูกทำเครื่องหมาย is_test = true เสมอ
import { createClient } from "npm:@supabase/supabase-js@2";
import { ingestFilmJobMessage } from "../_shared/filmJobIntake.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TEST_TAG = "[TEST]";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ ok: false, reason: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ ok: false, reason: "unauthorized" }, 401);
  const { data: isStaff } = await admin.rpc("is_staff", { _user_id: user.id });
  if (!isStaff) return json({ ok: false, reason: "forbidden" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const action = String(body.action ?? "");
  const storeId = String(body.storeId ?? "") || "default";

  try {
    if (action === "web_order") {
      const customerName = String(body.customerName ?? "").trim() || "ลูกค้าทดสอบ";
      const description = String(body.description ?? "").trim() || "สติกเกอร์ PVC 10x10 ซม.";
      const quantity = Number(body.quantity) > 0 ? Number(body.quantity) : 1;
      const unitPrice = Number(body.unitPrice) >= 0 ? Number(body.unitPrice) : 0;
      const total = quantity * unitPrice;

      const { data: nextNo } = await admin.rpc("film_next_order_number");
      const orderNo = typeof nextNo === "string" && nextNo ? nextNo : `OR-${Date.now().toString().slice(-8)}`;

      const { data: order, error } = await admin
        .from("film_orders")
        .insert({
          order_no: orderNo,
          customer_name: `${TEST_TAG} ${customerName}`,
          channel: "web",
          title: `${TEST_TAG} ${description}`,
          status: "order_review",
          payment_status: "unpaid",
          subtotal: total,
          total,
          is_urgent: false,
          has_design: false,
          is_draft: false,
          is_test: true,
          notes: "สร้างจากศูนย์ทดสอบระบบ",
        })
        .select("id, order_no")
        .single();
      if (error || !order) return json({ ok: false, reason: error?.message ?? "insert_failed" }, 400);

      await admin.from("film_order_items").insert({
        order_id: order.id,
        description,
        quantity,
        unit: "ชิ้น",
        unit_price: unitPrice,
        total,
        sort_order: 0,
      });

      return json({ ok: true, orderId: order.id, orderNo: order.order_no, group: 1, total });
    }

    if (action === "nattaq") {
      const text = String(body.text ?? "").trim();
      if (!text) return json({ ok: false, reason: "empty_text" }, 400);
      const displayName = String(body.displayName ?? "").trim() || "ลูกค้าทดสอบ LINE";
      const eventId = `systest:${crypto.randomUUID()}`;

      const res = await ingestFilmJobMessage(admin, {
        eventId,
        messageId: eventId,
        lineUserId: null,
        displayName: `${TEST_TAG} ${displayName}`,
        channelId: storeId === "all" ? null : storeId,
        text,
      });

      if (res.orderId) {
        await admin.from("film_orders").update({ is_test: true }).eq("id", res.orderId);
      }

      const taskCode = `NATTA-Q-${eventId.slice(-6).toUpperCase()}`;
      const autoLine = res.orderNo
        ? `✅ สร้างงานเข้าคิวอัตโนมัติแล้ว: ${res.orderNo}`
        : res.missing?.length
          ? `⚠️ ยังสร้างงานอัตโนมัติไม่ได้ ขาด: ${res.missing.join(", ")}`
          : "";

      await admin.rpc("film_raise_ops_notification", {
        p_kind: "nattaq_auto_order",
        p_severity: "urgent",
        p_title: `🤖 NATTA.Q ออเดอร์อัตโนมัติ (${taskCode})`,
        p_body: [
          `AI ตรวจพบการรับงานจาก: ${TEST_TAG} ${displayName}`,
          `“${text.slice(0, 180)}”`,
          autoLine,
        ].filter(Boolean).join("\n"),
        p_order_id: res.orderId ?? null,
        p_job_id: null,
        p_dept: null,
        p_assignee: null,
        p_dedup_key: `nattaq_auto_order:${eventId}`,
        p_cooldown_minutes: 0,
        p_store_id: storeId,
        p_group_no: 2,
      });

      return json({
        ok: true,
        group: 2,
        intakeStatus: res.intakeStatus,
        orderId: res.orderId ?? null,
        orderNo: res.orderNo ?? null,
        missing: res.missing ?? [],
        taskCode,
      });
    }

    if (action === "purge") {
      // ล้างข้อมูลทดสอบต้องทำในสิทธิ์ของผู้ใช้ที่ล็อกอิน (ฟังก์ชันอนุญาตเฉพาะเจ้าของร้าน)
      const { error } = await asUser.rpc("film_purge_test_data");
      if (error) return json({ ok: false, reason: error.message }, 400);
      return json({ ok: true });
    }

    return json({ ok: false, reason: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, reason: String((e as Error)?.message ?? e) }, 500);
  }
});