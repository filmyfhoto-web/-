// Owner-only: create an admin/staff invitation via Email or LINE.
// Generates a signed token and delivers an accept-link through the requested channel.
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const body = await req.json().catch(() => ({} as any));
    const rawStoreId = body?.store_id ? String(body.store_id) : null;
    const storeId = rawStoreId && /^[0-9a-f-]{36}$/i.test(rawStoreId) ? rawStoreId : null;

    // Owners can invite for any scope. Store staff can invite ONLY for their store.
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller);
    const isOwner = (roles ?? []).some((r: any) => r.role === "owner");
    if (!isOwner) {
      if (!storeId) return json({ error: "owner only for global invites" }, 403);
      const { data: ok } = await admin.rpc("is_staff_of_store", { _user_id: caller, _store_id: storeId });
      if (!ok) return json({ error: "not a member of this store" }, 403);
    }

    const channel = String(body?.channel || "").toLowerCase();
    const target = String(body?.target || "").trim();
    const role = String(body?.role || "admin");
    const message = body?.message ? String(body.message).slice(0, 500) : null;
    const origin = String(body?.origin || "").replace(/\/$/, "");
    const inviteeName = body?.invitee_name ? String(body.invitee_name).slice(0, 120) : null;
    const rawPerms = (body?.perms ?? {}) as Record<string, unknown>;
    const permBool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);
    const fullAccess = role === "owner" || role === "admin";
    const perms = {
      perm_pos: fullAccess ? true : permBool(rawPerms.pos, true),
      perm_stock: fullAccess ? true : permBool(rawPerms.stock, true),
      perm_po: fullAccess ? true : permBool(rawPerms.po, false),
      perm_history: fullAccess ? true : permBool(rawPerms.history, true),
    };

    if (!ROLES.has(role)) return json({ error: "invalid role" }, 400);
    // Only global owners may mint invitations for global roles (owner/admin).
    // Store-scoped staff can only invite store-level roles.
    if (!isOwner && (role === "owner" || role === "admin")) {
      return json({ error: "only global owners can invite owner/admin roles" }, 403);
    }
    if (channel === "email") {
      if (!target.includes("@")) return json({ error: "invalid email" }, 400);
    } else if (channel === "line") {
      if (!/^U[0-9a-f]{32}$/i.test(target)) return json({ error: "invalid LINE user id" }, 400);
    } else if (channel === "link") {
      // Shareable signup link — no delivery, the admin copies the URL.
      if (target.length > 120) return json({ error: "invalid label" }, 400);
    } else {
      return json({ error: "invalid channel" }, 400);
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { data: inv, error: invErr } = await admin.from("admin_invitations")
      .insert({
        channel,
        target: channel === "email" ? target.toLowerCase() : (channel === "link" ? (target || inviteeName || "link") : target),
        role,
        token,
        message,
        invited_by: caller,
        store_id: storeId,
        invitee_name: inviteeName,
        ...perms,
      })
      .select("id, token, expires_at")
      .single();
    if (invErr) return json({ error: invErr.message }, 500);

    // Invitation links always live on the admin workspace so they never leak
    // onto the customer domain.
    const acceptUrl = `${origin || "https://admin.filmyynatta.com"}/accept-admin?token=${token}`;

    let deliveryOk = false;
    let deliveryNote = "";
    if (channel === "email") {
      const { error: mailErr } = await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "admin-invite",
          recipientEmail: target.toLowerCase(),
          idempotencyKey: `admin-invite-${inv.id}`,
          templateData: { acceptUrl, role, message, expiresAt: inv.expires_at },
        },
      });
      deliveryOk = !mailErr;
      deliveryNote = mailErr?.message || "queued";
    } else if (channel === "link") {
      deliveryOk = true;
      deliveryNote = "link_only";
    } else {
      // LINE invite channel disabled — the standalone LINE push function was
      // removed together with the Nattaworks store. Callers should use email.
      deliveryOk = false;
      deliveryNote = "line_channel_disabled";
    }

    await admin.from("activity_logs").insert({
      user_id: caller,
      action: "admin_invite_create",
      target_type: "admin_invitation",
      target_id: inv.id,
      detail: { channel, target, role, store_id: storeId, delivered: deliveryOk, note: deliveryNote },
    });

    return json({ ok: true, invitation_id: inv.id, accept_url: acceptUrl, delivered: deliveryOk, note: deliveryNote, store_id: storeId });
  } catch (e) {
    console.error("admin-invite-create", e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}