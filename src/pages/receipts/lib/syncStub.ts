import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { tbl } from "./tbl";

export type SyncTarget = "sheet" | "drive";
export type SyncStatus = "pending" | "success" | "failed" | null;

export type HeaderMismatch = { col: number; expected: string; actual: string };
export type HeaderIssue = { expected: string[]; actual: string[]; mismatches: HeaderMismatch[] };

export class SyncAuthError extends Error {
  status: number;
  constructor(message = "session หมดอายุ กรุณาเข้าสู่ระบบใหม่", status = 401) {
    super(message);
    this.name = "SyncAuthError";
    this.status = status;
  }
}

/**
 * Module-scoped set of documents currently being synced in this tab. Guards
 * against double-clicking the sync button so we don't fire duplicate
 * uploads while a request is still in flight. Server-side idempotency
 * would still make repeats safe, but skipping them client-side gives
 * instant feedback and avoids stacking edge function invocations.
 */
const inFlight = new Set<string>();
const bus = new EventTarget();

function emitChange() {
  bus.dispatchEvent(new Event("change"));
}

export function isSyncing(docId: string): boolean {
  return inFlight.has(docId);
}

export function anySyncing(): boolean {
  return inFlight.size > 0;
}

export function subscribeSyncLock(cb: () => void): () => void {
  bus.addEventListener("change", cb);
  return () => bus.removeEventListener("change", cb);
}

/** React hook: returns true while any of the given doc ids is syncing.
 *  Pass no ids to observe the global "any sync in progress" flag. */
export function useSyncLock(docIds?: string[]): boolean {
  const [busy, setBusy] = useState(() =>
    docIds && docIds.length ? docIds.some((id) => inFlight.has(id)) : inFlight.size > 0,
  );
  useEffect(() => {
    const compute = () =>
      setBusy(docIds && docIds.length ? docIds.some((id) => inFlight.has(id)) : inFlight.size > 0);
    compute();
    return subscribeSyncLock(compute);
    // docIds recomputed via join to avoid re-subscribing every render on a fresh array ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(docIds ?? []).join(",")]);
  return busy;
}

/**
 * Grab a fresh access token. `functions.invoke` normally attaches the
 * cached session token, but if it has expired we get a 401 from the edge
 * function. Calling getSession() forces a refresh when needed.
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;
  const exp = data.session?.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (!token || (exp && exp - now < 30)) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token ?? token;
  }
  if (!token) throw new SyncAuthError();
  return { Authorization: `Bearer ${token}` };
}

/** Detect whether an invoke error/data indicates a 401 unauthorized. */
function isAuthFailure(error: any, data: any): boolean {
  if (error?.status === 401) return true;
  const ctx = error?.context;
  if (ctx?.status === 401 || ctx?.response?.status === 401) return true;
  const msg = String(error?.message ?? "");
  if (/401|unauthorized/i.test(msg)) return true;
  if (data && typeof data === "object" && data.error === "unauthorized") return true;
  return false;
}

/**
 * Trigger Google Sheets/Drive sync for a set of documents via the
 * rds-google-sync edge function. Each document is synced individually
 * (Sheets append is sequential). Sets pending status optimistically so
 * the UI updates immediately.
 */
export async function triggerSync(
  docIds: string[],
  target: SyncTarget | "both" = "both",
  pdfByDocId?: Record<string, string>,
  mode: "document_full" = "document_full",
): Promise<{ ok: boolean; failed: string[]; headerIssue?: HeaderIssue | null; errors: string[]; skipped: string[] }> {
  if (!docIds.length) return { ok: true, failed: [], errors: [], skipped: [] };

  // Filter out documents that already have an in-flight sync in this tab.
  const skipped: string[] = [];
  const runIds: string[] = [];
  for (const id of docIds) {
    if (inFlight.has(id)) skipped.push(id);
    else runIds.push(id);
  }
  if (!runIds.length) return { ok: true, failed: [], errors: [], skipped };
  for (const id of runIds) inFlight.add(id);
  emitChange();

  const fields: Record<string, unknown> = {};
  if (target === "sheet" || target === "both") fields.google_sheet_sync_status = "pending";
  if (target === "drive" || target === "both") fields.google_drive_sync_status = "pending";
  await supabase.from(tbl("documents") as any).update(fields).in("id", runIds);

  const failed: string[] = [];
  const errors: string[] = [];
  let headerIssue: HeaderIssue | null = null;
  let authHeader: Record<string, string>;
  try {
    authHeader = await getAuthHeader(); // throws SyncAuthError if no session
    for (const id of runIds) {
      try {
        const { data, error } = await supabase.functions.invoke("rds-google-sync", {
          body: { document_id: id, target, pdf_base64: pdfByDocId?.[id], mode },
          headers: authHeader,
        });
        if (isAuthFailure(error, data)) throw new SyncAuthError();
        if (error) throw error;
        const d = data as any;
        if (d && !d.ok) failed.push(id);
        if (d?.header_issue) headerIssue = d.header_issue;
        if (d?.errors?.length) errors.push(...d.errors);
      } catch (e) {
        if (e instanceof SyncAuthError) throw e;
        failed.push(id);
      } finally {
        inFlight.delete(id);
        emitChange();
      }
    }
  } catch (e) {
    // Release any ids we hadn't dispatched yet (e.g. auth failure up front)
    for (const id of runIds) {
      if (inFlight.delete(id)) { /* released */ }
    }
    emitChange();
    throw e;
  }
  return { ok: failed.length === 0, failed, headerIssue, errors, skipped };
}

/**
 * Fetch a single document back from Google Sheets by document_no.
 * Used for the "Open by no" + Sheets-restore flow when the document is
 * missing from the database.
 */
export async function fetchDocumentFromSheets(
  storeId: string,
  documentNo: string,
): Promise<{ ok: boolean; header: Record<string, string> | null; items: Record<string, string>[]; tab: string | null; error?: string }> {
  try {
    const authHeader = await getAuthHeader();
    const { data, error } = await supabase.functions.invoke("rds-google-sync", {
      body: { mode: "fetch_document", store_id: storeId, document_no: documentNo },
      headers: authHeader,
    });
    if (isAuthFailure(error, data)) throw new SyncAuthError();
    if (error) return { ok: false, header: null, items: [], tab: null, error: error.message };
    const d = data as any;
    return {
      ok: !!d?.ok,
      header: d?.header ?? null,
      items: d?.items ?? [],
      tab: d?.tab ?? null,
      error: d?.error,
    };
  } catch (e: any) {
    if (e instanceof SyncAuthError) throw e;
    return { ok: false, header: null, items: [], tab: null, error: e?.message ?? "fetch failed" };
  }
}