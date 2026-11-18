/**
 * FILM SHOP scoped Supabase client.
 *
 * Wraps the shared @/integrations/supabase/client so the FILM SHOP code
 * (copied verbatim from the original FILM Shop project) transparently
 * targets the film_* tables in this project. Table names used by the
 * copied code are rewritten by a Proxy before hitting the base client,
 * so the source files do not need to know about the film_ prefix.
 */
import { supabase as base } from "@/integrations/supabase/client";

// Map: source table name → this project's prefixed table name.
const TABLE_MAP: Record<string, string> = {
  customers: "film_customers",
  employees: "film_employees",
  invoices: "film_invoices",
  transactions: "film_transactions",
  pos_products: "film_pos_products",
  pos_receipts: "film_pos_receipts",
  cash_advances: "film_cash_advances",
  cash_advance_repayments: "film_cash_advance_repayments",
  cash_drawer_shifts: "film_cash_drawer_shifts",
  cash_drawer_transactions: "film_cash_drawer_transactions",
  cash_drawer_audit: "film_cash_drawer_audit",
  daily_reports: "film_daily_reports",
  paper_withdrawals: "film_paper_withdrawals",
  job_requests: "film_job_requests",
  shop_settings: "film_shop_settings",
  shop_settings_public: "film_shop_settings",
  line_notification_settings: "film_line_notification_settings",
  admin_line_links: "film_admin_line_links",
  payment_status_history: "film_payment_status_history",
  job_type_totals_archived: "film_job_type_totals_archived",
};

function mapTable(name: string): string {
  return TABLE_MAP[name] ?? name;
}

// Wrap a realtime channel so its `.on('postgres_changes', { table }, …)` filters
// get their table names remapped too.
function wrapChannel(ch: any): any {
  const origOn = ch.on.bind(ch);
  ch.on = (event: any, filter: any, cb?: any) => {
    if (filter && typeof filter === "object" && typeof filter.table === "string") {
      filter = { ...filter, table: mapTable(filter.table) };
    }
    return origOn(event, filter, cb);
  };
  return ch;
}

export const supabase: any = new Proxy(base as any, {
  get(target, prop: any, receiver) {
    if (prop === "from") {
      return (name: string) => target.from(mapTable(name));
    }
    if (prop === "channel") {
      return (name: string, opts?: any) =>
        wrapChannel(opts ? target.channel(name, opts) : target.channel(name));
    }
    return Reflect.get(target, prop, receiver);
  },
});

export type { Session, User } from "@supabase/supabase-js";
