/**
 * Build a DocumentForm prefill payload out of a customer shop order.
 *
 * The receipts `DocumentForm` already understands a prefill object shaped
 * like the customer-purchase-order one, so we reuse that exact contract.
 * Documents created this way are standalone: they are NOT linked to the
 * order and never touch stock — the admin can edit everything afterwards.
 */

export interface OrderLike {
  id: string;
  order_no?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  school_name?: string | null;
  note?: string | null;
  organizations?: { name?: string | null } | null;
  order_items?: Array<{
    product_name?: string | null;
    qty?: number | string | null;
    unit?: string | null;
    price?: number | string | null;
    total?: number | string | null;
  }> | null;
}

export interface OrderDocumentPrefill {
  source: "customer_purchase_order";
  po_id: string;
  po_number: string;
  doc_type: string;
  customer: { name: string; phone: string; organization: string };
  note: string;
  items: Array<{ name: string; quantity: number; unit: string; price: number }>;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function orderCustomerName(o: OrderLike): string {
  return (
    o.organizations?.name?.trim() ||
    o.school_name?.trim() ||
    o.guest_name?.trim() ||
    "ลูกค้า"
  );
}

export function buildOrderDocumentPrefill(o: OrderLike, docType: string): OrderDocumentPrefill {
  const items = (o.order_items ?? [])
    .map((it) => ({
      name: String(it.product_name ?? "").trim(),
      quantity: num(it.qty),
      unit: String(it.unit ?? "ชิ้น") || "ชิ้น",
      price: num(it.price) || (num(it.qty) ? num(it.total) / num(it.qty) : 0),
    }))
    .filter((it) => it.name);

  const orderNo = (o.order_no ?? "").trim();
  return {
    source: "customer_purchase_order",
    po_id: o.id,
    po_number: orderNo,
    doc_type: docType,
    customer: {
      name: orderCustomerName(o),
      phone: (o.guest_phone ?? "").trim(),
      organization: (o.organizations?.name ?? o.school_name ?? "").trim(),
    },
    note: [o.note ?? "", orderNo ? `อ้างอิงคำสั่งซื้อ ${orderNo}` : ""]
      .filter(Boolean)
      .join("\n"),
    items,
  };
}

export function orderDocumentRoute(storeSlug: string, docType: string): string {
  return `/receipts/${encodeURIComponent(storeSlug)}/documents/new?doc_type=${encodeURIComponent(docType)}`;
}