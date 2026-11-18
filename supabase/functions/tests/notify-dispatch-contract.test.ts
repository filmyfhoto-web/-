// Contract tests for the central dispatcher source: privileged actions, the
// simulated self-test channel and the absence of embedded secrets.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../notify-dispatch/index.ts"),
  "utf8",
);

describe("notify-dispatch", () => {
  it("claims atomically through the DB function with a lease", () => {
    expect(src).toContain("notification_outbox_claim");
    expect(src).toContain("p_lease_seconds");
  });

  it("uses the outbox row id as the provider retry key", () => {
    expect(src).toMatch(/pushLine\(jobToken, to, text, job\.id\)/);
  });

  it("requires a worker token or an owner/admin for drain", () => {
    expect(src).toContain("hasWorkerToken");
    expect(src).toContain('json({ error: "unauthorized" }, 401)');
    expect(src).toContain('json({ error: "forbidden" }, 403)');
  });

  it("self-test is staff-only, idempotent and never calls the provider", () => {
    expect(src).toContain('action === "selftest"');
    expect(src).toContain("SELFTEST_CHANNEL");
    expect(src).toContain("p_client_request_id: clientReqId");
    // selftest rows short-circuit before any push
    expect(src).toMatch(/SELFTEST_CHANNEL\) \{[\s\S]*?continue;/);
  });

  it("records the outcome of every run", () => {
    expect(src).toMatch(/finishRun\(\{ claimed: rows\.length, sent, failed, skipped, dead \}\)/);
  });

  it("contains no hardcoded tokens or keys", () => {
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(src).not.toMatch(/sb_(publishable|secret)_[A-Za-z0-9_-]{10,}/);
  });
});

describe("order notification producers", () => {
  const read = (p: string) =>
    readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), p), "utf8");

  it.each([
    "../line-notify/index.ts",
    "../link-request-notify/index.ts",
    "../notify-new-signup/index.ts",
    "../guest-order-submit/index.ts",
  ])("%s enqueues instead of pushing", (file) => {
    const s = read(file);
    expect(s).not.toContain("api.line.me/v2/bot/message");
    expect(s).toMatch(/notifyOrderEvent|enqueueNotification|notification_outbox_enqueue/);
  });

  it("admin LINE tests can only target an approved recipient", () => {
    const s = read("../line-notify/index.ts");
    expect(s).toContain("recipient_not_allowed");
    expect(s).toContain("staff_line_bindings");
  });
});

describe("dispatcher authorization surface", () => {
  it("never trusts a client-supplied recipient for a manual resend", () => {
    // The resend branch must read the destination from the stored row.
    const branch = src.slice(src.indexOf('if (action === "enqueue")'), src.indexOf('if (action === "selftest"'));
    expect(branch).not.toMatch(/body\?\.recipient/);
    expect(branch).toContain("outbox_id");
    expect(branch).toContain('.from("notification_outbox")');
  });

  it("requires an authenticated staff caller for both manual actions", () => {
    const guards = src.match(/isStaff\(admin, uid\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it("runs the dry run entirely on the internal test channel", () => {
    const branch = src.slice(src.indexOf('if (action === "selftest"'), src.indexOf('if (action !== "drain")'));
    expect(branch).toContain("SELFTEST_CHANNEL");
    expect(branch).toContain("SELFTEST_REF_TYPE");
    expect(branch).not.toContain("pushLineText");
    // Enqueues twice with the same key to prove duplicates collapse.
    expect((branch.match(/notification_outbox_enqueue/g) ?? []).length).toBe(2);
    expect(branch).toContain("duplicate_suppressed");
  });

  it("accepts dry_run as an alias of the self test", () => {
    expect(src).toContain('action === "dry_run"');
  });
});
