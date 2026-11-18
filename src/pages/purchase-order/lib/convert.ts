// Helpers to convert a customer Purchase Order snapshot into
// prefill state for the admin receipts DocumentForm.

import type { POItem } from "./parse";

export interface PORow {
  id: string;
  po_number: string | null;
  customer_name: string;
  customer_phone: string;
  school_or_org: string;
  seller_name: string;
  note: string;
  items: unknown;
  subtotal: number;
  request_quotation: boolean;
  request_delivery_note: boolean;
  status: string;
  submitted_at: string | null;
  created_at: string;
}

export type ConvertTarget = "quotation" | "delivery_note" | "receipt";

export interface DocumentPrefill {
  source: "customer_purchase_order";
  po_id: string;
  po_number: string;
  doc_type: ConvertTarget;
  customer: {
    name: string;
    phone: string;
    organization: string;
  };
  note: string;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    price: number;
  }>;
}

function coerceItems(raw: unknown): POItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any) => ({
    key: String(r?.key ?? Math.random()),
    name: String(r?.name ?? "").trim(),
    quantity: Number(r?.quantity ?? 0) || 0,
    unit: String(r?.unit ?? "ชิ้น"),
    price: Number(r?.price ?? 0) || 0,
  })).filter((it) => it.name);
}

export function buildDocumentPrefill(po: PORow, target: ConvertTarget): DocumentPrefill {
  const items = coerceItems(po.items);
  return {
    source: "customer_purchase_order",
    po_id: po.id,
    po_number: po.po_number ?? "",
    doc_type: target,
    customer: {
      name: po.customer_name ?? "",
      phone: po.customer_phone ?? "",
      organization: po.school_or_org ?? "",
    },
    note: [po.note, po.po_number ? `อ้างอิงใบสั่งสินค้า ${po.po_number}` : ""]
      .filter(Boolean)
      .join("\n"),
    items: items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      price: it.price,
    })),
  };
}

/**
 * Build a target URL for the admin DocumentForm with the PO prefilled.
 * Uses location.state via react-router; also encodes a fallback in
 * `?po=` for hard-reload safety.
 */
export function buildConvertRoute(storeSlug: string, target: ConvertTarget, poId: string): string {
  return `/receipts/${encodeURIComponent(storeSlug)}/documents/new?from_po=${encodeURIComponent(
    poId,
  )}&doc_type=${target}`;
}

/** Human-readable label for a request/status flag. */
export function convertTargetLabel(t: ConvertTarget): string {
  return t === "quotation" ? "ใบเสนอราคา" : t === "delivery_note" ? "ใบส่งของ" : "ใบเสร็จ";
}