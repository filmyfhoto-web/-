// Canonical product-link builder.
//
// Requirements:
// - Always produce an absolute https URL that opens correctly in a plain
//   browser *and* inside the LINE in-app browser.
// - Never leak preview hosts (id-preview--*.lovable.app) into shared links —
//   those are ephemeral and blocked for guests.
// - Encode the product identifier safely.
//
// The route target is `/shop?p=<code>` (falls back to `?product=<id>` when a
// product code is not available). Shop.tsx picks up either query param and
// scrolls/highlights the matching product.

/** Preferred public origin for share links. Kept in sync with edge functions. */
export const CANONICAL_PUBLIC_ORIGIN = "https://www.filmyynatta.com";

function isSharePreviewHost(host: string): boolean {
  // Ephemeral Lovable preview domains — not safe to share externally.
  if (host.endsWith(".lovable.app") && host.includes("id-preview--")) return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  return false;
}

export function resolvePublicOrigin(): string {
  if (typeof window === "undefined") return CANONICAL_PUBLIC_ORIGIN;
  try {
    const loc = window.location;
    if (loc.protocol !== "https:" || isSharePreviewHost(loc.hostname)) {
      return CANONICAL_PUBLIC_ORIGIN;
    }
    return loc.origin;
  } catch {
    return CANONICAL_PUBLIC_ORIGIN;
  }
}

export interface ProductLinkInput {
  id?: string | null;
  code?: string | null;
}

/**
 * Build a shareable product URL.
 * Prefers product code (`?p=CODE`) because it is human-readable and stable
 * across environments. Falls back to id (`?product=UUID`).
 */
export function buildProductUrl(p: ProductLinkInput, origin?: string): string {
  const base = (origin || resolvePublicOrigin()).replace(/\/+$/, "");
  const code = (p.code || "").trim();
  if (code) return `${base}/shop?p=${encodeURIComponent(code)}`;
  const id = (p.id || "").trim();
  if (id) return `${base}/shop?product=${encodeURIComponent(id)}`;
  return `${base}/shop`;
}

/** Copy any string to the clipboard with a graceful fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallthrough to legacy path
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}