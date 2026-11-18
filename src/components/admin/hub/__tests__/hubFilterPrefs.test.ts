import { describe, expect, it } from "vitest";
import { DEFAULT_HUB_FILTERS, sanitizeHubFilters } from "../hubFilterPrefs";

describe("sanitizeHubFilters", () => {
  it("คืนค่าเริ่มต้นเมื่อข้อมูลเสียหาย", () => {
    expect(sanitizeHubFilters(null)).toEqual(DEFAULT_HUB_FILTERS);
    expect(sanitizeHubFilters({ filter: "nope", range: "xx", status: 1 })).toEqual(DEFAULT_HUB_FILTERS);
  });

  it("เก็บค่าที่ถูกต้องไว้", () => {
    expect(sanitizeHubFilters({ filter: "order", range: "7d", status: "unread", query: " a ", sortDesc: false })).toEqual({
      filter: "order", range: "7d", status: "unread", query: " a ", sortDesc: false,
    });
  });
});
