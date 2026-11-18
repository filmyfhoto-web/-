// Single source of truth for "is this LINE identity actually bound?".
//
// Historical model notes:
//  - `line-link-bind` auto-bind mode stores a row with customer_id = NULL
//    (LINE identity known, no customer record yet) — that still counts as
//    bound for the gate.
//  - `admin_unbind_line_customer` clears customer_id and stamps
//    customer_source = 'admin_unbound'. That row MUST NOT count as bound,
//    otherwise an unbound customer keeps passing RequireLineLink.

export const UNBOUND_SOURCE = "admin_unbound";

export interface LineLinkRow {
  line_user_id?: string | null;
  customer_id?: string | null;
  customer_source?: string | null;
  verified_at?: string | null;
}

/** Server truth for the gate: a row exists and has not been revoked. */
export function isBoundLink(row: LineLinkRow | null | undefined): boolean {
  if (!row) return false;
  if (row.customer_source === UNBOUND_SOURCE) return false;
  return true;
}

/** Which table holds the customer name for a given link row. */
export function customerNameTable(
  source?: string | null,
): "rds_customers" | "guest_customers" | "profiles" | null {
  switch (source) {
    case "rds":
      return "rds_customers";
    case "guest":
      return "guest_customers";
    case "profile":
    case "admin_manual":
      return "profiles";
    default:
      return null;
  }
}

/** Column that holds the display name in the resolved table. */
export function customerNameColumn(source?: string | null): "name" | "full_name" | null {
  const table = customerNameTable(source);
  if (!table) return null;
  return table === "profiles" ? "full_name" : "name";
}
