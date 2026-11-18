/**
 * Service layer ของหน้า "ใบเบิกสินค้า" (/admin/requisition-desk)
 *
 * ใช้ตารางเดิมของระบบทั้งหมด — ไม่สร้างระบบลูกค้า/ใบเบิกชุดใหม่
 *  - ใบเบิก        : public.school_requisitions (คอลัมน์ req_number / customer_id / line_user_id / receive_method / want_date / source_files)
 *  - รายชื่อลูกค้า : public.profiles (ผูก LINE ผ่าน line_user_id)
 *  - ไฟล์ลูกค้า    : public.customer_excel_intakes (+ storage bucket/path)
 *  - หน่วยนับ      : public.product_units
 *
 * ไม่มีการเรียก AI ที่คิดเครดิต — การ "อ่านไฟล์เป็นรายการ" ใช้รายการที่ระบบ
 * แปลงไว้ตอนลูกค้าอัปโหลด (deterministic) และทำเครื่องหมายช่องที่ไม่ชัดให้แก้เอง
 */
import { supabase } from "@/integrations/supabase/client";
import type { RequisitionItem } from "@/lib/schoolRequisition";
import { newItemId } from "@/lib/schoolRequisition";

const db = supabase as any;

export const RECEIVE_METHODS = ["รับที่ร้าน", "จัดส่ง", "อื่น ๆ"] as const;
export const FALLBACK_UNITS = ["รีม", "แฟ้ม", "กล่อง", "ด้าม", "แผ่น", "เล่ม", "ชุด", "ชิ้น"];

export type ReqMode = "manual" | "files";

export interface DeskCustomer {
  id: string;
  name: string;
  code: string;
  phone: string;
  lineUserId: string | null;
  lineName: string | null;
}

export type ReqFileKind = "excel" | "pdf" | "image" | "word" | "other";

export interface ReqFile {
  id: string;
  name: string;
  kind: ReqFileKind;
  sizeBytes: number;
  bucket: string | null;
  path: string | null;
  url?: string | null;
  items: RequisitionItem[];
  needsReviewCount: number;
}

/** CUS-00127 จากรหัสลูกค้าเดิม (customer_code) หรือเลขท้ายของ id */
export function customerCode(p: { code?: string | null; id: string }): string {
  const raw = (p.code || "").trim();
  if (raw) return /^CUS-/i.test(raw) ? raw.toUpperCase() : `CUS-${raw.replace(/\D/g, "").padStart(5, "0")}`;
  const tail = (p.id || "").replace(/\D/g, "").slice(-5) || "00000";
  return `CUS-${tail.padStart(5, "0")}`;
}

export function kindOf(name: string, mime = ""): ReqFileKind {
  const n = `${name} ${mime}`.toLowerCase();
  if (/\.(xlsx|xls|csv)|spreadsheet|excel/.test(n)) return "excel";
  if (/\.pdf|pdf/.test(n)) return "pdf";
  if (/\.(jpg|jpeg|png|webp|gif|heic)|image\//.test(n)) return "image";
  if (/\.(docx?|rtf)|word/.test(n)) return "word";
  return "other";
}

export function fmtSize(bytes: number): string {
  if (!bytes) return "-";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export const KIND_LABEL: Record<ReqFileKind, string> = {
  excel: "Excel", pdf: "PDF", image: "รูปภาพ", word: "Word", other: "ไฟล์",
};

/** วันที่ไทย พ.ศ. เช่น 28 ส.ค. 2569 */
export function thaiDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${d.toLocaleDateString("th-TH", { month: "short" })} ${d.getFullYear() + 543}`;
}

/* ------------------------------------------------------------------ reads */

export async function listUnits(): Promise<string[]> {
  try {
    const { data } = await db.from("product_units").select("name, sort_order").order("sort_order");
    const names = ((data ?? []) as any[]).map((r) => String(r.name || "")).filter(Boolean);
    return names.length ? [...new Set([...FALLBACK_UNITS, ...names])] : FALLBACK_UNITS;
  } catch {
    return FALLBACK_UNITS;
  }
}

export async function searchCustomers(q: string, limit = 40): Promise<DeskCustomer[]> {
  let query = db
    .from("profiles")
    .select("id, full_name, customer_code, phone, line_user_id, line_display_name, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  const term = q.trim();
  if (term) {
    const esc = term.replace(/[%,()]/g, " ");
    query = query.or(`full_name.ilike.%${esc}%,phone.ilike.%${esc}%,customer_code.ilike.%${esc}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    name: String(r.full_name || "ลูกค้าไม่ระบุชื่อ"),
    code: customerCode({ code: r.customer_code, id: String(r.id) }),
    phone: String(r.phone || ""),
    lineUserId: r.line_user_id ? String(r.line_user_id) : null,
    lineName: r.line_display_name ? String(r.line_display_name) : null,
  }));
}

function toReqItems(raw: unknown): { items: RequisitionItem[]; needsReview: number } {
  if (!Array.isArray(raw)) return { items: [], needsReview: 0 };
  let needsReview = 0;
  const items = raw.map((r: any) => {
    const name = String(r?.name ?? r?.description ?? "").trim();
    const qty = Number(r?.qty ?? r?.quantity ?? 0) || 0;
    const unit = String(r?.unit ?? "").trim();
    const flag = Boolean(r?.needsReview) || !name || qty <= 0 || !unit;
    if (flag) needsReview += 1;
    return {
      id: newItemId(),
      code: String(r?.code ?? ""),
      name,
      unit: unit || "ชิ้น",
      price: Number(r?.price ?? 0) || 0,
      qty: qty > 0 ? qty : 1,
      source: "import" as const,
      needsReview: flag,
      reviewNote: flag ? "อ่านจากไฟล์ได้ไม่ชัด — โปรดตรวจสอบ" : undefined,
    };
  });
  return { items, needsReview };
}

/** ไฟล์ที่ลูกค้ารายนี้ส่งเข้ามา (จับคู่ด้วย user_id ก่อน แล้วค่อยเบอร์โทร) */
export async function listCustomerFiles(c: DeskCustomer): Promise<ReqFile[]> {
  const cols = "id, filename, file_size, mime_type, items, storage_bucket, storage_path, phone, user_id, submitted_at";
  const digits = (c.phone || "").replace(/\D/g, "");
  const { data, error } = await db
    .from("customer_excel_intakes")
    .select(cols)
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as any[]).filter(
    (r) => String(r.user_id) === c.id || (digits && String(r.phone || "").replace(/\D/g, "") === digits),
  );
  return rows.map((r) => {
    const parsed = toReqItems(r.items);
    return {
      id: String(r.id),
      name: String(r.filename || "ไฟล์แนบ"),
      kind: kindOf(String(r.filename || ""), String(r.mime_type || "")),
      sizeBytes: Number(r.file_size || 0),
      bucket: r.storage_bucket ? String(r.storage_bucket) : null,
      path: r.storage_path ? String(r.storage_path) : null,
      items: parsed.items,
      needsReviewCount: parsed.needsReview,
    };
  });
}

export async function signFileUrl(bucket: string, path: string): Promise<string | null> {
  try {
    const { data } = await (supabase as any).storage.from(bucket).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** เลขที่ใบเบิกใหม่ BR-{พ.ศ.}-{ลำดับ} (ไม่ซ้ำ) */
export async function nextReqNumber(): Promise<string> {
  const { data, error } = await db.rpc("next_requisition_number");
  if (error || !data) {
    const yr = new Date().getFullYear() + 543;
    return `BR-${yr}-${String(Date.now() % 10000).padStart(4, "0")}`;
  }
  return String(data);
}

/** งานจากลูกค้าที่ยังไม่ได้ทำใบเบิก (ใช้กับแถบด้านล่าง) */
export interface InboxJob {
  id: string;
  customerName: string;
  phone: string;
  filename: string;
  submittedAt: string;
}

export async function listInboxJobs(limit = 20): Promise<InboxJob[]> {
  const { data, error } = await db
    .from("customer_excel_intakes")
    .select("id, customer_name, school_name, phone, filename, submitted_at, converted_id")
    .is("converted_id", null)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    customerName: String(r.customer_name || r.school_name || "ลูกค้าไม่ระบุชื่อ"),
    phone: String(r.phone || ""),
    filename: String(r.filename || ""),
    submittedAt: String(r.submitted_at || ""),
  }));
}

/* ----------------------------------------------------------------- writes */

export interface DeskSavePayload {
  id?: string;
  reqNumber: string;
  customer: DeskCustomer;
  items: RequisitionItem[];
  wantDate: string;
  receiveMethod: string;
  note: string;
  sourceFiles: Array<Pick<ReqFile, "id" | "name" | "kind" | "bucket" | "path">>;
  status: "draft" | "submitted";
}

export interface DeskSaveResult {
  id: string;
  reqNumber: string;
  status: "draft" | "submitted";
}

export function validateDesk(p: Omit<DeskSavePayload, "status">): string[] {
  const errs: string[] = [];
  if (!p.customer?.id) errs.push("ยังไม่ได้เลือกลูกค้า");
  if (!p.items.length) errs.push("ต้องมีรายการอย่างน้อย 1 รายการ");
  p.items.forEach((it, i) => {
    if (!it.name.trim()) errs.push(`รายการที่ ${i + 1} ยังไม่ได้ใส่ชื่อสินค้า`);
    if (!(Number(it.qty) > 0)) errs.push(`รายการที่ ${i + 1} จำนวนต้องมากกว่า 0`);
    if (!it.unit.trim()) errs.push(`รายการที่ ${i + 1} ยังไม่ได้เลือกหน่วย`);
  });
  return errs;
}

export function totalUnits(items: RequisitionItem[]): number {
  return items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
}

/** บันทึกใบเบิก (ร่าง/จริง) ลงตาราง school_requisitions เดิม */
export async function saveDeskRequisition(p: DeskSavePayload): Promise<DeskSaveResult> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อนบันทึกใบเบิก");

  const row: Record<string, unknown> = {
    user_id: uid,
    req_number: p.reqNumber,
    customer_id: p.customer.id,
    line_user_id: p.customer.lineUserId,
    school_name: p.customer.name,
    project_name: "",
    prepared_by: sess.session?.user?.email ?? "",
    doc_date: new Date().toISOString().slice(0, 10),
    want_date: p.wantDate || null,
    receive_method: p.receiveMethod,
    status: p.status,
    items: p.items,
    total: 0,
    note: p.note || null,
    source_files: p.sourceFiles,
    submitted_at: p.status === "submitted" ? new Date().toISOString() : null,
  };

  const q = p.id
    ? db.from("school_requisitions").update(row).eq("id", p.id).select("id, req_number, status").single()
    : db.from("school_requisitions").insert(row).select("id, req_number, status").single();
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // ไฟล์ต้นฉบับที่ใช้สร้างใบเบิก → อัปเดตสถานะงานจาก "ใหม่" เป็น "กำลังตรวจ"
  if (p.status === "submitted" && p.sourceFiles.length) {
    await db
      .from("customer_excel_intakes")
      .update({ status: "reviewing", converted_to: "requisition", converted_id: data.id, converted_at: new Date().toISOString() })
      .in("id", p.sourceFiles.map((f) => f.id));
  }

  return { id: String(data.id), reqNumber: String(data.req_number ?? p.reqNumber), status: p.status };
}
