// Customer purchase-order review flow.
//  - action=send    (staff JWT)  -> mark awaiting_customer + LINE link to the customer
//  - action=respond (public)     -> customer confirms or asks for a revision, admins notified
import { createClient } from "npm:@supabase/supabase-js@2";
import { enqueueNotification, kickDispatch } from "../_shared/notifyOutbox.ts";
import { loadOrderGroupDestinations } from "../_shared/orderGroupNotify.ts";


const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function money(n: unknown): string {
  return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function publicOrigin(req: Request, fallback?: string): string {
  const explicit = (fallback || "").trim();
  if (explicit.startsWith("http")) return explicit.replace(/\/$/, "");
  const origin = req.headers.get("origin");
  if (origin && origin.startsWith("http")) return origin.replace(/\/$/, "");
  return "https://nattafilmyy.lovable.app";
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** GROUP-ONLY: แจ้งเตือนแอดมินเข้ากลุ่ม LINE รับออเดอร์เท่านั้น (ไม่ส่งแชทส่วนตัว) */
async function adminRecipients(admin: any): Promise<string[]> {
  const dests = await loadOrderGroupDestinations(admin);
  return dests.map((d) => d.dest);
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || "");

    // ---------------------------------------------------------------- send
    if (action === "send") {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "unauthorized" }, 401);
      const { data: userRes } = await admin.auth.getUser(jwt);
      const uid = userRes?.user?.id;
      if (!uid) return json({ error: "unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
      const isStaff = (roles ?? []).some((r: any) => r.role && r.role !== "customer");
      if (!isStaff) return json({ error: "forbidden" }, 403);

      const poId = String(body?.po_id || "");
      if (!poId) return json({ error: "missing_po_id" }, 400);
      const { data: po, error } = await admin
        .from("customer_purchase_orders")
        .select("*")
        .eq("id", poId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      if (!po) return json({ error: "not_found" }, 404);
      if (po.review_status === "documented") return json({ error: "already_documented" }, 409);

      const token = po.review_token || newToken();
      const { error: upErr } = await admin
        .from("customer_purchase_orders")
        .update({
          review_token: token,
          review_status: "awaiting_customer",
          revision_note: "",
          confirmed_at: null,
          last_sent_at: new Date().toISOString(),
        })
        .eq("id", poId);
      if (upErr) return json({ error: upErr.message }, 400);

      await admin.from("customer_po_review_events").insert({
        po_id: poId,
        event: "sent_to_customer",
        note: "",
        actor: "staff",
      });

      // Recipient: explicit line id on the PO, else the owning profile.
      let recipient: string | null = (po.line_user_id as string | null) || null;
      if (!recipient && po.user_id) {
        const { data: prof } = await admin.from("profiles").select("line_user_id").eq("id", po.user_id).maybeSingle();
        recipient = (prof?.line_user_id as string | null) || null;
      }

      const url = `${publicOrigin(req, body?.origin)}/po/${token}`;
      let queued = false;
      if (recipient) {
        const res = await enqueueNotification(admin, {
          event_type: "po_review_request",
          ref_type: "customer_purchase_order",
          ref_id: poId,
          recipient,
          audience: "customer",
          version: String(po.updated_at || Date.now()),
          text:
            `📄 ขอให้ตรวจสอบออเดอร์\n` +
            `เลขที่: ${po.po_number || "-"}\n` +
            `ยอดสุทธิ: ${money(po.net_total)} บาท\n\n` +
            `กดตรวจสอบและยืนยัน:\n${url}`,
          created_by: uid,
        });
        queued = Boolean((res as any)?.queued);
        if (queued) await kickDispatch();
      }
      return json({ ok: true, token, url, queued, recipient_found: Boolean(recipient) });
    }

    // ------------------------------------------------------------- respond
    if (action === "respond") {
      const token = String(body?.token || "");
      const decision = String(body?.decision || "");
      const note = String(body?.note || "").slice(0, 1000);
      if (!token || !["confirm", "revise"].includes(decision)) return json({ error: "bad_request" }, 400);

      const { data, error } = await admin.rpc("cpo_customer_respond", {
        p_token: token,
        p_action: decision,
        p_note: note,
      });
      if (error) return json({ error: error.message }, 400);
      const result = data as any;
      if (!result?.ok) return json({ error: result?.error || "failed" }, 409);

      const text =
        decision === "confirm"
          ? `✅ ลูกค้ายืนยันออเดอร์แล้ว\nเลขที่: ${result.po_number || "-"}\nออกเอกสารจริงได้แล้ว`
          : `✏️ ลูกค้าขอแก้ไขออเดอร์\nเลขที่: ${result.po_number || "-"}\nรายละเอียด: ${note || "-"}`;
      for (const rcpt of await adminRecipients(admin)) {
        await enqueueNotification(admin, {
          event_type: decision === "confirm" ? "po_review_confirmed" : "po_review_revision",
          ref_type: "customer_purchase_order",
          ref_id: result.id,
          recipient: rcpt,
          audience: "admin",
          version: new Date().toISOString(),
          text,
        });
      }
      await kickDispatch();
      return json({ ok: true, review_status: result.review_status });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[po-review] failed", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});