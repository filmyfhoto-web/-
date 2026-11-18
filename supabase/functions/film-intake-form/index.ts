/**
 * ฟอร์ม “รับงานใหม่” จากกลุ่ม LINE (มือถือ 3 ขั้น)
 *
 * ทุกคำขอต้องมี token อายุสั้นที่บอทสร้างให้ในกลุ่มเท่านั้น — ฟอร์มไม่เชื่อ
 * groupId / ร้าน / ผู้ส่ง จาก client. เมื่อยืนยัน จะเรียก RPC คิวเดิม
 * (film_queue_intake_confirm) แล้วส่งการ์ดสรุปกลับ “กลุ่มเดิม”
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { loadLineChannels } from "../_shared/lineChannels.ts";
import { pushLineMessages } from "../_shared/linePush.ts";
import { buildIntakeSummaryFlex } from "../_shared/intakeFormLink.ts";
import { withQueueQuickReply } from "../_shared/adminRoomQueries.ts";
import { filmQueueUrls } from "../_shared/nattaDocBot.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "job-attachments";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function loadToken(db: any, token: string) {
  if (!token || token.length < 16) return null;
  const { data } = await db.from("film_intake_form_tokens").select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  if (Date.parse(data.expires_at) < Date.now()) return null;
  if (data.cancelled_at) return null;
  return data;
}

function bkk(iso?: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 7 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const action = String(body?.action || "");
  const db = admin();

  const row = await loadToken(db, String(body?.token || ""));
  if (!row) return json({ error: "invalid_or_expired_token" }, 401);

  if (action === "resolve") {
    return json({
      ok: true,
      store_label: row.store_label,
      expires_at: row.expires_at,
      used: Boolean(row.used_at),
      order_id: row.order_id,
      prefill: row.prefill ?? null,
    });
  }

  if (action === "sign_upload") {
    const name = String(body?.filename || "file").replace(/[\\/:*?"<>|]+/g, "_").slice(-100);
    const path = `line-intake/${row.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, path, token: data.token, signedUrl: data.signedUrl, bucket: BUCKET });
  }

  if (action === "confirm") {
    const payload = { ...(body?.payload ?? {}) } as Record<string, unknown>;
    payload.intake_source = "line_group";
    // idempotency ผูกกับ token row เท่านั้น — ไม่เชื่อ request_id จาก client
    payload.request_id = `line-intake-token:${row.id}`;

    const { data, error } = await db.rpc("film_queue_intake_confirm", { p_payload: payload });
    if (error) return json({ error: error.message }, 400);
    const res = { ...(data as any) } as any;
    if (row.used_at) res.duplicate = true;

    await db.from("film_intake_form_tokens")
      .update({ used_at: new Date().toISOString(), order_id: res?.order_id ?? null })
      .eq("id", row.id)
      .is("used_at", null);

    // การ์ดสรุปกลับกลุ่มเดิม (ไม่หยุดผลลัพธ์ถ้าส่งไม่สำเร็จ)
    try {
      if (!res?.duplicate) {
        const channels = await loadLineChannels(db);
        const ch = channels.find((c) => c.id === row.channel_key && !c.signatureOnly) ??
          channels.find((c) => c.id === row.channel_key);
        if (ch?.token) {
          const items = Array.isArray((payload as any).items) ? (payload as any).items : [];
          await pushLineMessages(ch.token, row.group_id, [withQueueQuickReply(buildIntakeSummaryFlex({
            orderNo: res.order_no,
            customerName: String((payload as any)?.customer?.name ?? "-"),
            items: items.map((i: any) => ({ title: String(i.title ?? ""), quantity: i.quantity, unit: i.unit })),
            dueText: bkk(String((payload as any).due_at ?? "") || null),
            queueUrl: filmQueueUrls(Deno.env.get("PUBLIC_APP_ORIGIN")).queue,
            docsUrl: filmQueueUrls(Deno.env.get("PUBLIC_APP_ORIGIN")).docs,
          }))], `intake-summary:${res.order_id}`);
        }
      }
    } catch (e) {
      console.error("intake summary push failed", e);
    }

    return json({ ok: true, ...res });
  }

  return json({ error: "unknown_action" }, 400);
});
