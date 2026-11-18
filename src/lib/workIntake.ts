/**
 * "รับงานใหม่" ในหน้า งานและเอกสาร (/admin/work-docs)
 *
 * ป้ายเดียวกัน ลิสต์เดียวกัน — เลือกบันทึกเป็นคำสั่งซื้อหรือใบเขียนเบิก
 * ตัวอ่านไฟล์และรายชื่อลูกค้าใช้ของเดิม (`@/lib/workDesk`)
 */
import { supabase } from "@/integrations/supabase/client";
import {
  validateWorkItems,
  type CustomerFile, type DeskCustomer, type WorkLineItem,
} from "@/lib/workDesk";
import { nextReqNumber as nextDeskReqNumber, saveDeskRequisition } from "@/lib/requisitionDesk";
import type { RequisitionItem } from "@/lib/schoolRequisition";

const db = supabase as any;

export type NewWorkKind = "order" | "requisition";
export type IntakeMethod = "manual" | "files" | "line";

export const NEW_WORK_KIND_LABEL: Record<NewWorkKind, string> = {
  order: "คำสั่งซื้อ",
  requisition: "ใบเขียนเบิก",
};

export const INTAKE_METHODS: { key: IntakeMethod; label: string; desc: string }[] = [
  { key: "manual", label: "พิมพ์รายการเอง", desc: "กรอกรายการทีละบรรทัด" },
  { key: "files", label: "แนบไฟล์ให้ระบบอ่าน", desc: "Excel, PDF, รูปภาพ, Word" },
  { key: "line", label: "รับจาก LINE", desc: "งานที่ลูกค้าส่งเข้ามาทาง LINE" },
];

export type SourceFile = Pick<CustomerFile, "id" | "name" | "kind" | "bucket" | "path">;

export interface NewWorkPayload {
  kind: NewWorkKind;
  customer: DeskCustomer;
  items: WorkLineItem[];
  wantDate: string;
  receiveMethod: string;
  note: string;
  sourceFiles: SourceFile[];
}

export interface NewWorkResult {
  kind: NewWorkKind;
  id: string;
  code: string;
}

export function itemsTotal(items: WorkLineItem[]): number {
  return items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
}

export function validateNewWork(p: Omit<NewWorkPayload, "kind">): string[] {
  return validateWorkItems(p);
}

/** เลขที่คำสั่งซื้อใหม่ (ใช้ตัวรันเลขเดิมของระบบ) */
export async function nextPoNumber(): Promise<string> {
  const { data, error } = await db.rpc("next_customer_po_number");
  if (error || !data) {
    const yr = new Date().getFullYear() + 543;
    return `PO-${yr}-${String(Date.now() % 10000).padStart(4, "0")}`;
  }
  return String(data);
}

/** เลขที่ใบเบิกใหม่ (ใช้ตัวรันเลขเดิมของระบบ) */
export async function nextReqNumber(): Promise<string> {
  return nextDeskReqNumber();
}

/** ไฟล์ต้นฉบับที่ใช้สร้างงาน → ทำเครื่องหมายว่าแปลงแล้ว (ไม่ให้ค้างเป็นงานใหม่ซ้ำ) */
async function markConverted(files: SourceFile[], to: string, id: string) {
  if (!files.length) return;
  try {
    await db.from("customer_excel_intakes").update({
      status: "reviewing", converted_to: to, converted_id: id, converted_at: new Date().toISOString(),
    }).in("id", files.map((f) => f.id));
  } catch {
    /* งานหลักบันทึกสำเร็จแล้ว — สถานะไฟล์ไม่สำคัญพอจะทำให้ล้มทั้งงาน */
  }
}

async function saveOrder(p: Omit<NewWorkPayload, "kind">): Promise<NewWorkResult> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อนบันทึกงาน");

  const poNumber = await nextPoNumber();
  const subtotal = itemsTotal(p.items);
  const row: Record<string, unknown> = {
    po_number: poNumber,
    user_id: uid,
    customer_name: p.customer.name,
    customer_phone: p.customer.phone || "",
    school_or_org: p.customer.name,
    line_user_id: p.customer.lineUserId,
    seller_name: sess.session?.user?.email ?? "",
    items: p.items.map((it) => ({
      key: it.id, name: it.name, quantity: Number(it.qty) || 0,
      unit: it.unit, price: Number(it.price) || 0, discount: 0,
    })),
    subtotal,
    net_total: subtotal,
    note: p.note || "",
    source: "staff",
    status: "submitted",
    submitted_at: new Date().toISOString(),
    due_date: p.wantDate || null,
    receive_method: p.receiveMethod,
    attachments: p.sourceFiles,
  };

  const { data, error } = await db
    .from("customer_purchase_orders").insert(row).select("id, po_number").single();
  if (error) throw new Error(error.message);
  await markConverted(p.sourceFiles, "purchase_order", String(data.id));
  return { kind: "order", id: String(data.id), code: String(data.po_number ?? poNumber) };
}

/** บันทึกงานใหม่ตามชนิดที่เลือก — เข้าลิสต์เดียวกันของหน้า งานและเอกสาร */
export async function saveNewWork(p: NewWorkPayload, reqNumber = ""): Promise<NewWorkResult> {
  if (p.kind === "order") return saveOrder(p);
  const res = await saveDeskRequisition({
    reqNumber: reqNumber || await nextReqNumber(),
    customer: p.customer,
    items: p.items as RequisitionItem[],
    wantDate: p.wantDate,
    receiveMethod: p.receiveMethod,
    note: p.note,
    sourceFiles: p.sourceFiles,
    status: "submitted",
  });
  return { kind: "requisition", id: res.id, code: res.reqNumber };
}

export type { CustomerFile, DeskCustomer, WorkLineItem };
