import { supabase } from "@/integrations/supabase/client";

/**
 * Daily roll-up of admin alert activity (pure aggregation + a staff-only read).
 */

export const DOWNLOAD_ACTIONS = [
  "order_export_csv",
  "order_export_xlsx",
  "order_pdf_download",
] as const;

export const DOWNLOAD_KIND_LABEL_TH: Record<string, string> = {
  order_export_csv: "CSV",
  order_export_xlsx: "Excel (XLSX)",
  order_pdf_download: "ใบสั่งงาน (PDF)",
};

export interface DailyActivityStat {
  day: string;            // yyyy-mm-dd
  newOrders: number;
  acks: number;
  resends: number;
  autoResends: number;
  downloads: number;
  downloadsByKind: Record<string, number>;
  documentsCreated: number;
  statusChanges: number;
}

export interface ActivityLogLite {
  action: string;
  created_at: string;
  detail?: Record<string, unknown> | null;
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function blank(day: string): DailyActivityStat {
  return {
    day,
    newOrders: 0,
    acks: 0,
    resends: 0,
    autoResends: 0,
    downloads: 0,
    downloadsByKind: {},
    documentsCreated: 0,
    statusChanges: 0,
  };
}

/** Aggregate logs + orders into per-day rows, newest day first. */
export function buildDailyStats(
  logs: ActivityLogLite[],
  orders: Array<{ created_at: string }> = [],
): DailyActivityStat[] {
  const map = new Map<string, DailyActivityStat>();
  const get = (day: string) => {
    if (!map.has(day)) map.set(day, blank(day));
    return map.get(day)!;
  };

  for (const o of orders) {
    const d = dayKey(o.created_at);
    if (d) get(d).newOrders += 1;
  }

  for (const l of logs) {
    const d = dayKey(l.created_at);
    if (!d) continue;
    const row = get(d);
    switch (l.action) {
      case "order_ack":
      case "order_ack_all":
        row.acks += 1;
        break;
      case "order_line_resend":
        row.resends += 1;
        if (l.detail?.auto === true) row.autoResends += 1;
        break;
      case "order_document_create":
        row.documentsCreated += 1;
        break;
      case "order_status_change":
        row.statusChanges += 1;
        break;
      default:
        if ((DOWNLOAD_ACTIONS as readonly string[]).includes(l.action)) {
          row.downloads += 1;
          row.downloadsByKind[l.action] = (row.downloadsByKind[l.action] ?? 0) + 1;
        }
    }
  }

  return [...map.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

export function sumStats(rows: DailyActivityStat[]): DailyActivityStat {
  const total = blank("รวม");
  for (const r of rows) {
    total.newOrders += r.newOrders;
    total.acks += r.acks;
    total.resends += r.resends;
    total.autoResends += r.autoResends;
    total.downloads += r.downloads;
    total.documentsCreated += r.documentsCreated;
    total.statusChanges += r.statusChanges;
    for (const [k, v] of Object.entries(r.downloadsByKind)) {
      total.downloadsByKind[k] = (total.downloadsByKind[k] ?? 0) + v;
    }
  }
  return total;
}

/** Fetch raw data for the stats page. Staff-only via RLS. */
export async function fetchActivityStatsData(from: string, to: string) {
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59.999`;
  const [logsRes, ordersRes] = await Promise.all([
    supabase
      .from("activity_logs")
      .select("action, created_at, detail")
      .eq("target_type", "order")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("orders")
      .select("created_at")
      .is("deleted_at", null)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(5000),
  ]);
  return {
    logs: ((logsRes.data as any[]) ?? []) as ActivityLogLite[],
    orders: ((ordersRes.data as any[]) ?? []) as Array<{ created_at: string }>,
    error: logsRes.error?.message || ordersRes.error?.message || null,
  };
}