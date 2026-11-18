import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GW_DRIVE = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const GW_DRIVE_UPLOAD =
  "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const DRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

/** Cron/internal caller proof — a random token stored in the database and
 *  readable only by service_role and the cron job owner. Mirrors the check
 *  used by notify-dispatch so both workers share one auth mechanism. */
async function hasWorkerToken(admin: any, req: Request): Promise<boolean> {
  const presented = req.headers.get("x-worker-token") || "";
  if (!presented) return false;
  const { data } = await admin
    .from("internal_worker_tokens").select("token").eq("name", "order_drive_upload").maybeSingle();
  const expected = String(data?.token || "");
  if (!expected || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
  return diff === 0;
}

const PENDING_BUCKET = "order-drive-pending";
// backoff seconds after each failure: after attempt 1 -> wait 60s, then 5m, 15m, 1h, 6h
const BACKOFF_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 6 * 60 * 60];
const MAX_ATTEMPTS = BACKOFF_SECONDS.length + 1; // 6

type ErrCode =
  | "connector_missing"
  | "store_not_found"
  | "store_root_missing"
  | "order_not_found"
  | "permission_denied"
  | "token_expired"
  | "folder_missing"
  | "folder_create_failed"
  | "upload_failed"
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "internal_error";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function mapGw(status: number): ErrCode {
  if (status === 401) return "token_expired";
  if (status === 403) return "permission_denied";
  if (status === 404) return "folder_missing";
  return "upload_failed";
}

function extractFolderId(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(s)) return s;
  return null;
}

async function gwFetch(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  if (!LOVABLE_API_KEY || !DRIVE_KEY) {
    const e: any = new Error("connector_missing"); e.code = "connector_missing"; throw e;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${LOVABLE_API_KEY}`);
    headers.set("X-Connection-Api-Key", DRIVE_KEY);
    return await fetch(url, { ...init, headers, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

async function findFolder(name: string, parentId: string): Promise<string | null> {
  const safe = name.replace(/'/g, "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and name='${safe}' and '${parentId}' in parents and trashed=false`;
  const res = await gwFetch(`${GW_DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`, { method: "GET" }, 15_000);
  if (!res.ok) { const e: any = new Error(`find_${res.status}: ${(await res.text()).slice(0, 200)}`); e.code = mapGw(res.status); throw e; }
  const j = await res.json();
  return j.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const res = await gwFetch(`${GW_DRIVE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  }, 20_000);
  if (!res.ok) {
    const e: any = new Error(`create_${res.status}: ${(await res.text()).slice(0, 200)}`);
    e.code = res.status === 403 ? "permission_denied" : res.status === 401 ? "token_expired" : "folder_create_failed";
    throw e;
  }
  return (await res.json()).id as string;
}

async function uploadMultipart(folderId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<{ id: string; webViewLink: string; thumbnailLink?: string; size?: string }> {
  // encode bytes → base64 (chunked to avoid stack overflow)
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const base64 = btoa(bin);
  const boundary = "----lovable-" + crypto.randomUUID();
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name, mimeType, parents: [folderId] }),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    "Content-Transfer-Encoding: base64",
    "",
    base64,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const res = await gwFetch(`${GW_DRIVE_UPLOAD}&fields=id,webViewLink,thumbnailLink,size`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  }, 90_000);
  if (!res.ok) {
    const e: any = new Error(`upload_${res.status}: ${(await res.text()).slice(0, 300)}`);
    e.code = res.status === 403 ? "permission_denied" : res.status === 401 ? "token_expired" : res.status === 404 ? "folder_missing" : "upload_failed";
    throw e;
  }
  return await res.json();
}

function kindFromMime(mime: string): "pdf" | "image" | "attachment" {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  return "attachment";
}

// Resolve the store row from shop_id (preferred) or slug fallback.
async function resolveStore(admin: any, shopId: string | null, storeSlug: string | null) {
  if (shopId) {
    const { data } = await admin.from("rds_stores")
      .select("id, slug, name, google_drive_folder_id, drive_root_folder_id, drive_orders_folder_id, drive_quotes_folder_id, drive_receipts_folder_id")
      .eq("id", shopId).maybeSingle();
    if (data) return data;
  }
  if (storeSlug) {
    const { data } = await admin.from("rds_stores")
      .select("id, slug, name, google_drive_folder_id, drive_root_folder_id, drive_orders_folder_id, drive_quotes_folder_id, drive_receipts_folder_id")
      .eq("slug", storeSlug).maybeSingle();
    if (data) return data;
  }
  return null;
}

// Ensure per-order folder exists under the store's orders root. Path: <orders_root>/<order_no>/
async function ensureOrderFolder(admin: any, order: any, shopId: string | null, storeSlug: string): Promise<{ folderId: string; folderUrl: string; shopId: string }> {
  const store = await resolveStore(admin, shopId, storeSlug);
  if (!store) { const e: any = new Error(`no store ${shopId ?? storeSlug}`); e.code = "store_not_found"; throw e; }
  const rootId = extractFolderId(store.drive_orders_folder_id) ?? extractFolderId(store.drive_root_folder_id) ?? extractFolderId(store.google_drive_folder_id);
  if (!rootId) { const e: any = new Error("root missing"); e.code = "store_root_missing"; throw e; }

  // Reuse cached folder when it still targets the same shop.
  if (order.drive_folder_id && order.drive_folder_url?.includes(order.drive_folder_id) && order.shop_id === store.id) {
    return { folderId: order.drive_folder_id, folderUrl: order.drive_folder_url, shopId: store.id };
  }
  const folderName = String(order.order_no ?? order.id);
  let fId = await findFolder(folderName, rootId);
  if (!fId) fId = await createFolder(folderName, rootId);
  const folderUrl = `https://drive.google.com/drive/folders/${fId}`;
  await admin.from("orders").update({
    shop_id: store.id,
    drive_folder_id: fId,
    drive_folder_url: folderUrl,
    drive_store_slug: store.slug,
    drive_synced_at: new Date().toISOString(),
    drive_last_error: null,
  }).eq("id", order.id);
  return { folderId: fId, folderUrl, shopId: store.id };
}

// Core: try to upload one pending file row. Returns true on success.
async function attemptUpload(admin: any, fileId: string): Promise<boolean> {
  const { data: row } = await admin.from("order_drive_files").select("*").eq("id", fileId).maybeSingle();
  if (!row) return false;
  if (row.status === "uploaded") return true;

  const { data: order } = await admin.from("orders").select("id, order_no, created_at, drive_folder_id, drive_folder_url, drive_store_slug, shop_id").eq("id", row.order_id).maybeSingle();
  if (!order) {
    await admin.from("order_drive_files").update({ status: "failed", last_error_code: "order_not_found", last_error_at: new Date().toISOString() }).eq("id", fileId);
    return false;
  }

  try {
    const { folderId } = await ensureOrderFolder(admin, order, row.shop_id ?? order.shop_id ?? null, row.store_slug ?? order.drive_store_slug ?? "colorlab");

    // Load payload from storage
    if (!row.payload_path) throw Object.assign(new Error("no payload"), { code: "internal_error" });
    const { data: blob, error: dlErr } = await admin.storage.from(PENDING_BUCKET).download(row.payload_path);
    if (dlErr || !blob) throw Object.assign(new Error(dlErr?.message ?? "download failed"), { code: "internal_error" });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // Folder is already per-order, so keep original file name.
    const up = await uploadMultipart(folderId, row.file_name, row.mime_type ?? "application/octet-stream", bytes);

    await admin.from("order_drive_files").update({
      status: "uploaded",
      drive_file_id: up.id,
      drive_file_url: up.webViewLink,
      drive_thumbnail_url: up.thumbnailLink ?? null,
      size_bytes: up.size ? Number(up.size) : bytes.length,
      next_retry_at: null,
      last_error_code: null,
      last_error_at: null,
    }).eq("id", fileId);

    await admin.storage.from(PENDING_BUCKET).remove([row.payload_path]);
    return true;
  } catch (e: any) {
    const code = (e?.code as ErrCode) ?? "upload_failed";
    const nextCount = (row.retry_count ?? 0) + 1;
    const isFinal = nextCount >= MAX_ATTEMPTS;
    const backoffIdx = Math.min(nextCount - 1, BACKOFF_SECONDS.length - 1);
    const nextRetry = isFinal ? null : new Date(Date.now() + BACKOFF_SECONDS[backoffIdx] * 1000).toISOString();
    await admin.from("order_drive_files").update({
      status: isFinal ? "failed" : "pending_retry",
      retry_count: nextCount,
      next_retry_at: nextRetry,
      last_error_code: code,
      last_error_at: new Date().toISOString(),
    }).eq("id", fileId);
    await admin.from("orders").update({ drive_last_error: code }).eq("id", row.order_id);
    console.error("[attempt failed]", fileId, code, e?.message);
    return false;
  }
}

async function processPending(admin: any, limit = 20): Promise<{ processed: number; ok: number }> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await admin
    .from("order_drive_files")
    .select("id")
    .eq("status", "pending_retry")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(limit);
  let ok = 0;
  for (const r of rows ?? []) {
    if (await attemptUpload(admin, r.id)) ok++;
  }
  return { processed: rows?.length ?? 0, ok };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, code: "bad_request", error: "method not allowed" });

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { ok: false, code: "bad_request", error: "invalid json" }); }
  const action = String(payload?.action ?? "");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Cron/internal entry point. Accepted proofs, in order:
  //   1. `x-worker-token` matching `internal_worker_tokens.order_drive_upload`
  //      — this is what the pg_cron job presents (same mechanism as
  //      notify-dispatch), so no service-role key is ever put in a cron body.
  //   2. the legacy CRON_SECRET bearer, kept for any external caller.
  //   3. a signed-in owner/admin/staff running it manually from the UI.
  if (action === "process_pending") {
    const auth = req.headers.get("Authorization") ?? "";
    const bearer = auth.replace(/^Bearer\s+/i, "");
    const workerOk = await hasWorkerToken(admin, req);
    const secretOk = !!CRON_SECRET && bearer === CRON_SECRET;
    if (!workerOk && !secretOk) {
      // Also allow authenticated staff to run it manually
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: u } = await userClient.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) return json(401, { ok: false, code: "unauthorized", error: "missing token" });
      const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", uid);
      const isStaff = !!roles?.some((r: any) => ["owner", "admin", "staff"].includes(r.role));
      if (!isStaff) return json(403, { ok: false, code: "forbidden", error: "staff only" });
    }
    const result = await processPending(admin, Number(payload?.limit ?? 20));
    return json(200, { ok: true, ...result });
  }

  // Authenticated user actions
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { ok: false, code: "unauthorized", error: "missing token" });
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json(401, { ok: false, code: "unauthorized", error: "invalid session" });
  const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", uid);
  const isStaff = !!roles?.some((r: any) => ["owner", "admin", "staff"].includes(r.role));
  if (!isStaff) return json(403, { ok: false, code: "forbidden", error: "staff only" });

  try {
    if (action === "test_access") {
      if (!LOVABLE_API_KEY || !DRIVE_KEY) return json(200, { ok: false, code: "connector_missing", error: "Google Drive connector ยังไม่ถูก link เข้าโปรเจกต์" });
      const shopId = payload?.shop_id ?? null;
      const storeSlug = payload?.store_slug ?? null;
      const purpose = String(payload?.purpose ?? "orders"); // orders | quotes | receipts | root
      const store = await resolveStore(admin, shopId, storeSlug);
      if (!store) return json(200, { ok: false, code: "store_not_found", error: `ไม่พบร้าน ${shopId ?? storeSlug}` });
      const candidates: Record<string, string | null> = {
        orders: store.drive_orders_folder_id ?? store.drive_root_folder_id ?? store.google_drive_folder_id,
        quotes: store.drive_quotes_folder_id ?? store.drive_root_folder_id ?? store.google_drive_folder_id,
        receipts: store.drive_receipts_folder_id ?? store.drive_root_folder_id ?? store.google_drive_folder_id,
        root: store.drive_root_folder_id ?? store.google_drive_folder_id,
      };
      const rootId = extractFolderId(candidates[purpose] ?? candidates.root);
      if (!rootId) return json(200, { ok: false, code: "store_root_missing", error: `ร้าน ${store.name}: ยังไม่ได้ตั้ง Drive folder id (${purpose})` });
      const res = await gwFetch(`${GW_DRIVE}/files/${encodeURIComponent(rootId)}?fields=id,name,mimeType,capabilities(canAddChildren)`, { method: "GET" }, 15_000);
      if (!res.ok) return json(200, { ok: false, code: mapGw(res.status), error: `drive ${res.status}: ${(await res.text()).slice(0, 200)}` });
      const info = await res.json();
      if (info.mimeType !== "application/vnd.google-apps.folder") return json(200, { ok: false, code: "folder_missing", error: "root id ไม่ใช่โฟลเดอร์" });
      if (info.capabilities?.canAddChildren === false) return json(200, { ok: false, code: "permission_denied", error: "บัญชี connector ไม่มีสิทธิ์เพิ่มไฟล์ในโฟลเดอร์นี้" });
      return json(200, { ok: true, root: { id: info.id, name: info.name, url: `https://drive.google.com/drive/folders/${info.id}` }, store: store.slug, shop_id: store.id, purpose });
    }

    const orderId = String(payload?.order_id ?? "");
    if (!orderId) return json(400, { ok: false, code: "bad_request", error: "order_id required" });

    if (action === "list_files") {
      const { data: order } = await admin.from("orders").select("drive_folder_id, drive_folder_url, drive_store_slug, drive_last_error").eq("id", orderId).maybeSingle();
      const { data: files } = await admin.from("order_drive_files").select("*").eq("order_id", orderId).order("uploaded_at", { ascending: false });
      return json(200, {
        ok: true,
        files: files ?? [],
        folder: { id: order?.drive_folder_id ?? null, url: order?.drive_folder_url ?? null, store_slug: order?.drive_store_slug ?? null },
        order_last_error: order?.drive_last_error ?? null,
        max_attempts: MAX_ATTEMPTS,
      });
    }

    if (action === "retry_now") {
      const fileId = String(payload?.file_id ?? "");
      if (!fileId) return json(400, { ok: false, code: "bad_request", error: "file_id required" });
      const { data: existing } = await admin.from("order_drive_files").select("id, status, retry_count").eq("id", fileId).maybeSingle();
      if (!existing) return json(404, { ok: false, code: "bad_request", error: "file not found" });
      // Reset counter when user forces retry on a 'failed' row so they get a fresh full budget
      const resetPatch: any = { status: "pending_retry", next_retry_at: new Date().toISOString() };
      if (existing.status === "failed") resetPatch.retry_count = 0;
      await admin.from("order_drive_files").update(resetPatch).eq("id", fileId);
      const ok = await attemptUpload(admin, fileId);
      return json(200, { ok: true, uploaded: ok });
    }

    if (action === "upload_file") {
      const storeSlug = String(payload?.store_slug ?? "colorlab");
      const shopIdIn = payload?.shop_id ?? null;
      const fileName = String(payload?.file_name ?? "").trim();
      const mimeType = String(payload?.mime_type ?? "application/octet-stream");
      const base64 = String(payload?.file_base64 ?? "");
      if (!fileName || !base64) return json(400, { ok: false, code: "bad_request", error: "file_name และ file_base64 จำเป็น" });

      // Decode → Uint8Array
      let bytes: Uint8Array;
      try {
        const bin = atob(base64);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } catch { return json(400, { ok: false, code: "bad_request", error: "invalid base64" }); }

      // Resolve the shop_id from the admin's current dropdown selection so
      // each upload targets the shop they picked — not whichever shop a
      // previous upload cached on the order row. Without this the row is
      // inserted with shop_id=null, then attemptUpload falls back to
      // order.shop_id (from the prior upload) and files land in the wrong
      // Drive folder while being labelled with the newly-picked slug.
      let resolvedShopId: string | null = shopIdIn;
      if (!resolvedShopId) {
        const store = await resolveStore(admin, null, storeSlug);
        if (store) resolvedShopId = store.id;
      }

      const fileRowId = crypto.randomUUID();
      const payloadPath = `${orderId}/${fileRowId}`;
      const { error: upErr } = await admin.storage.from(PENDING_BUCKET).upload(payloadPath, bytes, {
        contentType: mimeType,
        upsert: true,
      });
      if (upErr) return json(500, { ok: false, code: "internal_error", error: `staging: ${upErr.message}` });

      await admin.from("order_drive_files").insert({
        id: fileRowId,
        order_id: orderId,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: bytes.length,
        kind: kindFromMime(mimeType),
        uploaded_by: uid,
        store_slug: storeSlug,
        shop_id: resolvedShopId,
        status: "pending_retry",
        retry_count: 0,
        next_retry_at: new Date().toISOString(),
        payload_path: payloadPath,
      });

      const ok = await attemptUpload(admin, fileRowId);
      const { data: fresh } = await admin.from("order_drive_files").select("*").eq("id", fileRowId).maybeSingle();
      return json(200, { ok: true, uploaded: ok, file: fresh });
    }

    return json(400, { ok: false, code: "bad_request", error: `unknown action: ${action}` });
  } catch (e: any) {
    const code = (e?.code as ErrCode) ?? "internal_error";
    console.error("[order-drive-upload]", code, e?.message);
    return json(200, { ok: false, code, error: String(e?.message ?? e) });
  }
});