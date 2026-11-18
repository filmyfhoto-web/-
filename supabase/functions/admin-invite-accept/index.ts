// Public (auth-required): the invited person calls this after logging in.
// Validates token, assigns the requested role, marks the invitation accepted.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, svc);

    const body = await req.json().catch(() => ({} as any));
    const token = String(body?.token || "").trim();
    const mode = String(body?.mode || "accept"); // "preview" | "accept"
    if (!token) return json({ error: "missing token" }, 400);

    const { data: inv, error: invErr } = await admin
      .from("admin_invitations")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (invErr || !inv) return json({ error: "invalid token" }, 404);
    if (inv.status !== "pending") return json({ error: `invitation ${inv.status}`, status: inv.status }, 409);
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await admin.from("admin_invitations").update({ status: "expired" }).eq("id", inv.id);
      return json({ error: "invitation expired" }, 410);
    }

    if (mode === "preview") {
      let storeName: string | null = null;
      if (inv.store_id) {
        const { data: s } = await admin.from("rds_stores").select("name").eq("id", inv.store_id).maybeSingle();
        storeName = s?.name ?? null;
      }
      return json({
        ok: true,
        invitation: {
          channel: inv.channel,
          role: inv.role,
          message: inv.message,
          expires_at: inv.expires_at,
          store_id: inv.store_id,
          store_name: storeName,
          scope: inv.store_id ? "store" : "global",
          invitee_name: inv.invitee_name ?? null,
          perms: {
            pos: !!inv.perm_pos,
            stock: !!inv.perm_stock,
            po: !!inv.perm_po,
            history: !!inv.perm_history,
          },
        },
      });
    }

    // Need logged-in user for accept
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "login required" }, 401);
    const authed = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await authed.auth.getClaims(authHeader.slice(7));
    const uid = claims?.claims?.sub as string | undefined;
    if (!uid) return json({ error: "login required" }, 401);

    // Optional email match check for email invites
    if (inv.channel === "email") {
      const email = String(claims?.claims?.email || "").toLowerCase();
      if (email && email !== inv.target) {
        return json({ error: `กรุณาเข้าสู่ระบบด้วยอีเมล ${inv.target}` }, 403);
      }
    }

    // Assign role. Use upsert-style so we don't wipe an existing higher role.
    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert({ user_id: uid, role: inv.role }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (roleErr) return json({ error: roleErr.message }, 500);

    // If the invite is scoped to a store, add the store membership too so
    // per-store RLS (is_staff_of_store) grants access to that shop.
    if (inv.store_id) {
      const { error: memErr } = await admin
        .from("staff_stores")
        .upsert({ user_id: uid, store_id: inv.store_id }, { onConflict: "user_id,store_id", ignoreDuplicates: true });
      if (memErr) return json({ error: memErr.message }, 500);
    }

    // Apply the default module permissions chosen by the inviting owner.
    if (inv.role !== "owner" && inv.role !== "admin") {
      const { error: permErr } = await admin
        .from("staff_permissions")
        .upsert({
          user_id: uid,
          can_pos: !!inv.perm_pos,
          can_stock: !!inv.perm_stock,
          can_po: !!inv.perm_po,
          can_history: !!inv.perm_history,
          updated_by: inv.invited_by,
        }, { onConflict: "user_id" });
      if (permErr) console.error("admin-invite-accept perms", permErr);
    }

    await admin.from("admin_invitations")
      .update({ status: "accepted", accepted_by: uid, accepted_at: new Date().toISOString() })
      .eq("id", inv.id);

    await admin.from("activity_logs").insert({
      user_id: uid,
      action: "admin_invite_accept",
      target_type: "admin_invitation",
      target_id: inv.id,
      detail: {
        channel: inv.channel,
        role: inv.role,
        store_id: inv.store_id,
        scope: inv.store_id ? "store" : "global",
        perms: { pos: !!inv.perm_pos, stock: !!inv.perm_stock, po: !!inv.perm_po, history: !!inv.perm_history },
      },
    });

    return json({
      ok: true,
      role: inv.role,
      store_id: inv.store_id,
      scope: inv.store_id ? "store" : "global",
      perms: { pos: !!inv.perm_pos, stock: !!inv.perm_stock, po: !!inv.perm_po, history: !!inv.perm_history },
    });
  } catch (e) {
    console.error("admin-invite-accept", e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}