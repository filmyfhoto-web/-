import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GW_SHEETS = "https://connector-gateway.lovable.dev/google_sheets/v4";
const GW_DRIVE_UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart";
const GW_DRIVE = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

// Wrap fetch with an AbortController so a slow/hung upstream call doesn't
// stall the whole edge invocation past the platform wall-clock (which the
// caller sees as 502/504 with no `last_sync_error` written). Tuned well
// below the edge wall-clock so the outer catch always runs and persists
// a "failed" status update.
async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 25_000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } catch (e) {
    if ((e as any)?.name === "AbortError") {
      throw new Error(`upstream timeout after ${timeoutMs}ms: ${url.split("?")[0]}`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function extractSheetId(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // already an id
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}

function extractDriveFolderId(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const m1 = s.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const SHEETS_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY") ?? "";
const DRIVE_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const DOC_LABEL: Record<string, string> = {
  receipt: "ใบเสร็จรับเงิน",
  delivery: "ใบส่งของ",
  invoice: "ใบแจ้งหนี้",
  quotation: "ใบเสนอราคา",
  tax_invoice: "ใบกำกับภาษี",
};

const EXPECTED_HEADERS = [
  "เลขที่", "วันที่", "ประเภท", "ลูกค้า", "เบอร์โทร", "เลขผู้เสียภาษี",
  "ก่อนส่วนลด", "ส่วนลด", "ยอดก่อน VAT", "VAT", "ยอดรวม",
  "หัก ณ ที่จ่าย", "สุทธิ", "วิธีชำระ", "สถานะชำระ", "สถานะเอกสาร", "เวลา sync",
];

// ===== Per-document-type permanent sheet schema =====
const DOC_TAB_HEADERS = [
  "document_id", "document_no", "issue_date",
  "ปี", "เดือน", "วัน",
  "customer_name", "phone", "address", "tax_id", "branch",
  "issued_by", "deliverer", "receiver", "note",
  "discount", "vat", "wht", "subtotal", "tax_amount", "total",
  "status", "internal_sale_type", "created_at", "updated_at",
];
const ITEMS_TAB = "รายการสินค้า";
const ITEMS_TAB_HEADERS = [
  "document_id", "document_no", "seq", "name", "qty", "unit", "unit_price", "amount",
];
const CUSTOMERS_TAB = "ลูกค้า";
const CUSTOMERS_TAB_HEADERS = [
  "customer_id", "name", "phone", "email", "address", "tax_id", "branch", "updated_at",
];
const COUNTERS_TAB = "เลขรันเอกสาร";
const COUNTERS_TAB_HEADERS = ["document_type", "prefix", "year", "last_number", "updated_at"];

async function gwSheetsFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const res = await fetchWithTimeout(`${GW_SHEETS}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SHEETS_KEY,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(friendlySheetsError(res.status, txt, path));
  }
  return res.json();
}

// Convert raw Google Sheets HTTP failures into actionable Thai messages so
// the UI can guide users to fix the root cause (wrong Sheet ID, missing
// share permission, etc.) instead of showing an opaque 404/403 blob.
function friendlySheetsError(status: number, body: string, path: string): string {
  const idMatch = path.match(/\/spreadsheets\/([^/?:]+)/);
  const sheetId = idMatch ? idMatch[1] : "";
  const idHint = sheetId ? ` (ID: ${sheetId})` : "";
  if (status === 404) {
    return `ไม่พบ Google Sheet ที่ตั้งไว้${idHint} — ตรวจว่า URL/ID ถูกต้อง และแชร์ให้บัญชี Google ที่เชื่อมกับ Lovable แล้ว (สิทธิ์ Editor)`;
  }
  if (status === 403) {
    return `ไม่มีสิทธิ์เข้าถึง Google Sheet${idHint} — โปรดแชร์ให้บัญชี Google ที่เชื่อมกับ Lovable แบบ Editor แล้วลองใหม่`;
  }
  if (status === 401) {
    return `Google connector หมดสิทธิ์ (401) — กรุณาเชื่อมต่อ Google Sheets ใหม่ในหน้า Connectors`;
  }
  return `Sheets ${status}: ${body.slice(0, 300)}`;
}

// Per-invocation cache so a single sync doesn't hit
// `spreadsheets?fields=sheets.properties` + `values/tab!1:1` for every tab it
// touches. That used to be ~8 sequential Sheets round-trips per document
// (DOC + ITEMS + CUSTOMERS + COUNTERS), which — combined with per-item
// append + per-row deletes — was pushing the edge worker past its wall-clock
// budget and returning 546 with no `last_sync_error` persisted.
type SheetCtx = {
  tabs: Set<string> | null; // populated lazily from one metadata read
  headerChecked: Set<string>; // tabs whose header row we've already verified this run
};
function newSheetCtx(): SheetCtx {
  return { tabs: null, headerChecked: new Set() };
}
async function loadTabs(ctx: SheetCtx, sheetId: string): Promise<Set<string>> {
  if (ctx.tabs) return ctx.tabs;
  const meta = await gwSheetsFetch(
    `/spreadsheets/${sheetId}?fields=sheets.properties(title,sheetId)`,
    { timeoutMs: 15_000 },
  );
  const tabs = new Set<string>(
    (meta.sheets ?? []).map((s: any) => String(s.properties?.title ?? "")),
  );
  ctx.tabs = tabs;
  return tabs;
}
async function ensureTab(
  sheetId: string,
  tabName: string,
  headers: string[],
  ctx: SheetCtx = newSheetCtx(),
) {
  const tabs = await loadTabs(ctx, sheetId);
  if (!tabs.has(tabName)) {
    await gwSheetsFetch(`/spreadsheets/${sheetId}:batchUpdate`, {
      method: "POST",
      timeoutMs: 20_000,
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
    });
    tabs.add(tabName);
    // Freshly added tab — write headers directly, skip the header GET.
    await gwSheetsFetch(
      `/spreadsheets/${sheetId}/values/'${tabName}'!A1?valueInputOption=USER_ENTERED`,
      { method: "PUT", timeoutMs: 15_000, body: JSON.stringify({ values: [headers] }) },
    );
    ctx.headerChecked.add(tabName);
    return;
  }
  if (ctx.headerChecked.has(tabName)) return;
  const hdr = await gwSheetsFetch(
    `/spreadsheets/${sheetId}/values/'${tabName}'!1:1`,
    { timeoutMs: 15_000 },
  );
  const actual: string[] = (hdr.values?.[0] ?? []).map((v: any) => String(v ?? "").trim());
  if (actual.length === 0 || actual.length < headers.length) {
    // Backfill new columns (เช่น ปี/เดือน/วัน) โดยไม่ทำลายข้อมูลเดิม
    await gwSheetsFetch(
      `/spreadsheets/${sheetId}/values/'${tabName}'!A1?valueInputOption=USER_ENTERED`,
      { method: "PUT", timeoutMs: 15_000, body: JSON.stringify({ values: [headers] }) },
    );
  }
  ctx.headerChecked.add(tabName);
}

async function findRowByKey(sheetId: string, tabName: string): Promise<string[]> {
  // Returns column A values (excluding header row)
  const j = await gwSheetsFetch(`/spreadsheets/${sheetId}/values/'${tabName}'!A2:A`, { timeoutMs: 15_000 });
  return (j.values ?? []).map((r: any) => String(r?.[0] ?? ""));
}

async function upsertRow(sheetId: string, tabName: string, key: string, row: (string | number)[]) {
  const colA = await findRowByKey(sheetId, tabName);
  const idx = colA.findIndex((v) => v === key);
  if (idx >= 0) {
    const rowNum = idx + 2; // header is row 1
    await gwSheetsFetch(`/spreadsheets/${sheetId}/values/'${tabName}'!A${rowNum}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      timeoutMs: 15_000,
      body: JSON.stringify({ values: [row] }),
    });
  } else {
    await gwSheetsFetch(
      `/spreadsheets/${sheetId}/values/'${tabName}'!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", timeoutMs: 15_000, body: JSON.stringify({ values: [row] }) },
    );
  }
}

async function deleteRowsByKey(sheetId: string, tabName: string, key: string) {
  // One HTTP call regardless of how many rows match. Previously we called
  // `values/A:Z:clear` per matching row, which added N round-trips per item
  // resync and was a major contributor to the 546 timeouts.
  const colA = await findRowByKey(sheetId, tabName);
  const ranges: string[] = [];
  colA.forEach((v, i) => {
    if (v === key) ranges.push(`'${tabName}'!A${i + 2}:Z${i + 2}`);
  });
  if (ranges.length === 0) return;
  await gwSheetsFetch(`/spreadsheets/${sheetId}/values:batchClear`, {
    method: "POST",
    timeoutMs: 20_000,
    body: JSON.stringify({ ranges }),
  });
}

// Read all rows of a tab (excluding header). Returns array of objects keyed by header.
async function readTabRows(sheetId: string, tabName: string): Promise<Record<string, string>[]> {
  const j = await gwSheetsFetch(`/spreadsheets/${sheetId}/values/'${tabName}'!A1:ZZ`, { timeoutMs: 20_000 });
  const values: string[][] = j.values ?? [];
  if (values.length < 2) return [];
  const header = values[0].map((v) => String(v ?? "").trim());
  return values.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = String(row?.[i] ?? ""); });
    return obj;
  });
}

async function fetchDocumentFromSheets(
  sheetId: string,
  documentNo: string,
  preferredType?: string | null,
): Promise<{ header: Record<string, string> | null; items: Record<string, string>[]; tab: string | null }> {
  // If the caller knows the doc type, look at just that tab. Otherwise fall
  // back to scanning every tab in DOC_LABEL. Scanning all tabs was another
  // hot source of edge-worker wall-clock exhaustion.
  const entries = preferredType && DOC_LABEL[preferredType]
    ? ([[preferredType, DOC_LABEL[preferredType]]] as [string, string][])
    : (Object.entries(DOC_LABEL) as [string, string][]);
  for (const [type, tabName] of entries) {
    try {
      const rows = await readTabRows(sheetId, tabName);
      const hit = rows.find((r) => (r["document_no"] ?? "").trim() === documentNo.trim());
      if (hit) {
        const items = await readTabRows(sheetId, ITEMS_TAB).catch(() => []);
        const myItems = items.filter((it) => (it["document_no"] ?? "").trim() === documentNo.trim());
        return { header: { ...hit, document_type: type }, items: myItems, tab: tabName };
      }
    } catch {
      // tab may not exist — skip
    }
  }
  return { header: null, items: [], tab: null };
}

async function syncDocumentFull(sb: any, sheetId: string, doc: any) {
  // Share one metadata + header cache across every ensureTab call in this
  // single-document sync (DOC tab + ITEMS_TAB + CUSTOMERS_TAB + COUNTERS_TAB).
  const ctx = newSheetCtx();
  // ให้ร้านตั้ง override ชื่อแท็บต่อ doc_type ได้ ผ่าน rds_stores.sheet_tab_map
  let tabMap: Record<string, string> = {};
  try {
    const { data: s } = await sb.from("rds_stores").select("sheet_tab_map").eq("id", doc.store_id).maybeSingle();
    if (s && s.sheet_tab_map && typeof s.sheet_tab_map === "object") tabMap = s.sheet_tab_map as any;
  } catch { /* fallback ใช้ default */ }
  const tab = (tabMap[doc.document_type] && String(tabMap[doc.document_type]).trim()) || DOC_LABEL[doc.document_type] || doc.document_type;
  await ensureTab(sheetId, tab, DOC_TAB_HEADERS, ctx);

  // แตกวันที่เพื่อใช้กรอง/ค้นหาในชีต
  const d = doc.document_date ? new Date(doc.document_date) : null;
  const yyyy = d ? String(d.getFullYear() + 543) : "";
  const mm = d ? String(d.getMonth() + 1).padStart(2, "0") : "";
  const dd = d ? String(d.getDate()).padStart(2, "0") : "";

  const headerRow = [
    doc.id, doc.document_no, doc.document_date ?? "",
    yyyy, mm, dd,
    doc.customer_name ?? "", doc.customer_phone ?? "", doc.customer_address ?? "",
    doc.customer_tax_id ?? "", doc.customer_branch ?? "",
    doc.issued_by_name ?? "", doc.deliverer_name ?? "", doc.receiver_name ?? "",
    doc.notes ?? "",
    Number(doc.discount_total ?? 0), Number(doc.vat_amount ?? 0), Number(doc.withholding_tax_amount ?? 0),
    Number(doc.amount_before_vat ?? 0), Number(doc.vat_amount ?? 0), Number(doc.net_total ?? 0),
    doc.status ?? "",
    doc.internal_sale_type ?? "real_goods",
    doc.created_at ?? "", new Date().toISOString(),
  ];
  await upsertRow(sheetId, tab, doc.id, headerRow);

  // Items: load and rewrite (clear old + append fresh)
  const { data: items } = await sb
    .from("rds_document_items")
    .select("item_order, name, quantity, unit, price, line_total")
    .eq("document_id", doc.id)
    .order("item_order");
  await ensureTab(sheetId, ITEMS_TAB, ITEMS_TAB_HEADERS, ctx);
  await deleteRowsByKey(sheetId, ITEMS_TAB, doc.id);
  const itemRows = (items ?? []).map((it: any) => [
    doc.id, doc.document_no, it.item_order, it.name ?? "",
    Number(it.quantity ?? 0), it.unit ?? "", Number(it.price ?? 0), Number(it.line_total ?? 0),
  ]);
  if (itemRows.length) {
    await gwSheetsFetch(
      `/spreadsheets/${sheetId}/values/'${ITEMS_TAB}'!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", timeoutMs: 20_000, body: JSON.stringify({ values: itemRows }) },
    );
  }

  // Customer: upsert when we have a customer_id
  if (doc.customer_id) {
    await ensureTab(sheetId, CUSTOMERS_TAB, CUSTOMERS_TAB_HEADERS, ctx);
    const { data: cust } = await sb
      .from("rds_customers")
      .select("id, name, phone, email, address, tax_id, branch_name")
      .eq("id", doc.customer_id)
      .maybeSingle();
    if (cust) {
      await upsertRow(sheetId, CUSTOMERS_TAB, cust.id, [
        cust.id, cust.name ?? "", cust.phone ?? "", cust.email ?? "",
        cust.address ?? "", cust.tax_id ?? "", cust.branch_name ?? "", new Date().toISOString(),
      ]);
    }
  }

  // Counter: reflect latest from rds_document_settings
  const { data: settings } = await sb
    .from("rds_document_settings")
    .select("document_type, prefix, next_number")
    .eq("store_id", doc.store_id)
    .eq("document_type", doc.document_type)
    .maybeSingle();
  if (settings) {
    await ensureTab(sheetId, COUNTERS_TAB, COUNTERS_TAB_HEADERS, ctx);
    await upsertRow(sheetId, COUNTERS_TAB, settings.document_type, [
      settings.document_type,
      settings.prefix ?? "",
      new Date().getFullYear() + 543,
      Math.max(0, Number(settings.next_number ?? 1) - 1),
      new Date().toISOString(),
    ]);
  }
}

type HeaderIssue = {
  expected: string[];
  actual: string[];
  mismatches: { col: number; expected: string; actual: string }[];
};

async function readHeaders(sheetId: string): Promise<string[]> {
  const url = `${GW_SHEETS}/spreadsheets/${sheetId}/values/Sheet1!1:1`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SHEETS_KEY,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(friendlySheetsError(res.status, txt, `/spreadsheets/${sheetId}`));
  }
  const j = await res.json();
  return (j.values?.[0] ?? []).map((v: any) => String(v ?? "").trim());
}

async function writeHeaders(sheetId: string, headers: string[]) {
  const url = `${GW_SHEETS}/spreadsheets/${sheetId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`;
  const res = await fetchWithTimeout(url, {
    method: "PUT",
    timeoutMs: 20_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SHEETS_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [headers] }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(friendlySheetsError(res.status, txt, `/spreadsheets/${sheetId}`));
  }
}

function diffHeaders(actual: string[]): HeaderIssue | null {
  const mismatches: HeaderIssue["mismatches"] = [];
  const max = Math.max(EXPECTED_HEADERS.length, actual.length);
  for (let i = 0; i < max; i++) {
    const e = EXPECTED_HEADERS[i] ?? "";
    const a = actual[i] ?? "";
    if (e !== a) mismatches.push({ col: i + 1, expected: e, actual: a });
  }
  if (!mismatches.length) return null;
  return { expected: EXPECTED_HEADERS, actual, mismatches };
}

async function ensureHeaders(sheetId: string): Promise<HeaderIssue | null> {
  const actual = await readHeaders(sheetId);
  if (actual.length === 0) {
    await writeHeaders(sheetId, EXPECTED_HEADERS);
    return null;
  }
  return diffHeaders(actual);
}

async function appendRow(sheetId: string, row: (string | number)[]) {
  const range = "Sheet1!A1";
  const url = `${GW_SHEETS}/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    timeoutMs: 20_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SHEETS_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(friendlySheetsError(res.status, txt, `/spreadsheets/${sheetId}`));
  }
}

async function uploadPdf(folderId: string | null, name: string, base64: string): Promise<{ id: string; webViewLink: string }> {
  const meta: Record<string, unknown> = { name, mimeType: "application/pdf" };
  if (folderId) meta.parents = [folderId];
  const boundary = "----lovable-" + crypto.randomUUID();
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(meta),
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    "",
    base64,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const res = await fetchWithTimeout(`${GW_DRIVE_UPLOAD}&fields=id,webViewLink`, {
    method: "POST",
    // PDFs can be large; allow more time than Sheets calls but still
    // under the edge wall-clock so the outer catch persists "failed".
    timeoutMs: 60_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive ${res.status}: ${txt.slice(0, 300)}`);
  }
  return await res.json();
}

async function createDriveFolder(name: string, parentId: string | null): Promise<string> {
  const body: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) body.parents = [parentId];
  const res = await fetchWithTimeout(`${GW_DRIVE}/files?fields=id`, {
    method: "POST",
    timeoutMs: 20_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive folder ${res.status}: ${txt.slice(0, 300)}`);
  }
  const j = await res.json();
  return j.id as string;
}

// ค้นหาโฟลเดอร์ตามชื่อภายใต้ parent — ถ้ายังไม่มีให้สร้างใหม่ คืน folderId
async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and name='${safe}' and '${parentId}' in parents and trashed=false`;
  const url = `${GW_DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive list ${res.status}: ${txt.slice(0, 300)}`);
  }
  const j = await res.json();
  const hit = j.files?.[0]?.id as string | undefined;
  if (hit) return hit;
  return await createDriveFolder(name, parentId);
}

// Look up (or create) a folder and report whether it already existed. Used
// by the probe_folders mode so the UI can distinguish "found existing" vs
// "created just now".
async function findOrCreateFolderProbe(
  name: string,
  parentId: string,
): Promise<{ id: string; created: boolean }> {
  const safe = name.replace(/'/g, "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and name='${safe}' and '${parentId}' in parents and trashed=false`;
  const url = `${GW_DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive list ${res.status}: ${txt.slice(0, 300)}`);
  }
  const j = await res.json();
  const hit = j.files?.[0]?.id as string | undefined;
  if (hit) return { id: hit, created: false };
  const created = await createDriveFolder(name, parentId);
  return { id: created, created: true };
}

// โครงสร้างใหม่: [ร้าน]/[ประเภทเอกสาร]/<เลขที่>-<ชื่อโรงเรียน>.pdf
// ไม่มีการแยกโฟลเดอร์ตามหน่วยงาน/ปี/เดือน/วันอีกต่อไป
async function resolveDocFolder(
  rootFolderId: string,
  docType: string,
  storeSlug?: string | null,
  driveFolderMap?: Record<string, string> | null,
): Promise<string> {
  // Explicit per-doc-type override wins if the mapped folder still exists.
  const mapped = driveFolderMap?.[docType];
  if (mapped && typeof mapped === "string" && mapped.trim()) {
    const id = mapped.trim();
    try {
      const meta = await driveGetFile(id);
      if (meta && meta.parents !== undefined) return id;
    } catch {
      // fall through to default folder resolution
    }
  }
  // Colorlab เป็นร้านที่จด VAT — ใบเสร็จของร้านนี้พิมพ์เป็น
  // "ใบเสร็จรับเงิน/ใบกำกับภาษี" ดังนั้นโฟลเดอร์ใน Drive ต้องใช้ชื่อเดียวกัน
  // ร้านอื่น (printing) ยังใช้ชื่อเดิม "ใบเสร็จรับเงิน"
  const perStore: Record<string, Record<string, string>> = {
    colorlab: {
      quotation: "ใบเสนอราคา",
      delivery: "ใบส่งของ",
      receipt: "ใบเสร็จรับเงิน/ใบกำกับภาษี",
      tax_invoice: "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    },
  };
  const override = storeSlug ? perStore[storeSlug]?.[docType] : undefined;
  const typeLabel = override ?? DOC_LABEL[docType] ?? docType;
  return await findOrCreateFolder(typeLabel, rootFolderId);
}

// Filename helpers + resync decision live in ./_resync so they can be unit
// tested without spinning up Deno.serve or hitting Drive. See _resync.test.ts.
import {
  sanitizeFileSegment,
  buildDocFileName,
  assertValidDocFileName,
  decideResync,
} from "./_resync.ts";

// ===== Drive helpers for resync/move-in-place =====
async function driveGetFile(
  fileId: string,
): Promise<{ id: string; name: string; parents: string[]; webViewLink?: string } | null> {
  const url = `${GW_DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,name,parents,webViewLink,trashed`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Drive get ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  if (j?.trashed) return null;
  return { id: j.id, name: j.name, parents: j.parents ?? [], webViewLink: j.webViewLink };
}

async function driveFindFileInFolder(
  folderId: string,
  name: string,
): Promise<{ id: string; webViewLink?: string } | null> {
  const safe = name.replace(/'/g, "\\'");
  const q = `name='${safe}' and '${folderId}' in parents and trashed=false`;
  const url = `${GW_DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,webViewLink)&pageSize=1`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
    },
  });
  if (!res.ok) throw new Error(`Drive search ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const hit = j.files?.[0];
  return hit ? { id: hit.id, webViewLink: hit.webViewLink } : null;
}

async function driveTrashFile(fileId: string): Promise<void> {
  const res = await fetchWithTimeout(`${GW_DRIVE}/files/${encodeURIComponent(fileId)}`, {
    method: "PATCH",
    timeoutMs: 15_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok) throw new Error(`Drive trash ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function driveMoveAndRename(
  fileId: string,
  newParentId: string,
  oldParents: string[],
  newName: string,
): Promise<{ id: string; webViewLink?: string }> {
  const params = new URLSearchParams();
  params.set("fields", "id,webViewLink,parents,name");
  const remove = oldParents.filter((p) => p && p !== newParentId).join(",");
  const addNeeded = !oldParents.includes(newParentId);
  if (addNeeded) params.set("addParents", newParentId);
  if (remove) params.set("removeParents", remove);
  const url = `${GW_DRIVE}/files/${encodeURIComponent(fileId)}?${params.toString()}`;
  const res = await fetchWithTimeout(url, {
    method: "PATCH",
    timeoutMs: 20_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error(`Drive move ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return { id: j.id, webViewLink: j.webViewLink };
}

// Replace the PDF bytes of an existing Drive file in place. Keeps the same
// fileId and shareable URL — anyone with the previous link still opens the
// updated file. Used by the re-sync path so repeated "ซิงค์" clicks refresh
// the existing PDF instead of piling up duplicates in the destination folder.
async function driveUpdatePdfMedia(
  fileId: string,
  base64: string,
): Promise<{ id: string; webViewLink?: string }> {
  // Decode base64 → binary so we can PATCH the raw PDF bytes as media.
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = `https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,webViewLink`;
  const res = await fetchWithTimeout(url, {
    method: "PATCH",
    timeoutMs: 60_000,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": DRIVE_KEY,
      "Content-Type": "application/pdf",
    },
    body: bin,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive update ${res.status}: ${txt.slice(0, 300)}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    // Build a lightweight admin client early so we can log auth failures.
    const debugAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
    const attemptAt = new Date().toISOString();
    const hasAuthHeader = !!authHeader;
    const authPrefixOk = !!authHeader?.startsWith("Bearer ");
    let tokenIat: number | null = null;
    let tokenExp: number | null = null;
    if (authPrefixOk) {
      try {
        const payload = JSON.parse(atob(authHeader!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        tokenIat = payload.iat ?? null;
        tokenExp = payload.exp ?? null;
      } catch { /* ignore */ }
    }
    async function logSyncEvent(action: string, userId: string | null, extra: Record<string, unknown> = {}) {
      try {
        await debugAdmin.from("activity_logs").insert({
          user_id: userId,
          action,
          target_type: "edge_function",
          detail: {
            fn: "rds-google-sync",
            attempt_at: attemptAt,
            has_auth_header: hasAuthHeader,
            auth_prefix_ok: authPrefixOk,
            token_iat: tokenIat,
            token_exp: tokenExp,
            ...extra,
          },
        });
      } catch { /* logging must not block the response */ }
    }

    if (!authHeader?.startsWith("Bearer ")) {
      await logSyncEvent("rds_sync_unauthorized", null, { reason: "missing_or_malformed_authorization" });
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      await logSyncEvent("rds_sync_unauthorized", null, {
        reason: "getuser_failed",
        error: userErr?.message ?? null,
      });
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isStaff, error: roleErr } = await adminClient.rpc("is_staff_any", { _uid: userId });
    if (roleErr || !isStaff) {
      await logSyncEvent("rds_sync_forbidden", userId, {
        reason: "not_staff",
        error: roleErr?.message ?? null,
      });
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { document_id, pdf_base64, target, mode, store_id, document_no } = body;

    // Per-store authorization helper. Mirrors the `is_staff_of_store` check
    // used by the underlying RLS policies (owners bypass; other staff must
    // have a matching `staff_stores` row). Prevents a globally-staffed
    // account from touching other stores' Sheets/Drive via this function.
    async function assertStoreAccess(targetStoreId: string | null | undefined): Promise<Response | null> {
      const sid = (targetStoreId ?? "").toString().trim();
      if (!sid) {
        return new Response(JSON.stringify({ ok: false, error: "store_id required" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const { data: ok, error } = await adminClient.rpc("is_staff_of_store", { _uid: userId, _store_id: sid });
      if (error || !ok) {
        await logSyncEvent("rds_sync_forbidden", userId, { reason: "not_store_staff", store_id: sid, error: error?.message ?? null });
        return new Response(JSON.stringify({ ok: false, error: "forbidden_store" }), {
          status: 403, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      return null;
    }
    async function resolveDocumentStoreId(docId: string): Promise<string | null> {
      const { data } = await adminClient.from("rds_documents").select("store_id").eq("id", docId).maybeSingle();
      return (data as any)?.store_id ?? null;
    }

    // Guard every mode by the target store. For document-scoped modes we
    // resolve store_id from the document first.
    {
      let targetStoreId: string | null | undefined = store_id;
      if (!targetStoreId && document_id) {
        targetStoreId = await resolveDocumentStoreId(String(document_id));
        if (!targetStoreId) {
          return new Response(JSON.stringify({ ok: false, error: "doc not found" }), {
            status: 404, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
      }
      const denied = await assertStoreAccess(targetStoreId);
      if (denied) return denied;
    }

    // ===== test_access mode: probe Sheet + Drive access without touching
    // any data. Returns sheet title, tab list, folder metadata, or a
    // detailed error code so Settings UI can guide the user to a fix.
    if (mode === "test_access") {
      const sb = adminClient;
      const { data: store, error: se } = await sb
        .from("rds_stores")
        .select("id, name, slug, google_sheet_id, google_drive_folder_id, sheet_tab_map, drive_folder_map")
        .eq("id", store_id ?? "")
        .maybeSingle();
      if (se || !store) {
        return new Response(JSON.stringify({ ok: false, code: "store_not_found", error: se?.message ?? "store not found" }),
          { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const out: Record<string, unknown> = {
        ok: true,
        store: { id: store.id, name: store.name, slug: store.slug },
        sheet: null,
        drive: null,
        sheet_tab_map: store.sheet_tab_map ?? {},
        drive_folder_map: (store as any).drive_folder_map ?? {},
        errors: [] as string[],
      };
      const errs = out.errors as string[];
      // Sheets metadata
      const sheetId = extractSheetId(store.google_sheet_id);
      if (!sheetId) {
        errs.push("ยังไม่ได้ตั้งค่า Google Sheet ID");
        (out as any).sheet = { ok: false, code: "sheet_id_missing" };
      } else if (!LOVABLE_API_KEY || !SHEETS_KEY) {
        errs.push("Google Sheets connector ยังไม่ได้เชื่อม");
        (out as any).sheet = { ok: false, code: "connector_missing", sheet_id: sheetId };
      } else {
        try {
          const meta = await gwSheetsFetch(`/spreadsheets/${sheetId}?fields=properties.title,sheets.properties(title,sheetId)`, { timeoutMs: 15_000 });
          const tabs = (meta.sheets ?? []).map((s: any) => s.properties?.title).filter(Boolean);
          // Also probe Drive capabilities on the same file to verify EDIT
          // permission (the Sheets metadata endpoint succeeds with only
          // Viewer access, which would still fail at write time).
          let can_edit: boolean | null = null;
          let owner_email: string | null = null;
          let permission_error: string | null = null;
          if (LOVABLE_API_KEY && DRIVE_KEY) {
            try {
              const capRes = await fetchWithTimeout(
                `${GW_DRIVE}/files/${encodeURIComponent(sheetId)}?fields=capabilities(canEdit,canModifyContent),owners(emailAddress,displayName),trashed`,
                { timeoutMs: 15_000, headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": DRIVE_KEY } },
              );
              if (capRes.ok) {
                const cj = await capRes.json();
                can_edit = !!(cj.capabilities?.canEdit && cj.capabilities?.canModifyContent);
                owner_email = cj.owners?.[0]?.emailAddress ?? null;
                if (cj.trashed) permission_error = "ไฟล์อยู่ในถังขยะ (Trash)";
              } else {
                permission_error = `Drive cap ${capRes.status}`;
              }
            } catch (e) { permission_error = (e as Error).message; }
          }
          const writable = can_edit !== false; // treat unknown as ok (Sheets meta already succeeded)
          (out as any).sheet = {
            ok: writable,
            code: writable ? undefined : "sheet_read_only",
            sheet_id: sheetId,
            title: meta.properties?.title ?? "",
            tabs,
            url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
            can_edit,
            owner_email,
            permission_error,
          };
          if (!writable) errs.push("Sheets: บัญชี Connector มีสิทธิ์แค่ Viewer — ต้องเป็น Editor");
        } catch (e) {
          const msg = (e as Error).message;
          const code = /ไม่พบ/.test(msg) ? "sheet_not_found" : /ไม่มีสิทธิ์/.test(msg) ? "sheet_no_access" : /401/.test(msg) ? "connector_unauthorized" : "sheet_error";
          errs.push(`Sheets: ${msg}`);
          (out as any).sheet = { ok: false, code, sheet_id: sheetId, error: msg };
        }
      }
      // Drive folder metadata
      const folderId = extractDriveFolderId(store.google_drive_folder_id);
      if (!folderId) {
        (out as any).drive = { ok: false, code: "folder_id_missing" };
      } else if (!LOVABLE_API_KEY || !DRIVE_KEY) {
        (out as any).drive = { ok: false, code: "connector_missing", folder_id: folderId };
      } else {
        try {
          const res = await fetchWithTimeout(`${GW_DRIVE}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,webViewLink,capabilities(canEdit,canAddChildren),owners(emailAddress,displayName)`, {
            timeoutMs: 15_000,
            headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": DRIVE_KEY },
          });
          if (!res.ok) {
            const txt = (await res.text()).slice(0, 300);
            const code = res.status === 404 ? "folder_not_found" : res.status === 403 ? "folder_no_access" : "folder_error";
            errs.push(`Drive: ${res.status} ${txt}`);
            (out as any).drive = { ok: false, code, folder_id: folderId, error: `Drive ${res.status}: ${txt}` };
          } else {
            const j = await res.json();
            const isFolder = j.mimeType === "application/vnd.google-apps.folder";
            const canAdd = !!j.capabilities?.canAddChildren;
            const canEdit = !!j.capabilities?.canEdit;
            const ok = !j.trashed && isFolder && canAdd;
            let code: string | undefined;
            if (j.trashed) code = "folder_trashed";
            else if (!isFolder) code = "not_a_folder";
            else if (!canAdd) code = "folder_read_only";
            (out as any).drive = {
              ok, code,
              folder_id: folderId,
              name: j.name,
              url: j.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`,
              trashed: !!j.trashed,
              is_folder: isFolder,
              can_edit: canEdit,
              can_add_children: canAdd,
              owner_email: j.owners?.[0]?.emailAddress ?? null,
            };
            if (j.trashed) errs.push("Drive: โฟลเดอร์ปลายทางอยู่ในถังขยะ");
            else if (!isFolder) errs.push("Drive: ID นี้ไม่ใช่โฟลเดอร์");
            else if (!canAdd) errs.push("Drive: บัญชี Connector ไม่มีสิทธิ์เพิ่มไฟล์ในโฟลเดอร์นี้ (ต้อง Editor)");
          }
        } catch (e) {
          errs.push(`Drive: ${(e as Error).message}`);
          (out as any).drive = { ok: false, code: "folder_error", folder_id: folderId, error: (e as Error).message };
        }
      }
      out.ok = errs.length === 0;
      return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ===== set_tab_map mode: persist user's tab re-mapping =====
    if (mode === "set_tab_map") {
      if (!store_id) throw new Error("store_id required");
      const map = (body as any).tab_map ?? {};
      if (typeof map !== "object" || Array.isArray(map)) throw new Error("tab_map must be object");
      const { error } = await adminClient.from("rds_stores").update({ sheet_tab_map: map }).eq("id", store_id);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ===== set_drive_folder_map mode: persist per-doc-type Drive folder ids =====
    if (mode === "set_drive_folder_map") {
      if (!store_id) throw new Error("store_id required");
      const map = (body as any).folder_map ?? {};
      if (typeof map !== "object" || Array.isArray(map)) throw new Error("folder_map must be object");
      // Normalize: keep only known doc_types with a non-empty string id
      const allowed = new Set(["quotation", "delivery", "receipt", "tax_invoice", "invoice"]);
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(map)) {
        if (!allowed.has(k)) continue;
        if (typeof v === "string" && v.trim()) clean[k] = v.trim();
      }
      const { error } = await adminClient.from("rds_stores").update({ drive_folder_map: clean }).eq("id", store_id);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true, folder_map: clean }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ===== list_drive_folders mode: enumerate subfolders under the store's
    // Drive root (or a specific parent) so the Settings UI can offer a
    // dropdown instead of asking users to paste folder IDs.
    if (mode === "list_drive_folders") {
      if (!store_id) throw new Error("store_id required");
      const parent = ((body as any).parent_id ?? "").toString().trim();
      const { data: store, error: se } = await adminClient
        .from("rds_stores")
        .select("google_drive_folder_id")
        .eq("id", store_id)
        .maybeSingle();
      if (se || !store) throw new Error(se?.message ?? "store not found");
      const rootId = parent || extractDriveFolderId(store.google_drive_folder_id) || "";
      if (!rootId) throw new Error("ยังไม่ได้ตั้งค่าโฟลเดอร์รูทของร้าน");
      if (!LOVABLE_API_KEY || !DRIVE_KEY) throw new Error("Google Drive connector ยังไม่ได้เชื่อม");
      const q = `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const url = `${GW_DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&orderBy=name&pageSize=200`;
      const res = await fetchWithTimeout(url, {
        timeoutMs: 20_000,
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": DRIVE_KEY },
      });
      if (!res.ok) {
        const txt = (await res.text()).slice(0, 300);
        throw new Error(`Drive list ${res.status}: ${txt}`);
      }
      const j = await res.json();
      return new Response(
        JSON.stringify({ ok: true, parent_id: rootId, folders: j.files ?? [] }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ===== probe_folders mode: verify the [store]/[docType] folder mapping
    // without touching any documents. Returns folder id for each of the 3
    // expected doc types plus whether it was just created.
    if (mode === "probe_folders") {
      if (!store_id) throw new Error("store_id required");
      const sb = adminClient;
      const { data: store, error: se } = await sb
        .from("rds_stores")
        .select("id, name, slug, google_drive_folder_id")
        .eq("id", store_id)
        .single();
      if (se || !store) throw new Error(se?.message ?? "store not found");
      if (!LOVABLE_API_KEY || !DRIVE_KEY) throw new Error("Google Drive connector ยังไม่ได้เชื่อม");
      let rootFolderId = extractDriveFolderId(store.google_drive_folder_id);
      let rootCreated = false;
      if (!rootFolderId) {
        rootFolderId = await createDriveFolder(store.name ?? "Documents", null);
        rootCreated = true;
        await sb.from("rds_stores").update({ google_drive_folder_id: rootFolderId }).eq("id", store.id);
      }
      const perStore: Record<string, Record<string, string>> = {
        colorlab: {
          quotation: "ใบเสนอราคา",
          delivery: "ใบส่งของ",
          receipt: "ใบเสร็จรับเงิน/ใบกำกับภาษี",
        },
      };
      const docTypes: Array<"quotation" | "delivery" | "receipt"> = ["quotation", "delivery", "receipt"];
      const results: Array<Record<string, unknown>> = [];
      for (const dt of docTypes) {
        const label = perStore[store.slug!]?.[dt] ?? DOC_LABEL[dt] ?? dt;
        try {
          const r = await findOrCreateFolderProbe(label, rootFolderId!);
          results.push({
            doc_type: dt,
            folder_label: label,
            folder_id: r.id,
            folder_url: `https://drive.google.com/drive/folders/${r.id}`,
            created: r.created,
            error: null,
          });
        } catch (e) {
          results.push({
            doc_type: dt,
            folder_label: label,
            folder_id: null,
            folder_url: null,
            created: false,
            error: (e as Error).message,
          });
        }
      }
      return new Response(
        JSON.stringify({
          ok: results.every((r) => !r.error),
          store: { id: store.id, name: store.name, slug: store.slug },
          root_folder_id: rootFolderId,
          root_folder_url: rootFolderId ? `https://drive.google.com/drive/folders/${rootFolderId}` : null,
          root_folder_created: rootCreated,
          results,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ===== resync_move mode: relocate an existing Drive file to the new
    // [store]/[docType]/<no>-<school>.pdf structure without re-uploading.
    // Safe against duplicates: if a file with the target name already
    // exists in the destination folder, we adopt it and trash the stray.
    if (mode === "resync_move") {
      if (!document_id) throw new Error("document_id required");
      const sb = adminClient;
      const { data: doc, error: de } = await sb
        .from("rds_documents")
        .select("id, store_id, document_no, document_type, customer_id, customer_name, google_drive_file_id, rds_stores!rds_documents_store_id_fkey!inner(slug, name, google_drive_folder_id, drive_folder_map)")
        .eq("id", document_id)
        .single();
      if (de || !doc) throw new Error(de?.message ?? "doc not found");
      const store = (doc as any).rds_stores;
      if (!LOVABLE_API_KEY || !DRIVE_KEY) throw new Error("Google Drive connector ยังไม่ได้เชื่อม");

      let rootFolderId = extractDriveFolderId(store.google_drive_folder_id);
      if (!rootFolderId) {
        rootFolderId = await createDriveFolder(store.name ?? "Documents", null);
        await sb.from("rds_stores").update({ google_drive_folder_id: rootFolderId }).eq("id", doc.store_id);
      }

      // resolve school name (for filename only)
      let schoolName = "";
      if ((doc as any).customer_id) {
        const { data: cust } = await sb
          .from("rds_customers").select("org_id").eq("id", (doc as any).customer_id).maybeSingle();
        if (cust?.org_id) {
          const { data: org } = await sb
            .from("organizations").select("name").eq("id", cust.org_id).maybeSingle();
          if (org?.name) schoolName = org.name;
        }
      }
      if (!schoolName) schoolName = (doc as any).customer_name ?? "";
      const targetFolder = await resolveDocFolder(
        rootFolderId,
        (doc as any).document_type,
        store?.slug,
        (store as any)?.drive_folder_map ?? null,
      );
      const targetName = buildDocFileName((doc as any).document_no, schoolName);
      // Guard rail: never hand Drive a name it will reject / rewrite.
      assertValidDocFileName(targetName);

      const currentId: string | null = (doc as any).google_drive_file_id ?? null;
      const current = currentId ? await driveGetFile(currentId) : null;
      // Ask Drive once whether a file already sits at the destination with our
      // target name so decideResync can handle the duplicate case correctly.
      const existing = await driveFindFileInFolder(targetFolder, targetName);
      const decision = decideResync({ current, existing, targetFolderId: targetFolder, targetName });

      let action: string = decision.action;
      let finalId: string | null = null;
      let finalUrl: string | undefined;

      if (decision.action === "unchanged" || decision.action === "adopted") {
        finalId = decision.keepFileId;
        finalUrl = decision.keepUrl;
        if (decision.action === "adopted" && "trashFileId" in decision && decision.trashFileId) {
          // Adopt the file that's already at the destination and trash the
          // stray copy so users don't see duplicates in Drive.
          await driveTrashFile(decision.trashFileId);
        }
      } else if (decision.action === "renamed" || decision.action === "moved") {
        const moved = await driveMoveAndRename(
          decision.moveFileId, targetFolder, decision.fromParents, targetName,
        );
        finalId = moved.id;
        finalUrl = moved.webViewLink;
      }

      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (finalId) {
        upd.google_drive_file_id = finalId;
        upd.google_drive_url = finalUrl ?? null;
        upd.google_drive_sync_status = "success";
        upd.google_drive_synced_at = new Date().toISOString();
      }
      await sb.from("rds_documents").update(upd).eq("id", document_id);
      await sb.from("rds_activity_logs").insert({
        store_id: (doc as any).store_id,
        action: "drive_resync_move",
        target_type: "document",
        target_id: document_id,
        detail: {
          action, file_id: finalId, target_folder_id: targetFolder,
          file_name: targetName, doc_type: (doc as any).document_type,
        },
      });
      return new Response(
        JSON.stringify({ ok: true, action, file_id: finalId, url: finalUrl, target_folder_id: targetFolder, file_name: targetName }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // ===== fetch_document mode: read a doc back from Sheets for restore =====
    if (mode === "fetch_document") {
      if (!store_id || !document_no) throw new Error("store_id and document_no required");
      const sb = adminClient;
      const { data: storeRow, error: se } = await sb
        .from("rds_stores")
        .select("id, google_sheet_id")
        .eq("id", store_id)
        .single();
      if (se || !storeRow) throw new Error(se?.message ?? "store not found");
      const sheetId = extractSheetId(storeRow.google_sheet_id);
      if (!sheetId) throw new Error("ร้านนี้ยังไม่ได้ตั้ง Google Sheet ID");
      if (!LOVABLE_API_KEY || !SHEETS_KEY) throw new Error("Google Sheets connector ยังไม่ได้เชื่อม");
      // Caller may pass `document_type` so we hit exactly one tab instead of
      // scanning every entry in DOC_LABEL (five slow reads → one).
      const result = await fetchDocumentFromSheets(
        sheetId,
        String(document_no),
        typeof (body as any).document_type === "string" ? (body as any).document_type : null,
      );
      return new Response(
        JSON.stringify({ ok: !!result.header, ...result }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!document_id) throw new Error("document_id required");
    const tg: "sheet" | "drive" | "both" = target ?? "both";

    const sb = adminClient;
    const { data: doc, error: de } = await sb
      .from("rds_documents")
      .select("*, rds_stores!rds_documents_store_id_fkey!inner(slug, name, google_sheet_id, google_drive_folder_id, drive_folder_map)")
      .eq("id", document_id)
      .single();
    if (de || !doc) throw new Error(de?.message ?? "doc not found");

    const store = (doc as any).rds_stores;
    const updates: Record<string, unknown> = {};
    const errors: string[] = [];

    const sheetId = extractSheetId(store.google_sheet_id);
    const folderId0 = extractDriveFolderId(store.google_drive_folder_id);
    if ((tg === "sheet" || tg === "both") && sheetId && mode === "document_full") {
      try {
        if (!LOVABLE_API_KEY || !SHEETS_KEY) throw new Error("Google Sheets connector ยังไม่ได้เชื่อม");
        await syncDocumentFull(sb, sheetId, doc);
        updates.google_sheet_sync_status = "success";
        updates.google_sheet_synced_at = new Date().toISOString();
        await sb.from("rds_activity_logs").insert({
          store_id: doc.store_id,
          action: "sheet_sync_full",
          target_type: "document",
          target_id: document_id,
          detail: {
            sheet_id: sheetId,
            tab: DOC_LABEL[doc.document_type] ?? doc.document_type,
            doc_type: doc.document_type,
            endpoint: "values:append (per-doc-type)",
          },
        });
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`Sheets: ${msg}`);
        updates.google_sheet_sync_status = "failed";
        await sb.from("rds_activity_logs").insert({
          store_id: doc.store_id,
          action: "sheet_sync_failed",
          target_type: "document",
          target_id: document_id,
          detail: { error: msg, sheet_id: sheetId, mode: "document_full" },
        });
      }
    } else if ((tg === "sheet" || tg === "both") && sheetId) {
      try {
        if (!LOVABLE_API_KEY || !SHEETS_KEY) throw new Error("Google Sheets connector ยังไม่ได้เชื่อม");
        const issue = await ensureHeaders(sheetId);
        if (issue) {
          const first = issue.mismatches[0];
          const msg = `หัวตารางคอลัมน์ที่ ${first.col} คาดว่า "${first.expected}" แต่พบ "${first.actual}" — โปรดแก้หัวตารางใน Google Sheet ให้ตรง (พบ ${issue.mismatches.length} จุดที่ต่างกัน)`;
          errors.push(`Sheets: ${msg}`);
          updates.google_sheet_sync_status = "failed";
          await sb.from("rds_activity_logs").insert({
            store_id: doc.store_id,
            action: "sheet_sync_failed",
            target_type: "document",
            target_id: document_id,
            detail: { reason: "header_mismatch", sheet_id: sheetId, ...issue },
          });
          (updates as any)._header_issue = issue;
          throw new Error(msg);
        }
        await appendRow(sheetId, [
          doc.document_no,
          doc.document_date,
          DOC_LABEL[doc.document_type] ?? doc.document_type,
          doc.customer_name ?? "",
          doc.customer_phone ?? "",
          doc.customer_tax_id ?? "",
          Number(doc.subtotal),
          Number(doc.discount_total),
          Number(doc.amount_before_vat),
          Number(doc.vat_amount),
          Number(doc.grand_total),
          Number(doc.withholding_tax_amount),
          Number(doc.net_total),
          doc.payment_method ?? "",
          doc.payment_status,
          doc.status,
          new Date().toISOString(),
        ]);
        updates.google_sheet_sync_status = "success";
        updates.google_sheet_synced_at = new Date().toISOString();
        await sb.from("rds_activity_logs").insert({
          store_id: doc.store_id,
          action: "sheet_sync",
          target_type: "document",
          target_id: document_id,
          detail: { sheet_id: sheetId },
        });
      } catch (e) {
        const msg = (e as Error).message;
        // avoid duplicating the header mismatch error we already pushed above
        if (!errors.some((x) => x.includes(msg))) errors.push(`Sheets: ${msg}`);
        updates.google_sheet_sync_status = "failed";
        if (!(updates as any)._header_issue) {
          await sb.from("rds_activity_logs").insert({
            store_id: doc.store_id,
            action: "sheet_sync_failed",
            target_type: "document",
            target_id: document_id,
            detail: { error: msg, sheet_id: sheetId },
          });
        }
      }
    } else if (tg === "sheet" || tg === "both") {
      if (tg === "sheet") errors.push("ร้านนี้ยังไม่ได้ตั้ง Google Sheet ID (หรือลิงก์ไม่ถูกต้อง)");
    }

    if ((tg === "drive" || tg === "both") && pdf_base64) {
      try {
        if (!LOVABLE_API_KEY || !DRIVE_KEY) throw new Error("Google Drive connector ยังไม่ได้เชื่อม");
        // Auto-create a per-store folder when none configured yet, so each
        // store ends up with its own subfolder without manual setup.
        let folderId: string | null = folderId0;
        if (!folderId) {
          folderId = await createDriveFolder(store.name ?? "Documents", null);
          await sb.from("rds_stores").update({ google_drive_folder_id: folderId }).eq("id", doc.store_id);
        }
        // หาชื่อโรงเรียน/หน่วยงานสำหรับผนวกในชื่อไฟล์ (ไม่สร้างโฟลเดอร์แยกอีก)
        let schoolName = "";
        let orgRow: { id: string; name: string } | null = null;
        if (doc.customer_id) {
          const { data: cust } = await sb
            .from("rds_customers")
            .select("org_id")
            .eq("id", doc.customer_id)
            .maybeSingle();
          if (cust?.org_id) {
            const { data: org } = await sb
              .from("organizations")
              .select("id, name")
              .eq("id", cust.org_id)
              .maybeSingle();
            if (org) {
              orgRow = org as any;
              schoolName = org.name ?? "";
            }
          }
        }
        if (!schoolName) schoolName = doc.customer_name ?? "";
        // โครงสร้างใหม่: [ร้าน]/[ประเภทเอกสาร]/<เลขที่>-<ชื่อโรงเรียน>.pdf
        const targetFolder = await resolveDocFolder(
          folderId,
          doc.document_type,
          store?.slug,
          (store as any)?.drive_folder_map ?? null,
        );
        const fileName = buildDocFileName(doc.document_no, schoolName);
        // Guard rail before upload: if this ever fails, sanitization missed
        // something and Drive would reject or silently rewrite the name.
        assertValidDocFileName(fileName);

        // Idempotent re-sync: reuse the existing Drive file whenever we can
        // so repeated "ซิงค์" clicks refresh the same PDF (fileId + share
        // link stay stable) instead of piling up duplicates.
        let finalId: string | null = null;
        let finalUrl: string | undefined;
        let action = "uploaded_new";

        const currentId: string | null = (doc as any).google_drive_file_id ?? null;
        const current = currentId ? await driveGetFile(currentId).catch(() => null) : null;

        if (current) {
          // Replace PDF bytes in place, then move/rename if the destination
          // folder or filename drifted (doc_no or school name changed).
          const updated = await driveUpdatePdfMedia(current.id, pdf_base64);
          const inRightFolder = (current.parents ?? []).includes(targetFolder);
          const sameName = current.name === fileName;
          if (!inRightFolder || !sameName) {
            const moved = await driveMoveAndRename(
              current.id, targetFolder, current.parents ?? [], fileName,
            );
            finalId = moved.id;
            finalUrl = moved.webViewLink ?? updated.webViewLink;
          } else {
            finalId = updated.id;
            finalUrl = updated.webViewLink ?? current.webViewLink;
          }
          action = "updated_in_place";
        } else {
          // We don't own a live file — check whether the destination already
          // has one with the same name (adopt + refresh), otherwise upload
          // fresh.
          const existing = await driveFindFileInFolder(targetFolder, fileName).catch(() => null);
          if (existing) {
            const updated = await driveUpdatePdfMedia(existing.id, pdf_base64);
            finalId = updated.id;
            finalUrl = updated.webViewLink ?? existing.webViewLink;
            action = "adopted_and_updated";
          } else {
            const up = await uploadPdf(targetFolder, fileName, pdf_base64);
            finalId = up.id;
            finalUrl = up.webViewLink;
            action = "uploaded_new";
          }
        }

        updates.google_drive_file_id = finalId;
        updates.google_drive_url = finalUrl ?? null;
        updates.google_drive_sync_status = "success";
        updates.google_drive_synced_at = new Date().toISOString();
        await sb.from("rds_activity_logs").insert({
          store_id: doc.store_id,
          action: "drive_sync",
          target_type: "document",
          target_id: document_id,
          detail: {
            file_id: finalId,
            url: finalUrl,
            resync_action: action,
            root_folder_id: folderId,
            org_id: orgRow?.id ?? null,
            target_folder_id: targetFolder,
            file_name: fileName,
            doc_type: doc.document_type,
          },
        });
        (updates as any)._drive_action = action;
      } catch (e) {
        errors.push(`Drive: ${(e as Error).message}`);
        updates.google_drive_sync_status = "failed";
        await sb.from("rds_activity_logs").insert({
          store_id: doc.store_id,
          action: "drive_sync_failed",
          target_type: "document",
          target_id: document_id,
          detail: { error: (e as Error).message },
        });
      }
    }

    updates.last_sync_error = errors.length ? errors.join(" | ") : null;
    updates.updated_at = new Date().toISOString();
    const headerIssue = (updates as any)._header_issue ?? null;
    delete (updates as any)._header_issue;
    const driveAction = (updates as any)._drive_action ?? null;
    delete (updates as any)._drive_action;
    await sb.from("rds_documents").update(updates).eq("id", document_id);

    return new Response(JSON.stringify({ ok: errors.length === 0, errors, updates, header_issue: headerIssue, drive_action: driveAction }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});