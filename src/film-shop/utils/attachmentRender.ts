import { supabase } from '@/film-shop/lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';

// Use CDN worker matching installed version
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface AttachmentRef {
  name: string;
  path: string;
  type?: string;
  size?: number;
}

export interface RenderedAttachment {
  name: string;
  dataUrl: string;
  kind: 'image' | 'pdf-page1';
  note?: string;
}

const BUCKET = 'invoice-attachments';

async function fetchAsBlob(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'ไม่สามารถสร้างลิงก์ไฟล์ได้');
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (${res.status})`);
  return await res.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function renderPdfFirstPage(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return canvas.toDataURL('image/jpeg', 0.92);
}

function isPdf(att: AttachmentRef): boolean {
  if (att.type?.includes('pdf')) return true;
  return /\.pdf$/i.test(att.name);
}

function isImage(att: AttachmentRef): boolean {
  if (att.type?.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(att.name);
}

export async function loadAttachmentsAsImages(
  attachments: AttachmentRef[]
): Promise<{ rendered: RenderedAttachment[]; errors: { name: string; error: string }[] }> {
  const rendered: RenderedAttachment[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const att of attachments) {
    try {
      const blob = await fetchAsBlob(att.path);
      if (isImage(att)) {
        const dataUrl = await blobToDataUrl(blob);
        rendered.push({ name: att.name, dataUrl, kind: 'image' });
      } else if (isPdf(att)) {
        const dataUrl = await renderPdfFirstPage(blob);
        rendered.push({ name: att.name, dataUrl, kind: 'pdf-page1', note: 'แสดงเฉพาะหน้าแรก' });
      } else {
        errors.push({ name: att.name, error: 'ชนิดไฟล์ไม่รองรับ' });
      }
    } catch (e: any) {
      errors.push({ name: att.name, error: e?.message || 'เกิดข้อผิดพลาด' });
    }
  }

  return { rendered, errors };
}

export function buildAttachmentsPrintHtml(
  rendered: RenderedAttachment[],
  documentLabel: string
): string {
  const n = rendered.length;
  const pages = rendered
    .map(
      (r, i) => `
      <div class="att-page">
        <div class="att-header">เอกสารแนบของ ${escapeHtml(documentLabel)} — ไฟล์ ${i + 1}/${n}: ${escapeHtml(r.name)}${
        r.note ? ` (${escapeHtml(r.note)})` : ''
      }</div>
        <img src="${r.dataUrl}" alt="${escapeHtml(r.name)}" />
      </div>`
    )
    .join('');

  return `
    <style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Sarabun', 'IBM Plex Sans Thai', sans-serif; margin: 0; }
      .att-page { page-break-after: always; text-align: center; padding: 0; }
      .att-page:last-child { page-break-after: auto; }
      .att-header { font-size: 11px; color: #555; margin-bottom: 6px; text-align: left; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
      .att-page img { max-width: 100%; max-height: 265mm; object-fit: contain; display: block; margin: 0 auto; }
    </style>
    ${pages}
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
