// แจ้งเตือนลูกค้าสำหรับ flow เดียวของหน้า "งานและเอกสาร"
//
//   ลูกค้าส่งรายการ → ร้านกดยืนยันรับ (received_ack)
//                   → ร้านแนบใบส่งของ PDF แล้วส่งกลับ (delivery_note)
//
// - เรียกได้จากหลังบ้านเท่านั้น (frontend ห้ามเรียก LINE API เอง)
// - กันส่งซ้ำด้วย public.order_notification_logs (order_id + notification_type + recipient_type)
// - ใช้ได้ทั้งคำสั่งซื้อ (customer_purchase_orders) และใบเขียนเบิก (school_requisitions)
import { createClient } from "npm:@supabase/supabase-js@2";
import { pushLineMessages } from "../_shared/linePush.ts";
import { resolveLineToken } from "../_shared/lineToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// web_order = คำสั่งซื้อจากเว็บลูกค้า (public.orders) — ป้าย/ข้อความเหมือนคำสั่งซื้อทุกอย่าง
export type WorkKind = "web_order" | "order" | "requisition";
export type WorkAction = "received_ack" | "delivery_note" | "quotation";

/** ข้อความยืนยันรับรายการ — ข้อความตามที่ร้านกำหนด */
export function ackText(kind: WorkKind): string {
  return kind === "requisition"
    ? "ได้รับใบเขียนเบิกเรียบร้อยแล้วค่ะ\nทางร้านจะดำเนินการจัดทำ และส่งไฟล์ใบส่งของให้เร็วที่สุดค่ะ"
    : "ได้รับคำสั่งซื้อเรียบร้อยแล้วค่ะ\nทางร้านจะดำเนินการจัดทำ และส่งไฟล์ใบส่งของให้เร็วที่สุดค่ะ";
}

export function deliveryText(code: string): string {
  return [
    "📄 ใบส่งของพร้อมแล้วค่ะ",
    code ? `เลขที่รายการ: ${code}` : "",
    "กดปุ่มด้านล่างเพื่อเปิด/ดาวน์โหลดไฟล์ใบส่งของค่ะ",
  ].filter(Boolean).join("\n");
}

/** ใบเสนอราคาที่ร้านยืนยันราคาแล้ว */
export function quotationText(code: string): string {
  return [
    "🧾 ใบเสนอราคาพร้อมแล้วค่ะ",
    code ? `เลขที่รายการ: ${code}` : "",
    "กดปุ่มด้านล่างเพื่อเปิด/ดาวน์โหลดใบเสนอราคาค่ะ",
  ].filter(Boolean).join("\n");
}


const TABLE: Record<WorkKind, string> = {
  web_order: "orders",
  order: "customer_purchase_orders",
  requisition: "school_requisitions",
};

/** คอลัมน์ที่ต้องอ่านของแต่ละชนิดงาน */
const COLS: Record<WorkKind, string> = {
  web_order: "id, order_no, guest_name, school_name, customer_id, line_user_id, delivery_note_file, quote_file",
  order: "id, po_number, customer_name, user_id, line_user_id, delivery_note_file, quote_file",
  requisition: "id, req_number, school_name, prepared_by, user_id, line_user_id, delivery_note_file, quote_file",
};


const KINDS: WorkKind[] = ["web_order", "order", "requisition"];

/** เลขที่รายการที่ลูกค้าเห็นในข้อความ */
function codeOf(kind: WorkKind, r: Record<string, unknown>): string {
  if (kind === "web_order") return String(r.order_no || "");
  if (kind === "requisition") return String(r.req_number || "");
  return String(r.po_number || "");
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
    if (!(await staffUserId(req, admin))) return json(401, { error: "unauthorized" });
    const body = await req.json().catch(() => ({}));
    const kind = (KINDS.includes(body?.kind as WorkKind) ? body.kind : "order") as WorkKind;
    const id = String(body?.id ?? "").trim();
    const action = (["delivery_note", "quotation"].includes(String(body?.action))
      ? String(body.action) : "received_ack") as WorkAction;
    const force = body?.force === true;
    if (!id) return json(400, { error: "id required" });


    const table = TABLE[kind];
    const { data: row, error } = await admin.from(table).select(COLS[kind]).eq("id", id).maybeSingle();
    if (error) return json(500, { error: error.message });
    if (!row) return json(404, { error: "not_found" });

    const r = row as Record<string, unknown>;
    const code = codeOf(kind, r);

    // ปลายทางลูกค้า: line_user_id ของรายการ → โปรไฟล์ผู้ใช้ (จำไว้ครั้งเดียว)
    // ออเดอร์เว็บผูกผู้ใช้ผ่าน customer_id ส่วนอีกสองตารางใช้ user_id
    const profileId = (kind === "web_order" ? r.customer_id : r.user_id) as string | null;
    const rawLineId = (r.line_user_id as string | null) || null;
    // ค่าเก่าบางแถวเคยเก็บรหัสจำลอง "guest:<uuid>" ของลูกค้าที่ยังไม่ผูก LINE → ไม่ใช่ปลายทางจริง
    let lineUserId = rawLineId && !rawLineId.startsWith("guest:") ? rawLineId : null;

    if (!lineUserId && profileId) {
      const { data: prof } = await admin.from("profiles").select("line_user_id").eq("id", profileId).maybeSingle();
      lineUserId = (prof?.line_user_id as string | null) || null;
      if (lineUserId) await admin.from(table).update({ line_user_id: lineUserId }).eq("id", id);
    }

    const notificationType = action;
    const { data: existing } = await admin
      .from("order_notification_logs")
      .select("id, status, attempts")
      .eq("order_id", id).eq("notification_type", notificationType).eq("recipient_type", "customer")
      .maybeSingle();
    if (existing && existing.status === "sent" && !force) {
      return json(200, { ok: true, status: "sent", deduplicated: true });
    }

    const base = {
      order_id: id, notification_type: notificationType, recipient_type: "customer",
      target_id: lineUserId, attempts: (existing?.attempts ?? 0) + 1,
      payload: { kind, code },
    };
    const save = async (patch: Record<string, unknown>) => {
      const payload = { ...base, ...patch };
      if (existing?.id) await admin.from("order_notification_logs").update(payload).eq("id", existing.id);
      else await admin.from("order_notification_logs").insert(payload);
    };

    if (!lineUserId) {
      await save({ status: "failed", error_message: "ลูกค้ายังไม่ได้เชื่อม LINE — รอจับคู่ลูกค้า", sent_at: null });
      return json(200, { ok: false, status: "failed", error: "no_line_link" });
    }

    let messages: unknown[];
    if (action === "received_ack") {
      messages = [{ type: "text", text: ackText(kind) }];
    } else {
      const isQuote = action === "quotation";
      const file = ((isQuote ? r.quote_file : r.delivery_note_file) ?? null) as
        { bucket?: string; path?: string; name?: string } | null;
      if (!file?.bucket || !file?.path) {
        await save({
          status: "failed",
          error_message: isQuote ? "ยังไม่ได้สร้างใบเสนอราคา" : "ยังไม่ได้แนบไฟล์ใบส่งของ",
          sent_at: null,
        });
        return json(200, { ok: false, status: "failed", error: "no_file" });
      }
      // LINE ไม่รองรับแนบ PDF ตรง ๆ → ส่งลิงก์ HTTPS ให้ลูกค้ากดเปิด/ดาวน์โหลด
      const { data: signed, error: sErr } = await admin.storage.from(file.bucket)
        .createSignedUrl(file.path, 60 * 60 * 24 * 30, { download: file.name || undefined });
      const url = signed?.signedUrl;
      if (!url) {
        await save({ status: "failed", error_message: `สร้างลิงก์ไฟล์ไม่สำเร็จ: ${sErr?.message || "unknown"}`, sent_at: null });
        return json(200, { ok: false, status: "failed", error: "sign_failed" });
      }
      messages = [{
        type: "text",
        text: isQuote ? quotationText(code) : deliveryText(code),
        quickReply: {
          items: [{
            type: "action",
            action: {
              type: "uri",
              label: isQuote ? "เปิดใบเสนอราคา (PDF)" : "เปิดใบส่งของ (PDF)",
              uri: url,
            },
          }],
        },
      }];
    }


    const token = await resolveLineToken(admin);
    const res = await pushLineMessages(token, lineUserId, messages, `wd:${id}:${action}`);
    if (res.ok) {
      await save({ status: "sent", error_message: null, sent_at: new Date().toISOString() });
      return json(200, { ok: true, status: "sent" });
    }
    // ใช้เฉพาะรหัส HTTP ที่เป็นตัวเลขจาก LINE API (ไม่ใช่ค่าที่ผู้ใช้ส่งเข้ามา)
    const httpCode = Number(res.status) || 0;
    await save({ status: "failed", error_message: String(res.error || "line_http_" + httpCode).slice(0, 500), sent_at: null });
    return json(200, { ok: false, status: "failed", error: String(res.error || httpCode) });
  } catch (e) {
    console.error("send-work-doc-notify", e);
    return json(500, { error: String((e as Error)?.message || e) });
  }
});
