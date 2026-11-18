/**
 * Shared attachment renderer used by the unified PrintExportSettings pipeline.
 *
 * - Images: fetched from storage, returned as data URLs.
 * - PDFs: every page rendered via pdfjs-dist (not just page 1, so multi-page
 *   supporting documents come through intact in preview / print / PDF / PNG /
 *   JPG exports).
 * - Anything else: returned as `unsupported` with a Thai reason string so the
 *   caller can show a "ไม่รองรับไฟล์นี้" row instead of crashing.
 *
 * All errors are captured per-attachment — one broken file must not silently
 * drop the rest of the list.
 */
import { supabase } from "@/integrations/supabase/client";

// pdfjs-dist is loaded lazily inside renderPdfAllPages so unit tests running
// in jsdom (no DOMMatrix) don't crash at module-load time.
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      // @ts-ignore worker via CDN, matches installed version
      mod.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return pdfjsPromise;
}

const DEFAULT_BUCKET = "invoice-attachments";

export interface AttachmentRef {
  /** Stable id used in PrintAttachmentSelection.selected + order. Typically
   * the storage path so it survives re-renders. */
  id: string;
  name: string;
  path: string;
  bucket?: string;
  type?: string;
  size?: number;
  /** Optional pre-resolved URL (skips storage signing). */
  url?: string;
}

export type RenderedPage = {
  /** Data URL (image/png or image/jpeg) of one page-sized image. */
  dataUrl: string;
  /** Rendered pixel width/height so callers can preserve aspect ratio. */
  width: number;
  height: number;
};

export type RenderedAttachment =
  | {
      status: "ok";
      ref: AttachmentRef;
      kind: "image" | "pdf";
      pages: RenderedPage[];
    }
  | {
      status: "unsupported";
      ref: AttachmentRef;
      reason: string;
    }
  | {
      status: "error";
      ref: AttachmentRef;
      error: string;
    };

export function isImage(att: Pick<AttachmentRef, "type" | "name">): boolean {
  if (att.type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(att.name);
}

export function isPdf(att: Pick<AttachmentRef, "type" | "name">): boolean {
  if (att.type?.includes("pdf")) return true;
  return /\.pdf$/i.test(att.name);
}

async function fetchBlob(att: AttachmentRef): Promise<Blob> {
  if (att.url) {
    const r = await fetch(att.url);
    if (!r.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (${r.status})`);
    return await r.blob();
  }
  const bucket = att.bucket || DEFAULT_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(att.path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message || "ไม่สามารถสร้างลิงก์ไฟล์ได้");
  const r = await fetch(data.signedUrl);
  if (!r.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (${r.status})`);
  return await r.blob();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function imageDataUrlToPage(dataUrl: string): Promise<RenderedPage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("ภาพเสียหรืออ่านไม่ได้"));
    img.src = dataUrl;
  });
}

async function renderPdfAllPages(blob: Blob): Promise<RenderedPage[]> {
  const pdfjsLib = await loadPdfJs();
  const buf = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out: RenderedPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context ไม่พร้อม");
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    out.push({
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      width: canvas.width,
      height: canvas.height,
    });
  }
  return out;
}

/** Render one attachment. Never throws — returns an error/unsupported variant
 * instead so callers can display it inline and offer a retry button. */
export async function renderAttachment(att: AttachmentRef): Promise<RenderedAttachment> {
  try {
    if (!isImage(att) && !isPdf(att)) {
      return { status: "unsupported", ref: att, reason: "รองรับเฉพาะไฟล์รูปภาพและ PDF" };
    }
    const blob = await fetchBlob(att);
    if (isImage(att)) {
      const dataUrl = await blobToDataUrl(blob);
      const page = await imageDataUrlToPage(dataUrl);
      return { status: "ok", ref: att, kind: "image", pages: [page] };
    }
    const pages = await renderPdfAllPages(blob);
    if (pages.length === 0) {
      return { status: "error", ref: att, error: "PDF ไม่มีหน้าใดๆ" };
    }
    return { status: "ok", ref: att, kind: "pdf", pages };
  } catch (e: any) {
    return { status: "error", ref: att, error: e?.message || "โหลดไฟล์ไม่สำเร็จ" };
  }
}

export async function renderAttachments(atts: AttachmentRef[]): Promise<RenderedAttachment[]> {
  const results: RenderedAttachment[] = [];
  for (const a of atts) results.push(await renderAttachment(a));
  return results;
}

/** Flatten the ok-attachments in selection order into a single ordered list
 * of RenderedPage. Skips errors + unsupported + unselected. */
export function flattenSelectedPages(
  rendered: RenderedAttachment[],
  selection: { order: string[]; selected: Record<string, boolean> },
): { attId: string; name: string; page: RenderedPage; pageIndex: number; totalPages: number }[] {
  const byId = new Map(rendered.map((r) => [r.ref.id, r]));
  const ordered = selection.order.length > 0
    ? selection.order.map((id) => byId.get(id)).filter((r): r is RenderedAttachment => !!r)
    : rendered;
  const out: { attId: string; name: string; page: RenderedPage; pageIndex: number; totalPages: number }[] = [];
  for (const r of ordered) {
    if (r.status !== "ok") continue;
    if (selection.selected[r.ref.id] === false) continue;
    r.pages.forEach((p, i) => {
      out.push({ attId: r.ref.id, name: r.ref.name, page: p, pageIndex: i, totalPages: r.pages.length });
    });
  }
  return out;
}

/**
 * Build a print-ready HTML block containing one letterboxed page per
 * attachment page (respecting aspect ratio, never cropped). Injected AFTER
 * the main document HTML in preview + print + PDF flows.
 */
export function buildAttachmentPagesHtml(
  rendered: RenderedAttachment[],
  selection: { order: string[]; selected: Record<string, boolean> },
  documentLabel = "เอกสาร",
): string {
  const pages = flattenSelectedPages(rendered, selection);
  if (pages.length === 0) return "";
  const html = pages
    .map(
      (p, i) => `
        <div class="doc-page attachment-page" data-att-id="${escapeAttr(p.attId)}">
          <div class="attachment-page__header">เอกสารแนบของ ${escapeHtml(documentLabel)} — ${escapeHtml(p.name)}${
        p.totalPages > 1 ? ` (หน้า ${p.pageIndex + 1}/${p.totalPages})` : ""
      } · ไฟล์ที่ ${i + 1}/${pages.length}</div>
          <img src="${p.page.dataUrl}" alt="${escapeAttr(p.name)}" />
        </div>`,
    )
    .join("");
  return `
    <style>
      .attachment-page { page-break-before: always; break-before: page; text-align: center; padding: 0; }
      .attachment-page__header { font-size: 11px; color: #555; margin-bottom: 6px; text-align: left; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
      .attachment-page img { max-width: 100%; max-height: 265mm; object-fit: contain; display: block; margin: 0 auto; }
    </style>
    ${html}
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/** Return the count of selected attachments (respecting order + selected).
 * Used by tests + status labels. */
export function countSelected(
  atts: Pick<AttachmentRef, "id">[],
  selection: { order: string[]; selected: Record<string, boolean> },
): number {
  const ids = selection.order.length > 0
    ? selection.order
    : atts.map((a) => a.id);
  return ids.filter((id) => selection.selected[id] !== false && atts.some((a) => a.id === id)).length;
}