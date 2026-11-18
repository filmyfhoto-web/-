import { supabase } from "@/integrations/supabase/client";
import type { Requisition, RequisitionItem } from "@/lib/schoolRequisition";

export type RequisitionLogAction = "create" | "update" | "submit" | "delete" | string;

export interface RequisitionChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface RequisitionLogRow {
  id: string;
  requisition_id: string;
  user_id: string | null;
  action: RequisitionLogAction;
  changes: RequisitionChange[];
  created_at: string;
}

export const REQ_ACTION_LABEL: Record<string, string> = {
  create: "สร้างเอกสาร",
  update: "แก้ไขเอกสาร",
  submit: "ส่งให้ร้าน",
  delete: "ลบเอกสาร",
};

export function requisitionActionLabel(action: string): string {
  return REQ_ACTION_LABEL[action] ?? action;
}

const FIELD_LABEL: Record<string, string> = {
  school_name: "โรงเรียน/หน่วยงาน",
  project_name: "โครงการ",
  prepared_by: "ผู้จัดทำ",
  doc_date: "วันที่เอกสาร",
  note: "หมายเหตุ",
  status: "สถานะ",
  total: "ยอดรวม",
  items: "รายการสินค้า",
};

function itemsSummary(items: RequisitionItem[]): string {
  return `${items.length} รายการ`;
}

/** เทียบข้อมูลเก่า/ใหม่ แล้วคืนเฉพาะฟิลด์ที่เปลี่ยน */
export function diffRequisition(
  before: Partial<Requisition> | null | undefined,
  after: Partial<Requisition>,
): RequisitionChange[] {
  const out: RequisitionChange[] = [];
  if (!before) return out;
  const keys = ["school_name", "project_name", "prepared_by", "doc_date", "note", "status", "total"] as const;
  for (const k of keys) {
    const a = before[k] ?? "";
    const b = after[k] ?? "";
    if (String(a) !== String(b)) {
      out.push({ field: k, label: FIELD_LABEL[k] ?? k, from: String(a || "—"), to: String(b || "—") });
    }
  }
  const beforeItems = before.items ?? [];
  const afterItems = after.items ?? [];
  if (JSON.stringify(beforeItems) !== JSON.stringify(afterItems)) {
    out.push({
      field: "items",
      label: FIELD_LABEL.items,
      from: itemsSummary(beforeItems),
      to: itemsSummary(afterItems),
    });
  }
  return out;
}

/** บันทึกประวัติ (best-effort — ล้มเหลวต้องไม่ทำให้การบันทึกเอกสารล้ม) */
export async function recordRequisitionLog(
  requisitionId: string,
  action: RequisitionLogAction,
  changes: RequisitionChange[] = [],
): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return;
    await supabase
      .from("school_requisition_logs" as never)
      .insert({ requisition_id: requisitionId, user_id: uid, action, changes } as never);
  } catch {
    /* best-effort */
  }
}

/** ดึงประวัติการแก้ไขของเอกสารหนึ่งใบ (เจ้าของหรือพนักงานร้านตาม RLS) */
export async function fetchRequisitionLogs(requisitionId: string): Promise<RequisitionLogRow[]> {
  try {
    const { data, error } = await supabase
      .from("school_requisition_logs" as never)
      .select("id, requisition_id, user_id, action, changes, created_at")
      .eq("requisition_id", requisitionId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return ((data ?? []) as unknown as RequisitionLogRow[]).map((r) => ({
      ...r,
      changes: Array.isArray(r.changes) ? r.changes : [],
    }));
  } catch {
    return [];
  }
}

export function formatLogTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}
