import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const BACKOFF_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 6 * 60 * 60];
const MAX_ATTEMPTS = BACKOFF_SECONDS.length + 1;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function mapGw(status: number): string {
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

async function gw(url: string, init: RequestInit = {}, timeoutMs = 30_000) {
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
  const res = await gw(`${GW_DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, { method: "GET" }, 15_000);
  if (!res.ok) { const e: any = new Error(await res.text()); e.code = mapGw(res.status); throw e; }
  const j = await res.json();
  return j.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const res = await gw(`${GW_DRIVE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  }, 20_000);
  if (!res.ok) {
    const e: any = new Error(await res.text());
    e.code = res.status === 403 ? "permission_denied" : res.status === 401 ? "token_expired" : "folder_create_failed";
    throw e;
  }
  return (await res.json()).id as string;
}

async function uploadPdf(folderId: string, name: string, bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const base64 = btoa(bin);
  const boundary = "----lovable-" + crypto.randomUUID();
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name, mimeType: "application/pdf", parents: [folderId] }),
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    "",
    base64,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const res = await gw(`${GW_DRIVE_UPLOAD}&fields=id,webViewLink`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  }, 90_000);
  if (!res.ok) {
    const e: any = new Error(await res.text());
    e.code = res.status === 403 ? "permission_denied" : res.status === 401 ? "token_expired" : res.status === 404 ? "folder_missing" : "upload_failed";
    throw e;
  }
  return await res.json() as { id: string; webViewLink: string };
}

// Map document_type -> which shop folder holds it
function folderForDocType(store: any, docType: string): string | null {
  const t = (docType || "").toLowerCase();
  if (t.includes("quote") || t === "quotation") return store.drive_quotes_folder_id;
  if (t.includes("receipt") || t.includes("invoice") || t.includes("delivery")) return store.drive_receipts_folder_id;
  return store.drive_orders_folder_id;
}

async function attemptDocUpload(admin: any, documentId: string, pdfBase64: string): Promise<{ ok: boolean; code?: string; file_url?: string; folder_url?: string }> {
  const { data: doc } = await admin.from("rds_documents").select("id, document_no, document_type, store_id, drive_folder_id, drive_folder_url, drive_retry_count").eq("id", documentId).maybeSingle();
  if (!doc) return { ok: false, code: "bad_request" };

  const shopId = doc.store_id;
  const { data: store } = await admin.from("rds_stores").select("id, slug, name, google_drive_folder_id, drive_root_folder_id, drive_orders_folder_id, drive_quotes_folder_id, drive_receipts_folder_id").eq("id", shopId).maybeSingle();
  if (!store) return { ok: false, code: "store_not_found" };

  try {
    const rawRoot = folderForDocType(store, doc.document_type) ?? store.drive_root_folder_id ?? store.google_drive_folder_id;
    const rootId = extractFolderId(rawRoot);
    if (!rootId) { const e: any = new Error("root missing"); e.code = "store_root_missing"; throw e; }

    // Subfolder = document number
    const subName = String(doc.document_no ?? doc.id);
    let folderId = doc.drive_folder_id;
    if (!folderId) {
      folderId = await findFolder(subName, rootId);
      if (!folderId) folderId = await createFolder(subName, rootId);
    }
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    // Decode PDF
    const bin = atob(pdfBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const fileName = `${subName}.pdf`;
    const up = await uploadPdf(folderId!, fileName, bytes);

    await admin.from("rds_documents").update({
      drive_folder_id: folderId,
      drive_folder_url: folderUrl,
      google_drive_file_id: up.id,
      google_drive_url: up.webViewLink,
      google_drive_sync_status: "synced",
      google_drive_synced_at: new Date().toISOString(),
      drive_next_retry_at: null,
      drive_last_error_code: null,
      drive_last_error_at: null,
      last_sync_error: null,
    }).eq("id", documentId);

    return { ok: true, file_url: up.webViewLink, folder_url: folderUrl };
  } catch (e: any) {
    const code = e?.code ?? "upload_failed";
    const nextCount = (doc.drive_retry_count ?? 0) + 1;
    const isFinal = nextCount >= MAX_ATTEMPTS;
    const backoffIdx = Math.min(nextCount - 1, BACKOFF_SECONDS.length - 1);
    const nextRetry = isFinal ? null : new Date(Date.now() + BACKOFF_SECONDS[backoffIdx] * 1000).toISOString();
    await admin.from("rds_documents").update({
      google_drive_sync_status: isFinal ? "failed" : "retry",
      drive_retry_count: nextCount,
      drive_next_retry_at: nextRetry,
      drive_last_error_code: code,
      drive_last_error_at: new Date().toISOString(),
      last_sync_error: String(e?.message ?? code).slice(0, 500),
    }).eq("id", documentId);
    console.error("[doc drive upload failed]", documentId, code, e?.message);
    return { ok: false, code };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, code: "bad_request" });

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { ok: false, code: "bad_request", error: "invalid json" }); }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: staff only
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { ok: false, code: "unauthorized" });
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json(401, { ok: false, code: "unauthorized" });
  const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", uid);
  const isStaff = !!roles?.some((r: any) => ["owner", "admin", "staff"].includes(r.role));
  if (!isStaff) return json(403, { ok: false, code: "forbidden" });

  // Per-store check: mirror is_staff_of_store used by RLS. Owners bypass;
  // other staff must have a matching staff_stores row for the document's
  // store. Prevents cross-store overwrites via this function.
  async function assertStoreAccess(documentId: string): Promise<{ ok: true } | { ok: false; status: number; code: string }> {
    if (!documentId) return { ok: false, status: 400, code: "bad_request" };
    const { data: doc } = await admin.from("rds_documents").select("store_id").eq("id", documentId).maybeSingle();
    const sid = (doc as any)?.store_id;
    if (!sid) return { ok: false, status: 404, code: "doc_not_found" };
    const { data: allowed, error } = await admin.rpc("is_staff_of_store", { _uid: uid, _store_id: sid });
    if (error || !allowed) return { ok: false, status: 403, code: "forbidden_store" };
    return { ok: true };
  }

  const action = String(payload?.action ?? "upload");

  if (!LOVABLE_API_KEY || !DRIVE_KEY) {
    return json(200, { ok: false, code: "connector_missing", error: "ยังไม่ได้เชื่อม Google Drive กับโปรเจกต์นี้" });
  }

  if (action === "upload") {
    const documentId = String(payload?.document_id ?? "");
    const pdfBase64 = String(payload?.pdf_base64 ?? "");
    if (!documentId || !pdfBase64) return json(400, { ok: false, code: "bad_request", error: "document_id + pdf_base64 required" });
    const gate = await assertStoreAccess(documentId);
    if (!gate.ok) return json(gate.status, { ok: false, code: gate.code });
    const r = await attemptDocUpload(admin, documentId, pdfBase64);
    return json(200, r);
  }

  if (action === "retry") {
    const documentId = String(payload?.document_id ?? "");
    const pdfBase64 = String(payload?.pdf_base64 ?? "");
    if (!documentId || !pdfBase64) return json(400, { ok: false, code: "bad_request" });
    const gate = await assertStoreAccess(documentId);
    if (!gate.ok) return json(gate.status, { ok: false, code: gate.code });
    await admin.from("rds_documents").update({ google_drive_sync_status: "retry", drive_retry_count: 0, drive_next_retry_at: new Date().toISOString() }).eq("id", documentId);
    const r = await attemptDocUpload(admin, documentId, pdfBase64);
    return json(200, r);
  }

  return json(400, { ok: false, code: "bad_request", error: `unknown action: ${action}` });
});