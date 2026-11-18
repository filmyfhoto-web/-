import { useEffect, useState } from "react";
import { clearMeasuredHeaderMm, setMeasuredHeaderMm } from "./paginate";

const PX_PER_MM = 96 / 25.4;

/**
 * Measure the REAL rendered header block(s) inside the live `#doc-print`
 * preview and publish the result (in mm) to the paginator, so page-capacity
 * math uses the actual header height instead of an assumed constant.
 *
 * `offsetHeight` is used on purpose: it ignores the preview's CSS `scale`
 * transform, so the value is the logical paper-space height that print/PDF
 * will use.
 */
export function useMeasuredDocHeader(deps: unknown[] = []): { full: number | null; compact: number | null } {
  const [mm, setMm] = useState<{ full: number | null; compact: number | null }>({ full: null, compact: null });

  useEffect(() => {
    if (typeof document === "undefined") return;
    let raf = 0;
    let stopped = false;

    // Measurements are only valid for the currently rendered print bundle.
    // Clear the module cache before measuring so another document/template
    // cannot briefly paginate with dimensions from the previous preview.
    clearMeasuredHeaderMm();
    setMm({ full: null, compact: null });

    const measure = () => {
      const root = document.getElementById("doc-print");
      if (!root) return;
      // A bundle can contain several full first-page headers. Never infer the
      // continuation header by position: the second `.doc-header-group` may
      // be the first page of the second selected document.
      const fullNode = root.querySelector<HTMLElement>(".doc-header-group");
      if (!fullNode) return;
      const full = fullNode.offsetHeight / PX_PER_MM;
      const compactNode = root.querySelector<HTMLElement>(".doc-header-compact");
      const compact = compactNode ? compactNode.offsetHeight / PX_PER_MM : null;
      if (!(full > 5)) return;
      const next = {
        full: Math.round(full * 10) / 10,
        compact: compact && compact > 3 ? Math.round(compact * 10) / 10 : null,
      };
      setMeasuredHeaderMm(next);
      setMm((prev) => (prev.full === next.full && prev.compact === next.compact ? prev : next));
    };

    const schedule = () => {
      if (stopped) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    schedule();
    const t = window.setTimeout(schedule, 300);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      const root = document.getElementById("doc-print");
      if (root) ro.observe(root);
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro?.disconnect();
      clearMeasuredHeaderMm();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return mm;
}
