// Share flow for customer purchase orders. Save-first, then try Web Share API,
// then fall back to clipboard copy + optional file download. Never blocks the
// caller: opening the LINE OA URL is a separate user action.

export const LINE_OA_URL = "https://lin.ee/QaMCxQg";

export interface ShareResult {
  channel: "webshare" | "clipboard" | "download" | "failed";
  error?: string;
}

export async function sharePurchaseOrder(opts: {
  poNumber: string;
  summary: string;
}): Promise<ShareResult> {
  const title = `ใบสั่งสินค้า ${opts.poNumber}`;
  try {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      await (navigator as any).share({ title, text: opts.summary });
      return { channel: "webshare" };
    }
  } catch (e: any) {
    // AbortError = user cancelled; treat as non-fatal.
    if (e?.name === "AbortError") return { channel: "webshare" };
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(opts.summary);
      return { channel: "clipboard" };
    }
  } catch { /* fall through */ }
  try {
    const blob = new Blob([opts.summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${opts.poNumber || "purchase-order"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { channel: "download" };
  } catch (e: any) {
    return { channel: "failed", error: e?.message ?? String(e) };
  }
}

export function openLineOa(): void {
  if (typeof window === "undefined") return;
  window.open(LINE_OA_URL, "_blank", "noopener,noreferrer");
}