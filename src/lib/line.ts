// Helpers for LINE add-friend URLs.
// Goal: give mobile users a deep link that opens the LINE app directly
// (no QR-scan page), and a sensible web fallback for desktop.

function extractId(input: string): string | null {
  const v = (input || "").trim();
  if (!v) return null;
  // line://ti/p/@id or line://ti/p/id
  let m = v.match(/^line:\/\/ti\/p\/@?([A-Za-z0-9._-]+)/i);
  if (m) return m[1];
  // https://line.me/R/ti/p/@id  (or URL-encoded %40)
  m = v.match(/line\.me\/R\/ti\/p\/(?:@|%40)?([A-Za-z0-9._-]+)/i);
  if (m) return m[1];
  // bare @id or id
  m = v.match(/^@?([A-Za-z0-9._-]+)$/);
  if (m) return m[1];
  return null;
}

/** Normalize any LINE input into a stored web URL (used at save time). */
export function normalizeLineUrl(input: string | null | undefined): string {
  const v = (input || "").trim();
  if (!v) return "";
  // Smart URL from LINE OA Manager — keep as-is (best UX on mobile)
  if (/^https?:\/\/lin\.ee\//i.test(v)) return v;
  if (/^https?:\/\//i.test(v) && !/line\.me\/R\/ti\/p\//i.test(v)) return v;
  const id = extractId(v);
  if (!id) return v;
  // URL-encode the @ so LINE treats it as an Official Account add-friend link
  return `https://line.me/R/ti/p/%40${id}`;
}

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Deep link that opens the LINE app's chat with an Official Account and
 * pre-fills the input box with `text`. On mobile this jumps straight into
 * the OA chat — the customer only taps "send" once to bind their order.
 *
 * Ref: https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/
 *   line://oaMessage/@{basicId}/?{text}  (URL-encoded)
 * Web fallback: https://line.me/R/oaMessage/@{basicId}/?{text}
 */
export function lineOaMessageUrl(
  basicId: string | null | undefined,
  text: string,
  opts: { app?: boolean } = {},
): string {
  const id = (basicId || "").trim().replace(/^@/, "");
  if (!id) return "";
  const encoded = encodeURIComponent(text || "");
  return opts.app
    ? `line://oaMessage/@${id}/?${encoded}`
    : `https://line.me/R/oaMessage/@${id}/?${encoded}`;
}

/**
 * Extract the LINE Official Account basic ID (e.g. "nattafilmyy") from
 * any stored LINE URL / deep link / bare handle. Returns null when the
 * input isn't recognizable.
 */
export function extractLineBasicId(input: string | null | undefined): string | null {
  return extractId(input || "");
}

/**
 * Open the LINE OA chat and pre-fill the bind phrase. On mobile, tries the
 * `line://` deep link first; on desktop (or when the app isn't installed),
 * falls back to the web URL which offers to open LINE or scan a QR.
 */
export function openLineWithMessage(storedUrl: string | null | undefined, text: string): void {
  const id = extractId(storedUrl || "");
  if (!id || !text) { openLine(storedUrl); return; }
  if (isMobile()) {
    const app = lineOaMessageUrl(id, text, { app: true });
    const web = lineOaMessageUrl(id, text);
    window.location.href = app;
    window.setTimeout(() => { window.location.href = web; }, 800);
    return;
  }
  window.open(lineOaMessageUrl(id, text), "_blank", "noopener,noreferrer");
}

/**
 * Open a LINE add-friend link. On mobile, tries the `line://` deep link
 * first so the LINE app opens directly without showing a QR page; falls
 * back to the stored web URL.
 */
export function openLine(storedUrl: string | null | undefined): void {
  const web = normalizeLineUrl(storedUrl) || (storedUrl || "");
  if (!web) return;
  if (isMobile()) {
    const id = extractId(storedUrl || "") || extractId(web);
    if (id) {
      // Deep link straight into the LINE app's add-friend screen.
      window.location.href = `line://ti/p/@${id}`;
      // Fallback to the web URL if the app isn't installed.
      window.setTimeout(() => { window.location.href = web; }, 800);
      return;
    }
  }
  window.open(web, "_blank", "noopener,noreferrer");
}