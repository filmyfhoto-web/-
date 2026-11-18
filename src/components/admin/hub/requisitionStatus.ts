import type { Requisition, RequisitionItem, RequisitionStatus } from "@/lib/schoolRequisition";
import type { BadgeTone } from "./ui";
import type { HubRequisition } from "./useHubData";

/** รหัสใบเบิกอ่านง่ายจาก uuid */
export function requisitionCode(id: string): string {
  return `BR-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** รหัสออเดอร์อ่านง่าย (ใช้ตอนแสดงความสัมพันธ์ ใบเบิก → ออเดอร์) */
export function orderCode(id: string): string {
  return `ORD-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/**
 * สถานะใบเขียนเบิก — ใช้ค่าเดิมในฐานข้อมูล (draft / submitted)
 * ร่วมกับความสัมพันธ์ “สร้างคำสั่งซื้อแล้ว” เพื่อบอกขั้นตอนที่ชัดขึ้น
 */
export function requisitionStatusLabel(
  status: string | null | undefined,
  convertedPoId?: string | null,
): { label: string; tone: BadgeTone } {
  const s = String(status ?? "").toLowerCase();
  if (convertedPoId) return { label: "สร้างคำสั่งซื้อแล้ว", tone: "green" };
  if (s === "submitted") return { label: "เสร็จแล้ว", tone: "green" };
  if (s === "review") return { label: "กำลังตรวจ", tone: "amber" };
  return { label: "ใหม่", tone: "amber" };
}

export const REQ_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "new", label: "ใหม่" },
  { key: "review", label: "กำลังตรวจ" },
  { key: "pricing", label: "รอราคา" },
  { key: "converted", label: "สร้างคำสั่งซื้อแล้ว" },
  { key: "done", label: "เสร็จแล้ว" },
];

/** ใบเบิกที่ยังไม่ได้ใส่ราคาเลย (ยังไม่ได้สร้างออเดอร์) */
export function needsPricing(r: HubRequisition): boolean {
  if (r.converted_po_id) return false;
  const items = Array.isArray(r.items) ? (r.items as RequisitionItem[]) : [];
  if (items.length === 0) return false;
  return items.every((it) => !Number(it?.price ?? 0));
}

export function matchesReqFilter(r: HubRequisition, filter: string): boolean {
  const s = String(r.status ?? "").toLowerCase();
  if (filter === "all") return true;
  if (filter === "converted") return !!r.converted_po_id;
  if (filter === "pricing") return needsPricing(r);
  if (filter === "review") return s === "review" && !r.converted_po_id;
  if (filter === "done") return s === "submitted" && !r.converted_po_id;
  return ["draft", "", "pending"].includes(s) && !r.converted_po_id;
}


export const requisitionItems = (r: HubRequisition): RequisitionItem[] =>
  Array.isArray(r.items) ? (r.items as RequisitionItem[]) : [];

/** แปลงแถวในฐานข้อมูลให้เป็นเอกสารสำหรับสร้าง PDF (ใช้ตัวสร้างเดิม) */
export function toRequisitionDoc(r: HubRequisition): Requisition {
  return {
    id: r.id,
    school_name: r.school_name ?? "",
    project_name: r.project_name ?? "",
    prepared_by: r.prepared_by ?? "",
    doc_date: (r.doc_date ?? r.created_at).slice(0, 10),
    status: (r.status === "submitted" ? "submitted" : "draft") as RequisitionStatus,
    items: requisitionItems(r),
    total: Number(r.total ?? 0),
    note: r.note ?? null,
    submitted_at: r.submitted_at ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at ?? r.created_at,
  };
}
