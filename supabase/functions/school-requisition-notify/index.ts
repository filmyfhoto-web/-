// แจ้งเตือนใบเขียนเบิกที่ลูกค้า "ส่งให้ร้าน" เข้ากลุ่ม LINE รับออเดอร์เดิม
// - ต้องมี session ของลูกค้า (JWT) และเป็นเจ้าของใบนั้นตาม RLS เท่านั้น
// - อ่านอย่างเดียว: ไม่แตะ products.stock และไม่แตะ stock_movements
import { createClient } from "npm:@supabase/supabase-js@2";
import { notifyRequisitionGroups } from "../_shared/requisitionGroupNotify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await asUser.auth.getUser();
    if (!userData?.user?.id) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const id = String((body as any)?.requisition_id || "").trim();
    if (!id) return json({ error: "requisition_id_required" }, 400);

    // RLS: ลูกค้าเห็นเฉพาะใบของตัวเอง
    const { data: row, error } = await asUser
      .from("school_requisitions")
      .select("id, school_name, project_name, prepared_by, status, total, items, submitted_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return json({ error: "lookup_failed" }, 400);
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status !== "submitted") return json({ error: "not_submitted" }, 400);

    const admin = createClient(url, service);
    const res = await notifyRequisitionGroups(admin, {
      id: String(row.id),
      schoolName: String(row.school_name ?? ""),
      projectName: String(row.project_name ?? ""),
      preparedBy: String(row.prepared_by ?? ""),
      itemCount: Array.isArray(row.items) ? row.items.length : 0,
      total: Number(row.total ?? 0),
      submittedAt: String(row.submitted_at ?? row.updated_at ?? new Date().toISOString()),
    });
    return json({ ok: true, ...res });
  } catch (e) {
    console.error("[school-requisition-notify]", String((e as Error)?.message || e));
    return json({ error: "internal_error" }, 500);
  }
});
