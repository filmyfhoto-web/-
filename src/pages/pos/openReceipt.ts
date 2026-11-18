/**
 * Receipt navigation helpers.
 *
 * The printable receipt is opened SAME-TAB via React Router by default.
 * Popups/new tabs were the root cause of the "มันเด้ง" reports: on iOS
 * Safari and installed PWAs `window.open` either gets blocked, opens a
 * detached window without the app session, or the OS bounces the user back
 * to the previous app. Same-tab navigation keeps the session, the route
 * guard and the browser back button all working.
 *
 * `openReceiptInNewTab` remains available as a deliberate, secondary action.
 */

export interface ReceiptPathOptions {
  /**
   * Only ever true for an explicit desktop opt-in. Production default is
   * manual printing — auto-print on mount is what closed/bounced Safari.
   */
  autoprint?: boolean;
  /** Where the "back" button should return to. Must be an in-app POS path. */
  returnTo?: string;
}

const RETURN_ALLOWLIST = ["/pos"];

/** Accept only same-origin in-app POS paths so `returnTo` can't be abused. */
export function safeReturnTo(value: string | null | undefined, fallback = "/pos"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  const path = value.split("?")[0].split("#")[0];
  const ok = RETURN_ALLOWLIST.some((p) => path === p || path.startsWith(`${p}/`));
  return ok ? value : fallback;
}

export function receiptPath(receiptId: string, opts: ReceiptPathOptions = {}): string {
  const qs = new URLSearchParams();
  if (opts.autoprint) qs.set("autoprint", "1");
  if (opts.returnTo) qs.set("returnTo", safeReturnTo(opts.returnTo));
  const q = qs.toString();
  return `/pos/receipt/${receiptId}${q ? `?${q}` : ""}`;
}

/** Secondary action only — never the primary print path. */
export function openReceiptInNewTab(
  receiptId: string,
  opts: ReceiptPathOptions & { win?: Window } = {},
): boolean {
  const w = (opts.win ?? (typeof window !== "undefined" ? window : undefined)) as Window | undefined;
  if (!w) return false;
  try {
    return !!w.open(receiptPath(receiptId, opts), "_blank");
  } catch {
    return false;
  }
}
