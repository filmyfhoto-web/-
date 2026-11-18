/**
 * NATTA DOC BOT — ชั้นข้อมูล (Supabase) ของร่าง/การอนุมัติ/กันซ้ำ/audit
 * ทุกฟังก์ชันใช้ service-role client จาก edge function เท่านั้น
 */
import type { DocBotCommand } from "./docBotCommands.ts";
import type { NdbBundleDoc, NdbDocRow, NdbShopKey, NdbTodaySummary } from "./nattaDocBot.ts";

export interface NdbDraftRow {
  id: string;
  group_id: string;
  line_user_id: string;
  shop_key: NdbShopKey;
  store_id: string | null;
  status: string;
  payload: { command?: DocBotCommand; missing?: string[]; [k: string]: unknown };
  document_no: string | null;
}

const DRAFTS = "line_doc_bot_drafts";

export async function createNdbDraft(
  admin: any,
  input: {
    groupId: string;
    lineUserId: string;
    shopKey: NdbShopKey;
    storeId: string | null;
    command: DocBotCommand;
    missing: string[];
  },
): Promise<NdbDraftRow | null> {
  const { data } = await admin
    .from(DRAFTS)
    .insert({
      group_id: input.groupId,
      line_user_id: input.lineUserId,
      shop_key: input.shopKey,
      store_id: input.storeId,
      status: "open",
      payload: { command: input.command, missing: input.missing },
    })
    .select("*")
    .maybeSingle();
  return (data as NdbDraftRow) ?? null;
}

export async function updateNdbDraft(
  admin: any,
  draftId: string,
  patch: { command?: DocBotCommand; missing?: string[]; status?: string; documentNo?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.status) row.status = patch.status;
  if (patch.documentNo !== undefined) row.document_no = patch.documentNo;
  if (patch.command || patch.missing) {
    const { data } = await admin.from(DRAFTS).select("payload").eq("id", draftId).maybeSingle();
    const payload = { ...((data?.payload as Record<string, unknown>) ?? {}) };
    if (patch.command) payload.command = patch.command;
    if (patch.missing) payload.missing = patch.missing;
    row.payload = payload;
  }
  if (!Object.keys(row).length) return;
  await admin.from(DRAFTS).update(row).eq("id", draftId);
}

export async function getNdbDraft(admin: any, draftId: string): Promise<NdbDraftRow | null> {
  const { data } = await admin.from(DRAFTS).select("*").eq("id", draftId).maybeSingle();
  return (data as NdbDraftRow) ?? null;
}

/** ร่างที่ยังเปิดอยู่ของ “คนนี้ ในกลุ่มนี้” เท่านั้น — กันข้อมูลปะปนระหว่างพนักงาน */
export async function listOpenNdbDrafts(
  admin: any,
  groupId: string,
  lineUserId: string,
): Promise<NdbDraftRow[]> {
  const { data } = await admin
    .from(DRAFTS)
    .select("*")
    .eq("group_id", groupId)
    .eq("line_user_id", lineUserId)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(5);
  return (data as NdbDraftRow[]) ?? [];
}

/** ผู้กดปุ่มต้องเป็นเจ้าของร่างและอยู่กลุ่มเดียวกัน */
export function ndbDraftAllowed(draft: NdbDraftRow | null, groupId: string, lineUserId: string): boolean {
  return Boolean(draft && draft.group_id === groupId && draft.line_user_id === lineUserId);
}

/* ------------------------------ idempotency ------------------------------ */

export type NdbClaim = "claimed" | "duplicate" | "error";

/**
 * จองสิทธิ์ทำ action หนึ่งครั้ง (กันกดซ้ำ)
 *  - "claimed"    = ครั้งแรก ทำงานต่อได้
 *  - "duplicate"  = เคยทำแล้ว ต้องไม่ทำซ้ำ
 *  - "error"      = ฐานข้อมูลผิดพลาด → fail-closed ห้ามทำงานต่อ (กันออกเลขเอกสารซ้ำ)
 */
export async function claimNdbAction(admin: any, actionKey: string): Promise<NdbClaim> {
  try {
    const { error } = await admin.from("line_doc_bot_actions").insert({ action_key: actionKey });
    if (!error) return "claimed";
    const code = String((error as any)?.code ?? "");
    if (code === "23505") return "duplicate";
    console.error("[ndb] claim action failed", error);
    return "error";
  } catch (e) {
    console.error("[ndb] claim action threw", e);
    return "error";
  }
}

/** คืนสิทธิ์ที่จองไว้ เมื่อการทำงานล้มเหลว เพื่อให้ผู้ใช้กดซ้ำแล้ว retry ได้อย่างปลอดภัย */
export async function releaseNdbAction(admin: any, actionKey: string): Promise<void> {
  try {
    await admin.from("line_doc_bot_actions").delete().eq("action_key", actionKey);
  } catch (e) {
    console.error("[ndb] release action failed", e);
  }
}

export async function ndbAudit(
  admin: any,
  input: {
    groupId?: string | null;
    lineUserId?: string | null;
    action: string;
    draftId?: string | null;
    documentNo?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("line_doc_bot_audit").insert({
      group_id: input.groupId ?? null,
      line_user_id: input.lineUserId ?? null,
      action: input.action,
      draft_id: input.draftId ?? null,
      document_no: input.documentNo ?? null,
      detail: input.detail ?? {},
    });
  } catch (e) {
    console.error("[ndb] audit failed", e);
  }
}

/* ------------------------------- approvals ------------------------------- */

export async function isQuotationApproved(
  admin: any,
  storeId: string | null,
  quotationNo: string,
): Promise<boolean> {
  let q = admin.from("line_doc_bot_approvals").select("id").eq("quotation_no", quotationNo).limit(1);
  if (storeId) q = q.eq("store_id", storeId);
  const { data } = await q.maybeSingle();
  return Boolean(data);
}

export async function approveQuotation(
  admin: any,
  input: { storeId: string | null; quotationNo: string; groupId: string; lineUserId: string },
): Promise<void> {
  const exists = await isQuotationApproved(admin, input.storeId, input.quotationNo);
  if (exists) return;
  await admin.from("line_doc_bot_approvals").insert({
    store_id: input.storeId,
    quotation_no: input.quotationNo,
    group_id: input.groupId,
    approved_by_line_user_id: input.lineUserId,
  });
}

/* --------------------------------- lists --------------------------------- */

const TYPE_LABELS: Record<string, string> = {
  quotation: "ใบเสนอราคา",
  delivery: "ใบส่งของ",
  receipt: "ใบเสร็จรับเงิน",
  tax_invoice: "ใบเสร็จ/ใบกำกับภาษี",
  invoice: "ใบแจ้งหนี้",
};

export function ndbTypeLabel(t: string): string {
  return TYPE_LABELS[t] ?? "เอกสาร";
}

export function ndbDocUrl(origin: string, storeSlug: string | null, id: string): string {
  return `${origin}/receipts/${storeSlug || "film"}/documents/${id}/edit`;
}

function toRow(d: any, origin: string, storeSlug: string | null): NdbDocRow {
  return {
    docNo: String(d.document_no ?? ""),
    docTypeLabel: ndbTypeLabel(String(d.document_type ?? "")),
    customerName: d.customer_name ?? null,
    total: d.grand_total != null ? Number(d.grand_total) : null,
    url: d.id ? ndbDocUrl(origin, storeSlug, String(d.id)) : null,
  };
}

export async function listRecentNdbDocs(
  admin: any,
  storeId: string | null,
  origin: string,
  storeSlug: string | null,
  limit = 5,
): Promise<NdbDocRow[]> {
  let q = admin
    .from("rds_documents")
    .select("id, document_no, document_type, customer_name, grand_total, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (storeId) q = q.eq("store_id", storeId);
  const { data } = await q;
  return ((data as any[]) ?? []).map((d) => toRow(d, origin, storeSlug));
}

/**
 * ทำความสะอาดคำค้นก่อนส่งเข้า PostgREST `or(...)`
 * ตัดอักขระที่ทำให้ไวยากรณ์เพี้ยน (, . ( ) % * \ " ') แต่ยังค้นไทย/เลขเอกสาร/เบอร์โทรได้
 */
export function sanitizeNdbKeyword(keyword: string, maxLen = 60): string {
  return String(keyword ?? "")
    .replace(/[,().%*\\"'`;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .trim();
}

export async function searchNdbDocs(
  admin: any,
  storeId: string | null,
  keyword: string,
  origin: string,
  storeSlug: string | null,
  limit = 10,
): Promise<NdbDocRow[]> {
  const kw = sanitizeNdbKeyword(keyword);
  if (!kw) return [];
  let q = admin
    .from("rds_documents")
    .select("id, document_no, document_type, customer_name, customer_phone, project_name, grand_total, created_at")
    .or(
      [
        `document_no.ilike.%${kw}%`,
        `customer_name.ilike.%${kw}%`,
        `customer_phone.ilike.%${kw}%`,
        `project_name.ilike.%${kw}%`,
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (storeId) q = q.eq("store_id", storeId);
  const { data } = await q;
  return ((data as any[]) ?? []).map((d) => toRow(d, origin, storeSlug));
}

export function summarizeNdbToday(
  docs: { document_type: string; grand_total?: number | null; document_no?: string | null }[],
  approvedNos: Set<string>,
): NdbTodaySummary {
  const out: NdbTodaySummary = { quotations: 0, approved: 0, deliveries: 0, receipts: 0, receiptAmount: 0 };
  for (const d of docs) {
    const t = String(d.document_type ?? "");
    if (t === "quotation") {
      out.quotations += 1;
      if (d.document_no && approvedNos.has(d.document_no)) out.approved += 1;
    } else if (t === "delivery") out.deliveries += 1;
    else if (t === "receipt" || t === "tax_invoice") {
      out.receipts += 1;
      out.receiptAmount += Number(d.grand_total ?? 0);
    }
  }
  return out;
}

/** เวลาเริ่มต้นของ “วันนี้” ตามเขตเวลาไทย (Asia/Bangkok = UTC+7) ในรูป ISO (UTC) */
export function bangkokDayStartIso(now: Date = new Date()): string {
  const OFFSET = 7 * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + OFFSET);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - OFFSET).toISOString();
}

export async function loadNdbToday(admin: any, storeId: string | null): Promise<NdbTodaySummary> {
  const startIso = bangkokDayStartIso();
  let q = admin
    .from("rds_documents")
    .select("document_no, document_type, grand_total")
    .gte("created_at", startIso)
    .limit(500);
  if (storeId) q = q.eq("store_id", storeId);
  const { data } = await q;
  const docs = ((data as any[]) ?? []);
  const nos = docs.map((d) => d.document_no).filter(Boolean);
  let approved = new Set<string>();
  if (nos.length) {
    let aq = admin.from("line_doc_bot_approvals").select("quotation_no").in("quotation_no", nos);
    if (storeId) aq = aq.eq("store_id", storeId);
    const { data: ap } = await aq;
    approved = new Set(((ap as any[]) ?? []).map((r) => String(r.quotation_no)));
  }
  return summarizeNdbToday(docs, approved);
}

/* ---------------------- ชุดเอกสาร (รวมลิงก์ทั้งชุด) ---------------------- */

const BUNDLE_COLUMNS =
  "id, store_id, document_no, document_type, customer_name, grand_total, net_total, source_document_id, document_date, created_at";

function bundleDateText(d: any): string | null {
  const raw = d.document_date ?? d.created_at;
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

/** นับจำนวนเอกสารในชุด (ต้นชุด + ต่อเนื่อง) แบบเบา ๆ เพื่อตัดสินใจแสดงปุ่ม “รวมลิงก์ทั้งชุด” */
export async function countNdbBundleDocs(
  admin: any,
  storeId: string | null,
  docNo: string,
): Promise<{ total: number; sourceDocNo: string | null }> {
  try {
    let q = admin
      .from("rds_documents")
      .select("id, document_no, source_document_id")
      .eq("document_no", docNo);
    if (storeId) q = q.eq("store_id", storeId);
    const { data: hit } = await q.limit(1).maybeSingle();
    if (!hit) return { total: 0, sourceDocNo: null };

    const rootId = String((hit as any).source_document_id ?? (hit as any).id);
    let sourceDocNo = String((hit as any).document_no ?? "") || null;
    if (rootId !== String((hit as any).id)) {
      let rq = admin.from("rds_documents").select("document_no").eq("id", rootId);
      if (storeId) rq = rq.eq("store_id", storeId);
      const { data: root } = await rq.limit(1).maybeSingle();
      if (root?.document_no) sourceDocNo = String(root.document_no);
    }

    let cq = admin.from("rds_documents").select("id").eq("source_document_id", rootId).limit(20);
    if (storeId) cq = cq.eq("store_id", storeId);
    const { data: children } = await cq;
    const childCount = ((children as any[]) ?? []).filter((c) => String(c.id) !== rootId).length;
    return { total: 1 + childCount, sourceDocNo };
  } catch (e) {
    console.error("[ndb] countNdbBundleDocs failed", e);
    return { total: 0, sourceDocNo: null };
  }
}

/**
 * โหลด “ชุดเอกสาร” ของงานเดียวกัน = ใบเสนอราคาต้นทาง + เอกสารต่อเนื่องทุกฉบับ
 * กรอง store_id ก่อนเสมอ (กันเลขเอกสารซ้ำข้ามร้าน) และแนบตัวอย่างรายการของแต่ละฉบับ
 */
export async function loadNdbDocBundle(
  admin: any,
  storeId: string | null,
  docNo: string,
  origin: string,
  storeSlug: string | null,
): Promise<{ docs: NdbBundleDoc[]; sourceDocNo: string | null }> {
  let q = admin.from("rds_documents").select(BUNDLE_COLUMNS).eq("document_no", docNo);
  if (storeId) q = q.eq("store_id", storeId);
  const { data: hit } = await q.limit(1).maybeSingle();
  if (!hit) return { docs: [], sourceDocNo: null };

  const rootId = String(hit.source_document_id ?? hit.id);
  let rootRow: any = hit;
  if (rootId !== String(hit.id)) {
    let rq = admin.from("rds_documents").select(BUNDLE_COLUMNS).eq("id", rootId);
    if (storeId) rq = rq.eq("store_id", storeId);
    const { data: root } = await rq.limit(1).maybeSingle();
    rootRow = root ?? hit;
  }

  let cq = admin
    .from("rds_documents")
    .select(BUNDLE_COLUMNS)
    .eq("source_document_id", rootRow.id)
    .order("created_at", { ascending: true })
    .limit(20);
  if (storeId) cq = cq.eq("store_id", storeId);
  const { data: children } = await cq;

  const rows = [rootRow, ...(((children as any[]) ?? []).filter((c) => String(c.id) !== String(rootRow.id)))];

  const { data: items } = await admin
    .from("rds_document_items")
    .select("document_id, name, description, quantity, unit, line_total, item_order")
    .in("document_id", rows.map((r) => r.id))
    .order("item_order");

  const byDoc = new Map<string, any[]>();
  for (const it of ((items as any[]) ?? [])) {
    const key = String(it.document_id);
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key)!.push(it);
  }

  const docs: NdbBundleDoc[] = rows.map((r) => {
    const all = byDoc.get(String(r.id)) ?? [];
    return {
      docNo: String(r.document_no ?? ""),
      docTypeLabel: ndbTypeLabel(String(r.document_type ?? "")),
      customerName: r.customer_name ?? null,
      dateText: bundleDateText(r),
      total: r.grand_total != null ? Number(r.grand_total) : r.net_total != null ? Number(r.net_total) : null,
      url: r.id ? ndbDocUrl(origin, storeSlug, String(r.id)) : null,
      items: all.slice(0, 4).map((i) => ({
        description: String(i.name ?? i.description ?? "-"),
        quantity: i.quantity != null ? Number(i.quantity) : null,
        unit: i.unit ?? null,
        total: i.line_total != null ? Number(i.line_total) : null,
      })),
      moreItems: Math.max(0, all.length - 4),
      isSource: String(r.id) === String(rootRow.id),
    };
  });

  return { docs, sourceDocNo: String(rootRow.document_no ?? "") || null };
}
