// แจ้งเตือนคำสั่งซื้อผ่าน LINE Messaging API (ปลายทางลูกค้า + ปลายทางแอดมิน/กลุ่มร้าน)
//
// - เรียกได้จากหลังบ้านเท่านั้น (ห้ามเรียก LINE API จาก frontend)
// - โทเคนทั้งหมดอ่านจาก Supabase Secrets (LINE_CHANNEL_ACCESS_TOKEN ฯลฯ)
// - กันส่งซ้ำด้วย unique (order_id, notification_type, recipient_type) ใน
//   public.order_notification_logs — ส่งซ้ำได้เมื่อสั่ง force เท่านั้น
// - ส่งไม่สำเร็จ = บันทึก status 'failed' พร้อม error_message โดยออเดอร์ไม่หาย
//
// GROUP-ONLY POLICY: ปลายทางฝั่งทีมงานต้องเป็นกลุ่ม LINE (C…/R…) เท่านั้น
import { createClient } from "npm:@supabase/supabase-js@2";
import { pushLineMessages } from "../_shared/linePush.ts";
import { resolveLineToken } from "../_shared/lineToken.ts";
import { loadOrderGroupDestinations } from "../_shared/orderGroupNotify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** ชุดข้อความตามสถานะที่ลูกค้าต้องได้รับ */
export const CUSTOMER_MESSAGES: Record<string, { title: string; line: string }> = {
  order_created: { title: "✅ ได้รับคำสั่งซื้อแล้ว", line: "ทางร้านได้รับคำสั่งซื้อของคุณเรียบร้อยแล้ว" },
  order_accepted: { title: "📦 รับออเดอร์แล้ว", line: "ร้านรับออเดอร์และเริ่มดำเนินการแล้ว" },
  awaiting_quote: { title: "🧾 รอเสนอราคา", line: "ร้านกำลังจัดทำใบเสนอราคาให้ค่ะ" },
  price_informed: { title: "💰 แจ้งยอดรวม", line: "ร้านแจ้งยอดรวมของคำสั่งซื้อแล้ว" },
  ready_for_pickup: { title: "🎉 สินค้าพร้อมรับ", line: "งานของคุณพร้อมรับแล้ว" },
  info_requested: { title: "❓ ขอข้อมูลเพิ่ม", line: "ร้านขอข้อมูลเพิ่มเติมเพื่อดำเนินการต่อ" },
  order_cancelled: { title: "🚫 ยกเลิกคำสั่งซื้อ", line: "คำสั่งซื้อนี้ถูกยกเลิกแล้ว" },
};

export const STATUS_LABELS: Record<string, string> = {
  order_created: "ได้รับคำสั่งซื้อ",
  order_accepted: "รับออเดอร์แล้ว",
  awaiting_quote: "รอเสนอราคา",
  price_informed: "แจ้งยอดรวมแล้ว",
  ready_for_pickup: "สินค้าพร้อมรับ",
  info_requested: "ขอข้อมูลเพิ่ม",
  order_cancelled: "ยกเลิกคำสั่งซื้อ",
};

const baht = (n: number) => `${Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;

const fmtTime = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" })
      .format(new Date(iso)) + " น.";
  } catch { return iso; }
};

export function isGroupDestination(dest: string): boolean {
  return /^[CR][0-9a-f]{10,}$/i.test(String(dest || "").trim());
}

type OrderInfo = {
  id: string; poNumber: string; customerName: string; phone: string;
  itemCount: number; total: number; lineUserId: string | null; createdAt: string;
};

export function buildCustomerMessage(o: OrderInfo, type: string, url: string) {
  const m = CUSTOMER_MESSAGES[type] ?? CUSTOMER_MESSAGES.order_created;
  const text = [
    m.title,
    m.line,
    `เลขคำสั่งซื้อ: ${o.poNumber}`,
    `ชื่อลูกค้า: ${o.customerName || "-"}`,
    `จำนวนรายการ: ${o.itemCount}`,
    `ยอดรวม: ${o.total > 0 ? baht(o.total) : "รอเสนอราคา"}`,
    `สถานะ: ${STATUS_LABELS[type] ?? type}`,
  ].join("\n");
  return [{
    type: "text",
    text,
    quickReply: { items: [{ type: "action", action: { type: "uri", label: "ดูรายละเอียดคำสั่งซื้อ", uri: url } }] },
  }];
}

export function buildAdminMessage(o: OrderInfo, type: string, url: string) {
  const text = [
    type === "order_created" ? "🛒 มีออเดอร์ใหม่" : `🔔 อัปเดตออเดอร์ · ${STATUS_LABELS[type] ?? type}`,
    `เลขคำสั่งซื้อ: ${o.poNumber}`,
    `ลูกค้า: ${o.customerName || "-"}`,
    `เบอร์โทร: ${o.phone || "-"}`,
    `จำนวนรายการ: ${o.itemCount}`,
    `ยอดรวม: ${o.total > 0 ? baht(o.total) : "รอเสนอราคา"}`,
    `เวลาที่สั่ง: ${fmtTime(o.createdAt)}`,
  ].join("\n");
  return [{
    type: "text",
    text,
    quickReply: { items: [{ type: "action", action: { type: "uri", label: "เปิดจัดการออเดอร์", uri: url } }] },
  }];
}

export type AdminTargetInfo = {
  target: string;
  /** env = มาจาก ADMIN_LINE_TARGET_ID, channel = กลุ่มที่ตั้งค่าในระบบ, none = ยังไม่ตั้งค่า */
  source: "env" | "channel" | "none";
  isGroup: boolean;
};

/** ปลายทางแอดมินแบบกำหนดค่าได้: ADMIN_LINE_TARGET_ID ก่อน แล้ว fallback เป็นกลุ่มในระบบ */
export function parseAdminTargetEnv(raw: string | undefined | null): string {
  return String(raw || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)[0] ?? "";
}

export async function resolveAdminTarget(admin: any): Promise<AdminTargetInfo> {
  const envTarget = parseAdminTargetEnv((globalThis as any).Deno?.env?.get?.("ADMIN_LINE_TARGET_ID"));
  if (envTarget) return { target: envTarget, source: "env", isGroup: isGroupDestination(envTarget) };
  const dest = (await loadOrderGroupDestinations(admin))[0]?.dest ?? "";
  if (!dest) return { target: "", source: "none", isGroup: false };
  return { target: dest, source: "channel", isGroup: isGroupDestination(dest) };
}

/** พนักงานเท่านั้น (owner/admin/staff role ใด ๆ) จึงจะสั่งส่งข้อความได้ */
async function staffUserId(req: Request, admin: any): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return null;
  const asUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data } = await asUser.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) return null;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const ok = (roles ?? []).some((r: { role: string }) =>
    ["owner", "admin", "stock_staff", "photo_staff"].includes(String(r.role)));
  return ok ? uid : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // ต้องเป็นพนักงานที่ล็อกอินแล้วเท่านั้น — กันคนนอกยิงสั่งส่ง LINE ถึงลูกค้า
    // และกันการสำรวจว่ามีเลขออเดอร์ใดอยู่จริง (404 vs 200)
    if (!(await staffUserId(req, admin))) return json(401, { error: "unauthorized" });
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? "").trim();
    const type = String(body?.notification_type ?? "order_created").trim();
    const force = body?.force === true;
    // แจ้งเตือนฝั่งแอดมิน/กลุ่มร้าน "ปิดใช้งาน" — แอดมินดูออเดอร์จากแชทลูกค้าใน LINE OA อยู่แล้ว
    // (โค้ด resolveAdminTarget/buildAdminMessage คงไว้เผื่อเปิดใช้อีกในอนาคต)
    const ADMIN_NOTIFY_ENABLED = false;
    const requested: string[] = Array.isArray(body?.recipient_types)
      ? body.recipient_types.filter((r: unknown) => r === "customer" || r === "admin")
      : ["customer"];
    const only = requested.filter((r) => r === "customer" || ADMIN_NOTIFY_ENABLED);

    // อ่านปลายทางที่ระบบจะใช้จริง (ให้หน้าแอดมินแสดงได้ว่าใช้ปลายทางไหน)
    if (String(body?.action ?? "") === "targets") {
      const info = await resolveAdminTarget(admin);
      return json(200, { ok: true, admin: info });
    }

    if (!orderId) return json(400, { error: "order_id required" });


    const { data: row, error } = await admin
      .from("customer_purchase_orders")
      .select("id, po_number, customer_name, customer_phone, items, net_total, subtotal, line_user_id, user_id, created_at")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return json(500, { error: error.message });
    if (!row) return json(404, { error: "order_not_found" });

    let lineUserId: string | null = (row.line_user_id as string | null) || null;
    if (!lineUserId && row.user_id) {
      const { data: prof } = await admin.from("profiles").select("line_user_id").eq("id", row.user_id).maybeSingle();
      lineUserId = (prof?.line_user_id as string | null) || null;
      // เชื่อม LINE ครั้งแรกครั้งเดียว: จำ line_user_id ไว้กับออเดอร์/ลูกค้า
      if (lineUserId) await admin.from("customer_purchase_orders").update({ line_user_id: lineUserId }).eq("id", orderId);
    }

    const items = Array.isArray(row.items) ? row.items : [];
    const order: OrderInfo = {
      id: String(row.id),
      poNumber: String(row.po_number || ""),
      customerName: String(row.customer_name || ""),
      phone: String(row.customer_phone || ""),
      itemCount: items.length,
      total: Number(row.net_total ?? row.subtotal ?? 0) || 0,
      lineUserId,
      createdAt: String(row.created_at || new Date().toISOString()),
    };

    const site = (Deno.env.get("PUBLIC_SITE_URL") || "https://nattafilmyy.lovable.app").replace(/\/+$/, "");
    const customerUrl = `${site}/account/orders?order=${order.id}`;
    const adminUrl = `${site}/admin/order-desk?order=${order.id}`;

    const token = await resolveLineToken(admin);
    const results: Array<Record<string, unknown>> = [];

    // ปลายทางแอดมิน: env ก่อน แล้วค่อย fallback เป็นกลุ่มที่ตั้งค่าไว้ในระบบ
    // ปกติไม่ถูกใช้แล้ว (ADMIN_NOTIFY_ENABLED = false) แต่คงไว้สำหรับ action=targets
    const adminInfo = only.includes("admin")
      ? await resolveAdminTarget(admin)
      : ({ target: "", source: "none", isGroup: false } as AdminTargetInfo);
    const adminTarget = adminInfo.target;


    for (const recipientType of only) {
      const target = recipientType === "customer" ? (order.lineUserId || "") : adminTarget;

      const { data: existing } = await admin
        .from("order_notification_logs")
        .select("id, status, attempts")
        .eq("order_id", orderId).eq("notification_type", type).eq("recipient_type", recipientType)
        .maybeSingle();
      if (existing && existing.status === "sent" && !force) {
        results.push({ recipient_type: recipientType, status: "sent", deduplicated: true });
        continue;
      }

      const base = {
        order_id: orderId, notification_type: type, recipient_type: recipientType,
        target_id: target || null, attempts: (existing?.attempts ?? 0) + 1,
      };

      const save = async (patch: Record<string, unknown>) => {
        const payload = { ...base, ...patch };
        if (existing?.id) await admin.from("order_notification_logs").update(payload).eq("id", existing.id);
        else await admin.from("order_notification_logs").insert(payload);
      };

      if (!target) {
        await save({ status: "failed", error_message: recipientType === "customer" ? "ลูกค้ายังไม่ได้เชื่อม LINE" : "ยังไม่ได้ตั้งค่ากลุ่มแจ้งเตือนของร้าน", sent_at: null });
        results.push({ recipient_type: recipientType, status: "failed", error: "no_target" });
        continue;
      }
      if (recipientType === "admin" && !isGroupDestination(target)) {
        await save({ status: "skipped", error_message: "ปลายทางทีมงานต้องเป็นกลุ่ม LINE เท่านั้น", sent_at: null });
        results.push({ recipient_type: recipientType, status: "skipped" });
        continue;
      }

      const messages = recipientType === "customer"
        ? buildCustomerMessage(order, type, customerUrl)
        : buildAdminMessage(order, type, adminUrl);
      const res = await pushLineMessages(token, target, messages, `onl:${orderId}:${type}:${recipientType}`);

      if (res.ok) {
        await save({ status: "sent", error_message: null, sent_at: new Date().toISOString() });
        results.push({ recipient_type: recipientType, status: "sent", deduplicated: res.deduplicated ?? false });
      } else {
        await save({ status: "failed", error_message: String(res.error || `line_http_${res.status}`).slice(0, 500), sent_at: null });
        results.push({ recipient_type: recipientType, status: "failed", error: res.error });
      }
    }

    return json(200, { ok: true, order_id: orderId, notification_type: type, admin: adminInfo, results });
  } catch (e) {
    console.error("send-order-line-notifications", e);
    return json(500, { error: String((e as Error)?.message || e) });
  }
});
