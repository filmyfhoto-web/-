import { useEffect, useMemo } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Incomplete" tax_invoice / receipt = shell documents that should be hidden
 * from list/tabs/sidebar/print/export flows:
 *   - status ∈ {draft, void}, OR
 *   - has no line items in rds_document_items
 *
 * Rule targets only tax_invoice + receipt. Other doc types unaffected.
 */
export const INCOMPLETE_TOOLTIP =
  "ข้ามใบเสร็จรับเงิน/ใบกำกับภาษีที่ยังไม่มีรายการสินค้าหรือยังเป็นร่าง/ยกเลิก";

export type IncompleteInfo = {
  ids: Set<string>;
  countByType: Record<string, number>; // "tax_invoice" | "receipt" → count
};

const EMPTY: IncompleteInfo = { ids: new Set(), countByType: {} };

export function useIncompleteReceiptIds(storeId: string | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["incomplete_receipts", storeId],
    enabled: !!storeId,
    queryFn: async (): Promise<IncompleteInfo> => {
      const { data: docs, error: e1 } = await supabase
        .from("rds_documents" as any)
        .select("id, document_type, status")
        .eq("store_id", storeId!)
        .in("document_type", ["tax_invoice", "receipt"])
        .is("deleted_at", null);
      if (e1) throw e1;
      const list = ((docs ?? []) as unknown) as Array<{ id: string; document_type: string; status: string | null }>;
      if (list.length === 0) return { ids: new Set(), countByType: {} };

      // Fetch item rows for these docs — one document_id per line item.
      const ids = list.map((r) => r.id);
      const { data: items, error: e2 } = await supabase
        .from("rds_document_items" as any)
        .select("document_id")
        .in("document_id", ids);
      if (e2) throw e2;
      const withItems = new Set<string>();
      for (const it of ((items ?? []) as unknown) as Array<{ document_id: string }>) {
        if (it.document_id) withItems.add(it.document_id);
      }

      const incomplete = new Set<string>();
      const countByType: Record<string, number> = {};
      for (const r of list) {
        const badStatus = r.status === "draft" || r.status === "void";
        const noItems = !withItems.has(r.id);
        if (badStatus || noItems) {
          incomplete.add(r.id);
          countByType[r.document_type] = (countByType[r.document_type] ?? 0) + 1;
        }
      }
      return { ids: incomplete, countByType };
    },
    staleTime: 15_000,
  });

  // Realtime invalidation: any change to rds_documents or rds_document_items
  // within this store should refresh the incomplete set.
  useEffect(() => {
    if (!storeId) return;
    // Random suffix keeps StrictMode double-mounts (and multiple consumers on
    // the same page) from re-subscribing to the same channel name, which
    // triggers "cannot add postgres_changes callbacks after subscribe()".
    const uid = Math.random().toString(36).slice(2, 10);
    const ch = liveChannel(`incomplete_receipts_${storeId}_${uid}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "rds_documents", filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: ["incomplete_receipts", storeId] }),
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "rds_document_items" },
        () => qc.invalidateQueries({ queryKey: ["incomplete_receipts", storeId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeId, qc]);

  return q.data ?? EMPTY;
}

/** Is `row` a tax_invoice/receipt in the incomplete set? */
export function isIncompleteReceipt(
  row: { id?: string | null; document_type?: string | null } | null | undefined,
  info: IncompleteInfo,
): boolean {
  if (!row?.id) return false;
  const t = row.document_type;
  if (t !== "tax_invoice" && t !== "receipt") return false;
  return info.ids.has(row.id);
}

/** Split a list, returning kept + skipped count. */
export function filterIncompleteReceipts<T extends { id?: string | null; document_type?: string | null }>(
  list: T[],
  info: IncompleteInfo,
): { kept: T[]; skipped: number } {
  if (info.ids.size === 0) return { kept: list, skipped: 0 };
  const kept = list.filter((r) => !isIncompleteReceipt(r, info));
  return { kept, skipped: list.length - kept.length };
}

/** Memo helper for consumers that want a stable reference. */
export function useIncompleteMemo(info: IncompleteInfo) {
  return useMemo(() => info, [info]);
}