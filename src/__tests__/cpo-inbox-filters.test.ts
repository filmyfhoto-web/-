import { describe, expect, it } from "vitest";
import { countUnread, emptyCpoFilters, filterCpoRows, orgOptions } from "@/lib/cpoInbox";

const rows = [
  { id: "a", created_at: "2026-01-05T03:00:00Z", review_status: "not_sent", school_or_org: "โรงเรียน ก" },
  { id: "b", created_at: "2026-02-10T03:00:00Z", review_status: "confirmed", school_or_org: "โรงเรียน ข" },
  { id: "c", created_at: "2026-03-01T03:00:00Z", review_status: "confirmed", school_or_org: "โรงเรียน ก" },
];

describe("cpo inbox filters", () => {
  it("ไม่กรองอะไรเมื่อไม่มีตัวกรอง", () => {
    expect(filterCpoRows(rows, emptyCpoFilters)).toHaveLength(3);
  });

  it("กรองตามสถานะและหน่วยงาน", () => {
    const out = filterCpoRows(rows, { ...emptyCpoFilters, statuses: ["confirmed"], org: "โรงเรียน ก" });
    expect(out.map((r) => r.id)).toEqual(["c"]);
  });

  it("กรองตามช่วงวันที่", () => {
    const out = filterCpoRows(rows, { ...emptyCpoFilters, from: "2026-02-01", to: "2026-02-28" });
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });

  it("กรองเฉพาะยังไม่อ่าน และนับค้างอ่านได้", () => {
    const read = { a: true as const };
    expect(filterCpoRows(rows, { ...emptyCpoFilters, unreadOnly: true }, read).map((r) => r.id)).toEqual(["b", "c"]);
    expect(countUnread(rows, read)).toBe(2);
  });

  it("รวมรายชื่อหน่วยงานแบบไม่ซ้ำ", () => {
    expect(orgOptions(rows)).toEqual(["โรงเรียน ก", "โรงเรียน ข"]);
  });
});