/**
 * Service layer สำหรับหน้า "จัดการคำสั่งซื้อ" (/admin/order-desk)
 *
 * ใช้ตารางเดิมของระบบทั้งหมด — ไม่สร้างระบบลูกค้า/คำสั่งซื้อชุดใหม่
 *  - รายการคำสั่งซื้อ : public.customer_purchase_orders
 *  - ไฟล์ที่ลูกค้าส่ง : public.customer_excel_intakes (จับคู่ด้วยเบอร์/ผู้ใช้)
 *  - สถานะ LINE      : customer_purchase_orders.line_user_id
 *
 * ส่วนที่ยังไม่มีคอลัมน์จริงในฐานข้อมูล (กำหนดส่ง / วิธีรับงาน) เก็บชั่วคราวใน
 * localStorage และรวมจุดเชื่อมต่อไว้ที่ `loadDelivery` / `saveDelivery`
 * เพื่อให้ย้ายไป DB ได้ในที่เดียว
 */
import { supabase } from "@/integrations/supabase/client";
import { type CpoItem, type CpoReviewStatus } from "@/lib/customerPoTotals";

const db = supabase as any;

export type DeskTab = "new" | "checking" | "pricing" | "done";

export const DESK_TABS: Array<{ key: DeskTab; label: string }> = [
  { key: "new", label: "ใหม่" },
  { key: "checking", label: "กำลังตรวจ" },
  { key: "pricing", label: "รอราคา" },
  { key: "done", label: "เสร็จแล้ว" },
];

export const DESK_TAB_TONE: Record<DeskTab, { text: string; bg: string; border: string }> = {
  new: { text: "#5B258B", bg: "#F6F0FA", border: "#D9C4EA" },
  checking: { text: "#1D6FD0", bg: "#EAF3FD", border: "#C2DCF7" },
  pricing: { text: "#B26A00", bg: "#FDF3E3", border: "#F0D5A8" },
  done: { text: "#1B7F4B", bg: "#E9F7EF", border: "#BFE6CE" },
};

export function tabOf(review: string): DeskTab {
  if (review === "documented") return "done";
  if (review === "confirmed" || review === "revision_requested") return "pricing";
  if (review === "awaiting_customer") return "checking";
  return "new";
}

/** ขั้นตอนการทำงานในหน้าโต๊ะจัดการ (เก็บจริงในคอลัมน์ desk_stage) */
export type DeskStage = "files" | "items" | "totals" | "saved";
export const DESK_STAGES: DeskStage[] = ["files", "items", "totals", "saved"];
export const STAGE_LABELS: Record<DeskStage, string> = {
  files: "ตรวจไฟล์", items: "สร้างรายการ", totals: "ตรวจยอด", saved: "บันทึก",
};
const STAGE_TAB: Record<DeskStage, DeskTab> = {
  files: "new", items: "checking", totals: "pricing", saved: "done",
};

/** แท็บทางซ้าย: ใช้สถานะรีวิวจริงก่อน ถ้ายังไม่ส่งให้ดูจากขั้นตอนที่ทำถึง */
export function tabOfOrder(o: { reviewStatus: string; stage?: DeskStage }): DeskTab {
  if (o.reviewStatus && o.reviewStatus !== "not_sent") return tabOf(o.reviewStatus);
  return STAGE_TAB[o.stage ?? "files"];
}

export type DeskFileKind = "excel" | "pdf" | "image" | "word" | "other";

export interface DeskFile {
  id: string;
  name: string;
  kind: DeskFileKind;
  sizeBytes: number;
  pages?: number;
  /** URL สำหรับดูตัวอย่าง (อาจว่างถ้ายังไม่มีไฟล์จริง) */
  url?: string;
  /** รายการที่อ่านได้จากไฟล์ ใช้ตอน "สร้างรายการจากไฟล์ที่เลือก" */
  items?: CpoItem[];
  /** ที่เก็บไฟล์จริง (ใช้ทำลิงก์ดู/ดาวน์โหลด) */
  bucket?: string | null;
  path?: string | null;
  /** มาจากไฟล์ที่ลูกค้าส่งเข้าระบบ (customer_excel_intakes) */
  intakeId?: string | null;
}

export interface DeskOrder {
  id: string;
  poNumber: string;
  customerId: string;
  customerName: string;
  org: string;
  phone: string;
  lineUserId: string | null;
  lineName: string | null;
  reviewStatus: CpoReviewStatus;
  createdAt: string;
  items: CpoItem[];
  note: string;
  vatEnabled: boolean;
  vatRate: number;
  dueDate: string;
  receiveMethod: string;
  deliveryNote: string;
  stage: DeskStage;
  attachments: DeskFile[];
  /** true = ข้อมูลตัวอย่าง (ยังไม่มีคำสั่งซื้อจริงในระบบ) */
  demo?: boolean;
}

export interface DeliveryInfo {
  dueDate: string;
  method: string;
  note: string;
}

export const RECEIVE_METHODS = ["รับที่ร้าน", "จัดส่ง", "ให้ร้านนำส่ง", "นัดรับภายหลัง"];
export const UNIT_OPTIONS = ["แผ่น", "ชิ้น", "เล่ม", "ชุด", "หน้า", "กล่อง", "งาน"];

const CPO_COLUMNS = [
  "id", "po_number", "user_id", "customer_name", "customer_phone", "school_or_org",
  "items", "note", "review_status", "vat_enabled", "vat_rate", "created_at", "line_user_id",
  "due_date", "receive_method", "delivery_note", "desk_stage", "attachments",
].join(", ");

function toItems(raw: unknown): CpoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any, i: number) => ({
    key: String(r?.key ?? `i${i}`),
    name: String(r?.name ?? ""),
    quantity: Number(r?.quantity ?? 0) || 0,
    unit: String(r?.unit ?? "ชิ้น"),
    price: Number(r?.price ?? 0) || 0,
    discount: Number(r?.discount ?? 0) || 0,
  }));
}

export function shortCustomerId(order: Pick<DeskOrder, "customerId" | "id">): string {
  const raw = (order.customerId || order.id || "").replace(/\D/g, "");
  const tail = raw.slice(-5) || "00000";
  return `CUS-${tail.padStart(5, "0")}`;
}

/** ------------------------------------------------------------------ mock */

const MOCK_DEFAULTS = { dueDate: "", receiveMethod: RECEIVE_METHODS[0], deliveryNote: "", stage: "files" as DeskStage, attachments: [] as DeskFile[] };

const MOCK_ORDERS: DeskOrder[] = ([

  {
    id: "demo-1", poNumber: "PO-DEMO-0127", customerId: "127",
    customerName: "โรงเรียนบ้านน้ำรีพัฒนา", org: "โรงเรียนบ้านน้ำรีพัฒนา",
    phone: "081-234-5678", lineUserId: "U-demo-1", lineName: "@baanamree",
    reviewStatus: "not_sent", createdAt: new Date().toISOString(),
    note: "", vatEnabled: true, vatRate: 7,
    items: [
      { key: "d1", name: "ถ่ายเอกสาร A4 ขาวดำ", quantity: 500, unit: "แผ่น", price: 1, discount: 0 },
      { key: "d2", name: "ปริ้นสี A4", quantity: 200, unit: "แผ่น", price: 12, discount: 0 },
      { key: "d3", name: "เข้าเล่มสันห่วง", quantity: 20, unit: "เล่ม", price: 60, discount: 0 },
      { key: "d4", name: "แพ็กใส่ซอง", quantity: 1, unit: "ชุด", price: 1900, discount: 0 },
    ],
    demo: true,
  },
  {
    id: "demo-2", poNumber: "PO-DEMO-0126", customerId: "126",
    customerName: "บริษัท แสงทอง จำกัด", org: "บริษัท แสงทอง จำกัด",
    phone: "082-111-2233", lineUserId: null, lineName: null,
    reviewStatus: "awaiting_customer", createdAt: new Date(Date.now() - 7_200_000).toISOString(),
    note: "", vatEnabled: true, vatRate: 7,
    items: [{ key: "d1", name: "นามบัตร 4 สี", quantity: 10, unit: "กล่อง", price: 250, discount: 0 }],
    demo: true,
  },
  {
    id: "demo-3", poNumber: "PO-DEMO-0125", customerId: "125",
    customerName: "โรงเรียนบ้านหนองบัว", org: "โรงเรียนบ้านหนองบัว",
    phone: "083-555-7788", lineUserId: "U-demo-3", lineName: "@nongbua",
    reviewStatus: "confirmed", createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    note: "", vatEnabled: true, vatRate: 7,
    items: [{ key: "d1", name: "ไวนิลป้ายกิจกรรม", quantity: 2, unit: "งาน", price: 900, discount: 0 }],
    demo: true,
  },
  {
    id: "demo-4", poNumber: "PO-DEMO-0124", customerId: "124",
    customerName: "คุณสมชาย ใจดี", org: "", phone: "084-909-1122",
    lineUserId: "U-demo-4", lineName: "@somchai",
    reviewStatus: "documented", createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    note: "", vatEnabled: true, vatRate: 7,
    items: [{ key: "d1", name: "ถ่ายเอกสาร A4 ขาวดำ", quantity: 300, unit: "แผ่น", price: 1, discount: 0 }],
    demo: true,
  },
] as Array<Omit<DeskOrder, keyof typeof MOCK_DEFAULTS>>).map((o) => ({ ...MOCK_DEFAULTS, ...o }));

const MOCK_FILE_COUNT: Record<string, number> = { "demo-1": 19, "demo-2": 8, "demo-3": 6, "demo-4": 4 };

function mockFiles(orderId: string): DeskFile[] {
  const base: DeskFile[] = [
    {
      id: `${orderId}-f1`, name: "รายการสั่งซื้อ.xlsx", kind: "excel", sizeBytes: 28 * 1024,
      items: [
        { key: "x1", name: "ถ่ายเอกสาร A4 ขาวดำ", quantity: 500, unit: "แผ่น", price: 1, discount: 0 },
        { key: "x2", name: "ปริ้นสี A4", quantity: 200, unit: "แผ่น", price: 12, discount: 0 },
      ],
    },
    {
      id: `${orderId}-f2`, name: "ใบสั่งซื้อ.pdf", kind: "pdf", sizeBytes: 120 * 1024, pages: 2,
      items: [{ key: "p1", name: "เข้าเล่มสันห่วง", quantity: 20, unit: "เล่ม", price: 60, discount: 0 }],
    },
    {
      id: `${orderId}-f3`, name: "รูปเอกสาร_01.jpg", kind: "image", sizeBytes: Math.round(2.1 * 1024 * 1024),
      items: [{ key: "i1", name: "แพ็กใส่ซอง", quantity: 1, unit: "ชุด", price: 1900, discount: 0 }],
    },
    { id: `${orderId}-f4`, name: "รูปเอกสาร_02.jpg", kind: "image", sizeBytes: Math.round(1.8 * 1024 * 1024) },
  ];
  const total = MOCK_FILE_COUNT[orderId] ?? 4;
  const extra: DeskFile[] = [];
  for (let i = base.length; i < total; i++) {
    extra.push({
      id: `${orderId}-f${i + 1}`,
      name: `รูปเอกสาร_${String(i - 1).padStart(2, "0")}.jpg`,
      kind: "image",
      sizeBytes: 900 * 1024 + i * 40_000,
    });
  }
  return [...base, ...extra];
}

/** ------------------------------------------------------------------ reads */

export async function listDeskOrders(): Promise<DeskOrder[]> {
  const { data, error } = await db
    .from("customer_purchase_orders")
    .select(CPO_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  if (!rows.length) return MOCK_ORDERS;
  return rows.map((r) => ({
    id: String(r.id),
    poNumber: String(r.po_number || ""),
    customerId: String(r.user_id || r.id || ""),
    customerName: String(r.customer_name || r.school_or_org || "(ไม่ระบุชื่อ)"),
    org: String(r.school_or_org || ""),
    phone: String(r.customer_phone || ""),
    lineUserId: r.line_user_id ? String(r.line_user_id) : null,
    lineName: r.line_user_id ? `@${String(r.line_user_id).slice(-8)}` : null,
    reviewStatus: (r.review_status || "not_sent") as CpoReviewStatus,
    createdAt: String(r.created_at || new Date().toISOString()),
    items: toItems(r.items),
    note: String(r.note || ""),
    vatEnabled: Boolean(r.vat_enabled),
    vatRate: Number(r.vat_rate || 7),
    dueDate: r.due_date ? String(r.due_date).slice(0, 10) : "",
    receiveMethod: String(r.receive_method || RECEIVE_METHODS[0]),
    deliveryNote: String(r.delivery_note || ""),
    stage: (DESK_STAGES.includes(r.desk_stage) ? r.desk_stage : "files") as DeskStage,
    attachments: toAttachments(r.attachments),
  }));
}

const kindOf = (name: string, mime = ""): DeskFileKind => {
  const n = name.toLowerCase();
  if (/\.(xlsx|xls|csv)$/.test(n) || mime.includes("sheet")) return "excel";
  if (/\.pdf$/.test(n) || mime.includes("pdf")) return "pdf";
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(n) || mime.startsWith("image/")) return "image";
  if (/\.(doc|docx)$/.test(n) || mime.includes("word")) return "word";
  return "other";
};

export function toAttachments(raw: unknown): DeskFile[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any, i: number) => ({
    id: String(r?.id ?? `a${i}`),
    name: String(r?.name ?? "ไฟล์แนบ"),
    kind: kindOf(String(r?.name ?? ""), String(r?.mime ?? "")),
    sizeBytes: Number(r?.sizeBytes ?? r?.size ?? 0) || 0,
    bucket: r?.bucket ? String(r.bucket) : null,
    path: r?.path ? String(r.path) : null,
    intakeId: r?.intakeId ? String(r.intakeId) : null,
    items: toItems(r?.items),
  }));
}

/** รูปแบบที่เก็บลง customer_purchase_orders.attachments */
export function attachmentsToJson(files: DeskFile[]): unknown[] {
  return files.map((f) => ({
    id: f.id, name: f.name, sizeBytes: f.sizeBytes,
    bucket: f.bucket ?? null, path: f.path ?? null, intakeId: f.intakeId ?? null,
    items: f.items ?? [],
  }));
}

/**
 * ไฟล์ที่แสดงในหน้าโต๊ะจัดการ = ไฟล์ที่ผูกกับออเดอร์แล้ว (attachments)
 * รวมกับไฟล์ Excel/PDF ที่ลูกค้าเบอร์เดียวกันส่งเข้ามาแต่ยังไม่ได้ผูก
 */
export async function listDeskFiles(order: DeskOrder): Promise<DeskFile[]> {
  if (order.demo) return mockFiles(order.id);
  const bound = order.attachments ?? [];
  const boundKeys = new Set(bound.map((f) => f.intakeId || f.id));
  const digits = (order.phone || "").replace(/\D/g, "");
  let intakes: DeskFile[] = [];
  if (digits) {
    const { data } = await db
      .from("customer_excel_intakes")
      .select("id, filename, file_size, mime_type, items, storage_bucket, storage_path, phone")
      .order("submitted_at", { ascending: false })
      .limit(100);
    intakes = ((data ?? []) as any[])
      .filter((r) => String(r.phone || "").replace(/\D/g, "") === digits && !boundKeys.has(String(r.id)))
      .map((r) => ({
        id: String(r.id),
        name: String(r.filename || "ไฟล์แนบ"),
        kind: kindOf(String(r.filename || ""), String(r.mime_type || "")),
        sizeBytes: Number(r.file_size || 0),
        bucket: r.storage_bucket ? String(r.storage_bucket) : null,
        path: r.storage_path ? String(r.storage_path) : null,
        intakeId: String(r.id),
        items: toItems(r.items),
      }));
  }
  const all = [...bound, ...intakes];
  // ทำลิงก์ดู/ดาวน์โหลดจริงให้ไฟล์ที่มีที่เก็บ
  await Promise.all(all.map(async (f) => {
    if (!f.url && f.bucket && f.path) f.url = (await signDeskFile(f.bucket, f.path)) ?? undefined;
  }));
  return all;
}

export async function signDeskFile(bucket: string, path: string): Promise<string | null> {
  const { data } = await (supabase as any).storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** ------------------------------------------------------------- delivery db */

const dkey = (id: string) => `orderDesk.delivery.${id}`;

/** ค่าจริงจากฐานข้อมูล (ออเดอร์ตัวอย่างยังใช้ localStorage) */
export function loadDelivery(order: DeskOrder | string): DeliveryInfo {
  if (typeof order !== "string") {
    if (!order.demo) {
      return { dueDate: order.dueDate || "", method: order.receiveMethod || RECEIVE_METHODS[0], note: order.deliveryNote || "" };
    }
    order = order.id;
  }
  try {
    const raw = localStorage.getItem(dkey(order));
    if (raw) return { dueDate: "", method: RECEIVE_METHODS[0], note: "", ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { dueDate: "", method: RECEIVE_METHODS[0], note: "" };
}

export async function saveDelivery(order: DeskOrder | string, info: DeliveryInfo): Promise<void> {
  const id = typeof order === "string" ? order : order.id;
  const demo = typeof order === "string" ? id.startsWith("demo") || id.startsWith("local-") : !!order.demo;
  if (demo) {
    try { localStorage.setItem(dkey(id), JSON.stringify(info)); } catch { /* ignore */ }
    return;
  }
  const { error } = await db.from("customer_purchase_orders").update({
    due_date: info.dueDate || null,
    receive_method: info.method || null,
    delivery_note: info.note || null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** ------------------------------------------------------------ stage/history */

export interface DeskEvent { id: string; event: string; note: string; actor: string; createdAt: string }

export async function listDeskEvents(orderId: string): Promise<DeskEvent[]> {
  const { data } = await db
    .from("customer_po_review_events")
    .select("id, event, note, actor, created_at")
    .eq("po_id", orderId)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id), event: String(r.event || ""), note: String(r.note || ""),
    actor: String(r.actor || "staff"), createdAt: String(r.created_at || ""),
  }));
}

export async function logDeskEvent(order: DeskOrder, event: string, note: string): Promise<void> {
  if (order.demo) return;
  await db.from("customer_po_review_events").insert({ po_id: order.id, event, actor: "staff", note });
}

/** บันทึกขั้นตอนที่ทำถึง + เก็บประวัติของจุดนั้น */
export async function saveDeskStage(order: DeskOrder, stage: DeskStage, note?: string): Promise<void> {
  if (order.demo) return;
  const { error } = await db.from("customer_purchase_orders").update({ desk_stage: stage }).eq("id", order.id);
  if (error) throw new Error(error.message);
  await logDeskEvent(order, `stage_${stage}`, note || `เข้าสู่ขั้นตอน “${STAGE_LABELS[stage]}”`);
}

/** ----------------------------------------------------------------- writes */

export interface SavePayload {
  items: CpoItem[];
  subtotal: number;
  vat: number;
  net: number;
  note: string;
  vatEnabled: boolean;
  vatRate: number;
  delivery?: DeliveryInfo;
  attachments?: DeskFile[];
  stage?: DeskStage;
}

/** บันทึกร่าง — ไม่เปลี่ยนสถานะรีวิว แต่ผูกไฟล์/กำหนดส่ง/ขั้นตอนไว้ */
export async function saveDeskDraft(order: DeskOrder, p: SavePayload): Promise<void> {
  if (order.demo) return;
  const patch: Record<string, unknown> = {
    items: p.items, subtotal: p.subtotal, vat_enabled: p.vatEnabled, vat_rate: p.vatRate,
    vat_amount: p.vat, net_total: p.net, note: p.note,
  };
  if (p.delivery) {
    patch.due_date = p.delivery.dueDate || null;
    patch.receive_method = p.delivery.method || null;
    patch.delivery_note = p.delivery.note || null;
  }
  if (p.attachments) patch.attachments = attachmentsToJson(p.attachments);
  if (p.stage) patch.desk_stage = p.stage;
  const { error } = await db.from("customer_purchase_orders").update(patch).eq("id", order.id);
  if (error) throw new Error(error.message);
  await logDeskEvent(order, "draft_saved", `บันทึกร่าง ${p.items.length} รายการ · ไฟล์แนบ ${p.attachments?.length ?? 0} ไฟล์`);
}

/** บันทึกคำสั่งซื้อ — ยืนยันรายการ + ผูกไฟล์ + เก็บประวัติการแก้ไข */
export async function commitDeskOrder(order: DeskOrder, p: SavePayload): Promise<void> {
  if (order.demo) return;
  await saveDeskDraft(order, { ...p, stage: "saved" });
  const { error } = await db.from("customer_purchase_orders")
    .update({ review_status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", order.id);
  if (error) throw new Error(error.message);
  await db.from("customer_po_review_events").insert({
    po_id: order.id, event: "status_changed", actor: "staff",
    note: "บันทึกคำสั่งซื้อจากหน้าจัดการคำสั่งซื้อ",
  });
}

/** ------------------------------------------------------- LINE notifications */

export type NotifyType =
  | "order_created" | "order_accepted" | "awaiting_quote" | "price_informed"
  | "ready_for_pickup" | "info_requested" | "order_cancelled";

export const NOTIFY_LABELS: Record<NotifyType, string> = {
  order_created: "ได้รับคำสั่งซื้อ",
  order_accepted: "รับออเดอร์แล้ว",
  awaiting_quote: "รอเสนอราคา",
  price_informed: "แจ้งยอดรวม",
  ready_for_pickup: "สินค้าพร้อมรับ",
  info_requested: "ขอข้อมูลเพิ่ม",
  order_cancelled: "ยกเลิกคำสั่งซื้อ",
};

export interface NotifyLog {
  id: string;
  orderId: string;
  notificationType: string;
  recipientType: "customer" | "admin";
  targetId: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

/** ส่งแจ้งเตือนผ่าน Edge Function เท่านั้น — ไม่เรียก LINE API จากหน้าเว็บ */
export async function notifyOrderLine(
  orderId: string, type: NotifyType, opts: { force?: boolean; recipients?: Array<"customer" | "admin"> } = {},
): Promise<{ ok: boolean; results: Array<{ recipient_type: string; status: string }>; error?: string }> {
  const { data, error } = await (supabase as any).functions.invoke("send-order-line-notifications", {
    body: {
      order_id: orderId, notification_type: type,
      force: opts.force ?? false,
      // ฝั่งแอดมิน/กลุ่มร้านปิดใช้งานแล้ว — ส่งเฉพาะลูกค้าเท่านั้น
      recipient_types: (opts.recipients ?? ["customer"]).filter((r) => r === "customer"),
    },
  });
  if (error) return { ok: false, results: [], error: error.message };
  return { ok: Boolean(data?.ok), results: data?.results ?? [] };
}

export async function listNotifyLogs(orderId: string): Promise<NotifyLog[]> {
  const { data } = await db
    .from("order_notification_logs")
    .select("id, order_id, notification_type, recipient_type, target_id, status, error_message, sent_at, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(30);
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id), orderId: String(r.order_id),
    notificationType: String(r.notification_type), recipientType: r.recipient_type,
    targetId: r.target_id ? String(r.target_id) : null,
    status: r.status, errorMessage: r.error_message ? String(r.error_message) : null,
    sentAt: r.sent_at ? String(r.sent_at) : null, createdAt: String(r.created_at || ""),
  }));
}

/** ปลายทาง LINE ฝั่งทีมงานที่ระบบใช้จริง */
export interface AdminLineTarget {
  target: string;
  source: "env" | "channel" | "none";
  isGroup: boolean;
}

export const TARGET_SOURCE_LABEL: Record<AdminLineTarget["source"], string> = {
  env: "ค่าที่ตั้งไว้ (ADMIN_LINE_TARGET_ID)",
  channel: "กลุ่มแจ้งเตือนคำสั่งซื้อในระบบ",
  none: "ยังไม่ได้ตั้งค่าปลายทาง",
};

/** ซ่อนกลาง ID เพื่อไม่ให้รหัสห้องหลุดทั้งชุดในหน้าจอ */
export function maskLineId(id: string | null | undefined): string {
  const v = String(id || "").trim();
  if (!v) return "-";
  if (v.length <= 10) return v;
  return `${v.slice(0, 5)}…${v.slice(-4)}`;
}

export async function loadAdminLineTarget(): Promise<AdminLineTarget> {
  const { data, error } = await (supabase as any).functions.invoke("send-order-line-notifications", {
    body: { action: "targets" },
  });
  if (error || !data?.admin) return { target: "", source: "none", isGroup: false };
  const a = data.admin;
  return { target: String(a.target || ""), source: a.source ?? "none", isGroup: Boolean(a.isGroup) };
}

export const NOTIFY_STATUS_LABEL: Record<string, string> = {
  sent: "ส่งแล้ว",
  failed: "ส่งไม่สำเร็จ",
  skipped: "ข้าม",
  pending: "รอส่ง",
};

export const RECIPIENT_LABEL: Record<string, string> = {
  customer: "ลูกค้า",
  admin: "กลุ่มร้าน / ทีมงาน (ปิดใช้งาน)",
};

/** แจ้งเตือนฝั่งแอดมินถูกปิดใช้งาน — ประวัติเก่าไม่ใช่ error */
export const ADMIN_NOTIFY_ENABLED = false;
export function isDisabledRecipient(recipientType: string): boolean {
  return recipientType === "admin" && !ADMIN_NOTIFY_ENABLED;
}


export function fmtSize(bytes: number): string {
  if (!bytes) return "-";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `วันนี้ ${time}`;
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${time}`;
}
