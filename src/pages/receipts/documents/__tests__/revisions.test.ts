import { describe, it, expect } from "vitest";
import {
  buildRevisionPayload,
  statusUpdatePatch,
  recordCreate,
  recordStatusChange,
  recordDownload,
  type AuditEvent,
} from "../revisions";
import type { DocFormState, Totals } from "../useDocumentForm";

const state: DocFormState = {
  document_type: "quotation",
  paper_size: "A4",
  template: "classic",
  status_workflow: "draft",
  document_date: "2026-06-24",
  show_document_date: true,
  vat_mode: "none",
  vat_rate: 0,
  price_type: "no_vat",
  withholding_tax_enabled: false,
  withholding_tax_rate: 3,
  discount_amount: 0,
  customer_id: null,
  customer_name: "ลูกค้าทดสอบ",
  customer_phone: "",
  customer_address: "",
  customer_tax_id: "",
  customer_branch: "",
  payment_method: "cash",
  notes: "",
  items: [],
};
const totals: Totals = {
  subtotal: 100, discount_total: 0, amount_before_vat: 100, vat_amount: 0,
  grand_total: 100, withholding_tax_amount: 0, net_total: 100,
};
const DOC = "doc-1";
const STORE = "store-1";
const ACTOR = "user-1";

describe("buildRevisionPayload", () => {
  it("captures state+totals snapshot", () => {
    const p = buildRevisionPayload(DOC, STORE, "create", state, totals, ACTOR);
    expect(p.document_id).toBe(DOC);
    expect(p.store_id).toBe(STORE);
    expect(p.action).toBe("create");
    expect(p.actor).toBe(ACTOR);
    expect(p.snapshot.state).toBe(state);
    expect(p.snapshot.totals).toBe(totals);
  });
});

describe("statusUpdatePatch", () => {
  it("draft has no timestamp fields", () => {
    const u = statusUpdatePatch("draft");
    expect(u.status_workflow).toBe("draft");
    expect(u.approved_at).toBeUndefined();
    expect(u.cancelled_at).toBeUndefined();
  });
  it("approved stamps approved_at + approved_by", () => {
    const u = statusUpdatePatch("approved", ACTOR);
    expect(u.status_workflow).toBe("approved");
    expect(u.approved_at).toBeTypeOf("string");
    expect(u.approved_by).toBe(ACTOR);
    expect(u.cancelled_at).toBeUndefined();
  });
  it("cancelled stamps cancelled_at only", () => {
    const u = statusUpdatePatch("cancelled");
    expect(u.cancelled_at).toBeTypeOf("string");
    expect(u.approved_at).toBeUndefined();
  });
  it("pending stamps no timestamps", () => {
    const u = statusUpdatePatch("pending");
    expect(u.status_workflow).toBe("pending");
    expect(u.approved_at).toBeUndefined();
    expect(u.cancelled_at).toBeUndefined();
  });
});

describe("revision audit trail", () => {
  it("create emits exactly one revision", () => {
    const events = recordCreate(DOC, STORE, state, totals, ACTOR);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("insert_revision");
    expect(events[0].payload.action).toBe("create");
  });

  it("status change emits update_doc + insert_revision in order", () => {
    const events = recordStatusChange(DOC, STORE, "approved", state, totals, ACTOR);
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("update_doc");
    expect(events[0].payload.approved_at).toBeTypeOf("string");
    expect(events[1].kind).toBe("insert_revision");
    expect(events[1].payload.action).toBe("status_approved");
  });

  it("full flow: create → download → send_admin (pending) → approved → cancelled captures every event", () => {
    const trail: AuditEvent[] = [];
    trail.push(...recordCreate(DOC, STORE, state, totals, ACTOR));
    trail.push(...recordDownload(DOC, STORE, state, totals, ACTOR));
    trail.push(...recordStatusChange(DOC, STORE, "pending", state, totals, ACTOR));
    trail.push(...recordStatusChange(DOC, STORE, "approved", state, totals, ACTOR));
    trail.push(...recordStatusChange(DOC, STORE, "cancelled", state, totals, ACTOR));

    const insertActions = trail
      .filter((e) => e.kind === "insert_revision")
      .map((e) => e.payload.action);
    expect(insertActions).toEqual([
      "create",
      "download",
      "status_pending",
      "status_approved",
      "status_cancelled",
    ]);

    // download must be recorded BEFORE send_admin (pending)
    expect(insertActions.indexOf("download")).toBeLessThan(insertActions.indexOf("status_pending"));

    // every status change produced exactly one update_doc
    const updates = trail.filter((e) => e.kind === "update_doc");
    expect(updates).toHaveLength(3);
    expect(updates.map((u) => u.payload.status_workflow)).toEqual(["pending", "approved", "cancelled"]);

    // approval and cancellation each stamped their respective timestamp
    expect(updates[1].payload.approved_at).toBeTypeOf("string");
    expect(updates[2].payload.cancelled_at).toBeTypeOf("string");
  });

  it("download before send_admin keeps both events in revisions", () => {
    const trail: AuditEvent[] = [
      ...recordDownload(DOC, STORE, state, totals, ACTOR),
      ...recordStatusChange(DOC, STORE, "pending", state, totals, ACTOR),
    ];
    const inserts = trail.filter((e) => e.kind === "insert_revision");
    expect(inserts).toHaveLength(2);
    expect(inserts[0].payload.action).toBe("download");
    expect(inserts[1].payload.action).toBe("status_pending");
  });
});