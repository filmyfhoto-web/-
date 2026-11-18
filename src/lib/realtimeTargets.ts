/**
 * Maps a changed Postgres table to the react-query keys that need refetching.
 *
 * Before this existed, every realtime event ran `queryClient.invalidateQueries()`
 * with no filter, so a single row change refetched *every* query in the app —
 * causing refresh storms, flicker and battery drain on mobile. Now only queries
 * whose key mentions a related token are invalidated.
 */

/** Extra key tokens per table, on top of the tokens derived from its name. */
const ALIASES: Record<string, string[]> = {
  rds_documents: ["doc"],
  rds_document_items: ["doc"],
  rds_document_revisions: ["doc"],
  rds_document_layouts: ["doc", "layout", "template"],
  rds_document_templates: ["doc", "template"],
  rds_document_settings: ["doc", "setting"],
  rds_payments: ["doc", "payment"],
  rds_payment_methods: ["payment"],
  rds_categories: ["cat"],
  rds_products: ["product", "catalog", "pos_products"],
  rds_customers: ["customer"],
  rds_stores: ["store"],
  rds_activity_logs: ["activity"],
  documents: ["doc"],
  order_items: ["order"],
  order_status_events: ["order", "alert"],
  order_replies: ["order"],
  orders: ["order", "alert", "dashboard"],
  guest_orders: ["order", "alert", "dashboard"],
  products: ["product", "catalog", "stock"],
  product_images: ["product"],
  categories: ["cat", "product"],
  stock_movements: ["stock", "product", "movement"],
  pos_receipts: ["pos", "receipt", "dashboard"],
  pos_receipt_items: ["pos", "receipt"],
  pos_store_profile: ["pos", "store"],
  film_job_requests: ["job", "film", "dashboard"],
  film_invoices: ["invoice", "film", "dashboard", "doc"],
  film_customers: ["customer", "film"],
  film_transactions: ["film", "transaction", "dashboard"],
  notifications: ["notification", "alert"],
  inbox_threads: ["inbox", "thread"],
};

/** Strip app prefixes and pluralisation so `rds_products` matches `products_list`. */
export function tokensForTable(table: string): string[] {
  const clean = table.replace(/^(rds_|film_|pos_|v_)/, "");
  const tokens = new Set<string>([table, clean]);
  if (clean.endsWith("s")) tokens.add(clean.slice(0, -1));
  for (const alias of ALIASES[table] ?? []) tokens.add(alias);
  return [...tokens].filter((t) => t.length >= 3);
}

/** True when a react-query key is related to any of the changed tables. */
export function queryKeyMatchesTables(queryKey: readonly unknown[], tables: string[]): boolean {
  const flat = queryKey
    .filter((part) => typeof part === "string")
    .join("|")
    .toLowerCase();
  if (!flat) return false;
  return tables.some((table) => tokensForTable(table).some((token) => flat.includes(token)));
}
