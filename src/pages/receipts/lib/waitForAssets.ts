/**
 * Wait until the print DOM (`#doc-print`) is safe to snapshot:
 *   1. `document.fonts.ready` — Sarabun and other web fonts have loaded, so
 *      Thai glyphs won't render as boxes in html2canvas/jsPDF output.
 *   2. Every `<img>` inside the print node has either loaded or failed. We
 *      resolve on `error` too so a single broken logo doesn't hang the
 *      export forever; the caller sees the missing image, not a stuck spinner.
 *
 * A generous timeout (`timeoutMs`, default 8s) guarantees the promise always
 * resolves so exports never wedge the UI on a stalled network image.
 */
export async function waitForExportAssets(
  root: HTMLElement | null = document.getElementById("doc-print"),
  timeoutMs = 8000,
): Promise<void> {
  const fontsPromise: Promise<unknown> =
    typeof document !== "undefined" && (document as any).fonts?.ready
      ? (document as any).fonts.ready
      : Promise.resolve();

  const imgs = root ? Array.from(root.querySelectorAll<HTMLImageElement>("img")) : [];
  const imgPromises = imgs.map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) return resolve();
        const done = () => {
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          resolve();
        };
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }),
  );

  const work = Promise.all([fontsPromise, ...imgPromises]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([work, timeout]);
}