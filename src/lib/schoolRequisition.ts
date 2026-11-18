import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv";
import { diffRequisition, recordRequisitionLog } from "@/lib/requisitionLog";


export type RequisitionItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  price: number;
  qty: number;
  source: "manual" | "shop" | "import";
  needsReview?: boolean;
  reviewNote?: string;
};

export type RequisitionStatus = "draft" | "submitted";

export type Requisition = {
  id: string;
  school_name: string;
  project_name: string;
  prepared_by: string;
  doc_date: string;
  status: RequisitionStatus;
  items: RequisitionItem[];
  total: number;
  note?: string | null;
  submitted_at?: string | null;
  created_at: string;
  updated_at: string;
  /** true = เก็บไว้ในเครื่องนี้ (ยังไม่ได้เข้าสู่ระบบ) */
  local?: boolean;
};

export const REQUISITION_LOCAL_KEY = "school_requisitions_local_v1";
/** ฟอร์มที่ค้างไว้ก่อนถูกพาไปเข้าสู่ระบบ (ต้องกู้คืนกลับมาให้ครบ) */
export const REQUISITION_PENDING_KEY = "school_requisition_pending_v1";
/** ข้อความ error เมื่อพยายามส่งรายการโดยยังไม่เข้าสู่ระบบ */
export const REQUIRE_LOGIN_ERROR = "requisition_requires_login";

export type PendingRequisition = {
  id?: string;
  school_name: string;
  project_name: string;
  prepared_by: string;
  doc_date: string;
  note?: string | null;
  items: RequisitionItem[];
  /** true = ผู้ใช้กด "ส่งรายการ" ไว้ก่อนถูกพาไปล็อกอิน */
  intent_submit: boolean;
  saved_at: string;
};

export function savePendingRequisition(p: Omit<PendingRequisition, "saved_at">) {
  try {
    localStorage.setItem(REQUISITION_PENDING_KEY, JSON.stringify({ ...p, saved_at: new Date().toISOString() }));
  } catch { /* storage เต็ม/ถูกปิด */ }
}

export function readPendingRequisition(): PendingRequisition | null {
  try {
    const raw = localStorage.getItem(REQUISITION_PENDING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PendingRequisition;
    if (!v || !Array.isArray(v.items)) return null;
    return v;
  } catch { return null; }
}

export function clearPendingRequisition() {
  try { localStorage.removeItem(REQUISITION_PENDING_KEY); } catch { /* ignore */ }
}

/* ---------------- บันทึกร่างอัตโนมัติ (ในเครื่อง) ---------------- */

export const REQUISITION_AUTOSAVE_KEY = "school_requisition_autosave_v1";

export type RequisitionAutosave = {
  id?: string;
  school_name: string;
  project_name: string;
  prepared_by: string;
  doc_date: string;
  note?: string | null;
  items: RequisitionItem[];
  saved_at: string;
};

/** ว่างเปล่า = ไม่ต้องเก็บ (กันการเขียนทับร่างเดิมด้วยฟอร์มเปล่า) */
export function isAutosaveEmpty(v: Omit<RequisitionAutosave, "saved_at">): boolean {
  return (
    !v.school_name.trim() &&
    !v.project_name.trim() &&
    !v.prepared_by.trim() &&
    !(v.note ?? "").trim() &&
    v.items.length === 0
  );
}

export function writeAutosave(v: Omit<RequisitionAutosave, "saved_at">): RequisitionAutosave | null {
  if (isAutosaveEmpty(v)) { clearAutosave(); return null; }
  const payload: RequisitionAutosave = { ...v, saved_at: new Date().toISOString() };
  try { localStorage.setItem(REQUISITION_AUTOSAVE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  return payload;
}

export function readAutosave(): RequisitionAutosave | null {
  try {
    const raw = localStorage.getItem(REQUISITION_AUTOSAVE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as RequisitionAutosave;
    if (!v || !Array.isArray(v.items)) return null;
    return v;
  } catch { return null; }
}

export function clearAutosave() {
  try { localStorage.removeItem(REQUISITION_AUTOSAVE_KEY); } catch { /* ignore */ }
}


export function newItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `it_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function lineTotal(item: Pick<RequisitionItem, "price" | "qty">): number {
  return round2((Number(item.price) || 0) * (Number(item.qty) || 0));
}

export function grandTotal(items: RequisitionItem[]): number {
  return round2(items.reduce((sum, it) => sum + lineTotal(it), 0));
}

export function formatMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** แสดงวันที่เป็น พ.ศ. รูปแบบ dd/mm/yyyy */
export function formatThaiDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map((v) => Number(v));
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y + 543}`;
}

export function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/* ---------------- local (ยังไม่เข้าสู่ระบบ) ---------------- */

export function readLocal(): Requisition[] {
  try {
    const raw = localStorage.getItem(REQUISITION_LOCAL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as Requisition[]).map((r) => ({ ...r, local: true })) : [];
  } catch {
    return [];
  }
}

export function writeLocal(list: Requisition[]) {
  try {
    localStorage.setItem(REQUISITION_LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* เต็ม/ปิดกั้น — ข้ามไป */
  }
}

export function upsertLocal(doc: Requisition): Requisition {
  const list = readLocal();
  const idx = list.findIndex((r) => r.id === doc.id);
  const saved = { ...doc, local: true, updated_at: new Date().toISOString() };
  if (idx >= 0) list[idx] = saved;
  else list.unshift(saved);
  writeLocal(list);
  return saved;
}

export function removeLocal(id: string) {
  writeLocal(readLocal().filter((r) => r.id !== id));
}

/* ---------------- remote (มีบัญชี) ---------------- */

export async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.user?.id);
}

type SavePayload = {
  id?: string;
  school_name: string;
  project_name: string;
  prepared_by: string;
  doc_date: string;
  status: RequisitionStatus;
  items: RequisitionItem[];
  note?: string | null;
};

/**
 * บันทึกใบเขียนเบิก — เป็นเอกสารประมาณการเท่านั้น
 * ไม่แตะ products.stock และไม่สร้าง stock_movements ใด ๆ
 */
export async function saveRequisition(payload: SavePayload): Promise<Requisition> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  const total = grandTotal(payload.items);
  const nowIso = new Date().toISOString();

  if (!uid) {
    // ด่านป้องกันชั้นที่สอง — ผู้ใช้ที่ยังไม่เข้าสู่ระบบ "ส่งรายการ" ไม่ได้
    if (payload.status === "submitted") throw new Error(REQUIRE_LOGIN_ERROR);
    const existing = payload.id ? readLocal().find((r) => r.id === payload.id) : undefined;
    return upsertLocal({
      id: payload.id || newItemId(),
      school_name: payload.school_name,
      project_name: payload.project_name,
      prepared_by: payload.prepared_by,
      doc_date: payload.doc_date,
      status: "draft",
      items: payload.items,
      total,
      note: payload.note ?? null,
      submitted_at: null,
      created_at: existing?.created_at || nowIso,
      updated_at: nowIso,
      local: true,
    });
  }


  const row = {
    user_id: uid,
    school_name: payload.school_name,
    project_name: payload.project_name,
    prepared_by: payload.prepared_by,
    doc_date: payload.doc_date,
    status: payload.status,
    items: payload.items as unknown as never,
    total,
    note: payload.note ?? null,
    submitted_at: payload.status === "submitted" ? nowIso : null,
  };

  const isLocalId = payload.id ? readLocal().some((r) => r.id === payload.id) : false;
  const isUpdate = Boolean(payload.id) && !isLocalId;

  let before: Requisition | null = null;
  if (isUpdate) {
    const { data: prev } = await supabase.from("school_requisitions").select("*").eq("id", payload.id!).maybeSingle();
    if (prev) before = normalize(prev);
  }

  const query = isUpdate
    ? supabase.from("school_requisitions").update(row).eq("id", payload.id!).select("*").single()
    : supabase.from("school_requisitions").insert(row).select("*").single();

  const { data, error } = await query;
  if (error) throw error;
  if (payload.id && isLocalId) removeLocal(payload.id);
  const saved = normalize(data);

  // ประวัติการแก้ไข — best-effort ไม่ทำให้การบันทึกล้มเหลว
  const changes = isUpdate ? diffRequisition(before, saved) : [];
  const action = payload.status === "submitted" && before?.status !== "submitted"
    ? "submit"
    : isUpdate
      ? "update"
      : "create";
  if (action !== "update" || changes.length > 0) {
    void recordRequisitionLog(saved.id, action, changes);
  }
  return saved;

}

export async function listRequisitions(status: RequisitionStatus): Promise<Requisition[]> {
  const local = readLocal().filter((r) => r.status === status);
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session?.user?.id) return local;
  const { data, error } = await supabase
    .from("school_requisitions")
    .select("*")
    .eq("status", status)
    .eq("user_id", sess.session.user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return [...(data ?? []).map(normalize), ...local];
}

export async function deleteRequisition(doc: Requisition): Promise<void> {
  if (doc.local) {
    removeLocal(doc.id);
    return;
  }
  const { error } = await supabase.from("school_requisitions").delete().eq("id", doc.id);
  if (error) throw error;
}

function normalize(row: Record<string, unknown>): Requisition {
  const items = Array.isArray(row.items) ? (row.items as RequisitionItem[]) : [];
  return {
    id: String(row.id),
    school_name: String(row.school_name ?? ""),
    project_name: String(row.project_name ?? ""),
    prepared_by: String(row.prepared_by ?? ""),
    doc_date: String(row.doc_date ?? todayIso()),
    status: (row.status === "submitted" ? "submitted" : "draft") as RequisitionStatus,
    items,
    total: Number(row.total ?? 0),
    note: (row.note as string) ?? null,
    submitted_at: (row.submitted_at as string) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}


/**
 * แจ้งเตือน "ใบเขียนเบิกใหม่" เข้ากลุ่ม LINE รับออเดอร์ (กลุ่มเดียวกับออเดอร์)
 * ทำหลังบันทึกสำเร็จเท่านั้น และห้ามทำให้การส่งของลูกค้าล้มเหลว
 */
export async function notifyRequisitionSubmitted(id: string): Promise<{ ok: boolean; configured?: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke("school-requisition-notify", {
      body: { requisition_id: id },
    });
    if (error) return { ok: false };
    return { ok: true, configured: Boolean((data as { configured?: boolean } | null)?.configured) };
  } catch {
    return { ok: false };
  }
}

/* ---------------- ดาวน์โหลดไฟล์ CSV (เปิดด้วย Excel ได้) ---------------- */

export const REQUISITION_CSV_COLUMNS = ["ลำดับ", "รายการ", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม"] as const;

/** แปลงรายการสินค้าเป็นแถว CSV พร้อมบรรทัดยอดรวมท้ายไฟล์ */
export function requisitionToCsvRows(doc: Pick<Requisition, "items">): Record<string, string>[] {
  const items = doc.items ?? [];
  const rows = items.map((it, i) => ({
    "ลำดับ": String(i + 1),
    "รายการ": it.name || "",
    "จำนวน": String(it.qty ?? 0),
    "หน่วย": it.unit || "",
    "ราคา/หน่วย": lineTotal({ price: it.price, qty: 1 }).toFixed(2),
    "รวม": lineTotal(it).toFixed(2),
  }));
  rows.push({
    "ลำดับ": "",
    "รายการ": "ยอดรวมทั้งสิ้น",
    "จำนวน": "",
    "หน่วย": "",
    "ราคา/หน่วย": "",
    "รวม": grandTotal(items).toFixed(2),
  });
  return rows;
}

/** ชื่อไฟล์: ใบเขียนเบิก-<หน่วยงาน>-<วันที่>.csv (ตัดอักขระที่ใช้กับชื่อไฟล์ไม่ได้) */
export function requisitionCsvFilename(doc: Pick<Requisition, "school_name" | "doc_date">): string {
  const safe = (doc.school_name || "ไม่ระบุหน่วยงาน").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 60);
  return `ใบเขียนเบิก-${safe}-${doc.doc_date || todayIso()}.csv`;
}

export function downloadRequisitionCsv(doc: Requisition) {
  const info = [
    `หน่วยงาน: ${doc.school_name || "-"}`,
    `โครงการ: ${doc.project_name || "-"}`,
    `ผู้จัดทำ: ${doc.prepared_by || "-"}`,
    `วันที่: ${formatThaiDate(doc.doc_date)}`,
    `เลขที่: ${doc.id}`,
    `สถานะ: ${doc.status === "submitted" ? "ส่งให้ร้านแล้ว" : "แบบร่าง"}`,
  ].join(" | ");
  downloadCsv(
    requisitionCsvFilename(doc),
    requisitionToCsvRows(doc),
    [...REQUISITION_CSV_COLUMNS],
    null,
    { storeName: "ใบเขียนเบิก — NATTA GROUP (เอกสารประมาณการ ไม่ตัดสต๊อก)", subtitle: info },
  );
}
