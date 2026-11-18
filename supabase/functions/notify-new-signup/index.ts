// Fan-out notification for new organization signups / join requests.
// Invoked by Signup.tsx after the signup RPC succeeds.
// Respects per-channel toggles stored in public.settings.
import { createClient } from "npm:@supabase/supabase-js@2";
import { enqueueNotification, kickDispatch } from "../_shared/notifyOutbox.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LINE_ADMIN = Deno.env.get("LINE_ADMIN_USER_ID");

function originOf(req: Request, fallback?: string | null) {
  const o = req.headers.get("origin") || req.headers.get("referer") || fallback || "";
  try { return new URL(o).origin; } catch { return ""; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    // Require authenticated caller — prevents anonymous admin notification spam.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsErr } =
      await authClient.auth.getClaims(authHeader.slice(7));
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;
    const { org_id, kind, force } = await req.json().catch(() => ({} as any));
    if (!org_id) {
      return new Response(JSON.stringify({ error: "missing org_id" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Authorization: only allow the caller if they belong to the org, or are
    // owner/admin staff. Prevents authenticated users from spamming admin LINE
    // by passing arbitrary org_ids.
    const [{ data: callerProfile }, { data: callerRoles }] = await Promise.all([
      admin.from("profiles").select("organization_id").eq("id", callerId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", callerId),
    ]);
    const roles = (callerRoles ?? []).map((r: any) => r.role);
    const isStaff = roles.includes("owner") || roles.includes("admin");
    const belongsToOrg = callerProfile?.organization_id === org_id;
    if (!isStaff && !belongsToOrg) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    // Only staff may use `force` to bypass the idempotency dedupe.
    const allowForce = !!force && isStaff;
    const [{ data: org }, { data: settings }] = await Promise.all([
      admin.from("organizations").select("id, name, contact_name, phone, email").eq("id", org_id).maybeSingle(),
      admin.from("settings").select("notify_signup_line, notify_signup_inapp").eq("id", 1).maybeSingle(),
    ]);
    if (!org) {
      return new Response(JSON.stringify({ error: "org not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const lineOn = settings?.notify_signup_line !== false;
    const result: any = { line: null };
    const origin = originOf(req);
    const link = `${origin || ""}/admin/customers?org=${org_id}`;

    if (lineOn && LINE_ADMIN) {
      const title = kind === "join" ? "📥 มีคำขอเข้าร่วมหน่วยงานใหม่" : "🆕 มีหน่วยงานสมัครใหม่";
      const text = [
        title,
        `หน่วยงาน: ${org.name}`,
        org.contact_name ? `ผู้ติดต่อ: ${org.contact_name}` : null,
        org.phone ? `โทร: ${org.phone}` : null,
        org.email ? `อีเมล: ${org.email}` : null,
        "",
        `👉 อนุมัติ: ${link}`,
      ].filter(Boolean).join("\n");
      const baseKey = `signup:${org_id}`;
      const idempotency_key = allowForce ? `${baseKey}:force:${Date.now()}` : baseKey;
      const { data: existing } = allowForce ? { data: null } : await admin
        .from("line_notifications").select("id, sent_status").eq("idempotency_key", baseKey).maybeSingle();
      if (existing && existing.sent_status === "sent") {
        result.line = { ok: true, deduped: true };
      } else {
        // Queue only — the outbox worker retries with a stable retry key.
        const r = await enqueueNotification(admin, {
          event_type: "new_signup",
          ref_type: "organization",
          ref_id: org_id,
          recipient: LINE_ADMIN,
          text,
          audience: "admin",
          version: allowForce ? String(Date.now()) : "",
        });
        await kickDispatch(admin);
        await admin.from("line_notifications").insert({
          type: "new_signup", kind: "new_signup", direction: "to_admin",
          recipient: LINE_ADMIN, message: text,
          sent_status: r.queued ? "pending" : "failed",
          sent_at: null,
          last_attempt_at: new Date().toISOString(),
          error_message: r.queued ? null : String(r.error || "").slice(0, 500),
          idempotency_key,
        });
        result.line = { queued: r.queued, outbox_id: r.id ?? null, error: r.error ?? null };
      }
    } else {
      result.line = { skipped: true, reason: !lineOn ? "disabled" : "no_admin" };
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-new-signup", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});