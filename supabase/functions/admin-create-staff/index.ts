// Owner-only: create a staff/admin account directly (email + password, pre-confirmed).
// No invitation email required — the owner hands the credentials to the staff member.
import { createClient } from "npm:@supabase/supabase-js@2";
import { friendlyAuthError } from "../_shared/authErrors.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = new Set(["owner", "admin", "stock_staff", "photo_staff"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authed = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await authed.auth.getClaims(authHeader.slice(7));
    const caller = claims?.claims?.sub as string | undefined;
    if (!caller) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, svc);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller);
    if (!(roles ?? []).some((r: any) => r.role === "owner")) return json({ error: "owner only" }, 403);

    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const role = String(body?.role || "stock_staff");
    const fullName = body?.full_name ? String(body.full_name).slice(0, 120) : null;
    const rawPerms = (body?.perms ?? {}) as Record<string, unknown>;
    const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
      return json({ error: "รูปแบบอีเมลไม่ถูกต้อง (เช่น somchai@gmail.com)" }, 400);
    }
    if (/@(example\.com|example\.org|test|localhost)$/i.test(email)) {
      return json({ error: "โดเมนตัวอย่าง (example.com) ใช้ไม่ได้ — กรุณาใช้อีเมลจริง" }, 400);
    }
    if (password.length < 8) return json({ error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" }, 400);
    if (!ROLES.has(role)) return json({ error: "invalid role" }, 400);

    // Create or reuse the account
    let uid: string | undefined;
    let created = false;
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (createErr) {
      const msg = String(createErr.message || "");
      if (!/already|registered|exists/i.test(msg)) {
        return json({ error: friendlyAuthError(msg) }, 400);
      }
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      uid = list?.users?.find((u: any) => (u.email || "").toLowerCase() === email)?.id;
      if (!uid) return json({ error: "มีบัญชีนี้อยู่แล้วแต่ค้นหาไม่พบ" }, 500);
      // reset password so the owner-provided credentials work
      const { error: pwErr } = await admin.auth.admin.updateUserById(uid, { password, email_confirm: true });
      if (pwErr) return json({ error: friendlyAuthError(pwErr.message), code: "password_rejected" }, 400);
    } else {
      uid = newUser?.user?.id;
      created = true;
    }
    if (!uid) return json({ error: "สร้างบัญชีไม่สำเร็จ" }, 500);

    await admin.from("profiles").upsert(
      { id: uid, email, ...(fullName ? { full_name: fullName } : {}) },
      { onConflict: "id" },
    );

    await admin.from("user_roles").delete().eq("user_id", uid);
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: uid, role });
    if (roleErr) return json({ error: roleErr.message }, 500);

    const fullAccess = role === "owner" || role === "admin";
    const { error: permErr } = await admin.from("staff_permissions").upsert({
      user_id: uid,
      can_pos: fullAccess ? true : bool(rawPerms.pos, true),
      can_stock: fullAccess ? true : bool(rawPerms.stock, true),
      can_po: fullAccess ? true : bool(rawPerms.po, false),
      can_history: fullAccess ? true : bool(rawPerms.history, true),
      updated_by: caller,
    }, { onConflict: "user_id" });
    if (permErr) console.error("admin-create-staff perms", permErr);

    await admin.from("activity_logs").insert({
      user_id: caller,
      action: "admin_create_staff",
      target_type: "profile",
      target_id: uid,
      detail: { email, role, created },
    });

    return json({ ok: true, user_id: uid, created, role });
  } catch (e) {
    console.error("admin-create-staff", e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
