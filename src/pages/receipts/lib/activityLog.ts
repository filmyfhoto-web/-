import { supabase } from "@/integrations/supabase/client";
import { tbl } from "./tbl";

/**
 * Centralised helper for writing audit rows to `rds_activity_logs`.
 * Used by the document form (and friends) to record actions like
 * `document_type_change` and `delivery_blocked_no_quotation` so the
 * back office can trace why a save was blocked or where a new running
 * number came from.
 *
 * Best-effort: failures are swallowed so a logging glitch never blocks
 * the user's primary action.
 */
export type DocActivityAction =
  | "document_type_change"
  | "delivery_blocked_no_quotation"
  | "document_print"
  | "document_print_error"
  | "document_status_change"
  | "document_create"
  | "document_restore_from_sheets"
  | string;

export async function logDocActivity(
  storeId: string,
  action: DocActivityAction,
  targetId: string | null,
  detail: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await supabase.from(tbl("activity_logs") as any).insert({
      store_id: storeId,
      action,
      target_type: "document",
      target_id: targetId,
      detail: (detail ?? {}) as any,
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Row shape returned by `fetchDocActivity` — a flat slice of the
 * `rds_activity_logs` table relevant to one document. We surface the most
 * common fields used by `DocActivityDialog` for rendering the timeline.
 */
export interface DocActivityRow {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
}

/**
 * Pull every activity log entry that mentions this document — either as
 * the direct target, or as the `from_doc_id` / `to_doc_id` /
 * `related_document_no` of another row (e.g. when a QT was migrated into
 * a DN, both sides should see the event).
 *
 * The query union-filters on Postgres' JSONB extract operator so a doc's
 * "incoming" type-change events from its source row are surfaced too.
 * Best-effort — returns [] on any failure so callers never crash.
 */
export async function fetchDocActivity(
  storeId: string,
  docId: string | null | undefined,
  docNo: string | null | undefined,
  limit = 50,
): Promise<DocActivityRow[]> {
  if (!storeId || (!docId && !docNo)) return [];
  try {
    const filters: string[] = [];
    if (docId) {
      filters.push(`target_id.eq.${docId}`);
      filters.push(`detail->>from_doc_id.eq.${docId}`);
      filters.push(`detail->>to_doc_id.eq.${docId}`);
    }
    if (docNo) {
      // Escape commas/quotes in document_no so they don't break the
      // PostgREST .or() list syntax.
      const safe = String(docNo).replace(/[,\)\(]/g, "");
      filters.push(`detail->>related_document_no.eq.${safe}`);
      filters.push(`detail->>from_no.eq.${safe}`);
      filters.push(`detail->>new_no.eq.${safe}`);
      filters.push(`detail->>document_no.eq.${safe}`);
    }
    const { data } = await supabase
      .from(tbl("activity_logs") as any)
      .select("id, action, created_at, user_id, target_id, detail")
      .eq("store_id", storeId)
      .or(filters.join(","))
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data as any[] | null) ?? [];
  } catch {
    return [];
  }
}