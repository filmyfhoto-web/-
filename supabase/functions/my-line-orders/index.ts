// Return the caller's own orders + a single order's detail, scoped
// SERVER-SIDE to the verified LINE identity.
//
// Ownership is decided from the caller's proof:
//   1. verifyLineIdentity (LIFF id_token or Supabase JWT) → line_user_id
//   2. line_account_links row keyed by line_user_id → phone / customer_id
//   3. Orders match one of:
//        - orders.line_user_id  = <verified line_user_id>
//        - orders.customer_id   = <linked customer_id>  (source-agnostic;
//          `orders.customer_id` is a uuid FK — no source column on orders)
//        - orders.is_guest=true AND orders.guest_phone = <linked phone>
//
// Client-supplied `line_user_id`, `phone`, `customer_id`, `guest_id`, or
// even the `order_id` (for the list action) are IGNORED.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineIdentity } from "../_shared/verifyLineIdentity.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    let identity;
    try {
      identity = await verifyLineIdentity(req, body || {});
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      console.warn("[my-line-orders] identity_verify_failed", msg);
      const wantedAction = typeof (body as any)?.action === "string" ? (body as any).action : "list";
      // ผู้ใช้ที่ยังไม่ได้ผูก LINE = สถานะปกติของหน้ารายการ → ลิสต์ว่าง
      if (msg === "no_line_user_bound_to_account") {
        return json({ orders: [], line_linked: false });
      }
      // ตัวตนยืนยันไม่ผ่าน (โทเคนหมดอายุ/ไม่ถูกต้อง) → ยังคืน 200 กันจอขาว
      // แต่บอกชัดว่าต้องเข้าสู่ระบบใหม่ ไม่ใช่ "ไม่มีงาน"
      if (wantedAction !== "detail") {
        return json({ orders: [], line_linked: false, auth_expired: true });
      }
      return json({ error: "unauthorized" }, 401);
    }


    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const line_user_id = identity.line_user_id;

    // Resolve linked contact for source-agnostic ownership.
    const { data: link } = await supabase
      .from("line_account_links")
      .select("phone, customer_id")
      .eq("line_user_id", line_user_id)
      .maybeSingle();
    const linkedPhone = (link?.phone || "").trim() || null;
    const linkedCustomerId = link?.customer_id || null;

    const action = typeof body?.action === "string" ? body.action : "list";

    if (action === "detail") {
      const orderId = typeof body?.order_id === "string" ? body.order_id : "";
      if (!orderId) return json({ error: "missing_order_id" }, 400);
      const { data: order, error: oe } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
      if (oe) { console.error("[my-line-orders] detail_lookup_failed", oe.message); return json({ error: "lookup_failed" }, 500); }
      if (!order) return json({ error: "not_found" }, 404);
      // Ownership check — the ONLY authoritative gate.
      const owns =
        (order as any).line_user_id === line_user_id ||
        (linkedCustomerId && (order as any).customer_id === linkedCustomerId) ||
        (linkedPhone && (order as any).is_guest === true && ((order as any).guest_phone || "").trim() === linkedPhone);
      if (!owns) return json({ error: "forbidden" }, 403);

      const [{ data: items }, { data: org }] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
        (order as any).organization_id
          ? supabase.from("organizations").select("*").eq("id", (order as any).organization_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return json({ order, items: items ?? [], organization: (org as any)?.data ?? org ?? null });
    }

    // Default: list
    // Fetch three candidate slices in parallel, merge & dedupe, sort desc, cap.
    const [byLine, byCustomer, byPhone] = await Promise.all([
      supabase.from("orders").select("*").eq("line_user_id", line_user_id).is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
      linkedCustomerId
        ? supabase.from("orders").select("*").eq("customer_id", linkedCustomerId).is("deleted_at", null).order("created_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [], error: null } as any),
      linkedPhone
        ? supabase.from("orders").select("*").eq("is_guest", true).eq("guest_phone", linkedPhone).is("deleted_at", null).order("created_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    const err = (byLine as any).error || (byCustomer as any).error || (byPhone as any).error;
    if (err) { console.error("[my-line-orders] list_failed", err.message); return json({ error: "lookup_failed" }, 500); }
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const row of [...((byLine as any).data || []), ...((byCustomer as any).data || []), ...((byPhone as any).data || [])]) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    merged.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return json({ orders: merged.slice(0, 200) });
  } catch (e) {
    console.error("[my-line-orders] unexpected", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});