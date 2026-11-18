import { describe, it, expect } from "vitest";
import { groupTraces, filterTraces, tracesToCsv } from "@/lib/lineLoginLogs";

const rows = [
  { id: "3", created_at: "2026-08-02T07:00:02Z", detail: { step: "token_exchange_failed", ok: false, trace_id: "t1", flow: "login", error: "invalid_grant" } },
  { id: "2", created_at: "2026-08-02T07:00:01Z", detail: { step: "state_consumed", ok: true, trace_id: "t1", flow: "login" } },
  { id: "1", created_at: "2026-08-02T06:59:00Z", detail: { step: "session_created", ok: true, trace_id: "t2", flow: "link" } },
];

describe("lineLoginLogs", () => {
  it("groups rows per trace, newest first", () => {
    const t = groupTraces(rows as never);
    expect(t.map((x) => x.traceId)).toEqual(["t1", "t2"]);
    expect(t[0].steps).toHaveLength(2);
    expect(t[0].failed).toBe(true);
    expect(t[0].failedStep).toBe("token_exchange_failed");
    expect(t[1].finished).toBe(true);
  });

  it("filters by failure, flow and search", () => {
    const t = groupTraces(rows as never);
    expect(filterTraces(t, { onlyFailed: true })).toHaveLength(1);
    expect(filterTraces(t, { flow: "link" })[0].traceId).toBe("t2");
    expect(filterTraces(t, { search: "invalid_grant" })[0].traceId).toBe("t1");
  });

  it("exports one csv line per step", () => {
    const csv = tracesToCsv(groupTraces(rows as never));
    expect(csv.split("\n")).toHaveLength(4);
    expect(csv).toContain("invalid_grant");
  });
});
