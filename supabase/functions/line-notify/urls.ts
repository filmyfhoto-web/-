// Pure URL builders for LINE notification messages.
// Extracted so they can be unit-tested under vitest and reused from
// Playwright e2e tests without pulling in the Deno runtime.

export interface DocLinks {
  detail_url: string | null;
  pdf_url: string | null;
  xlsx_url: string | null;
}

/** Canonical public app URL used in every LINE message when PUBLIC_APP_URL is unset. */
export const DEFAULT_PUBLIC_APP_URL = "https://www.filmyynatta.com";

/**
 * Resolve the origin used for links in LINE messages.
 * Priority:
 *  1. PUBLIC_APP_URL secret (recommended — always custom domain)
 *  2. DEFAULT_PUBLIC_APP_URL fallback (logged with reason)
 *  3. Request origin / referer / explicit fallback (last resort — may be preview)
 *
 * Returns both the resolved origin and the `source` label so callers can
 * log a clear reason.
 */
export function pickPublicOrigin(
  envUrl: string | null | undefined,
  req?: { headers: Headers } | null,
  explicitFallback?: string | null,
): { origin: string; source: "env" | "default" | "request" | "none"; reason?: string } {
  const clean = (raw: string) => raw.replace(/\/+$/, "");
  const asOrigin = (raw: string) => {
    try { return new URL(raw).origin; } catch { return ""; }
  };
  if (envUrl && envUrl.trim().length > 0) {
    const o = asOrigin(envUrl.trim());
    if (o) return { origin: o, source: "env" };
    return { origin: clean(DEFAULT_PUBLIC_APP_URL), source: "default", reason: `PUBLIC_APP_URL "${envUrl}" is not a valid URL — falling back to default` };
  }
  // Env not set — default to canonical domain and record why
  const def = asOrigin(DEFAULT_PUBLIC_APP_URL);
  if (def) return { origin: def, source: "default", reason: "PUBLIC_APP_URL secret not set — using DEFAULT_PUBLIC_APP_URL" };
  const fromReq = req?.headers.get("origin") || req?.headers.get("referer") || explicitFallback || "";
  const ro = asOrigin(fromReq);
  if (ro) return { origin: ro, source: "request", reason: "no PUBLIC_APP_URL configured — using request origin (may be Lovable preview)" };
  return { origin: "", source: "none", reason: "no valid origin resolved" };
}

/** Customer-facing "update products" page for a specific school slug. */
export function guestShopUrl(origin: string, slug: string | null | undefined): string | null {
  if (!origin || !slug) return null;
  return `${origin}/s/${encodeURIComponent(slug)}`;
}

export function orderUrls(origin: string, orderId: string): DocLinks {
  if (!origin || !orderId) return { detail_url: null, pdf_url: null, xlsx_url: null };
  return {
    detail_url: `${origin}/admin/orders/${orderId}`,
    pdf_url: `${origin}/admin/orders/${orderId}?export=pdf`,
    xlsx_url: `${origin}/admin/orders/${orderId}?export=xlsx`,
  };
}

export function docUrls(origin: string, docId: string, docNo?: string | null): DocLinks {
  if (!origin || !docId) return { detail_url: null, pdf_url: null, xlsx_url: null };
  const key = docNo || docId;
  return {
    detail_url: docNo
      ? `${origin}/receipts?doc=${encodeURIComponent(docNo)}`
      : `${origin}/receipts`,
    pdf_url: `${origin}/receipts?doc=${encodeURIComponent(key)}&export=pdf`,
    xlsx_url: `${origin}/receipts?doc=${encodeURIComponent(key)}&export=xlsx`,
  };
}

/**
 * ลิงก์ฝั่ง "ลูกค้า" — ใช้ในข้อความที่ส่งหาลูกค้าเท่านั้น
 * (ของเดิม `orderUrls` เป็นลิงก์แอดมิน `/admin/orders/:id` ซึ่งลูกค้าเปิดไม่ได้)
 */
export function customerOrderUrls(origin: string, orderId: string): DocLinks {
  if (!origin || !orderId) return { detail_url: null, pdf_url: null, xlsx_url: null };
  return {
    detail_url: `${origin}/my-orders/${encodeURIComponent(orderId)}`,
    pdf_url: null,
    xlsx_url: null,
  };
}

/** หน้ารวมเอกสารของลูกค้า (ใบเสนอราคา/ใบส่งของ/ใบเสร็จ) */
export function customerDocsUrl(origin: string): string | null {
  return origin ? `${origin}/account/documents` : null;
}

/** หน้าประวัติและสถานะคำสั่งซื้อของลูกค้า */
export function customerHistoryUrl(origin: string): string | null {
  return origin ? `${origin}/account/history` : null;
}
