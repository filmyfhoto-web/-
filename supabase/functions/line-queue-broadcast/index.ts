// รีเฟรชการ์ดคิวงานในกลุ่ม LINE แบบเรียลไทม์ เมื่อมีการอัปเดตสถานะงานในระบบ
// เรียกจากแอป (พนักงาน/แอดมินที่ล็อกอินแล้ว) ทุกครั้งที่สถานะงานเปลี่ยน
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildQueueListFlex, summarizeQueueStats } from "../_shared/adminRoomQueries.ts";
import { pushLineMessages } from "../_shared/linePush.ts";
import { resolveStoreLineToken } from "../_shared/lineToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ROLES = ["owner", "admin", "stock_staff", "photo_staff"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await supa.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return json({ ok: false, error: "unauthorized" }, 401);
  const roleChecks = await Promise.all(
    ROLES.map((r) => supa.rpc("has_role", { _user_id: uid, _role: r })),
  );
  if (!roleChecks.some((r) => r.data === true)) return json({ ok: false, error: "forbidden" }, 403);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const appOrigin = Deno.env.get("APP_ORIGIN") || "https://filmyynatta.com";

  const { data: jobs } = await admin
    .from("film_order_jobs")
    .select("job_no,queue_code,title,status,priority,created_at,film_orders(customer_name)")
    .not("status", "in", `("done","cancelled")`)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(15);
  const sorted = (jobs ?? []).slice().sort((a: any, b: any) =>
    (a.status === "producing" ? 0 : 1) - (b.status === "producing" ? 0 : 1));
  const listJobs = sorted.map((j: any) => ({ ...j, customer_name: j.film_orders?.customer_name ?? null }));
  const { count: openCount } = await admin
    .from("film_order_jobs")
    .select("id", { count: "exact", head: true })
    .not("status", "in", `("done","cancelled")`);
  const stats = summarizeQueueStats(listJobs);
  if (typeof openCount === "number" && openCount > listJobs.length) {
    stats.total = openCount;
    stats.waiting = Math.max(0, openCount - stats.running);
  }
  const card = buildQueueListFlex(listJobs, `${appOrigin}/admin/control-room`, stats);

  // เฉพาะ "กลุ่มรันคิวหลัก" ของแต่ละร้าน (hub + เปิดคำสั่งคิว) เท่านั้น
  // ห้ามส่งเข้าแชทส่วนตัว และไม่รบกวนกลุ่มแจ้งเตือนออเดอร์
  const { data: rooms } = await admin
    .from("line_notification_channels")
    .select("id, store_id, line_destination_id, display_name, queue_commands_enabled, is_hub, is_active")
    .eq("is_active", true)
    .eq("is_hub", true)
    .eq("queue_commands_enabled", true);

  const results: Array<{ room: string; ok: boolean; error?: string }> = [];
  for (const r of (rooms ?? []) as any[]) {
    const dest = String(r.line_destination_id || "");
    if (!dest.startsWith("C") && !dest.startsWith("R")) continue; // group/room เท่านั้น
    const token = await resolveStoreLineToken(admin, r.store_id);
    const res = await pushLineMessages(token, dest, [card], `queue-refresh:${r.id}:${Date.now()}`);
    results.push({ room: r.display_name || dest, ok: !!res.ok, error: res.error });
  }
  return json({ ok: true, rooms: results.length, results, jobs: listJobs.length });
});
