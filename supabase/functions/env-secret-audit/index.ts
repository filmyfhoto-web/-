// Audits the edge-function environment for missing, malformed or unexpected
// secret names. NEVER returns a secret value — only the name, presence and a
// shape verdict derived from the value. Owner/admin only.
//
// Deleting a Lovable-managed secret cannot be done from an edge function, so
// `request_delete` records an audited, explicitly-confirmed deletion request
// instead of silently doing nothing.

import { createClient } from "npm:@supabase/supabase-js@2";

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

type Shape = (v: string) => { ok: boolean; note: string };

const hex32: Shape = (v) =>
  /^[0-9a-f]{32}$/i.test(v)
    ? { ok: true, note: "hex 32 ตัว" }
    : { ok: false, note: `ต้องเป็น hex 32 ตัว (ได้ ${v.length} ตัว)` };
const longToken: Shape = (v) =>
  /^Bearer\s/i.test(v)
    ? { ok: false, note: "มีคำว่า 'Bearer ' ปนมา" }
    : v.length >= 80
    ? { ok: true, note: `token ยาว ${v.length} ตัว` }
    : { ok: false, note: `สั้นเกินไป (${v.length} ตัว) — token มักยาว ~172` };
const digits: Shape = (v) =>
  /^\d{8,15}$/.test(v) ? { ok: true, note: "ตัวเลข 8–15 หลัก" } : { ok: false, note: "ต้องเป็นตัวเลข 8–15 หลัก" };
const lineUserId: Shape = (v) =>
  /^U[0-9a-f]{32}$/i.test(v) ? { ok: true, note: "U + hex 32" } : { ok: false, note: "ต้องขึ้นต้น U ตามด้วย hex 32" };
const liffId: Shape = (v) =>
  /^\d+-[a-zA-Z0-9]+$/.test(v) ? { ok: true, note: "รูปแบบ LIFF ID ถูกต้อง" } : { ok: false, note: "ควรเป็น 1234567890-abcdefg" };
const url: Shape = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:"
      ? { ok: true, note: "URL https" }
      : { ok: false, note: "ควรเป็น https" };
  } catch {
    return { ok: false, note: "ไม่ใช่ URL ที่ถูกต้อง" };
  }
};
const nonEmpty: Shape = (v) =>
  v.trim().length > 0 ? { ok: true, note: `ตั้งค่าแล้ว (${v.length} ตัว)` } : { ok: false, note: "ค่าว่าง" };

type Spec = { name: string; required: boolean; label: string; shape: Shape };

export const SPECS: Spec[] = [
  { name: "LINE_LOGIN_CHANNEL_ID", required: true, label: "LINE Login channel ID", shape: digits },
  { name: "LINE_LOGIN_CHANNEL_SECRET", required: true, label: "LINE Login channel secret", shape: hex32 },
  { name: "LINE_CHANNEL_SECRET", required: true, label: "Messaging API channel secret", shape: hex32 },
  { name: "LINE_CHANNEL_ACCESS_TOKEN", required: true, label: "Messaging API access token", shape: longToken },
  { name: "LINE_ADMIN_USER_ID", required: true, label: "LINE userId ของแอดมิน", shape: lineUserId },
  { name: "LIFF_ID", required: false, label: "LIFF ID", shape: liffId },
  { name: "LINE_LOGIN_CHANNEL_TOKEN", required: false, label: "LINE Login channel token (debug)", shape: longToken },
  { name: "PUBLIC_APP_URL", required: false, label: "โดเมนสาธารณะของแอป", shape: url },
  { name: "RESEND_API_KEY", required: false, label: "คีย์ส่งอีเมล", shape: nonEmpty },
  { name: "LOVABLE_API_KEY", required: false, label: "Lovable AI gateway", shape: nonEmpty },
];

/** Platform-provided variables that must never be flagged or deleted. */
const RESERVED = [
  /^SUPABASE_/,
  /^DENO_/,
  /^SB_/,
  /^EDGE_RUNTIME/,
  /^AWS_/,
  /^_/,
  /^(PATH|HOME|HOSTNAME|LANG|PWD|SHLVL|TERM|TZ|NODE_ENV)$/,
  /^LOGFLARE/,
  /^GOOGLE_/,
  /^INTERNAL_WORKER_TOKEN$/,
  /^POSTGRES_/,
];

export function classifyUnknown(name: string): { suspicious: boolean; reason: string } {
  if (/^[0-9a-f]{16,}$/i.test(name)) {
    return { suspicious: true, reason: "ชื่อดูเหมือนค่าที่ถูกวางผิดช่อง (hex ล้วน) — น่าจะสร้างพลาด" };
  }
  if (/\s/.test(name)) return { suspicious: true, reason: "ชื่อมีช่องว่าง" };
  if (name !== name.toUpperCase()) return { suspicious: true, reason: "ชื่อไม่ใช่ตัวพิมพ์ใหญ่ตามมาตรฐาน" };
  if (name.length < 4) return { suspicious: true, reason: "ชื่อสั้นผิดปกติ" };
  return { suspicious: false, reason: "ไม่ได้ใช้ในโค้ดชุดนี้ — ตรวจสอบก่อนลบ" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
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

    const body = (await req.json().catch(() => ({}))) as { action?: string; name?: string; confirm?: string };
    const action = body.action || "audit";
    const env = Deno.env.toObject();
    const known = new Set(SPECS.map((s) => s.name));

    if (action === "request_delete") {
      const name = String(body.name || "");
      if (!name) return json({ ok: false, error: "missing_name" }, 400);
      if (body.confirm !== name) return json({ ok: false, error: "confirm_mismatch" }, 400);
      if (RESERVED.some((re) => re.test(name))) return json({ ok: false, error: "reserved_name" }, 400);
      const spec = SPECS.find((s) => s.name === name);
      if (spec?.required) return json({ ok: false, error: "required_secret", message: "secret นี้จำเป็นต่อระบบ — ลบไม่ได้" }, 400);

      await supa.from("activity_logs").insert({
        user_id: uid,
        action: "secret.delete_request",
        target_type: "secret",
        detail: { name, present: name in env, requested_at: new Date().toISOString() },
      });
      return json({
        ok: true,
        requires_manual_delete: true,
        message:
          "บันทึกคำขอลบแล้ว (ไม่มีการเปิดเผยค่า) — การลบ secret จริงต้องทำผ่านหน้าตั้งค่าโปรเจกต์เพื่อความปลอดภัย",
        name,
      });
    }

    const items = SPECS.map((s) => {
      const raw = env[s.name] ?? "";
      if (!raw) {
        return {
          name: s.name,
          label: s.label,
          required: s.required,
          present: false,
          status: s.required ? "missing" : "optional_missing",
          note: s.required ? "ยังไม่ได้ตั้งค่า — ระบบส่วนนี้จะไม่ทำงาน" : "ยังไม่ได้ตั้งค่า (ไม่บังคับ)",
        };
      }
      if (raw !== raw.trim()) {
        return { name: s.name, label: s.label, required: s.required, present: true, status: "invalid", note: "มีช่องว่างหัว/ท้าย" };
      }
      const v = s.shape(raw);
      return {
        name: s.name,
        label: s.label,
        required: s.required,
        present: true,
        status: v.ok ? "ok" : "invalid",
        note: v.note,
      };
    });

    const unknowns = Object.keys(env)
      .filter((k) => !known.has(k) && !RESERVED.some((re) => re.test(k)))
      .map((name) => ({ name, ...classifyUnknown(name), present: true }))
      .sort((a, b) => Number(b.suspicious) - Number(a.suspicious) || a.name.localeCompare(b.name));

    return json({
      ok: true,
      checked_at: new Date().toISOString(),
      items,
      unknowns,
      summary: {
        missing_required: items.filter((i) => i.status === "missing").length,
        invalid: items.filter((i) => i.status === "invalid").length,
        suspicious: unknowns.filter((u) => u.suspicious).length,
        unknown: unknowns.length,
      },
    });
  } catch (e) {
    console.error("env-secret-audit error", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
