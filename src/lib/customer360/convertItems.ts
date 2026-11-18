/**
 * Excel intake items -> shape ที่ระบบปลายทาง "ใช้จริง" (ไม่ใช่แค่ insert ผ่าน DB ได้)
 *
 *  - ใบเขียนเบิก (school_requisitions) ใช้ RequisitionItem
 *    { id, code, name, unit, price, qty, source, needsReview? }  → src/lib/schoolRequisition.ts
 *  - ใบสั่งซื้อของลูกค้า (customer_purchase_orders) ใช้ POItem
 *    { key, name, quantity, unit, price }                        → src/pages/purchase-order/lib/parse.ts
 *
 * ตรรกะเดียวกันนี้ถูก mirror ไว้ใน RPC `admin_convert_excel_intake`
 * (public.excel_items_to_requisition / public.excel_items_to_po)
 */

export interface ExcelIntakeItem {
  order?: number;
  code?: string;
  name: string;
  unit?: string;
  qty?: number;
  price?: number;
  total?: number;
  needsReview?: boolean;
}

const FALLBACK_UNIT = "ชิ้น";
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function toRequisitionItems(items: ExcelIntakeItem[] = []) {
  return items.map((it, i) => ({
    id: `xls_${i + 1}`,
    code: String(it.code ?? ""),
    name: String(it.name ?? "").trim(),
    unit: (it.unit || "").trim() || FALLBACK_UNIT,
    price: num(it.price),
    qty: num(it.qty) > 0 ? num(it.qty) : 1,
    source: "import" as const,
    needsReview: !!it.needsReview,
  }));
}

export function toPurchaseOrderItems(items: ExcelIntakeItem[] = []) {
  return items.map((it, i) => ({
    key: `xls_${i + 1}`,
    name: String(it.name ?? "").trim(),
    quantity: num(it.qty) > 0 ? num(it.qty) : 1,
    unit: (it.unit || "").trim() || FALLBACK_UNIT,
    price: num(it.price),
  }));
}
