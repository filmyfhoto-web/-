/**
 * "งานและเอกสาร" — flow เดียวของระบบรับงานลูกค้า
 *
 *   ลูกค้าส่งรายการ → ร้านกดยืนยันรับ → ร้านแนบใบส่งของ PDF → ส่งไฟล์กลับทาง LINE
 *
 * ใช้ตารางเดิมทั้งหมด ไม่สร้างระบบใหม่:
 *  - คำสั่งซื้อ   : public.customer_purchase_orders + public.orders
 *  - ใบเขียนเบิก  : public.school_requisitions
 *  - ไฟล์ลูกค้า   : public.customer_excel_intakes (+ attachments / source_files)
 *  - แจ้งเตือน    : edge function `send-work-doc-notify` (ห้ามเรียก LINE API จากหน้าเว็บ)
 */
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

/**
 * ชนิดงาน — ต่างกันแค่ "มาจากตารางไหน" ไม่ใช่คนละระบบ
 *  - web_order   : คำสั่งซื้อจากเว็บลูกค้า (public.orders + order_items)
 *  - order       : ใบสั่งซื้อลูกค้า (public.customer_purchase_orders)
 *  - requisition : ใบเขียนเบิก (public.school_requisitions)
 */
export type WorkKind = "web_order" | "order" | "requisition";
export type WorkTab = "pending" | "sent";
export type WorkFilter = "all" | "order" | "requisition";

export const KIND_LABEL: Record<WorkKind, string> = {
  web_order: "คำสั่งซื้อ",
  order: "คำสั่งซื้อ",
  requisition: "ใบเขียนเบิก",
};

/** ใบเขียนเบิกเป็นป้ายกำกับของงานคนละตาราง — ที่เหลือถือเป็นคำสั่งซื้อทั้งหมด */
export const isOrderKind = (kind: WorkKind) => kind !== "requisition";

/** ชนิดงาน → ตัวกรองบนหน้าเว็บ (ใช้กับลิงก์ "เปิดงาน") */
export const filterOfKind = (kind: WorkKind): WorkFilter =>
  kind === "requisition" ? "requisition" : "order";





export const DELIVERY_BUCKET = "invoice-attachments";
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

export interface WorkFile {
  id: string;
  name: string;
  sizeBytes: number;
  bucket: string | null;
  path: string | null;
  url?: string | null;
}

export interface DeliveryFile {
  name: string;
  bucket: string;
  path: string;
  sizeBytes: number;
  uploadedAt: string;
}

/** รหัสจำลอง "guest:<uuid>" ของลูกค้าที่ยังไม่ผูก LINE ไม่ถือว่าเป็นการจับคู่จริง */
const realLineId = (v: unknown): string | null => {
  const s = v ? String(v) : "";
  return s && !s.startsWith("guest:") ? s : null;
};

export interface WorkItem {
  kind: WorkKind;
  id: string;
  code: string;
  customerName: string;
  org: string;
  phone: string;
  source: string;
  lineUserId: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  deliveryFile: DeliveryFile | null;
  deliverySentAt: string | null;
  /** ใบเสนอราคาที่ร้านสร้างจากตาราง "ยืนยันและแก้ราคา" */
  quoteFile: DeliveryFile | null;
  quoteSentAt: string | null;
  pricedAt: string | null;
  /** สถานะดิบจากตารางต้นทาง (ใช้กับชิปเปลี่ยนสถานะเร็ว) */
  status: string;
  files: WorkFile[];

}


/* ----------------------------------------------------------------- helpers */

export const isAcknowledged = (i: WorkItem) => Boolean(i.acknowledgedAt);
export const isSent = (i: WorkItem) => Boolean(i.deliverySentAt);
export const tabOf = (i: WorkItem): WorkTab => (isSent(i) ? "sent" : "pending");
export const statusLabel = (i: WorkItem) => (isAcknowledged(i) ? "รับเรื่องแล้ว" : "ยังไม่ยืนยัน");

/** งานที่ต้องดำเนินการ = รับเรื่องแล้วแต่ยังไม่ได้ส่งใบส่งของ */
export const needsAction = (i: WorkItem) => isAcknowledged(i) && !isSent(i);

export function fmtSize(bytes: number): string {
  if (!bytes) return "-";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function fmtWhen(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `วันนี้ ${time}`;
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${time}`;
}

export function thaiToday(): string {
  const d = new Date();
  return `${d.getDate()} ${d.toLocaleDateString("th-TH", { month: "long" })} ${d.getFullYear() + 543}`;
}

export const isToday = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
};

export function matchesSearch(i: WorkItem, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [i.customerName, i.org, i.code, i.phone].some((v) => String(v || "").toLowerCase().includes(t));
}

/** ตัวกรองบนหน้าเว็บ: ทั้งหมด / คำสั่งซื้อ (เว็บ+ใบสั่งซื้อ) / ใบเขียนเบิก */
export function matchesFilter(i: WorkItem, filter: WorkFilter): boolean {
  if (filter === "all") return true;
  return filterOfKind(i.kind) === filter;
}





function toFiles(raw: unknown): WorkFile[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any, idx: number) => ({
    id: String(r?.id ?? r?.path ?? `f${idx}`),
    name: String(r?.name ?? r?.filename ?? "ไฟล์แนบ"),
    sizeBytes: Number(r?.sizeBytes ?? r?.size ?? r?.file_size ?? 0) || 0,
    bucket: r?.bucket ?? r?.storage_bucket ?? null,
    path: r?.path ?? r?.storage_path ?? null,
  }));
}

function toDeliveryFile(raw: unknown): DeliveryFile | null {
  const r = raw as any;
  if (!r || typeof r !== "object" || !r.bucket || !r.path) return null;
  return {
    name: String(r.name || "ใบส่งของ.pdf"),
    bucket: String(r.bucket),
    path: String(r.path),
    sizeBytes: Number(r.sizeBytes ?? 0) || 0,
    uploadedAt: String(r.uploadedAt || ""),
  };
}

const TABLE: Record<WorkKind, string> = {
  web_order: "orders",
  order: "customer_purchase_orders",
  requisition: "school_requisitions",
};



/* ------------------------------------------------------------------- reads */

/** ชื่อ/เบอร์ของออเดอร์เว็บ — เก็บกระจายหลายที่ตามช่องทางที่ลูกค้าเข้ามา */
function webOrderContact(r: any): { name: string; phone: string; org: string } {
  const snap = (r?.customer_snapshot ?? {}) as Record<string, unknown>;
  const name = String(r?.guest_name || snap.name || "").trim();
  const phone = String(r?.guest_phone || snap.phone || "").trim();
  const org = String(r?.school_name || snap.school || "").trim();
  return { name: name || org || "(ไม่ระบุชื่อ)", phone, org };
}

export async function listWorkItems(limit = 200): Promise<WorkItem[]> {
  const QUOTE_COLS = "quote_file, quote_sent_at, priced_at";
  const [webOrders, orders, reqs] = await Promise.all([
    db.from("orders")
      .select(`id, order_no, guest_name, guest_phone, school_name, customer_snapshot, source, doc_intent, line_user_id, created_at, acknowledged_at, delivery_note_file, delivery_note_sent_at, deleted_at, status, ${QUOTE_COLS}`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(limit),
    db.from("customer_purchase_orders")
      .select(`id, po_number, customer_name, school_or_org, customer_phone, source, line_user_id, created_at, acknowledged_at, delivery_note_file, delivery_note_sent_at, attachments, status, ${QUOTE_COLS}`)
      .order("created_at", { ascending: false }).limit(limit),
    db.from("school_requisitions")
      .select(`id, req_number, school_name, project_name, prepared_by, line_user_id, created_at, submitted_at, acknowledged_at, delivery_note_file, delivery_note_sent_at, source_files, attachments, status, ${QUOTE_COLS}`)
      .order("created_at", { ascending: false }).limit(limit),
  ]);

  if (webOrders.error) throw new Error(webOrders.error.message);
  if (orders.error) throw new Error(orders.error.message);
  if (reqs.error) throw new Error(reqs.error.message);


  /** ฟิลด์ใบเสนอราคาที่ทั้ง 3 ตารางมีเหมือนกัน */
  const quoteFields = (r: any) => ({
    quoteFile: toDeliveryFile(r.quote_file),
    quoteSentAt: r.quote_sent_at ? String(r.quote_sent_at) : null,
    pricedAt: r.priced_at ? String(r.priced_at) : null,
  });

  const items: WorkItem[] = [
    ...((webOrders.data ?? []) as any[]).map((r) => {
      const c = webOrderContact(r);
      return {
        kind: "web_order" as WorkKind,
        id: String(r.id),
        code: String(r.order_no || "-"),
        customerName: c.name,
        org: c.org,
        phone: c.phone,
        source: r.doc_intent === "quote"
          ? "ขอใบราคา (จากตะกร้า)"
          : String(r.source || "เว็บแอปลูกค้า"),
        lineUserId: realLineId(r.line_user_id),
        createdAt: String(r.created_at || ""),
        acknowledgedAt: r.acknowledged_at ? String(r.acknowledged_at) : null,
        deliveryFile: toDeliveryFile(r.delivery_note_file),
        deliverySentAt: r.delivery_note_sent_at ? String(r.delivery_note_sent_at) : null,
        ...quoteFields(r),
        status: String(r.status || ""),
        files: [],
      };
    }),
    ...((orders.data ?? []) as any[]).map((r) => ({
      kind: "order" as WorkKind,
      id: String(r.id),
      code: String(r.po_number || "-"),
      customerName: String(r.customer_name || r.school_or_org || "(ไม่ระบุชื่อ)"),
      org: String(r.school_or_org || ""),
      phone: String(r.customer_phone || ""),
      source: String(r.source || "เว็บไซต์"),
      lineUserId: realLineId(r.line_user_id),
      createdAt: String(r.created_at || ""),
      acknowledgedAt: r.acknowledged_at ? String(r.acknowledged_at) : null,
      deliveryFile: toDeliveryFile(r.delivery_note_file),
      deliverySentAt: r.delivery_note_sent_at ? String(r.delivery_note_sent_at) : null,
      ...quoteFields(r),
      status: String(r.status || ""),
      files: toFiles(r.attachments),
    })),
    ...((reqs.data ?? []) as any[]).map((r) => ({
      kind: "requisition" as WorkKind,
      id: String(r.id),
      code: String(r.req_number || "-"),
      customerName: String(r.school_name || r.prepared_by || "(ไม่ระบุชื่อ)"),
      org: String(r.school_name || ""),
      phone: "",
      source: String(r.project_name || "ใบเขียนเบิก"),
      lineUserId: realLineId(r.line_user_id),
      createdAt: String(r.created_at || r.submitted_at || ""),
      acknowledgedAt: r.acknowledged_at ? String(r.acknowledged_at) : null,
      deliveryFile: toDeliveryFile(r.delivery_note_file),
      deliverySentAt: r.delivery_note_sent_at ? String(r.delivery_note_sent_at) : null,
      ...quoteFields(r),
      status: String(r.status || ""),
      files: [...toFiles(r.source_files), ...toFiles(r.attachments)],
    })),
  ];
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}


/** จำนวนงานที่ยังไม่ได้รับทราบสำหรับ badge เมนู — ใช้เงื่อนไขเดียวกับ listWorkItems */
export async function countPendingWorkItems(): Promise<number> {
  // ไม่มีเซสชัน (หมดอายุ/ยังไม่ล็อกอิน) → ห้ามยิง query แบบ anon
  // ตารางเหล่านี้ REVOKE สิทธิ์ anon ไว้ จึงตอบ permission denied รัวๆ ใน log
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return 0;
  const [webOrders, orders, reqs] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).is("deleted_at", null).is("acknowledged_at", null),
    db.from("customer_purchase_orders").select("id", { count: "exact", head: true }).is("acknowledged_at", null),
    db.from("school_requisitions").select("id", { count: "exact", head: true }).is("acknowledged_at", null),
  ]);
  if (webOrders.error) throw new Error(webOrders.error.message);
  if (orders.error) throw new Error(orders.error.message);
  if (reqs.error) throw new Error(reqs.error.message);
  return (webOrders.count ?? 0) + (orders.count ?? 0) + (reqs.count ?? 0);
}




/** ไฟล์ต้นฉบับของลูกค้า + ลิงก์ดู/ดาวน์โหลดจริง */

export async function loadWorkFiles(item: WorkItem): Promise<WorkFile[]> {
  const files = [...item.files];
  const digits = (item.phone || "").replace(/\D/g, "");
  if (item.kind === "requisition") {
    await Promise.all(files.map(async (f) => {
      if (!f.url && f.bucket && f.path) f.url = await signFile(f.bucket, f.path);
    }));
    return files;
  }
  if (digits) {
    const known = new Set(files.map((f) => f.path || f.id));
    const { data } = await db
      .from("customer_excel_intakes")
      .select("id, filename, file_size, storage_bucket, storage_path, phone")
      .order("submitted_at", { ascending: false })
      .limit(100);
    for (const r of ((data ?? []) as any[])) {
      if (String(r.phone || "").replace(/\D/g, "") !== digits) continue;
      if (known.has(String(r.storage_path || r.id))) continue;
      files.push({
        id: String(r.id),
        name: String(r.filename || "ไฟล์แนบ"),
        sizeBytes: Number(r.file_size || 0),
        bucket: r.storage_bucket ? String(r.storage_bucket) : null,
        path: r.storage_path ? String(r.storage_path) : null,
      });
    }
  }
  await Promise.all(files.map(async (f) => {
    if (!f.url && f.bucket && f.path) f.url = await signFile(f.bucket, f.path);
  }));
  return files;
}


export async function signFile(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await (supabase as any).storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/* ------------------------------------------------------------------ writes */

async function actorName(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.email || data.user?.id || "staff";
  } catch {
    return "staff";
  }
}

export interface NotifyResult { ok: boolean; status: string; error?: string }

async function notify(item: WorkItem, action: "received_ack" | "delivery_note", force = false): Promise<NotifyResult> {
  const { data, error } = await (supabase as any).functions.invoke("send-work-doc-notify", {
    body: { kind: item.kind, id: item.id, action, force },
  });
  if (error) return { ok: false, status: "failed", error: error.message };
  return { ok: Boolean(data?.ok), status: String(data?.status || "failed"), error: data?.error };
}

/**
 * 1. ยืนยันว่าได้รับรายการแล้ว — บันทึกก่อน แล้วจึงส่งข้อความ
 * idempotent: กดซ้ำ/refresh จะไม่ส่งข้อความซ้ำ (edge function กันด้วย log)
 */
export async function acknowledgeItem(item: WorkItem): Promise<NotifyResult> {
  if (!item.acknowledgedAt) {
    const { error } = await db.from(TABLE[item.kind]).update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: await actorName(),
    }).eq("id", item.id);
    if (error) throw new Error(error.message);
  }
  if (!item.lineUserId) return { ok: false, status: "failed", error: "no_line_link" };
  return notify(item, "received_ack");
}

/** ส่งข้อความยืนยันรับรายการอีกครั้งเมื่อครั้งก่อนล้มเหลว */
export const resendAck = (item: WorkItem) => notify(item, "received_ack", true);

/**
 * มาร์คแจ้งเตือน "คำสั่งซื้อใหม่" ของงานนี้ว่าอ่านแล้ว เพื่อให้ตัวเลขบนกระดิ่ง
 * (notifications type=new_order) ตรงกับงานที่รับเรื่องไปแล้วจริง
 * — ไม่เปลี่ยนสคีมา ไม่แตะฝั่งที่เขียนแจ้งเตือน
 */
export async function markOrderNotificationsRead(refId: string): Promise<void> {
  await db.from("notifications").update({ read: true })
    .eq("for_staff", true).eq("type", "new_order").eq("ref_id", refId).eq("read", false);
}


function safeName(name: string): string {
  return name.replace(/[^\w.\-ก-๙]+/g, "_").slice(-80);
}

/** แนบใบส่งของ (PDF เท่านั้น) — เก็บใน storage เดิมและผูกกับรายการจริง */
export async function uploadDeliveryNote(item: WorkItem, file: File): Promise<DeliveryFile> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) throw new Error("รับเฉพาะไฟล์ PDF เท่านั้น");
  if (file.size > MAX_PDF_BYTES) throw new Error(`ไฟล์ใหญ่เกิน ${fmtSize(MAX_PDF_BYTES)}`);
  const path = `work-docs/${item.kind}/${item.id}/${Date.now()}-${safeName(file.name)}`;
  const { error: upErr } = await (supabase as any).storage
    .from(DELIVERY_BUCKET)
    .upload(path, file, { upsert: false, contentType: "application/pdf" });
  if (upErr) throw new Error(upErr.message);
  const meta: DeliveryFile = {
    name: file.name, bucket: DELIVERY_BUCKET, path,
    sizeBytes: file.size, uploadedAt: new Date().toISOString(),
  };
  const { error } = await db.from(TABLE[item.kind]).update({ delivery_note_file: meta }).eq("id", item.id);
  if (error) throw new Error(error.message);
  return meta;
}

/** 2. ส่งใบส่งของกลับลูกค้า — ส่งข้อความพร้อมลิงก์ PDF ผ่านหลังบ้าน */
export async function sendDeliveryNote(item: WorkItem, force = false): Promise<NotifyResult> {
  if (!item.deliveryFile) throw new Error("ยังไม่ได้แนบไฟล์ใบส่งของ");
  const res = await notify(item, "delivery_note", force);
  if (res.ok) {
    await db.from(TABLE[item.kind]).update({
      delivery_note_sent_at: new Date().toISOString(),
      delivery_note_sent_by: await actorName(),
    }).eq("id", item.id);
  }
  return res;
}

/* ------------------------------------------------- สถานะ / ลบ / ส่งออก CSV */

/**
 * ตาราง orders ใช้ enum `order_status` ส่วนอีก 2 ตารางเก็บสถานะเป็นข้อความ
 * จึงแปลงคีย์กลาง (ORDER_FLOW ของหน้าเดิม) ไป-กลับให้ตรงกับข้อมูลจริง
 */
const WEB_ORDER_TO_ENUM: Record<string, string> = {
  submitted: "pending_quote",
  quoted: "quoted",
  pending: "pending_quote",
  preparing: "approved",
  ready: "ready",
  completed: "completed",
};

const ENUM_TO_FLOW: Record<string, string> = {
  pending_quote: "submitted",
  quoted: "quoted",
  approved: "preparing",
  picking: "preparing",
  ready: "ready",
  completed: "completed",
  cancelled: "cancelled",
};

/** สถานะดิบ → คีย์กลางที่ชิปใช้เทียบว่าอันไหน active */
export function workStatusKey(item: WorkItem): string {
  const s = String(item.status || "").toLowerCase();
  if (!s) return "";
  if (item.kind === "web_order") return ENUM_TO_FLOW[s] ?? s;
  if (item.kind === "requisition") {
    if (s === "draft") return "submitted";
    if (s === "completed" || s === "delivered") return "completed";
    return s === "submitted" || s === "review" ? "submitted" : s;
  }
  if (s === "draft" || s === "review") return "submitted";
  return ENUM_TO_FLOW[s] ?? s;
}


/** เปลี่ยนสถานะเร็วจากชิปในหน้า "งานและเอกสาร" (ใช้คอลัมน์ status เดิมของแต่ละตาราง) */
export async function setWorkStatus(item: WorkItem, key: string): Promise<void> {
  const value = item.kind === "web_order" ? (WEB_ORDER_TO_ENUM[key] ?? key) : key;
  const { error } = await db.from(TABLE[item.kind]).update({ status: value }).eq("id", item.id);
  if (error) throw new Error(error.message);
}

/**
 * ลบรายการงาน (หน้าเว็บยืนยันก่อนเสมอ)
 *  - ออเดอร์เว็บ  : soft delete (deleted_at) เพื่อไม่ให้ประวัติลูกค้าหาย
 *  - ใบเขียนเบิก  : ลบ log ที่อ้างถึงก่อน แล้วจึงลบแถวจริง
 *  - ใบสั่งซื้อ    : ลบ review event ที่อ้างถึงก่อน แล้วจึงลบแถวจริง
 */
export async function deleteWorkItem(item: WorkItem): Promise<void> {
  if (item.kind === "web_order") {
    const { error } = await db.from("orders").update({ deleted_at: new Date().toISOString() }).eq("id", item.id);
    if (error) throw new Error(error.message);
    return;
  }
  if (item.kind === "requisition") {
    await db.from("school_requisition_logs").delete().eq("requisition_id", item.id);
    const { error } = await db.from("school_requisitions").delete().eq("id", item.id);
    if (error) throw new Error(error.message);
    return;
  }
  await db.from("customer_po_review_events").delete().eq("po_id", item.id);
  const { error } = await db.from("customer_purchase_orders").delete().eq("id", item.id);
  if (error) throw new Error(error.message);
}


/** แถวสำหรับส่งออก CSV ของรายการที่กรองอยู่ (ใช้ downloadCsv เดิม) */
export function workItemsToCsvRows(items: WorkItem[]): Record<string, string>[] {
  return items.map((i) => ({
    ประเภท: KIND_LABEL[i.kind],
    เลขที่: i.code,
    ชื่อลูกค้า: i.customerName || "-",
    "โรงเรียน/หน่วยงาน": i.org || "-",
    เบอร์โทร: i.phone || "-",
    แหล่งที่มา: i.source || "-",
    สถานะ: isSent(i) ? "ส่งกลับแล้ว" : statusLabel(i),
    สถานะงาน: workStatusKey(i) || "-",
    LINE: i.lineUserId ? "จับคู่แล้ว" : "รอจับคู่",
    วันที่รับเรื่อง: i.acknowledgedAt || "-",
    วันที่ส่งกลับ: i.deliverySentAt || "-",
    สร้างเมื่อ: i.createdAt || "-",
  }));
}

/* ------------------------------------------------------------------ counts */

export interface TodayCounts {
  newOrders: number;
  requisitions: number;
  linePending: number;
  todo: number;
}

export function countToday(items: WorkItem[]): TodayCounts {
  return {
    newOrders: items.filter((i) => isOrderKind(i.kind) && !isAcknowledged(i)).length,
    requisitions: items.filter((i) => i.kind === "requisition" && !isAcknowledged(i)).length,
    linePending: items.filter((i) => !i.lineUserId && !isSent(i)).length,
    todo: items.filter(needsAction).length,
  };
}

/** ลิงก์ไปหน้า "งานและเอกสาร" พร้อมตัวกรองที่ต้องการ */
export function workDocsTo(opts: { filter?: WorkFilter; tab?: WorkTab; todo?: boolean; id?: string; kind?: WorkKind } = {}): string {
  const q = new URLSearchParams();
  if (opts.filter && opts.filter !== "all") q.set("filter", opts.filter);
  if (opts.tab) q.set("tab", opts.tab);
  if (opts.todo) q.set("todo", "1");
  if (opts.id) q.set("id", opts.id);
  if (opts.kind) q.set("kind", opts.kind);
  const s = q.toString();
  return s ? `/admin/work-docs?${s}` : "/admin/work-docs";
}


/* ------------------------------------- คำแนะนำ "ข้อความ LINE น่าจะเป็นรายการสั่งของ" */

/**
 * อ่านข้อความขาเข้าจากกล่องข้อความ LINE (public.film_messages + film_conversations)
 * แบบอ่านอย่างเดียว แล้วให้ `detectChatOrder` ตัดสินว่าน่าจะเป็นรายการสั่งของไหม
 *
 * หมายเหตุ: ตารางกล่องข้อความอยู่ในโมดูล Film Shop — ถ้าอนาคตย้าย/เปลี่ยนชื่อ ต้องแก้ที่นี่จุดเดียว
 * ไม่แตะ webhook, ไม่แตะสถานะอ่าน/ยังไม่อ่าน และไม่แจ้งเตือนซ้ำเข้ากลุ่ม LINE
 */
export interface ChatOrderHint {
  messageId: string;
  conversationId: string;
  customerName: string;
  lineUserId: string | null;
  text: string;
  createdAt: string;
  itemCount: number;
  confidence: number;
  items: import("@/lib/chatOrderDetect").ChatOrderLine[];
}

export async function listChatOrderHints(days = 14, max = 200): Promise<ChatOrderHint[]> {
  const { detectChatOrder } = await import("@/lib/chatOrderDetect");
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data: msgs, error } = await db
    .from("film_messages")
    .select("id, conversation_id, text, created_at")
    .eq("direction", "inbound")
    .not("text", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(max);
  if (error) throw new Error(error.message);

  const candidates: { row: any; det: ReturnType<typeof detectChatOrder> }[] = [];
  for (const row of ((msgs ?? []) as any[])) {
    const det = detectChatOrder(String(row.text || ""));
    if (det.looksLikeOrder) candidates.push({ row, det });
  }
  if (!candidates.length) return [];

  const msgIds = candidates.map((c) => String(c.row.id));
  const convIds = [...new Set(candidates.map((c) => String(c.row.conversation_id)).filter(Boolean))];

  const [{ data: hints }, { data: convs }] = await Promise.all([
    db.from("line_order_hints").select("message_id").in("message_id", msgIds),
    convIds.length
      ? db.from("film_conversations").select("id, display_name, external_user_id").in("id", convIds)
      : Promise.resolve({ data: [] }),
  ]);

  const handled = new Set(((hints ?? []) as any[]).map((h) => String(h.message_id)));
  const convMap = new Map(((convs ?? []) as any[]).map((c) => [String(c.id), c]));

  return candidates
    .filter((c) => !handled.has(String(c.row.id)))
    .map(({ row, det }) => {
      const conv = convMap.get(String(row.conversation_id));
      return {
        messageId: String(row.id),
        conversationId: String(row.conversation_id ?? ""),
        customerName: String(conv?.display_name || "ลูกค้า LINE"),
        lineUserId: realLineId(conv?.external_user_id),
        text: String(row.text || ""),
        createdAt: String(row.created_at || ""),
        itemCount: det.lines.length,
        confidence: det.confidence,
        items: det.lines,
      };
    });
}

/** บันทึกว่าแอดมิน "ข้าม" หรือ "สร้างงานแล้ว" จากข้อความนี้ (กันการ์ดเด้งซ้ำ) */
export async function markChatOrderHint(
  hint: Pick<ChatOrderHint, "messageId" | "conversationId">,
  state: "dismissed" | "converted",
  converted?: { to: string; id: string },
): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  await db.from("line_order_hints").upsert({
    message_id: hint.messageId,
    conversation_id: hint.conversationId || null,
    state,
    converted_to: converted?.to ?? null,
    converted_id: converted?.id ?? null,
    acted_by: sess.session?.user?.id ?? null,
  }, { onConflict: "message_id" });
}
