/**
 * ขั้นตอน "ยืนยันและแก้ราคา" ของหน้า งานและเอกสาร
 *
 *   รายการที่ลูกค้าส่งมา → แอดมินแก้ราคาต่อหน่วย → ยืนยันราคา
 *   → สร้างใบเสนอราคา PDF (ใช้เทมเพลตกลาง `@/lib/pdf`) → ส่งทาง LINE ด้วยกลไกเดิม
 *
 * กติกาการคำนวณ (จุดเดียวทั้งระบบ):
 *   ยอดบรรทัด = ปัดทศนิยม 2 ตำแหน่ง(จำนวน × ราคาต่อหน่วย)
 *   ยอดรวม     = ผลบวกของยอดบรรทัด (ไม่เชื่อค่า total เดิมในฐานข้อมูล)
 */
import { supabase } from "@/integrations/supabase/client";
import { DELIVERY_BUCKET, signFile, type DeliveryFile, type WorkItem, type WorkKind } from "@/lib/workDocs";

const db = supabase as any;

export interface WorkLine {
  /** คีย์ภายในสำหรับ React (id จริงของ order_items ถ้ามี) */
  key: string;
  code: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  /** ฟิลด์อื่น ๆ ของบรรทัดเดิม (jsonb) ที่ต้องคงไว้ตอนบันทึกกลับ */
  raw?: Record<string, unknown>;
}

export const STORE_NAME = "นัฐภรณ์คัลเลอร์แล็ป & การพิมพ์";

/* ---------------------------------------------------------------- คำนวณ */

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function lineAmount(l: Pick<WorkLine, "qty" | "price">): number {
  return round2((Number(l.qty) || 0) * (Number(l.price) || 0));
}

export function linesTotal(lines: Pick<WorkLine, "qty" | "price">[]): number {
  return round2(lines.reduce((s, l) => s + lineAmount(l), 0));
}

/** มีบรรทัดที่ยังไม่ได้ใส่ราคาไหม (0 ใส่ได้ แต่ควรเตือนก่อนออกเอกสาร) */
export function hasZeroPrice(lines: Pick<WorkLine, "price">[]): boolean {
  return lines.some((l) => !(Number(l.price) > 0));
}

/* ---------------------------------------------------------------- อ่าน */

const JSONB_TABLE: Partial<Record<WorkKind, string>> = {
  order: "customer_purchase_orders",
  requisition: "school_requisitions",
};

function fromJsonbItems(raw: unknown): WorkLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any, i) => ({
    key: String(r?.key ?? r?.id ?? `l${i + 1}`),
    code: String(r?.code ?? r?.product_code ?? ""),
    name: String(r?.name ?? r?.product_name ?? ""),
    unit: String(r?.unit ?? ""),
    qty: Number(r?.quantity ?? r?.qty ?? 0) || 0,
    price: Number(r?.price ?? 0) || 0,
    raw: (r ?? {}) as Record<string, unknown>,
  }));
}

/** รายการ + ราคาปัจจุบันของงานหนึ่งใบ (แหล่งข้อมูลต่างกันตามชนิดงาน) */
export async function loadWorkLines(item: WorkItem): Promise<WorkLine[]> {
  if (item.kind === "web_order") {
    const { data, error } = await db
      .from("order_items")
      .select("id, product_name, product_code, qty, unit, price")
      .eq("order_id", item.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r, i) => ({
      key: String(r.id ?? `l${i + 1}`),
      code: String(r.product_code || ""),
      name: String(r.product_name || ""),
      unit: String(r.unit || ""),
      qty: Number(r.qty) || 0,
      price: Number(r.price) || 0,
    }));
  }
  const table = JSONB_TABLE[item.kind]!;

  const { data, error } = await db.from(table).select("items").eq("id", item.id).maybeSingle();
  if (error) throw new Error(error.message);
  return fromJsonbItems(data?.items);
}

/* -------------------------------------------------- ราคามาตรฐานตั้งต้น */

/**
 * เติม "ราคามาตรฐาน" (products.standard_price) ให้บรรทัดที่ยังไม่มีราคา
 * - จับคู่ด้วยรหัสสินค้าก่อน ถ้าไม่มีรหัสจึงจับคู่ด้วยชื่อแบบตรงตัว
 * - บรรทัดที่แอดมินใส่ราคาไว้แล้ว (> 0) จะไม่ถูกทับ
 * - สินค้าที่ไม่ได้ตั้งราคามาตรฐาน (ว่าง/0) ปล่อยช่องว่างไว้ให้กรอกเอง
 */
export async function applyStandardPrices(lines: WorkLine[]): Promise<WorkLine[]> {
  const need = lines.filter((l) => !(Number(l.price) > 0));
  if (need.length === 0) return lines;

  const codes = [...new Set(need.map((l) => l.code.trim()).filter(Boolean))];
  const names = [...new Set(need.filter((l) => !l.code.trim()).map((l) => l.name.trim()).filter(Boolean))];
  if (codes.length === 0 && names.length === 0) return lines;

  const byCode = new Map<string, number>();
  const byName = new Map<string, number>();
  const collect = (rows: any[]) => {
    for (const r of rows ?? []) {
      const p = Number(r?.standard_price);
      if (!(p > 0)) continue;
      const c = String(r?.code ?? "").trim();
      const n = String(r?.name ?? "").trim();
      if (c && !byCode.has(c)) byCode.set(c, p);
      if (n && !byName.has(n)) byName.set(n, p);
    }
  };

  if (codes.length) {
    const { data } = await db.from("products").select("code, name, standard_price").in("code", codes);
    collect(data as any[]);
  }
  if (names.length) {
    const { data } = await db.from("products").select("code, name, standard_price").in("name", names);
    collect(data as any[]);
  }

  return lines.map((l) => {
    if (Number(l.price) > 0) return l;
    const std = byCode.get(l.code.trim()) ?? byName.get(l.name.trim());
    return std ? { ...l, price: round2(std) } : l;
  });
}

/* --------------------------------------------------------------- บันทึก */

async function actorName(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.email || data.user?.id || "staff";
  } catch {
    return "staff";
  }
}

/**
 * บันทึกราคาที่แอดมินแก้ + ยอดรวมที่คำนวณจากบรรทัดเสมอ
 * ถ้าอัปเดตรายการล้มเหลว จะไม่แตะยอดรวม/สถานะยืนยันราคา
 */
export async function saveWorkPrices(item: WorkItem, lines: WorkLine[]): Promise<number> {
  const total = linesTotal(lines);
  const by = await actorName();
  const stamp = { priced_at: new Date().toISOString(), priced_by: by };

  if (item.kind === "web_order") {
    for (const l of lines) {
      const { error } = await db.from("order_items")
        .update({ price: round2(l.price), total: lineAmount(l) })
        .eq("id", l.key);
      if (error) throw new Error(error.message);
    }
    const { error } = await db.from("orders")
      .update({ subtotal: total, total, ...stamp })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
    return total;
  }

  const table = JSONB_TABLE[item.kind]!;
  const items = lines.map((l) => ({
    ...(l.raw ?? {}),
    code: l.code,
    name: l.name,
    unit: l.unit,
    quantity: l.qty,
    qty: l.qty,
    price: round2(l.price),
    total: lineAmount(l),
  }));
  const patch: Record<string, unknown> = { items, total, ...stamp };
  if (item.kind === "order") { patch.subtotal = total; patch.net_total = total; }
  const { error } = await db.from(table).update(patch).eq("id", item.id);
  if (error) throw new Error(error.message);
  return total;
}

/* ------------------------------------------------------- เอกสารส่งลูกค้า */

/** แถวสำหรับไฟล์ Excel — ใช้ downloadXlsx ตัวเดิมของระบบได้ทันที */
export function quoteXlsxRows(lines: WorkLine[]): Record<string, string | number>[] {
  return lines.map((l, i) => ({
    "ลำดับ": i + 1,
    "รหัส": l.code,
    "รายการ": l.name,
    "จำนวน": l.qty,
    "หน่วย": l.unit,
    "ราคาต่อหน่วย": round2(l.price),
    "รวม": lineAmount(l),
  }));
}

export function quoteFileName(item: WorkItem): string {
  return `ใบเสนอราคา-${item.code || item.id.slice(0, 8)}`;
}

/** สร้าง PDF ใบเสนอราคาจากตารางราคา (เทมเพลตกลางของระบบ) */
export async function buildQuotePdf(item: WorkItem, lines: WorkLine[]): Promise<Blob> {
  const { makePdf } = await import("@/lib/pdf");
  return makePdf({
    kind: "quotation",
    docNo: item.code || item.id.slice(0, 8).toUpperCase(),
    date: new Date(),
    store: { name: STORE_NAME },
    customer: { name: item.customerName, phone: item.phone || undefined, contact: item.org || undefined },
    items: lines.map((l) => ({
      name: l.name, code: l.code || undefined, qty: l.qty,
      unit: l.unit || undefined, price: round2(l.price), total: lineAmount(l),
    })),
    subtotal: linesTotal(lines),
    discount: 0,
    shippingFee: 0,
    total: linesTotal(lines),
  });
}

/** อัปโหลดใบเสนอราคาเข้า storage เดิม แล้วผูกกับรายการ */
export async function uploadQuoteFile(item: WorkItem, blob: Blob): Promise<DeliveryFile> {
  const name = `${quoteFileName(item)}.pdf`;
  const path = `work-docs/${item.kind}/${item.id}/quote-${Date.now()}.pdf`;
  const { error: upErr } = await (supabase as any).storage
    .from(DELIVERY_BUCKET)
    .upload(path, blob, { upsert: false, contentType: "application/pdf" });
  if (upErr) throw new Error(upErr.message);
  const meta: DeliveryFile = {
    name, bucket: DELIVERY_BUCKET, path,
    sizeBytes: blob.size, uploadedAt: new Date().toISOString(),
  };
  const table = item.kind === "web_order" ? "orders" : JSONB_TABLE[item.kind]!;
  const { error } = await db.from(table).update({ quote_file: meta }).eq("id", item.id);
  if (error) throw new Error(error.message);
  return meta;
}

export interface QuoteSendResult { ok: boolean; status: string; error?: string }

/** ส่งใบเสนอราคาให้ลูกค้าทาง LINE — ใช้ edge function เดิม (ห้ามเรียก LINE API จากหน้าเว็บ) */
export async function sendQuotation(item: WorkItem, force = false): Promise<QuoteSendResult> {
  const { data, error } = await (supabase as any).functions.invoke("send-work-doc-notify", {
    body: { kind: item.kind, id: item.id, action: "quotation", force },
  });
  if (error) return { ok: false, status: "failed", error: error.message };
  const res = { ok: Boolean(data?.ok), status: String(data?.status || "failed"), error: data?.error };
  if (res.ok) {
    const table = item.kind === "web_order" ? "orders" : JSONB_TABLE[item.kind]!;
    await db.from(table).update({
      quote_sent_at: new Date().toISOString(),
      quote_sent_by: await actorName(),
    }).eq("id", item.id);
  }
  return res;
}

export { signFile };
