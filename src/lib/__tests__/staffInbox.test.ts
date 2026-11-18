import { describe, expect, it } from "vitest";
import {
  ageHours, ageLabel, countByStatus, isOpenOrder, NEXT_STATUS, queueIndex, sortInboxOrders,
} from "@/lib/staffInbox";

const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

describe("staff inbox queue", () => {
  it("orders the queue from most to least urgent stage", () => {
    expect(queueIndex("pending_quote")).toBeLessThan(queueIndex("ready"));
    expect(queueIndex("completed")).toBe(5);
  });

  it("only keeps open statuses", () => {
    expect(isOpenOrder("picking")).toBe(true);
    expect(isOpenOrder("completed")).toBe(false);
    expect(isOpenOrder("cancelled")).toBe(false);
  });

  it("sorts by stage then oldest first", () => {
    const rows = [
      { id: "a", status: "ready", created_at: iso(50) },
      { id: "b", status: "pending_quote", created_at: iso(2) },
      { id: "c", status: "pending_quote", created_at: iso(30) },
    ];
    expect(sortInboxOrders(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("counts per status", () => {
    const counts = countByStatus([{ status: "quoted" }, { status: "quoted" }, { status: "ready" }]);
    expect(counts).toEqual({ quoted: 2, ready: 1 });
  });

  it("advances through the whole pipeline", () => {
    expect(NEXT_STATUS.pending_quote).toBe("quoted");
    expect(NEXT_STATUS.ready).toBe("completed");
  });

  it("labels waiting time", () => {
    expect(ageHours(iso(5))).toBe(5);
    expect(ageLabel(iso(0.2))).toBe("ไม่ถึง 1 ชม.");
    expect(ageLabel(iso(5))).toBe("5 ชม.");
    expect(ageLabel(iso(50))).toBe("2 วัน");
  });
});