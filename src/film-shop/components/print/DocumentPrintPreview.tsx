import { useState, useRef, useEffect, useId } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Printer, Settings2, Image, ImageDown, Download, FileText, FileSpreadsheet, CalendarIcon, Paperclip, Files } from 'lucide-react';
import { loadAttachmentsAsImages, buildAttachmentsPrintHtml, type AttachmentRef, type RenderedAttachment } from '@/film-shop/utils/attachmentRender';
import { InlineAttachmentsCanvas, buildDefaultLayout, type AttachmentBox } from './InlineAttachmentsCanvas';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { computePdfSlices } from '@/lib/pdfSlices';
import { openPrintWindowOrSurface, printWhenFontsReady, PRINT_FONT_HEAD } from "@/lib/printSurface";
import { PaperViewport } from '@/components/print/PaperViewport';
import {
  DOC_KIND_LABELS,
  SYSTEM_DEFAULTS,
  clearDocPrefs,
  loadDocPrefs,
  loadTemplate,
  saveDocPrefs,
  saveTemplate,
  samePrefs,
  type ColumnPrefs,
  type DocKind,
} from '@/film-shop/lib/printColumnPrefs';

export type PaperSize = '80mm' | '100x70' | '100x75' | 'A5' | 'A4';

export interface PrintSettings {
  paperSize: PaperSize;
  fontSize: number;
  showPricePerSqm: boolean;
  showArea: boolean;
  showPricePerPiece: boolean;
}

export type ReceiptOrientation = 'portrait' | 'landscape';
export type ReceiptFitMode = 'fit' | 'actual';
export interface ReceiptMargins { top: number; right: number; bottom: number; left: number; }
export interface Receipt100x70Prefs {
  orientation: ReceiptOrientation;
  margins: ReceiptMargins;
  fitMode: ReceiptFitMode;
}

const RECEIPT_10x7_PREFS_KEY = 'film_shop_receipt_10x7_prefs_v1';
const RECEIPT_10x7_PRESETS_KEY = 'film_shop_receipt_10x7_presets_v1';
const RECEIPT_10x7_ACTIVE_KEY = 'film_shop_receipt_10x7_active_v1';

export interface Receipt10x7Preset {
  id: string;
  name: string;
  prefs: Receipt100x70Prefs;
}

function loadPresets(): Receipt10x7Preset[] {
  try {
    const raw = localStorage.getItem(RECEIPT_10x7_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id && p.name && p.prefs) : [];
  } catch { return []; }
}
function savePresets(list: Receipt10x7Preset[]) {
  try { localStorage.setItem(RECEIPT_10x7_PRESETS_KEY, JSON.stringify(list)); } catch {}
}
function loadActivePresetId(): string | null {
  try { return localStorage.getItem(RECEIPT_10x7_ACTIVE_KEY); } catch { return null; }
}
function saveActivePresetId(id: string | null) {
  try {
    if (id) localStorage.setItem(RECEIPT_10x7_ACTIVE_KEY, id);
    else localStorage.removeItem(RECEIPT_10x7_ACTIVE_KEY);
  } catch {}
}

const DEFAULT_10x7_PREFS: Receipt100x70Prefs = {
  orientation: 'portrait',
  margins: { top: 2, right: 2, bottom: 2, left: 2 },
  fitMode: 'fit',
};

function load10x7Prefs(): Receipt100x70Prefs {
  try {
    const raw = localStorage.getItem(RECEIPT_10x7_PREFS_KEY);
    if (!raw) return DEFAULT_10x7_PREFS;
    const parsed = JSON.parse(raw);
    return {
      orientation: parsed?.orientation === 'landscape' ? 'landscape' : 'portrait',
      fitMode: parsed?.fitMode === 'actual' ? 'actual' : 'fit',
      margins: {
        top: clampMm(parsed?.margins?.top, 2),
        right: clampMm(parsed?.margins?.right, 2),
        bottom: clampMm(parsed?.margins?.bottom, 2),
        left: clampMm(parsed?.margins?.left, 2),
      },
    };
  } catch {
    return DEFAULT_10x7_PREFS;
  }
}
function clampMm(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(15, n));
}

interface DocumentPrintPreviewProps {
  title: string;
  documentNumber: string;
  children: React.ReactNode;
  onClose: () => void;
  onPrint?: (settings: PrintSettings) => void;
  onSettingsChange?: (settings: PrintSettings) => void;
  onExportExcel?: () => void;
  showAreaColumn?: boolean;
  showPriceColumns?: boolean;
  documentDate?: Date;
  onDocumentDateChange?: (date: Date) => void;
  attachments?: AttachmentRef[];
  initialPaperSize?: PaperSize;
  /** ประเภทเอกสาร ใช้แยกเทมเพลตคอลัมน์ (ใบสั่งจ้าง / ใบเสร็จ ฯลฯ) */
  docKind?: DocKind;
}

const paperSizeStyles: Record<PaperSize, { width: string; padding: string; fontSize: string }> = {
  '80mm': { width: '80mm', padding: '3mm', fontSize: '10px' },
  '100x70': { width: '100mm', padding: '3mm', fontSize: '10px' },
  '100x75': { width: '100mm', padding: '3mm', fontSize: '10px' },
  'A5': { width: '148mm', padding: '10mm', fontSize: '11px' },
  'A4': { width: '210mm', padding: '15mm', fontSize: '12px' },
};

export function DocumentPrintPreview({
  title,
  documentNumber,
  children,
  onClose,
  onSettingsChange,
  onExportExcel,
  showAreaColumn = true,
  showPriceColumns = true,
  documentDate,
  onDocumentDateChange,
  attachments,
  initialPaperSize,
  docKind = 'other',
}: DocumentPrintPreviewProps) {
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const [isPrintingAttachments, setIsPrintingAttachments] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Attachment placement
  type AttachmentMode = 'none' | 'inline' | 'separate';
  const [attachmentMode, setAttachmentMode] = useState<AttachmentMode>('none');
  const [inlineRendered, setInlineRendered] = useState<RenderedAttachment[]>([]);
  const [inlineLayout, setInlineLayout] = useState<Record<string, AttachmentBox>>({});
  const [isLoadingInline, setIsLoadingInline] = useState(false);
  
  // Print settings
  const [paperSize, setPaperSize] = useState<PaperSize>(initialPaperSize ?? 'A4');
  const [fontSize, setFontSize] = useState(100);
  const initialCols = useRef<ColumnPrefs>(loadDocPrefs(docKind, documentNumber)).current;
  const [showPricePerSqm, setShowPricePerSqm] = useState(initialCols.showPricePerSqm);
  const [showArea, setShowArea] = useState(initialCols.showArea);
  const [showPricePerPiece, setShowPricePerPiece] = useState(initialCols.showPricePerPiece);
  const [resetNotice, setResetNotice] = useState(false);
  const columnPrefs: ColumnPrefs = { showPricePerSqm, showArea, showPricePerPiece };

  // จดจำคอลัมน์ที่เลือกไว้ของเอกสารใบนี้ เปิดครั้งถัดไปจะแสดงเหมือนเดิม
  useEffect(() => {
    saveDocPrefs(docKind, documentNumber, { showPricePerSqm, showArea, showPricePerPiece });
  }, [docKind, documentNumber, showPricePerSqm, showArea, showPricePerPiece]);

  // 10×7cm receipt-only prefs (persisted)
  const [prefs10x7, setPrefs10x7] = useState<Receipt100x70Prefs>(() => load10x7Prefs());
  useEffect(() => {
    try { localStorage.setItem(RECEIPT_10x7_PREFS_KEY, JSON.stringify(prefs10x7)); } catch {}
  }, [prefs10x7]);
  // Presets (multiple, per-printer)
  const [presets, setPresets] = useState<Receipt10x7Preset[]>(() => loadPresets());
  const [activePresetId, setActivePresetId] = useState<string | null>(() => loadActivePresetId());
  useEffect(() => { savePresets(presets); }, [presets]);
  useEffect(() => { saveActivePresetId(activePresetId); }, [activePresetId]);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showSettings) {
      // Move focus into the settings panel for keyboard users.
      const id = window.setTimeout(() => settingsPanelRef.current?.focus(), 40);
      return () => window.clearTimeout(id);
    }
  }, [showSettings]);
  const settingsPanelId = useId();
  const isReceiptSlip = paperSize === '100x70' || paperSize === '100x75';
  const is10x7 = isReceiptSlip; // preserved name; covers both 10×7 and 10×7.5
  // Base slip dimensions (portrait): 100mm wide × 70/75mm tall.
  // Landscape swaps to (70|75)×100.
  const baseShortMm = paperSize === '100x75' ? 75 : 70;
  // Gprinter GP-1324D (100×75 mm) is a landscape-only label printer — force
  // landscape regardless of persisted orientation so the driver + @page rule
  // always agree with the physical paper feed.
  const forceLandscape = paperSize === '100x75';
  const effectiveOrientation: ReceiptOrientation = forceLandscape
    ? 'landscape'
    : prefs10x7.orientation;
  const pageWmm = isReceiptSlip
    ? (effectiveOrientation === 'landscape' ? baseShortMm : 100)
    : 0;
  const pageHmm = isReceiptSlip
    ? (effectiveOrientation === 'landscape' ? 100 : baseShortMm)
    : 0;

  // Auto-correct stored prefs the first time a user lands on 100×75 with a
  // stale portrait preference so the preview + saved value match the lock.
  useEffect(() => {
    if (forceLandscape && prefs10x7.orientation !== 'landscape') {
      setPrefs10x7((p) => ({ ...p, orientation: 'landscape' }));
    }
  }, [forceLandscape, prefs10x7.orientation]);

  const currentSettings: PrintSettings = {
    paperSize,
    fontSize,
    showPricePerSqm,
    showArea,
    showPricePerPiece,
  };

  // Notify parent of settings changes
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange(currentSettings);
    }
  }, [paperSize, fontSize, showPricePerSqm, showArea, showPricePerPiece, onSettingsChange]);

  // Load attachments lazily when switching to inline mode
  useEffect(() => {
    if (attachmentMode !== 'inline' || !hasAttachments || inlineRendered.length > 0 || isLoadingInline) return;
    setIsLoadingInline(true);
    toast.loading('กำลังโหลดไฟล์แนบ...', { id: 'inline-att' });
    loadAttachmentsAsImages(attachments!)
      .then(({ rendered, errors }) => {
        toast.dismiss('inline-att');
        errors.forEach(e => toast.error(`ข้าม "${e.name}": ${e.error}`));
        setInlineRendered(rendered);
        setInlineLayout(buildDefaultLayout(rendered, 700));
      })
      .catch(e => {
        toast.dismiss('inline-att');
        toast.error(e?.message || 'โหลดไฟล์แนบไม่สำเร็จ');
      })
      .finally(() => setIsLoadingInline(false));
  }, [attachmentMode, hasAttachments, attachments, inlineRendered.length, isLoadingInline]);

  const resetInlineLayout = () => {
    setInlineLayout(buildDefaultLayout(inlineRendered, 700));
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = openPrintWindowOrSurface();
    if (!printWindow) return;

    const pageSize =
      paperSize === '80mm' ? '80mm 297mm'
      : isReceiptSlip
        ? `${pageWmm}mm ${pageHmm}mm${effectiveOrientation === 'landscape' ? ' landscape' : ' portrait'}`
      : paperSize;
    const margin = paperSize === '80mm'
      ? '2mm'
      : isReceiptSlip
        ? `${prefs10x7.margins.top}mm ${prefs10x7.margins.right}mm ${prefs10x7.margins.bottom}mm ${prefs10x7.margins.left}mm`
        : '15mm';
    const baseFontSize = paperSizeStyles[paperSize].fontSize;
    const fitCss = isReceiptSlip && prefs10x7.fitMode === 'fit'
      ? `
        .print-container { transform-origin: top left; }
        @media print {
          .fit-wrapper {
            width: ${pageWmm - prefs10x7.margins.left - prefs10x7.margins.right}mm;
            height: ${pageHmm - prefs10x7.margins.top - prefs10x7.margins.bottom}mm;
            overflow: hidden;
            display: block;
          }
          .print-container {
            width: max-content;
            max-width: none;
            transform: scale(var(--fit-scale, 1));
          }
        }
      `
      : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - ${documentNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: ${pageSize}; margin: ${margin}; }
            body { 
              font-family: 'IBM Plex Sans Thai', 'Sarabun', sans-serif; 
              font-size: calc(${baseFontSize} * ${fontSize / 100}); 
              line-height: 1.4;
              color: #333;
            }
            .print-container { 
              width: 100%;
              padding: ${paperSizeStyles[paperSize].padding};
            }
            .no-print { display: none !important; }
            .inline-att-canvas { border: none !important; }
            ${fitCss}
            ${content.innerHTML.includes('style') ? '' : getDefaultStyles(paperSize, fontSize)}
          </style>
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; img-src 'self' data:;">
          ${PRINT_FONT_HEAD}
        </head>
        <body>
          ${isReceiptSlip && prefs10x7.fitMode === 'fit'
            ? `<div class="fit-wrapper"><div class="print-container" id="__doc_print">${content.innerHTML}</div></div>`
            : `<div class="print-container">${content.innerHTML}</div>`}
          ${isReceiptSlip && prefs10x7.fitMode === 'fit' ? `
            <script>
              (function(){
                function fit(){
                  var el = document.getElementById('__doc_print');
                  var wrap = document.querySelector('.fit-wrapper');
                  if(!el||!wrap) return;
                  var pw = wrap.clientWidth || 1, ph = wrap.clientHeight || 1;
                  var cw = el.scrollWidth || 1, ch = el.scrollHeight || 1;
                  var s = Math.min(pw / cw, ph / ch, 1);
                  el.style.setProperty('--fit-scale', String(s));
                }
                window.addEventListener('load', function(){ setTimeout(fit, 50); });
              })();
            </script>` : ''}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.onload = () => {
      void printWhenFontsReady(printWindow).then(() => printWindow.close());
    };
  };

  const openPrintWindowWithHtml = (html: string, winTitle: string) => {
    const w = openPrintWindowOrSurface();
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${winTitle}</title>
      ${PRINT_FONT_HEAD}
      </head><body>${html}</body></html>`);
    w.document.close();
    w.onload = () => {
      // wait for images to load
      const imgs = Array.from(w.document.images);
      Promise.all(
        imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = img.onerror = () => res(null); }))
      ).then(() => printWhenFontsReady(w)).then(() => w.close());
    };
  };

  const handlePrintAttachmentsOnly = async () => {
    if (!hasAttachments) return;
    setIsPrintingAttachments(true);
    try {
      toast.loading('กำลังเตรียมไฟล์แนบ...', { id: 'att-print' });
      const { rendered, errors } = await loadAttachmentsAsImages(attachments!);
      toast.dismiss('att-print');
      if (errors.length > 0) {
        errors.forEach(e => toast.error(`ข้าม "${e.name}": ${e.error}`));
      }
      if (rendered.length === 0) {
        toast.error('ไม่มีไฟล์แนบที่พิมพ์ได้');
        return;
      }
      const html = buildAttachmentsPrintHtml(rendered, documentNumber);
      openPrintWindowWithHtml(html, `ไฟล์แนบ - ${documentNumber}`);
    } catch (e: any) {
      toast.dismiss('att-print');
      toast.error(e?.message || 'พิมพ์ไฟล์แนบไม่สำเร็จ');
    } finally {
      setIsPrintingAttachments(false);
    }
  };

  const handlePrintAll = async () => {
    const content = printRef.current;
    if (!content) return;
    if (!hasAttachments) { handlePrint(); return; }
    setIsPrintingAttachments(true);
    try {
      toast.loading('กำลังเตรียมไฟล์แนบ...', { id: 'att-print' });
      const { rendered, errors } = await loadAttachmentsAsImages(attachments!);
      toast.dismiss('att-print');
      errors.forEach(e => toast.error(`ข้าม "${e.name}": ${e.error}`));

      const pageSize =
        paperSize === '80mm' ? '80mm 297mm'
        : isReceiptSlip
          ? `${pageWmm}mm ${pageHmm}mm${effectiveOrientation === 'landscape' ? ' landscape' : ' portrait'}`
        : paperSize;
      const margin = paperSize === '80mm'
        ? '2mm'
        : isReceiptSlip
          ? `${prefs10x7.margins.top}mm ${prefs10x7.margins.right}mm ${prefs10x7.margins.bottom}mm ${prefs10x7.margins.left}mm`
          : '15mm';
      const baseFontSize = paperSizeStyles[paperSize].fontSize;
      const docHtml = `
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: ${pageSize}; margin: ${margin}; }
          body { font-family: 'Sarabun', 'IBM Plex Sans Thai', sans-serif; font-size: calc(${baseFontSize} * ${fontSize / 100}); line-height: 1.4; color: #333; }
          .print-container { width: 100%; padding: ${paperSizeStyles[paperSize].padding}; page-break-after: always; }
          .no-print { display: none !important; }
          .inline-att-canvas { border: none !important; }
          ${content.innerHTML.includes('style') ? '' : getDefaultStyles(paperSize, fontSize)}
        </style>
        <div class="print-container">${content.innerHTML}</div>
      `;
      const attHtml = rendered.length > 0 ? buildAttachmentsPrintHtml(rendered, documentNumber) : '';
      openPrintWindowWithHtml(docHtml + attHtml, `${title} - ${documentNumber}`);
    } catch (e: any) {
      toast.dismiss('att-print');
      toast.error(e?.message || 'พิมพ์ไม่สำเร็จ');
    } finally {
      setIsPrintingAttachments(false);
    }
  };

  /** ตัดองค์ประกอบ .no-print ออกจากภาพ/PDF ให้ตรงกับหน้าพิมพ์ */
  const stripNoPrint = (_doc: Document, el: HTMLElement) => {
    el.querySelectorAll('.no-print').forEach((n) => n.remove());
  };

  const handleSaveAsImage = async () => {
    const content = printRef.current;
    if (!content) return;

    setIsSaving(true);
    try {
      const canvas = await html2canvas(content, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: stripNoPrint,
        width: content.scrollWidth,
        height: content.scrollHeight,
      });

      const link = document.createElement('a');
      link.download = `${title}-${documentNumber}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast.success('บันทึกรูปภาพสำเร็จ');
    } catch (error) {
      console.error('Error saving image:', error);
      toast.error('ไม่สามารถบันทึกรูปภาพได้');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsJpg = async () => {
    const content = printRef.current;
    if (!content) return;

    setIsSaving(true);
    try {
      const canvas = await html2canvas(content, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: stripNoPrint,
      });

      const link = document.createElement('a');
      link.download = `${title}-${documentNumber}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      
      toast.success('บันทึกรูปภาพ JPG สำเร็จ');
    } catch (error) {
      console.error('Error saving JPG:', error);
      toast.error('ไม่สามารถบันทึกรูปภาพได้');
    } finally {
      setIsSaving(false);
    }
  };

  /** บันทึกลงอัลบั้มมือถือ — ใช้ Web Share (ไฟล์) ถ้าอุปกรณ์รองรับ ไม่งั้นดาวน์โหลดเป็นไฟล์ภาพ */
  const handleSaveToPhotos = async () => {
    const content = printRef.current;
    if (!content) return;
    setIsSaving(true);
    try {
      const canvas = await html2canvas(content, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', onclone: stripNoPrint,
      });
      const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.95));
      if (!blob) throw new Error('no blob');
      const file = new File([blob], `${title}-${documentNumber}.jpg`, { type: 'image/jpeg' });
      const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: `${title} ${documentNumber}` });
        toast.success('เลือก “บันทึกรูปภาพ” เพื่อเก็บลงอัลบั้ม');
        return;
      }
      const link = document.createElement('a');
      link.download = file.name;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('บันทึกรูปภาพลงเครื่องแล้ว');
    } catch (error) {
      if ((error as any)?.name === 'AbortError') return;
      console.error('Error saving to photos:', error);
      toast.error('บันทึกลงอัลบั้มไม่สำเร็จ');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsPdf = async () => {
    const content = printRef.current;
    if (!content) return;

    setIsSaving(true);
    try {
      const canvas = await html2canvas(content, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: stripNoPrint,
      });

      const imgData = canvas.toDataURL('image/png');

      // Determine PDF dimensions
      let pdfWidth: number, pdfHeight: number;
      const orientation: 'p' | 'l' = 'p';

      if (paperSize === 'A4') {
        pdfWidth = 210;
        pdfHeight = 297;
      } else if (paperSize === 'A5') {
        pdfWidth = 148;
        pdfHeight = 210;
      } else {
        // 80mm / 100x70 / 100x75 receipts stay single-page (their content is
        // already short by design).
        pdfWidth = paperSize === '80mm' ? 80 : 100;
        const ratio = canvas.height / canvas.width;
        pdfHeight = pdfWidth * ratio;
      }

      const doc = new jsPDF(orientation, 'mm', [pdfWidth, pdfHeight]);

      // Calculate image dimensions to fit the page width with margins.
      const margin = paperSize === '80mm' || paperSize === '100x70' || paperSize === '100x75' ? 2 : paperSize === 'A5' ? 5 : 10;
      const imgWidth = pdfWidth - margin * 2;
      const imgHeight = (canvas.height / canvas.width) * imgWidth;
      const usablePageHeight = pdfHeight - margin * 2;

      if ((paperSize === 'A4' || paperSize === 'A5') && imgHeight > usablePageHeight) {
        // Content taller than one page: slice the rendered canvas into
        // page-height chunks (preserving aspect ratio) and add a PDF page
        // per slice, so multi-page A4/A5 documents export completely
        // instead of being cropped to page 1.
        const pxPerMm = canvas.width / imgWidth;
        const sliceHeightPx = Math.floor(usablePageHeight * pxPerMm);
        const slices = computePdfSlices(canvas.height, sliceHeightPx);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        const ctx = sliceCanvas.getContext('2d');
        for (const { sourceY: sy, heightPx: sh, index: i } of slices) {
          sliceCanvas.height = sh;
          ctx?.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx?.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
          const sliceData = sliceCanvas.toDataURL('image/png');
          const sliceHeightMm = (sh / canvas.width) * imgWidth;
          if (i > 0) doc.addPage([pdfWidth, pdfHeight], orientation);
          doc.addImage(sliceData, 'PNG', margin, margin, imgWidth, sliceHeightMm);
        }
      } else {
        doc.addImage(imgData, 'PNG', margin, margin, imgWidth, Math.min(imgHeight, usablePageHeight));
      }
      doc.save(`${title}-${documentNumber}.pdf`);
      
      toast.success('บันทึก PDF สำเร็จ');
    } catch (error) {
      console.error('Error saving PDF:', error);
      toast.error('ไม่สามารถบันทึก PDF ได้');
    } finally {
      setIsSaving(false);
    }
  };

  const resetSettings = () => {
    setPaperSize('A4');
    setFontSize(100);
    const def = loadTemplate(docKind);
    setShowPricePerSqm(def.showPricePerSqm);
    setShowArea(def.showArea);
    setShowPricePerPiece(def.showPricePerPiece);
    clearDocPrefs(docKind, documentNumber);
    setResetNotice(true);
    window.setTimeout(() => setResetNotice(false), 4000);
    toast.success(`รีเซ็ตเป็นค่าเริ่มต้นของ ${DOC_KIND_LABELS[docKind]} แล้ว`);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Action Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          กลับ
        </Button>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Date Picker */}
          {documentDate && onDocumentDateChange && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-1">
                  <CalendarIcon className="h-4 w-4" />
                  {format(new Date(documentDate), 'dd/MM/yyyy', { locale: th })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={new Date(documentDate)}
                  onSelect={(date) => date && onDocumentDateChange(date)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          )}
          <Button
            variant="outline"
            onClick={() => setShowSettings(!showSettings)}
            aria-label="เปิด/ปิดแผงตั้งค่าพิมพ์"
            aria-expanded={showSettings}
            aria-controls={settingsPanelId}
            data-testid="open-print-settings"
          >
            <Settings2 className="h-4 w-4" />
            ตั้งค่าพิมพ์
          </Button>
          {onExportExcel && (
            <Button variant="outline" onClick={onExportExcel} disabled={isSaving} aria-label="ส่งออก Excel">
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
          )}
          <Button variant="outline" onClick={handleSaveAsPdf} disabled={isSaving} aria-label="บันทึกเป็น PDF">
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" onClick={handleSaveAsImage} disabled={isSaving} aria-label="บันทึกเป็น PNG">
            <Image className="h-4 w-4" />
            PNG
          </Button>
          <Button variant="outline" onClick={handleSaveAsJpg} disabled={isSaving} aria-label="บันทึกเป็น JPG">
            <Download className="h-4 w-4" />
            JPG
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveToPhotos}
            disabled={isSaving}
            aria-label="บันทึกลงอัลบั้มรูปในเครื่อง"
            data-testid="save-to-photos"
          >
            <ImageDown className="h-4 w-4" />
            ลงอัลบั้ม
          </Button>
          {hasAttachments && (
            <>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">ไฟล์แนบ:</Label>
                <Select value={attachmentMode} onValueChange={(v) => setAttachmentMode(v as AttachmentMode)}>
                  <SelectTrigger className="h-9 w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ไม่แสดง</SelectItem>
                    <SelectItem value="inline">ในหน้าเดียวกัน</SelectItem>
                    <SelectItem value="separate">หน้าแยก</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {attachmentMode === 'inline' && inlineRendered.length > 0 && (
                <Button variant="outline" size="sm" onClick={resetInlineLayout}>
                  รีเซ็ตเลย์เอาต์
                </Button>
              )}
              {attachmentMode === 'separate' && (
                <>
                  <Button variant="outline" onClick={handlePrintAttachmentsOnly} disabled={isPrintingAttachments}>
                    <Paperclip className="h-4 w-4" />
                    พิมพ์ไฟล์แนบ ({attachments!.length})
                  </Button>
                  <Button variant="outline" onClick={handlePrintAll} disabled={isPrintingAttachments}>
                    <Files className="h-4 w-4" />
                    พิมพ์ทั้งหมด
                  </Button>
                </>
              )}
            </>
          )}
          <Button onClick={handlePrint} aria-label="พิมพ์เอกสาร" data-testid="print-document">
            <Printer className="h-4 w-4" />
            พิมพ์
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <Card
          id={settingsPanelId}
          role="region"
          aria-label="แผงตั้งค่าพิมพ์"
          tabIndex={-1}
          ref={settingsPanelRef as any}
        >
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Paper Size */}
              <div className="space-y-2">
                <Label htmlFor="paper-size-select" className="text-sm font-medium">ขนาดกระดาษ</Label>
                <Select value={paperSize} onValueChange={(v) => setPaperSize(v as PaperSize)}>
                  <SelectTrigger id="paper-size-select" aria-label="ขนาดกระดาษ" data-testid="paper-size-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="80mm">80mm (ใบเสร็จย่อ)</SelectItem>
                    <SelectItem value="100x70">10×7 ซม. (ใบเสร็จ)</SelectItem>
                    <SelectItem value="100x75">10×7.5 ซม. (Gprinter GP-1324D)</SelectItem>
                    <SelectItem value="A5">A5 (148 x 210 mm)</SelectItem>
                    <SelectItem value="A4">A4 (210 x 297 mm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Font Size */}
              <div className="space-y-2">
                <Label className="text-sm">ขนาดตัวอักษร: {fontSize}%</Label>
                <Slider
                  value={[fontSize]}
                  onValueChange={(v) => setFontSize(v[0])}
                  min={70}
                  max={150}
                  step={5}
                />
              </div>
            </div>

            {/* 10×7 cm receipt-only controls (navy theme) */}
            {is10x7 && (
              <section
                data-testid="receipt-10x7-panel"
                aria-label={`ตั้งค่าใบเสร็จ 10×${baseShortMm === 75 ? '7.5' : '7'} ซม.`}
                className="rounded-lg border border-slate-800 bg-slate-900 text-slate-100 p-4 space-y-4"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-white">
                    ตั้งค่าใบเสร็จ 10×{baseShortMm === 75 ? '7.5' : '7'} ซม.
                  </h4>
                  <span className="text-[11px] text-slate-300">บันทึกค่าอัตโนมัติทุกครั้งที่ปรับ</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-200" id="orient-label">แนวกระดาษ</Label>
                    <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="orient-label">
                      {(['portrait','landscape'] as ReceiptOrientation[]).map((o) => (
                        <Button
                          key={o}
                          size="sm"
                          variant={effectiveOrientation === o ? 'default' : 'outline'}
                          onClick={() => setPrefs10x7((p) => ({ ...p, orientation: o }))}
                          aria-pressed={effectiveOrientation === o}
                          disabled={forceLandscape && o === 'portrait'}
                          title={forceLandscape && o === 'portrait'
                            ? 'Gprinter GP-1324D บังคับแนวนอนเท่านั้น'
                            : undefined}
                          aria-label={o === 'portrait'
                            ? `แนวตั้ง 100×${baseShortMm} มม.`
                            : `แนวนอน ${baseShortMm}×100 มม.`}
                          data-testid={`orient-${o}`}
                          className={effectiveOrientation === o
                            ? 'bg-sky-600 hover:bg-sky-500 text-white border-0'
                            : `bg-transparent border-slate-600 text-slate-100 hover:bg-slate-800 hover:text-white ${forceLandscape && o === 'portrait' ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          {o === 'portrait'
                            ? `↕ แนวตั้ง (100×${baseShortMm})`
                            : `↔ แนวนอน (${baseShortMm}×100)`}
                        </Button>
                      ))}
                    </div>
                    {forceLandscape && (
                      <p className="text-[10px] text-sky-300" role="note">
                        ล็อกแนวนอนอัตโนมัติสำหรับ Gprinter GP-1324D (100×75 มม.)
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-200" id="fitmode-label">โหมดจัดวาง</Label>
                    <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="fitmode-label">
                      {(['fit','actual'] as ReceiptFitMode[]).map((m) => (
                        <Button
                          key={m}
                          size="sm"
                          variant={prefs10x7.fitMode === m ? 'default' : 'outline'}
                          onClick={() => setPrefs10x7((p) => ({ ...p, fitMode: m }))}
                          aria-pressed={prefs10x7.fitMode === m}
                          aria-label={m === 'fit' ? 'พอดีกับกระดาษ' : 'ขนาดจริง 100%'}
                          data-testid={`fit-${m}`}
                          className={prefs10x7.fitMode === m
                            ? 'bg-sky-600 hover:bg-sky-500 text-white border-0'
                            : 'bg-transparent border-slate-600 text-slate-100 hover:bg-slate-800 hover:text-white'}
                        >
                          {m === 'fit' ? 'พอดีกับกระดาษ' : 'ขนาดจริง 100%'}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-200">
                      ระยะขอบ (mm) · 0–15
                    </Label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['top','right','bottom','left'] as const).map((side) => (
                        <div key={side} className="flex flex-col items-center gap-1">
                          <label className="text-[10px] text-slate-400" htmlFor={`margin-${side}`}>
                            {side === 'top' ? 'บน' : side === 'right' ? 'ขวา' : side === 'bottom' ? 'ล่าง' : 'ซ้าย'}
                          </label>
                          <input
                            id={`margin-${side}`}
                            aria-label={`ระยะขอบด้าน${side === 'top' ? 'บน' : side === 'right' ? 'ขวา' : side === 'bottom' ? 'ล่าง' : 'ซ้าย'} (mm)`}
                            data-testid={`margin-${side}`}
                            type="number"
                            min={0}
                            max={15}
                            step={0.5}
                            value={prefs10x7.margins[side]}
                            onChange={(e) =>
                              setPrefs10x7((p) => ({
                                ...p,
                                margins: { ...p.margins, [side]: clampMm(e.target.value, 2) },
                              }))
                            }
                            className="w-full rounded border border-slate-600 bg-slate-950 text-slate-100 text-center text-xs px-1 py-1 tabular-nums"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1" role="group" aria-label="พรีเซ็ตระยะขอบด่วน">
                      {[
                        { label: 'ขอบเยอะ 5mm', v: 5 },
                        { label: 'มาตรฐาน 2mm', v: 2 },
                        { label: 'ไม่มีขอบ', v: 0 },
                      ].map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          aria-label={`ตั้งระยะขอบทุกด้านเป็น ${p.v} มม.`}
                          onClick={() =>
                            setPrefs10x7((prev) => ({
                              ...prev,
                              margins: { top: p.v, right: p.v, bottom: p.v, left: p.v },
                            }))
                          }
                          className="text-[10px] rounded-full border border-slate-600 text-slate-200 px-2 py-0.5 hover:bg-slate-800"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Printer presets */}
                <div className="rounded border border-slate-700 bg-slate-950/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label htmlFor="preset-select" className="text-xs font-semibold text-slate-200">
                      พรีเซ็ตเครื่องพิมพ์
                    </Label>
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        type="button"
                        data-testid="preset-save"
                        aria-label="บันทึกค่าปัจจุบันเป็นพรีเซ็ตใหม่"
                        onClick={() => {
                          const name = window.prompt('ชื่อพรีเซ็ต (เช่น ชื่อเครื่องพิมพ์)', activePresetId
                            ? presets.find((p) => p.id === activePresetId)?.name || ''
                            : 'เครื่องพิมพ์ 1');
                          if (!name) return;
                          const id = `pr_${Date.now().toString(36)}`;
                          const next: Receipt10x7Preset = { id, name: name.trim(), prefs: prefs10x7 };
                          setPresets((prev) => [...prev, next]);
                          setActivePresetId(id);
                          toast.success(`บันทึกพรีเซ็ต "${next.name}" แล้ว`);
                        }}
                        className="text-[11px] rounded border border-sky-500 text-sky-200 hover:bg-sky-900 px-2 py-1"
                      >
                        + บันทึกพรีเซ็ต
                      </button>
                      <button
                        type="button"
                        data-testid="preset-delete"
                        aria-label="ลบพรีเซ็ตปัจจุบัน"
                        disabled={!activePresetId}
                        onClick={() => {
                          if (!activePresetId) return;
                          const target = presets.find((p) => p.id === activePresetId);
                          if (!target) return;
                          setPresets((prev) => prev.filter((p) => p.id !== activePresetId));
                          setActivePresetId(null);
                          toast.success(`ลบพรีเซ็ต "${target.name}" แล้ว`);
                        }}
                        className="text-[11px] rounded border border-slate-600 text-slate-200 hover:bg-slate-800 px-2 py-1 disabled:opacity-40"
                      >
                        ลบ
                      </button>
                      <button
                        type="button"
                        data-testid="sample-print"
                        aria-label="พิมพ์ตัวอย่างเพื่อทดสอบระยะขอบและสเกล"
                        onClick={() => {
                          toast.info('กำลังส่งตัวอย่างไปเครื่องพิมพ์…');
                          handlePrint();
                        }}
                        className="text-[11px] rounded border border-emerald-500 text-emerald-200 hover:bg-emerald-900 px-2 py-1"
                      >
                        พิมพ์ตัวอย่าง
                      </button>
                    </div>
                  </div>
                  <select
                    id="preset-select"
                    data-testid="preset-select"
                    aria-label="เลือกพรีเซ็ตเครื่องพิมพ์"
                    value={activePresetId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      setActivePresetId(id);
                      if (id) {
                        const found = presets.find((p) => p.id === id);
                        if (found) {
                          setPrefs10x7(found.prefs);
                          toast.success(`โหลดพรีเซ็ต "${found.name}"`);
                        }
                      }
                    }}
                    className="w-full rounded border border-slate-600 bg-slate-950 text-slate-100 text-xs px-2 py-1.5"
                  >
                    <option value="">— ค่ากำหนดเอง —</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-slate-400">
                  โหมด "พอดีกับกระดาษ" จะย่อเนื้อหาให้ไม่ตัดขอบเครื่องพิมพ์อัตโนมัติ · ทุกค่าจะถูกจดจำสำหรับการพิมพ์ครั้งถัดไป
                </p>
              </section>
            )}

            {/* Column Visibility */}
            {(showAreaColumn || showPriceColumns) && (
              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-3 block">คอลัมน์ที่แสดง</Label>
                <div className="flex flex-wrap gap-4">
                  {showPriceColumns && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="showPricePerSqm"
                        checked={showPricePerSqm}
                        onCheckedChange={(v) => setShowPricePerSqm(!!v)}
                      />
                      <Label htmlFor="showPricePerSqm" className="text-sm cursor-pointer">ราคา/ตร.ม.</Label>
                    </div>
                  )}
                  {showAreaColumn && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="showArea"
                        checked={showArea}
                        onCheckedChange={(v) => setShowArea(!!v)}
                      />
                      <Label htmlFor="showArea" className="text-sm cursor-pointer">ขนาด (กว้าง x ยาว)</Label>
                    </div>
                  )}
                  {showPriceColumns && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="showPricePerPiece"
                        checked={showPricePerPiece}
                        onCheckedChange={(v) => setShowPricePerPiece(!!v)}
                      />
                      <Label htmlFor="showPricePerPiece" className="text-sm cursor-pointer">ราคา/หน่วย</Label>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      saveTemplate(docKind, columnPrefs);
                      toast.success(`บันทึกเป็นค่าเริ่มต้นของ ${DOC_KIND_LABELS[docKind]} แล้ว`);
                    }}
                  >
                    บันทึกเป็นค่าเริ่มต้นของ {DOC_KIND_LABELS[docKind]}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const t = loadTemplate(docKind);
                      setShowPricePerSqm(t.showPricePerSqm);
                      setShowArea(t.showArea);
                      setShowPricePerPiece(t.showPricePerPiece);
                      toast.success('ใช้ค่าเริ่มต้นของประเภทเอกสารนี้แล้ว');
                    }}
                  >
                    ใช้ค่าเริ่มต้นของประเภทนี้
                  </Button>
                  {!samePrefs(columnPrefs, SYSTEM_DEFAULTS[docKind]) && (
                    <span className="text-[11px] text-muted-foreground">* ต่างจากค่าระบบ</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetSettings}>
                รีเซ็ต
              </Button>
              {resetNotice && (
                <span
                  role="status"
                  className="self-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
                >
                  รีเซ็ตเป็นค่าเริ่มต้นแล้ว
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview — PaperViewport keeps true mm size in the DOM and only
          CSS-transforms the on-screen sheet, so narrow (390px) screens never
          get horizontal overflow from a fixed A4/A5 width. Print output is
          unaffected (@media print { transform: none } via SHARED_PRINT_CSS). */}
      <Card className="mx-auto overflow-hidden">
        <CardContent className="p-0">
          <style>{`@media print { .no-print { display: none !important; } .inline-att-canvas { border: none !important; } }`}</style>
          <PaperViewport
            paper={paperSize}
            orient={isReceiptSlip && effectiveOrientation === 'landscape' ? 'landscape' : 'portrait'}
          >
            <div
              ref={printRef}
              className="bg-white p-6"
              style={{
                padding: is10x7
                  ? `${prefs10x7.margins.top}mm ${prefs10x7.margins.right}mm ${prefs10x7.margins.bottom}mm ${prefs10x7.margins.left}mm`
                  : undefined,
                fontSize: `${fontSize}%`,
                minHeight: paperSize === '80mm' ? 'auto' : '100%',
              }}
              data-settings={JSON.stringify(currentSettings)}
              data-receipt-orientation={is10x7 ? prefs10x7.orientation : undefined}
              data-receipt-fitmode={is10x7 ? prefs10x7.fitMode : undefined}
            >
              {children}
              {attachmentMode === 'inline' && hasAttachments && inlineRendered.length > 0 && (
                <InlineAttachmentsCanvas
                  rendered={inlineRendered}
                  layout={inlineLayout}
                  onLayoutChange={setInlineLayout}
                  canvasHeightPx={paperSize === 'A4' ? 760 : paperSize === 'A5' ? 500 : 300}
                />
              )}
            </div>
          </PaperViewport>
        </CardContent>
      </Card>
    </div>
  );
}

function getDefaultStyles(paperSize: PaperSize, fontSize: number): string {
  const baseFontSize = paperSizeStyles[paperSize].fontSize;
  const isSmall = paperSize === '80mm' || paperSize === '100x70';
  
  return `
    .header { text-align: center; margin-bottom: ${isSmall ? '10px' : '20px'}; border-bottom: 2px solid #1e40af; padding-bottom: ${isSmall ? '8px' : '15px'}; }
    .shop-name { font-size: ${isSmall ? '14px' : '24px'}; font-weight: bold; color: #1e40af; }
    .shop-info { font-size: ${isSmall ? '9px' : '11px'}; color: #666; margin-top: 5px; }
    .doc-title { font-size: ${isSmall ? '12px' : '18px'}; font-weight: bold; margin: ${isSmall ? '10px' : '20px'} 0; text-align: center; color: #1e40af; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: ${isSmall ? '10px' : '20px'}; ${isSmall ? 'flex-direction: column; gap: 5px;' : ''} }
    .info-box { flex: 1; }
    .info-label { font-weight: bold; color: #1e40af; margin-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin: ${isSmall ? '10px' : '20px'} 0; font-size: ${isSmall ? '9px' : baseFontSize}; }
    th { background: #1e40af; color: white; padding: ${isSmall ? '4px' : '10px'}; text-align: left; font-weight: 600; }
    td { padding: ${isSmall ? '4px' : '10px'}; border-bottom: 1px solid #ddd; }
    .summary { margin-top: ${isSmall ? '10px' : '20px'}; text-align: right; }
    .summary-row { display: flex; justify-content: flex-end; gap: ${isSmall ? '10px' : '20px'}; padding: ${isSmall ? '2px' : '5px'} 0; }
    .summary-label { min-width: ${isSmall ? '60px' : '120px'}; text-align: right; }
    .summary-value { min-width: ${isSmall ? '50px' : '100px'}; text-align: right; font-weight: 600; }
    .total-row { font-size: ${isSmall ? '11px' : '16px'}; font-weight: bold; border-top: 2px solid #1e40af; padding-top: 10px; margin-top: 10px; color: #1e40af; }
    .notes { margin-top: ${isSmall ? '15px' : '30px'}; padding: ${isSmall ? '8px' : '15px'}; background: #f8fafc; border-radius: 8px; }
    .notes-title { font-weight: bold; color: #1e40af; }
    .footer { margin-top: ${isSmall ? '20px' : '40px'}; display: flex; justify-content: space-between; ${isSmall ? 'flex-direction: column; gap: 15px;' : ''} }
    .signature-box { text-align: center; padding-top: ${isSmall ? '20px' : '50px'}; }
    .signature-line { width: ${isSmall ? '80px' : '150px'}; border-top: 1px solid #333; margin: 0 auto 5px; }
  `;
}
