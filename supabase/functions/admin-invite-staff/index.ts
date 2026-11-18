// Owner-only: invite a new staff user by email and assign them a role.
// Uses Supabase Auth admin API to send an invite email; then upserts user_roles.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = new Set(["owner", "admin", "stock_staff", "photo_staff", "customer"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(authHeader.slice(7));
    if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthorized" }, 401);
    const callerId = claims.claims.sub as string;

    const admin = createClient(url, svc);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
    const isOwner = (roles ?? []).some((r: any) => r.role === "owner");
    if (!isOwner) return json({ error: "owner only" }, 403);

    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "admin");
    const redirectTo = String(body?.redirect_to || "");
    if (!email || !email.includes("@")) return json({ error: "invalid email" }, 400);
    if (!ALLOWED_ROLES.has(role)) return json({ error: "invalid role" }, 400);

    // Send invite (Supabase generates & emails the link with default template)
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo || undefined,
    });
    if (inviteErr) {
      // If user already exists, fall back to setting the role only
      const msg = String(inviteErr.message || "");
      const exists = /already/i.test(msg) || /registered/i.test(msg);
      if (!exists) return json({ error: msg }, 400);
    }

    // Locate the user (freshly invited or already existing)
    let uid = invited?.user?.id as string | undefined;
    if (!uid) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      uid = list?.users?.find((u: any) => (u.email || "").toLowerCase() === email)?.id;
    }
    if (!uid) return json({ error: "user not found after invite" }, 500);

    // Ensure profile exists (handle_new_user trigger runs on signup, not invite)
    await admin.from("profiles").upsert({ id: uid, email }, { onConflict: "id" });

    // Replace roles for this user with the requested one
    await admin.from("user_roles").delete().eq("user_id", uid);
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: uid, role });
    if (roleErr) return json({ error: roleErr.message }, 500);

    await admin.from("activity_logs").insert({
      user_id: callerId,
      action: "admin_invite_staff",
      target_type: "profile",
      target_id: uid,
      detail: { email, role, invited: !!invited?.user },
    });

    return json({ ok: true, user_id: uid, role, invited: !!invited?.user });
  } catch (e) {
    console.error("admin-invite-staff", e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}