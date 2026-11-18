import type { DocFormState, Totals, StatusWorkflow } from "./useDocumentForm";

export type RevisionAction =
  | "create"
  | "edit"
  | "download"
  | "print"
  | "send_admin"
  | `status_${StatusWorkflow}`;

export interface RevisionPayload {
  document_id: string;
  store_id: string;
  action: RevisionAction | string;
  note: string | null;
  snapshot: { state: DocFormState; totals: Totals };
  actor: string | null;
}

export function buildRevisionPayload(
  docId: string,
  storeId: string,
  action: RevisionAction | string,
  state: DocFormState,
  totals: Totals,
  actor: string | null = null,
  note: string | null = null,
): RevisionPayload {
  return {
    document_id: docId,
    store_id: storeId,
    action,
    note,
    snapshot: { state, totals },
    actor,
  };
}

/**
 * Compute the document-table updates needed when changing workflow status.
 * Pure — easy to unit test.
 */
export function statusUpdatePatch(next: StatusWorkflow, actor: string | null = null): Record<string, any> {
  const u: Record<string, any> = { status_workflow: next };
  const now = new Date().toISOString();
  if (next === "approved") {
    u.approved_at = now;
    u.approved_by = actor;
  }
  if (next === "cancelled") {
    u.cancelled_at = now;
  }
  return u;
}

/**
 * Simulate the full sequence of inserts/updates when a user performs actions.
 * Used by integration tests to assert the audit trail is complete.
 */
export interface AuditEvent {
  kind: "insert_revision" | "update_doc";
  payload: any;
}

export function recordCreate(docId: string, storeId: string, state: DocFormState, totals: Totals, actor: string | null = null): AuditEvent[] {
  return [{ kind: "insert_revision", payload: buildRevisionPayload(docId, storeId, "create", state, totals, actor) }];
}

export function recordStatusChange(
  docId: string,
  storeId: string,
  next: StatusWorkflow,
  state: DocFormState,
  totals: Totals,
  actor: string | null = null,
): AuditEvent[] {
  return [
    { kind: "update_doc", payload: { id: docId, ...statusUpdatePatch(next, actor) } },
    { kind: "insert_revision", payload: buildRevisionPayload(docId, storeId, `status_${next}`, state, totals, actor) },
  ];
}

export function recordDownload(docId: string, storeId: string, state: DocFormState, totals: Totals, actor: string | null = null): AuditEvent[] {
  return [{ kind: "insert_revision", payload: buildRevisionPayload(docId, storeId, "download", state, totals, actor) }];
}