/**
 * Hook that rasterizes each `BundleAttachmentRef` into ready-to-print pages.
 *
 * Why: `BundlePrint` renders one `.doc-page` per attachment page, and every
 * export channel (Print, PDF, PNG, JPG) snapshots those same DOM nodes. But
 * PDFs and remote images can't be captured reliably as `<iframe>`s or with
 * unresolved CORS. We pre-render every attachment to page-shaped data URLs
 * (via `renderAttachments`) so the printable copy contains only `<img>` tags
 * that all four export pipelines can render identically and in bundle order.
 */
import { useEffect, useMemo, useState } from "react";
import type { BundleAttachmentRef } from "./BundlePrint";
import { renderAttachments, type AttachmentRef, type RenderedAttachment } from "../lib/attachmentRender";

function toRef(att: BundleAttachmentRef): AttachmentRef | null {
  if (!att.url && !att.file) return null;
  const url = att.url ?? (att.file ? URL.createObjectURL(att.file) : undefined);
  if (!url) return null;
  return {
    id: att.id,
    name: att.label,
    path: att.id,
    url,
    type: att.file?.type,
    size: att.file?.size,
  };
}

export function useBundleAttachmentPages(
  attachments: BundleAttachmentRef[],
): BundleAttachmentRef[] {
  const [rendered, setRendered] = useState<Record<string, RenderedAttachment>>({});

  // Serialize which attachments we need to render, so re-renders that
  // don't change the list don't re-fetch/re-render every attachment.
  const key = useMemo(
    () =>
      attachments
        .map((a) => `${a.id}::${a.url ?? ""}::${a.file?.name ?? ""}::${a.file?.size ?? ""}`)
        .join("|"),
    [attachments],
  );

  useEffect(() => {
    let cancelled = false;
    const refs = attachments.map(toRef).filter((r): r is AttachmentRef => !!r);
    if (refs.length === 0) {
      setRendered({});
      return;
    }
    (async () => {
      try {
        const out = await renderAttachments(refs);
        if (cancelled) return;
        const map: Record<string, RenderedAttachment> = {};
        for (const r of out) map[r.ref.id] = r;
        setRendered(map);
      } catch {
        if (!cancelled) setRendered({});
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(
    () =>
      attachments.map((att) => {
        const r = rendered[att.id];
        if (!r) return { ...att, status: "loading" as const };
        if (r.status === "ok") {
          return {
            ...att,
            pages: r.pages.map((p) => ({ dataUrl: p.dataUrl, width: p.width, height: p.height })),
            status: "ok" as const,
          };
        }
        if (r.status === "unsupported") {
          return { ...att, status: "unsupported" as const, statusMessage: r.reason };
        }
        return { ...att, status: "error" as const, statusMessage: r.error };
      }),
    [attachments, rendered],
  );
}