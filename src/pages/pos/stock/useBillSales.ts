import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Shops that issue "ขายบิล" documents (rds_documents). */
export type BillShop = "colorlab" | "print";

export const BILL_SHOP_MATCH: Record<BillShop, RegExp> = {
  colorlab: /คัลเลอร์แล็ป/,
  print: /การพิมพ์/,
};

export type BillDocType = "all" | "receipt" | "delivery" | "quotation";

export const BILL_DOC_LABEL: Record<BillDocType, string> = {
  all: "รวมทุกชนิด",
  receipt: "ใบเสร็จ",
  delivery: "ใบส่งของ",
  quotation: "ใบเสนอราคา",
};

export const BILL_DOC_TYPES: BillDocType[] = ["all", "receipt", "delivery", "quotation"];

export type BillDocument = {
  id: string;
  document_no: string | null;
  document_type: string | null;
  document_date: string | null;
  created_at: string;
  customer_name: string | null;
  status: string | null;
  grand_total: number | null;
  store_id: string | null;
  internal_sale_type?: string | null;
};

export type BillItem = {
  id: string;
  document_id: string;
  name: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  price: number | null;
  line_total: number | null;
  item_order: number | null;
};

/** Stock movement created by rds_apply_document_stock for one document item. */
export type DocStockMovement = {
  idempotency_key: string | null;
  before_qty: number | null;
  after_qty: number | null;
  qty: number | null;
};

/** Parse the item id out of `rdsdoc:<document_id>:<item_id>`. */
export function itemIdFromIdempotencyKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const parts = key.split(":");
  if (parts[0] !== "rdsdoc" || parts.length < 3) return null;
  return parts[2] || null;
}

/** Map movements onto the document item they were created from. */
export function movementsByItemId(moves: DocStockMovement[]): Map<string, DocStockMovement> {
  const m = new Map<string, DocStockMovement>();
  for (const mv of moves) {
    const id = itemIdFromIdempotencyKey(mv.idempotency_key);
    if (id) m.set(id, mv);
  }
  return m;
}

/** One flattened row: document header + a single item line. */
export type BillRow = {
  id: string;
  documentId: string;
  itemId: string;
  /** Stock level before/after the deduction (real_goods only, null = not applied) */
  stockBefore: number | null;
  stockAfter: number | null;
  /** true when a stock movement exists for this item line */
  applied: boolean;
  date: string;
  documentNo: string;
  documentType: string;
  customer: string;
  product: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
};

export type BillTotals = {
  documents: number;
  items: number;
  qty: number;
  amount: number;
};

/**
 * Bill sales never touch stock — a document counts only when it is not
 * deleted/cancelled AND it was ticked as "ซื้อบิล" (internal_sale_type =
 * bill_only) on the document form. Real-goods documents belong to the
 * stock-deducting side and are excluded here.
 */
export type SaleType = "bill_only" | "real_goods";

export function isCountableDocument(
  d: Pick<BillDocument, "status" | "internal_sale_type">,
  saleType: SaleType = "bill_only",
): boolean {
  const s = (d.status || "").toLowerCase();
  if (s === "cancelled" || s === "canceled" || s === "void" || s === "draft") return false;
  return (d.internal_sale_type ?? "bill_only") === saleType;
}

export function lineTotal(item: Pick<BillItem, "quantity" | "price" | "line_total">): number {
  const explicit = Number(item.line_total);
  if (Number.isFinite(explicit) && explicit !== 0) return explicit;
  return (Number(item.quantity) || 0) * (Number(item.price) || 0);
}

/** Flatten documents + items into per-item rows (cancelled/deleted docs excluded). */
export function buildBillRows(
  documents: BillDocument[],
  items: BillItem[],
  saleType: SaleType = "bill_only",
  moves?: Map<string, DocStockMovement>,
): BillRow[] {
  const byId = new Map<string, BillDocument>();
  for (const d of documents) if (isCountableDocument(d, saleType)) byId.set(d.id, d);

  const rows: BillRow[] = [];
  for (const it of items) {
    const doc = byId.get(it.document_id);
    if (!doc) continue;
    const mv = moves?.get(it.id);
    rows.push({
      id: it.id,
      documentId: doc.id,
      itemId: it.id,
      stockBefore: mv && mv.before_qty != null ? Number(mv.before_qty) : null,
      stockAfter: mv && mv.after_qty != null ? Number(mv.after_qty) : null,
      applied: Boolean(mv),
      date: doc.document_date || doc.created_at,
      documentNo: doc.document_no || "—",
      documentType: doc.document_type || "",
      customer: doc.customer_name || "—",
      product: it.name || it.description || "—",
      unit: it.unit || "",
      qty: Number(it.quantity) || 0,
      price: Number(it.price) || 0,
      total: lineTotal(it),
    });
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function sumBillRows(rows: BillRow[]): BillTotals {
  const docs = new Set<string>();
  let qty = 0;
  let amount = 0;
  for (const r of rows) {
    docs.add(r.documentNo);
    qty += r.qty;
    amount += r.total;
  }
  return { documents: docs.size, items: rows.length, qty, amount };
}

export type BillRollup = { product: string; unit: string; qty: number; amount: number };

export function rollupBillRows(rows: BillRow[]): BillRollup[] {
  const m = new Map<string, BillRollup>();
  for (const r of rows) {
    const key = `${r.product}|${r.unit}`;
    const cur = m.get(key) || { product: r.product, unit: r.unit, qty: 0, amount: 0 };
    cur.qty += r.qty;
    cur.amount += r.total;
    m.set(key, cur);
  }
  return Array.from(m.values()).sort((a, b) => b.amount - a.amount);
}

/** Resolve the rds_stores UUID for each shop at runtime (no hardcoded ids). */
export function useBillStoreIds() {
  const [ids, setIds] = useState<Partial<Record<BillShop, string>>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("rds_stores").select("id, name");
      if (cancelled) return;
      const next: Partial<Record<BillShop, string>> = {};
      for (const s of (data ?? []) as Array<{ id: string; name: string | null }>) {
        const name = s.name || "";
        (Object.keys(BILL_SHOP_MATCH) as BillShop[]).forEach((k) => {
          if (!next[k] && BILL_SHOP_MATCH[k].test(name)) next[k] = s.id;
        });
      }
      setIds(next);
    })();
    return () => { cancelled = true; };
  }, []);
  return ids;
}

export function useBillSales(
  shop: BillShop,
  docType: BillDocType,
  sinceISO: string | null,
  saleType: SaleType = "bill_only",
  untilISO: string | null = null,
) {
  const storeIds = useBillStoreIds();
  const storeId = storeIds[shop];
  const [rows, setRows] = useState<BillRow[]>([]);
  const [docs, setDocs] = useState<BillDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      // Paginate so the full bill history is shown, not just the newest page.
      const PAGE = 1000;
      const all: BillDocument[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = supabase
          .from("rds_documents")
          .select("id, document_no, document_type, document_date, created_at, customer_name, status, grand_total, store_id, internal_sale_type")
          .eq("store_id", storeId)
          .eq("internal_sale_type", saleType)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (docType !== "all") q = q.eq("document_type", docType);
        if (sinceISO) q = q.gte("created_at", sinceISO);
        if (untilISO) q = q.lte("created_at", untilISO);
        const { data: page } = await q;
        const list = (page ?? []) as BillDocument[];
        all.push(...list);
        if (list.length < PAGE) break;
      }
      const documents = all.filter((d) => isCountableDocument(d, saleType));
      setDocs(documents);
      if (documents.length === 0) { setRows([]); return; }
      const items: BillItem[] = [];
      const ids = documents.map((d) => d.id);
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase
          .from("rds_document_items")
          .select("id, document_id, name, description, unit, quantity, price, line_total, item_order")
          .in("document_id", ids.slice(i, i + 150));
        items.push(...((data ?? []) as BillItem[]));
      }
      // Real goods deduct stock — pull the matching movements so the table can
      // show สต๊อกก่อน → หลัง per line and flag lines that never deducted.
      let moves: Map<string, DocStockMovement> | undefined;
      if (saleType === "real_goods") {
        const list: DocStockMovement[] = [];
        for (let i = 0; i < ids.length; i += 150) {
          const { data } = await supabase
            .from("stock_movements")
            .select("idempotency_key, before_qty, after_qty, qty")
            .eq("ref_type", "rds_document")
            .in("ref_id", ids.slice(i, i + 150));
          list.push(...((data ?? []) as DocStockMovement[]));
        }
        moves = movementsByItemId(list);
      }
      setRows(buildBillRows(documents, items, saleType, moves));
    } finally {
      setLoading(false);
    }
  }, [storeId, docType, sinceISO, untilISO, saleType]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => sumBillRows(rows), [rows]);
  return { rows, documents: docs, totals, loading, reload: load, storeReady: Boolean(storeId) };
}