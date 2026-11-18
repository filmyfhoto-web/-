import { supabase } from "@/integrations/supabase/client";

/**
 * Admin action audit trail for customer orders.
 *
 * Rows are written to `public.activity_logs` with `target_type = 'order'`
 * and read back through the existing staff-only RPC
 * `get_order_activity_log(_order_id)`.
 *
 * Writing is best-effort: a logging failure must never block the admin's
 * primary action (acknowledge / resend LINE / status change).
 */

export type OrderActionKind =
  | "order_ack"
  | "order_ack_all"
  | "order_line_resend"
  | "order_status_change"
  | "order_document_create"
  | "order_export_csv"
  | "order_export_xlsx"
  | "order_pdf_download"
  | string;

export const ORDER_ACTION_LABEL_TH: Record<string, string> = {
  order_ack: "รับทราบคำสั่งซื้อ",
  order_ack_all: "รับทราบทั้งหมด",
  order_line_resend: "ส่ง LINE ซ้ำ",
  order_status_change: "เปลี่ยนสถานะ",
  order_document_create: "สร้างเอกสารจากออเดอร์",
  order_export_csv: "ดาวน์โหลด CSV",
  order_export_xlsx: "ดาวน์โหลด Excel",
  order_pdf_download: "ดาวน์โหลดใบสั่งงาน (PDF)",
  submit_order: "ลูกค้าส่งคำสั่งซื้อ",
  new_order: "คำสั่งซื้อใหม่",
};

export function orderActionLabel(action: string): string {
  return ORDER_ACTION_LABEL_TH[action] ?? action;
}

export interface OrderActivityRow {
  id: string;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
}

export async function logOrderAction(
  orderId: string,
  action: OrderActionKind,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("activity_logs").insert({
      user_id: data?.user?.id ?? null,
      action,
      target_type: "order",
      target_id: orderId,
      detail: detail as never,
    } as never);
  } catch {
    /* best-effort */
  }
}

export async function fetchOrderActivity(orderId: string): Promise<OrderActivityRow[]> {
  if (!orderId) return [];
  try {
    const { data, error } = await supabase.rpc("get_order_activity_log", {
      _order_id: orderId,
    } as never);
    if (error) return [];
    return ((data as unknown as OrderActivityRow[]) ?? []).map((r) => ({
      ...r,
      detail: (r.detail ?? null) as Record<string, unknown> | null,
    }));
  } catch {
    return [];
  }
}

/** Compact one-line summary of a log row's `detail` payload for the timeline. */
export function summarizeDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  const parts: string[] = [];
  const push = (k: string, label: string) => {
    const v = detail[k];
    if (v !== undefined && v !== null && v !== "") parts.push(`${label}: ${String(v)}`);
  };
  push("order_no", "เลขที่");
  push("from", "จาก");
  push("to", "เป็น");
  push("doc_type", "ชนิดเอกสาร");
  push("store_slug", "ร้าน");
  push("filename", "ไฟล์");
  push("rows", "จำนวนแถว");
  push("count", "จำนวน");
  push("result", "ผล");
  if (detail.auto === true) parts.push("อัตโนมัติ");
  return parts.join(" · ");
}