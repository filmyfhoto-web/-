/**
 * Parse a print-page range string like "1,3,5-7" into a Set of 1-based page
 * indexes. Empty string, whitespace, or invalid input → null (meaning "print
 * all pages").
 */
export function parsePageRange(input: string, totalPages: number): Set<number> | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  const pages = new Set<number>();
  const parts = trimmed.split(/[,\s]+/).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) {
        if (i >= 1 && i <= totalPages) pages.add(i);
      }
      continue;
    }
    const n = parseInt(part, 10);
    if (Number.isNaN(n)) return null;
    if (n >= 1 && n <= totalPages) pages.add(n);
  }
  if (pages.size === 0) return null;
  return pages;
}

/**
 * Apply a page-range filter to a printable container by marking pages outside
 * the selection with `data-print-skip="true"`. Returns a cleanup function that
 * removes the attribute so the on-screen preview stays unaffected.
 */
export function applyPrintPageFilter(root: HTMLElement, range: string): () => void {
  const pages = root.querySelectorAll<HTMLElement>(".doc-page[data-page-idx]");
  const total = pages.length;
  const selected = parsePageRange(range, total);
  if (!selected) return () => { /* no filter applied */ };
  const touched: HTMLElement[] = [];
  pages.forEach((el) => {
    const idx = parseInt(el.dataset.pageIdx ?? "", 10);
    if (!selected.has(idx)) {
      el.setAttribute("data-print-skip", "true");
      touched.push(el);
    }
  });
  return () => touched.forEach((el) => el.removeAttribute("data-print-skip"));
}