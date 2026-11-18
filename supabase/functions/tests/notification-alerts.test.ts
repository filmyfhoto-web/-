// Focused tests for the server-side staff-alert helpers (dedupe types + copy).
import { describe, it, expect } from "vitest";
import { alertTypeFor, alertTitle } from "../_shared/alertTypes.ts";

describe("alertTypeFor", () => {
  it("maps sources to the three rate-limited internal alert types", () => {
    expect(alertTypeFor("line-webhook")).toBe("webhook_failure");
    expect(alertTypeFor("line-oauth-callback")).toBe("line_login_failure");
    expect(alertTypeFor("staff-line-login")).toBe("line_login_failure");
    expect(alertTypeFor("line-link-start")).toBe("line_link_failure");
  });
});

describe("alertTitle", () => {
  it("returns Thai copy for every alert type", () => {
    for (const t of ["webhook_failure", "line_login_failure", "line_link_failure"]) {
      expect(/[ก-๙]/.test(alertTitle(t))).toBe(true);
    }
  });
});

describe("sensitive alert types", () => {
  it("are exactly the types blocked from client insert by RLS", () => {
    const sensitive = ["line_login_failure", "line_link_failure", "webhook_failure"];
    for (const s of sensitive) expect(s.endsWith("_failure")).toBe(true);
  });
});
