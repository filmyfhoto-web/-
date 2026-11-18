import { createClient } from "npm:@supabase/supabase-js@2";
import { kickDispatch } from "../_shared/notifyOutbox.ts";
import { notifyOrderEvent } from "../_shared/orderEvents.ts";
import { verifyLineIdentity } from "../_shared/verifyLineIdentity.ts";
import { checkFriendshipViaMessagingApi } from "../_shared/lineFriendCheck.ts";
import { notifyOrderGroups } from "../_shared/orderGroupNotify.ts";
import { logCallbackFailure, reasonFromIdentityError } from "../_shared/logCallbackFailure.ts";
import { realLineTarget, sendCustomerAck } from "../_shared/customerAck.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InItem = { product_id?: string | null; name: string; code?: string; unit?: string; qty: number; price: number };

function sanitizeItems(raw: unknown): InItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InItem[] = [];
  for (const it of raw.slice(0, 200)) {
    const name = String((it as any)?.name ?? "").trim().slice(0, 200);
    const qty = Number((it as any)?.qty ?? 0);
    if (!name || !isFinite(qty) || qty <= 0) continue;
    const priceRaw = Number((it as any)?.price ?? 0);
    const price = isFinite(priceRaw) && priceRaw > 0 ? priceRaw : 0;
    out.push({
      product_id: (it as any)?.product_id ? String((it as any).product_id) : null,
      name,
      code: String((it as any)?.code ?? "").trim().slice(0, 60) || undefined,
      unit: String((it as any)?.unit ?? "").trim().slice(0, 20) || undefined,
      qty,
      price,
    });
  }
  return out;
}

function genOrderNo(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  const t = String(d.getTime()).slice(-4);
  return `SO-${yy}${mm}-${t}${rand}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try {
    const body = await req.json();
    const guest_id = String(body?.guest_id || "").trim();
    const name = String(body?.name || "").trim().slice(0, 120);
    const phone = String(body?.phone || "").trim().slice(0, 40);
    const project = body?.project ? String(body.project).trim().slice(0, 200) : null;
    const school_name = body?.school_name ? String(body.school_name).trim().slice(0, 200) : null;
    // ที่อยู่สำหรับจัดส่ง/ออกเอกสาร — เก็บใน customer_snapshot (additive, ไม่แตะ schema)
    const address = body?.address ? String(body.address).trim().slice(0, 500) : null;
    const org_slug = body?.org_slug ? String(body.org_slug).trim().slice(0, 80) : null;
    const note = body?.note ? String(body.note).trim().slice(0, 1000) : null;
    const customer_tax_id_raw = body?.customer_tax_id ? String(body.customer_tax_id).replace(/\D+/g, "") : "";
    const customer_tax_id = customer_tax_id_raw && customer_tax_id_raw.length === 13 ? customer_tax_id_raw : null;
    const customer_branch = body?.customer_branch ? String(body.customer_branch).trim().slice(0, 40) || null : null;
    const items = sanitizeItems(body?.items);
    // ตะกร้ามี 2 ทางจบ: สั่งซื้อเลย (order) หรือ ขอใบราคา/ใบเบิกไปก่อน (quote)
    const doc_intent = body?.doc_intent === "quote" ? "quote" : "order";
    const idempotency_key_raw = typeof body?.idempotency_key === "string" ? body.idempotency_key.trim() : "";
    const idempotency_key = /^[A-Za-z0-9_-]{8,64}$/.test(idempotency_key_raw) ? idempotency_key_raw : "";


    if (!guest_id || !/^[0-9a-f-]{16,}$/i.test(guest_id)) {
      return new Response(JSON.stringify({ error: "invalid_guest_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!name || !phone) {
      return new Response(JSON.stringify({ error: "missing_contact" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // `project` เป็น optional แล้ว (checkout ใหม่ไม่ถามลูกค้า) แต่ยังรับค่าเดิม
    // จากไคลเอนต์รุ่นก่อนได้เพื่อ backward compatibility
    if (!/^[0-9+\-\s()]{6,20}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "invalid_phone" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (items.length === 0) {
      return new Response(JSON.stringify({ error: "empty_order" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Idempotency key is REQUIRED for customer checkout. The DB-enforced
    // unique index on (line_user_id, idempotency_key) is what makes
    // concurrent duplicate submits collapse to a single order.
    if (!idempotency_key) {
      return new Response(JSON.stringify({ error: "missing_idempotency_key", detail: "idempotency_key required (8-64 chars [A-Za-z0-9_-])" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ตัวตน LINE เป็น "ตัวเลือก" ไม่ใช่ข้อบังคับอีกต่อไป:
    // ลูกค้าที่ทักมาทาง LINE OA และแอดมินกดเชื่อมให้แล้ว สั่งซื้อได้เลย
    // ด้วยชื่อ+เบอร์ (ทุกออเดอร์ต้องผ่านการเสนอราคาจากร้านก่อนอยู่แล้ว)
    // ถ้าผู้สั่งมีหลักฐาน LINE ที่ตรวจสอบได้ ก็ผูกออเดอร์เข้ากับบัญชีนั้น
    let verifiedLineUserId: string | null = null;
    try {
      const identity = await verifyLineIdentity(req, body ?? {});
      verifiedLineUserId = identity.line_user_id;
    } catch (err) {
      console.warn("guest-order-submit: no verified LINE identity — continuing as guest", reasonFromIdentityError(err));
    }
    // คีย์สำหรับกันส่งซ้ำ: ใช้ LINE id เมื่อมี ไม่งั้นผูกกับ guest_id
    const dedupeIdentity = verifiedLineUserId ?? `guest:${guest_id}`;

    // Friendship = best-effort UX signal (identity above is what is
    // fail-closed). A client-side boolean/status is never trusted: we ask the
    // LINE Messaging API directly with the server-verified LINE user id.
    //   - HTTP 200 → confirmed, continue
    //   - HTTP 404 → not_friend, block with the add-friend card
    //   - anything else / missing token → unknown|config_missing: we do NOT
    //     claim friendship, but a verified LINE customer is still allowed to
    //     order. The true status is recorded on the order + log.
    let friendStatus = "unknown";
    if (verifiedLineUserId) {
      const friend = await checkFriendshipViaMessagingApi(
        Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN"),
        verifiedLineUserId,
      );
      friendStatus = friend.status;
    }

    // Resolve org from slug (optional)
    let organization_id: string | null = null;
    if (org_slug) {
      const { data: orgs } = await admin.from("organizations").select("id").eq("slug", org_slug).limit(1);
      organization_id = orgs?.[0]?.id ?? null;
    }

    const now = Date.now();
    const t10m = new Date(now - 10 * 60_000).toISOString();

    // Dedupe FIRST — a retry with the same idempotency key must return the
    // existing order rather than hitting the rate limiter.
    {
      // ลูกค้าที่ยังไม่ผูก LINE จะไม่มี line_user_id ในออเดอร์ → กันซ้ำด้วย guest_id
      let q = admin
        .from("orders")
        .select("id, order_no, line_link_token")
        .eq("idempotency_key", idempotency_key);
      q = verifiedLineUserId
        ? q.eq("line_user_id", verifiedLineUserId)
        : q.eq("guest_id", guest_id);
      const { data: dup } = await q.limit(1).maybeSingle();

      if (dup) {
        return new Response(JSON.stringify({
          ok: true, deduplicated: true,
          order_id: dup.id, order_no: dup.order_no,
          line_link_token: dup.line_link_token,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Rate limiting: block if guest submitted an order in the last 20s,
    // or more than 5 orders in the last 10 minutes (per guest_id OR phone).
    try {
      const { data: recent } = await admin
        .from("orders")
        .select("id, created_at, guest_id, guest_phone")
        .gte("created_at", t10m)
        .or(`guest_id.eq.${guest_id},guest_phone.eq.${phone}`)
        .order("created_at", { ascending: false })
        .limit(20);
      const rows = recent ?? [];
      const lastAt = rows[0]?.created_at ? new Date(rows[0].created_at).getTime() : 0;
      if (lastAt && now - lastAt < 20_000) {
        const wait = Math.ceil((20_000 - (now - lastAt)) / 1000);
        return new Response(
          JSON.stringify({ error: "too_many_requests", retry_after: wait, detail: `กรุณารออีก ${wait} วินาที ก่อนส่งคำสั่งซื้อครั้งถัดไป` }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(wait) } },
        );
      }
      const recent10m = rows.filter((r) => new Date(r.created_at).getTime() > now - 10 * 60_000).length;
      if (recent10m >= 5) {
        return new Response(
          JSON.stringify({ error: "rate_limited", detail: "ส่งคำสั่งซื้อบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ (สูงสุด 5 ครั้ง / 10 นาที)" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } },
        );
      }
    } catch (e) {
      console.warn("rate-limit check failed (allowing)", e);
    }

    // Best-effort touch last_seen_at now that binding is confirmed. No
    // upsert — this only updates an existing row.
    if (verifiedLineUserId) {
      try {
        await admin.from("line_account_links")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("line_user_id", verifiedLineUserId);
      } catch (e) { console.warn("line_account_links touch failed", e); }
    }

    // SERVER-SIDE RE-PRICING (security): never trust prices sent by the
    // browser. Every catalog item is re-priced from customer_prices →
    // group_prices → products.standard_price. Free-text items (no
    // product_id) are always priced 0 so staff must quote them manually.
    {
      const catalogIds = Array.from(
        new Set(items.map((it) => it.product_id).filter((v): v is string => !!v && /^[0-9a-f-]{32,}$/i.test(v))),
      );
      const priceById = new Map<string, number>();
      if (catalogIds.length > 0) {
        const { data: prods, error: prodErr } = await admin
          .from("products")
          .select("id, standard_price")
          .in("id", catalogIds);
        if (prodErr) {
          console.error("product price lookup failed", prodErr);
          return new Response(JSON.stringify({ error: "pricing_lookup_failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        for (const p of (prods ?? []) as any[]) {
          const sp = Number(p.standard_price ?? 0);
          priceById.set(String(p.id), isFinite(sp) && sp > 0 ? sp : 0);
        }

        if (organization_id) {
          const { data: org } = await admin
            .from("organizations").select("price_group_id").eq("id", organization_id).maybeSingle();
          const groupId = (org as any)?.price_group_id ?? null;
          if (groupId) {
            const { data: gps } = await admin
              .from("group_prices").select("product_id, price")
              .eq("price_group_id", groupId).in("product_id", catalogIds);
            for (const g of (gps ?? []) as any[]) {
              const v = Number(g.price);
              if (isFinite(v) && v > 0) priceById.set(String(g.product_id), v);
            }
          }
          const { data: cps } = await admin
            .from("customer_prices").select("product_id, price")
            .eq("organization_id", organization_id).in("product_id", catalogIds);
          for (const c of (cps ?? []) as any[]) {
            const v = Number(c.price);
            if (isFinite(v) && v > 0) priceById.set(String(c.product_id), v);
          }
        }
      }
      for (const it of items) {
        it.price = it.product_id ? (priceById.get(String(it.product_id)) ?? 0) : 0;
      }
    }

    // Atomic order + items + status-event insert via SECURITY DEFINER RPC.
    // The DB-enforced unique index on (line_user_id, idempotency_key)
    // collapses concurrent duplicates to a single order; the RPC catches
    // that unique_violation and returns the existing row.
    let orderRow: any = null;
    const subtotal = items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);

    let link_token = "";
    let deduplicated = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const order_no = genOrderNo();
      link_token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 24);
      const orderPayload = {
        order_no,
        organization_id,
        note,
        guest_id,
        guest_name: name,
        guest_phone: phone,
        project_name: project,
        school_name,
        customer_tax_id,
        customer_branch,
        line_link_token: link_token,
        subtotal,
        total: subtotal,
        customer_snapshot: {
          ...((body as any)?.customer_snapshot ?? {
            name, phone, project, school: school_name, note: note ?? null,
            guest_id, captured_at: new Date().toISOString(),
          }),
          ...(address ? { address } : {}),
          // สถานะเพื่อนตามจริงเท่านั้น: confirmed | not_friend | unknown | config_missing
          friendship_status: friendStatus,
          idempotency_key,
          doc_intent,
        },

      };
      const itemsPayload = items.map((it) => ({
        product_id: it.product_id ?? null,
        product_name: it.name,
        product_code: it.code ?? null,
        qty: it.qty,
        unit: it.unit ?? null,
        price: Number(it.price),
        total: Number(it.price) * Number(it.qty),
      }));
      const { data, error } = await admin.rpc("submit_guest_order_atomic", {
        p_line_user_id: dedupeIdentity,
        p_idempotency_key: idempotency_key,
        p_order: orderPayload,
        p_items: itemsPayload,
      });
      if (!error && data && (data as any[]).length > 0) {
        const row = (data as any[])[0];
        orderRow = { id: row.order_id, order_no: row.order_no };
        link_token = row.line_link_token;
        deduplicated = !!row.deduplicated;
        break;
      }
      // 23505 on order_no (idempotency violation is already handled inside RPC).
      if (error && ((error as any)?.code === "23505" || /order_no/.test(String((error as any)?.message || "")))) {
        continue;
      }
      console.error("atomic submit failed", error);
      return new Response(JSON.stringify({ error: "insert_failed", detail: error?.message || "unknown" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!orderRow) {
      return new Response(JSON.stringify({ error: "order_no_conflict" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // การสั่งซื้อที่มีหลักฐาน LINE ผ่านการตรวจสอบแล้ว ถือเป็นการผูกสำเร็จ
    // ทันที: เก็บเบอร์จากออเดอร์ไว้เพื่อไม่ต้องกรอกซ้ำในครั้งถัดไป
    // ห้ามใช้ค่า line_user_id จาก body — verifiedLineUserId มาจาก verifyLineIdentity เท่านั้น
    if (verifiedLineUserId) {
      try {
        const { data: existingLink, error: existingErr } = await admin
          .from("line_account_links")
          .select("phone, display_name, customer_source")
          .eq("line_user_id", verifiedLineUserId)
          .maybeSingle();
        if (existingErr) throw existingErr;

        // เคารพการยกเลิกผูกโดยแอดมิน: การกดสั่งซื้อจะไม่เปิดบัญชีที่ถูกเพิกถอนกลับเอง
        if (existingLink?.customer_source !== "admin_unbound") {
          const { error: bindErr } = await admin
            .from("line_account_links")
            .upsert({
              line_user_id: verifiedLineUserId,
              phone: existingLink?.phone || phone,
              display_name: existingLink?.display_name || name,
              verified_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
            }, { onConflict: "line_user_id" });
          if (bindErr) throw bindErr;
        }
      } catch (e) {
        // การบันทึก binding เป็น best-effort — ไม่ทำให้ออเดอร์ที่สร้างสำเร็จล้มเหลว
        console.warn("guest-order-submit: auto LINE binding failed", String((e as Error)?.message || e));
      }
    }

    if (deduplicated) {
      return new Response(JSON.stringify({
        ok: true, deduplicated: true,
        order_id: orderRow.id, order_no: orderRow.order_no, line_link_token: link_token,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ธงประเภทเอกสาร — RPC ด้านบนมีคอลัมน์ตายตัว จึงบันทึกต่อทันทีหลังสร้างสำเร็จ
    if (doc_intent === "quote") {
      const { error: intentErr } = await admin
        .from("orders").update({ doc_intent }).eq("id", orderRow.id);
      if (intentErr) console.error("doc_intent update failed", intentErr.message);
    }


    // แจ้งกลุ่ม LINE "คำสั่งซื้อใหม่" — ปิดใช้งาน (เหมือน send-order-line-notifications)
    // ร้านคุยกับลูกค้าผ่านแชท LINE OA โดยตรงแล้ว จึงไม่ต้องยิงเข้ากลุ่มซ้ำ
    // (คงโค้ดไว้เผื่อเปิดใช้อีกในอนาคต — เปลี่ยนธงด้านล่างเป็น true)
    const ADMIN_GROUP_NOTIFY_ENABLED = false;
    if (ADMIN_GROUP_NOTIFY_ENABLED) {
      try {
        await notifyOrderGroups(admin, {
          orderId: orderRow.id,
          orderNo: orderRow.order_no,
          customerName: school_name ? `${name} (${school_name})` : name,
          itemCount: items.length,
          total: subtotal > 0 ? subtotal : null,
          source: "เว็บแอปลูกค้า",
          createdAt: new Date().toISOString(),
        });
      } catch (e) { console.warn("order group notify failed", e); }
    }


    // ตอบกลับลูกค้าทันที: "ได้รับคำสั่งซื้อ/คำขอใบเสนอราคาแล้ว" (best-effort)
    try {
      const { data: created } = await admin
        .from("orders").select("line_user_id, customer_id").eq("id", orderRow.id).maybeSingle();
      let ackTarget = realLineTarget(created?.line_user_id as string | null)
        || realLineTarget(verifiedLineUserId);
      if (!ackTarget && created?.customer_id) {
        const { data: prof } = await admin
          .from("profiles").select("line_user_id").eq("id", created.customer_id).maybeSingle();
        ackTarget = realLineTarget(prof?.line_user_id as string | null);
      }
      const site = (Deno.env.get("PUBLIC_SITE_URL") || "https://nattafilmyy.lovable.app").replace(/\/+$/, "");
      const ack = await sendCustomerAck(admin, {
        orderId: orderRow.id,
        orderNo: orderRow.order_no,
        intent: doc_intent === "quote" ? "quote" : "order",
        lineUserId: ackTarget,
        itemCount: items.length,
        detailUrl: `${site}/my-orders/${orderRow.id}`,
      });
      console.log("customer ack", orderRow.order_no, ack.status, ack.error || "");
    } catch (e) { console.warn("customer ack failed", e); }

    // แจ้งเตือนแอดมิน = "กลุ่ม LINE เท่านั้น" (notifyOrderGroups ด้านบน)
    // ไม่ส่งเข้าแชทส่วนตัวของแอดมิน/ผู้รับรายบุคคลอีกต่อไป



    // In-app notify staff (best-effort)
    try {
      await admin.rpc("notify_staff", {
        p_type: "new_order",
        p_title: "มีออเดอร์ใหม่ (จากลิงก์)",
        p_body: `${orderRow.order_no} จาก ${name} (${phone})`,
        p_ref_id: orderRow.id,
      });
    } catch (e) { console.warn("notify_staff failed", e); }

    // Queue a LINE notification log row so admins can see status & retry.
    try {
      await admin.from("line_notifications").insert({
        order_id: orderRow.id,
        type: "new_order",
        kind: "new_order",
        direction: "to_admin",
        message: `ออเดอร์ใหม่ ${orderRow.order_no} จาก ${name} (${phone})`,
        sent_status: "queued",
        idempotency_key: `guest_order:${orderRow.id}`,
      });
    } catch (e) { console.warn("line_notifications queue failed", e); }

    return new Response(JSON.stringify({ ok: true, order_id: orderRow.id, order_no: orderRow.order_no, line_link_token: link_token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("guest-order-submit error", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});