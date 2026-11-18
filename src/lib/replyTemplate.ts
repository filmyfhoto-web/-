/**
 * Render simple {token} placeholders in reply / receipt templates.
 * Tokens are replaced case-insensitively; unknown tokens are left as-is.
 */
export type TemplateVars = Record<string, string | number | null | undefined>;

export function renderTemplate(tpl: string, vars: TemplateVars): string {
  if (!tpl) return "";
  return tpl.replace(/\{(\w+)\}/g, (m, key) => {
    const v = vars[key] ?? vars[key.toLowerCase()];
    return v === null || v === undefined ? m : String(v);
  });
}

/** Build the `{items}` block from a list of order items. */
export function formatItemsBlock(items: Array<{ product_name?: string; qty?: number | string; price?: number | string; total?: number | string }>): string {
  if (!items?.length) return "-";
  return items
    .map((i) => {
      const name = i.product_name ?? "-";
      const qty = Number(i.qty ?? 0);
      const total = Number(i.total ?? 0);
      return `• ${name} × ${qty}  ฿${total.toLocaleString("th-TH")}`;
    })
    .join("\n");
}

/** Available tokens for the admin reply template. */
export const REPLY_TOKENS = [
  "store_name",
  "customer_name",
  "order_no",
  "total",
  "items",
  "payment_link",
  "receipt_no",
  "receipt_url",
] as const;