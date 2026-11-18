import { describe, it, expect } from "vitest";
import { buildDailyStats, sumStats, dayKey } from "../orderActivityStats";

const at = (d: string) => `${d}T10:00:00`;

describe("orderActivityStats", () => {
  it("aggregates logs and orders per day", () => {
    const rows = buildDailyStats(
      [
        { action: "order_ack", created_at: at("2026-07-20") },
        { action: "order_line_resend", created_at: at("2026-07-20"), detail: { auto: true } },
        { action: "order_line_resend", created_at: at("2026-07-20") },
        { action: "order_export_csv", created_at: at("2026-07-20") },
        { action: "order_export_xlsx", created_at: at("2026-07-21") },
        { action: "order_pdf_download", created_at: at("2026-07-21") },
        { action: "order_document_create", created_at: at("2026-07-21") },
        { action: "order_status_change", created_at: at("2026-07-21") },
      ],
      [{ created_at: at("2026-07-20") }, { created_at: at("2026-07-21") }, { created_at: at("2026-07-21") }],
    );
    expect(rows.map((r) => r.day)).toEqual(["2026-07-21", "2026-07-20"]);
    const d20 = rows.find((r) => r.day === "2026-07-20")!;
    expect(d20).toMatchObject({ newOrders: 1, acks: 1, resends: 2, autoResends: 1, downloads: 1 });
    expect(d20.downloadsByKind.order_export_csv).toBe(1);
    const d21 = rows.find((r) => r.day === "2026-07-21")!;
    expect(d21).toMatchObject({ newOrders: 2, downloads: 2, documentsCreated: 1, statusChanges: 1 });
  });

  it("sums all days", () => {
    const rows = buildDailyStats(
      [
        { action: "order_export_xlsx", created_at: at("2026-07-20") },
        { action: "order_export_xlsx", created_at: at("2026-07-21") },
      ],
      [],
    );
    const total = sumStats(rows);
    expect(total.downloads).toBe(2);
    expect(total.downloadsByKind.order_export_xlsx).toBe(2);
  });

  it("ignores invalid timestamps", () => {
    expect(dayKey("nope")).toBe("");
    expect(buildDailyStats([{ action: "order_ack", created_at: "nope" }], [])).toEqual([]);
  });
});
