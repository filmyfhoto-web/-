/**
 * Pre-print preview route: /receipts/:storeSlug/documents/:id/print-preview
 *
 * Full-page host for print controls. Loads the saved document fresh from the
 * database, then renders:
 *   - a sticky toolbar (back, document date, settings toggle, Excel/PDF/PNG/JPG, print)
 *   - a collapsible settings panel (paper, orientation, font size, zoom, margins, columns, reset)
 *   - a live paper preview using the same <DocumentPreview> component the form uses
 *
 * All export/print actions read from THIS page's state so the file that the
 * user downloads always matches what they see. The DocumentForm no longer
 * carries any print controls of its own.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkDiscount } from "@/pages/receipts/lib/discount";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tbl } from "../lib/tbl";
import { storeBasePath } from "../useStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Printer, Pencil, Settings2, Minus, Plus, Maximize2, RotateCw, Download,
  FileSpreadsheet, FileText, Image as ImageIcon, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import BundlePicker, { type BundlePickerItem } from "./BundlePicker";
import { BundlePrint, defaultBundleDocIds, type BundleAttachmentRef, type BundleDocRef } from "./BundlePrint";
import { useBundleAttachmentPages } from "./useBundleAttachmentPages";
import { PrintCompleteDialog } from "./PrintCompleteDialog";
import DocumentPreview, { DEFAULT_DISCOUNT_TABLE_STYLE, type DiscountTableStyle } from "./DocumentPreview";
import {
  computeTotals, emptyItem,
  type DocFormState, type DocumentType, type DocTemplate, type PaperSize,
} from "./useDocumentForm";
import type { RdsStore } from "../types";
import { useDocLayouts, pickLayout, mergeConfigWithLayout } from "../lib/layouts";
import {
  loadPrintPrefs, savePrintPrefs, loadDocPrintPrefs, saveDocPrintPrefs, DEFAULT_PRINT_PREFS,
  reconcileBundle, isBundleItemSelected,
  loadTypePrintPrefs, saveTypePrintPrefs,
  getPaperSizeMm,
  type PrintBundleSelection, type PrintPrefs,
} from "../lib/printPrefs";
import { docTypeTint } from "./docTypeTint";
import { exportDocumentAsPng, exportDocumentAsJpg, exportDocumentAsXlsx, exportDocumentAsCsv } from "../lib/documentExports";
import { elementToPdfBlob, downloadBlob } from "../lib/pdfUtils";
import { printViaCurrentDocument, printViaHiddenIframe } from "../lib/printWindow";
import { waitForExportAssets } from "../lib/waitForAssets";
import { resolveDocumentPageLayout, estimateTrailerMm } from "./DocumentPreview";
import { fitFontScaleToOnePage, itemToPaginateHints, paginateMainDocument } from "../lib/paginate";
import { useMeasuredDocHeader } from "../lib/useMeasuredDocHeader";

import { allowedDocTypesForStore } from "../lib/docTheme";
import { printQueue } from "../lib/printQueue";
import { usePaperScale } from "@/hooks/usePaperScale";

function rowToState(d: any, items: any[]): DocFormState {
  return {
    document_type: (d.document_type ?? "receipt") as DocumentType,
    paper_size: (d.paper_size ?? "A4") as PaperSize,
    print_mode: d.print_mode ?? "fit_a4",
    auto_fit_a4: d.auto_fit_a4 ?? true,
    print_scale: d.print_scale != null ? Number(d.print_scale) : null,
    font_scale: d.font_scale != null ? Number(d.font_scale) : 1,
    template: (d.template ?? "modern") as DocTemplate,
    status_workflow: d.status_workflow ?? "draft",
    companion_set: "none",
    related_document_no: d.related_document_no ?? null,
    document_date: d.document_date ?? new Date().toISOString().slice(0, 10),
    show_document_date: d.show_document_date !== false,
    vat_mode: d.vat_mode ?? "none",
    vat_rate: Number(d.vat_rate ?? 0),
    price_type: d.price_type ?? "no_vat",
    withholding_tax_enabled: !!d.withholding_tax_enabled,
    withholding_tax_rate: Number(d.withholding_tax_rate ?? 0),
    discount_amount: Number(d.discount_amount ?? 0),
    customer_id: d.customer_id ?? null,
    customer_name: d.customer_name ?? "",
    customer_phone: d.customer_phone ?? "",
    customer_address: d.customer_address ?? "",
    customer_tax_id: d.customer_tax_id ?? "",
    customer_branch: d.customer_branch ?? "",
    payment_method: d.payment_method ?? "cash",
    show_payment_method: d.show_payment_method !== false,
    show_payment_date: d.show_payment_date !== false,
    show_footer_document_date: d.show_footer_document_date !== false,
    notes: d.notes ?? "",
    project_name: d.project_name ?? "",
    internal_sale_type: d.internal_sale_type === "bill_only" ? "bill_only" : "real_goods",
    layout_id: d.layout_id ?? null,
    items: items.length
      ? items.map((it: any) => ({
          key: it.id,
          product_id: it.product_id,
          name: it.name ?? "",
          description: it.description ?? "",
          price: Number(it.price ?? 0),
          quantity: Number(it.quantity ?? 0),
          unit: it.unit ?? "",
          discount_percent: Number(it.discount_percent ?? 0),
          discount_amount: Number(it.discount_amount ?? 0),
        }))
      : [emptyItem()],
  };
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function docLabel(type: DocumentType): string {
  return type === "quotation" ? "ใบเสนอราคา"
    : type === "delivery" ? "ใบส่งของ"
    : type === "receipt" ? "ใบเสร็จรับเงิน"
    : "ใบกำกับภาษี/ใบเสร็จรับเงิน";
}

export default function PrintPreview() {
  const { storeSlug, id } = useParams<{ storeSlug: string; id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // simpleMode = entered from the documents list ("?settings=1"). Locks the
  // primary paper to A4 210×297 portrait and hides advanced controls behind
  // a collapsible so users only see the essentials.
  const simpleMode = searchParams.get("settings") === "1";
  // Multi-document mode: `?ids=a,b,c` picks up bulk selections from the
  // documents list. The main doc (route :id) renders with the full
  // bundle/preview UI; the rest are queued into a hidden print area and
  // included in the same print job so users get every selected document
  // in a single sequential run.
  const extraIds = useMemo<string[]>(() => {
    const raw = searchParams.get("ids");
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== id);
  }, [searchParams, id]);
  const copiesFromUrl = useMemo<number | null>(() => {
    const raw = searchParams.get("copies");
    if (!raw) return null;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(10, Math.max(1, n));
  }, [searchParams]);

  const storeQ = useQuery({
    queryKey: ["preview-store", storeSlug],
    enabled: !!storeSlug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("stores") as any)
        .select("id, slug, name, tax_id, phone, address, logo_url, default_vat_rate, vat_enabled, brand_color, doc_theme, attach_biz_reg_url, attach_id_copy_url, attach_bankbook_url")
        .eq("slug", storeSlug!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as RdsStore | null;
    },
  });

  const docQ = useQuery({
    queryKey: ["preview-doc", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: docs, error: de }, { data: items, error: ie }] = await Promise.all([
        supabase.from(tbl("documents") as any).select("*").eq("id", id!).maybeSingle(),
        supabase.from(tbl("document_items") as any).select("*").eq("document_id", id!).order("item_order"),
      ]);
      if (de) throw de;
      if (ie) throw ie;
      return { doc: docs as any, items: (items as any[]) ?? [] };
    },
  });

  // Bulk mode: load the extra selected documents so they can be included
  // in the same print run.
  const extraDocsQ = useQuery({
    queryKey: ["preview-extra-docs", extraIds],
    enabled: extraIds.length > 0,
    queryFn: async () => {
      const [{ data: docs, error: de }, { data: items, error: ie }] = await Promise.all([
        supabase.from(tbl("documents") as any).select("*").in("id", extraIds),
        supabase
          .from(tbl("document_items") as any)
          .select("*")
          .in("document_id", extraIds)
          .order("item_order"),
      ]);
      if (de) throw de;
      if (ie) throw ie;
      const docsArr = ((docs as any[]) ?? []);
      const itemsArr = ((items as any[]) ?? []);
      const byId = new Map(docsArr.map((d) => [d.id, d]));
      return extraIds
        .map((docId) => byId.get(docId))
        .filter(Boolean)
        .map((d: any) => ({
          doc: d,
          items: itemsArr.filter((it: any) => it.document_id === d.id),
        }));
    },
  });

  const companionsQ = useQuery({
    queryKey: ["preview-companions", storeQ.data?.id, docQ.data?.doc?.document_no],
    enabled: !!storeQ.data?.id && !!docQ.data?.doc?.document_no,
    queryFn: async () => {
      const { data } = await supabase
        .from(tbl("documents") as any)
        .select("id, document_no, document_type, deleted_at")
        .eq("store_id", storeQ.data!.id)
        .eq("related_document_no", docQ.data!.doc.document_no);
      return ((data as any[]) ?? [])
        .filter((r) => !r.deleted_at)
        .map((r) => ({ id: `doc:${r.document_type}`, type: r.document_type as DocumentType, docNo: r.document_no as string | null }));
    },
  });

  const templateQ = useQuery({
    queryKey: ["preview-templates", storeQ.data?.id],
    enabled: !!storeQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from(tbl("document_templates") as any)
        .select("*")
        .eq("store_id", storeQ.data!.id);
      const byType: Record<string, { header_text?: string; footer_text?: string }> = {};
      ((data as any[]) ?? []).forEach((r) => {
        byType[r.document_type] = { header_text: r.header_text, footer_text: r.footer_text };
      });
      return byType;
    },
  });

  const layoutsQ = useDocLayouts(storeQ.data?.id);

  // Local, page-scoped prefs. Seeded from global localStorage but changes
  // here don't automatically write back — user chooses "รีเซ็ต" or edits
  // freely per print job.
  const [prefs, setPrefs] = useState<PrintPrefs>(() => ({ ...DEFAULT_PRINT_PREFS, margins: { ...DEFAULT_PRINT_PREFS.margins }, customPaper: { ...DEFAULT_PRINT_PREFS.customPaper } }));
  const [bundle, setBundle] = useState<PrintBundleSelection>(() => reconcileBundle(undefined, ["doc:main"]));
  const [uploadedAttachments, setUploadedAttachments] = useState<BundleAttachmentRef[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState<null | "print" | "pdf" | "png" | "jpg" | "xlsx">(null);
  const [printedOpen, setPrintedOpen] = useState(false);
  // ใช้/ไม่ใช้ส่วนลดตอนพิมพ์ (จำค่าไว้ต่อเอกสาร — เปิดหน้ามาได้สถานะล่าสุดเสมอ)
  const [useDiscount, setUseDiscount] = useState<boolean>(true);
  // เลือกพิมพ์เป็นเอกสารแบบไหน (null = ใช้ประเภทที่บันทึกไว้) + บีบให้พอดี 1 หน้า
  const [printAsType, setPrintAsType] = useState<DocumentType | null>(null);
  // ค่าเริ่มต้น: ใช้ขนาดตัวอักษรที่ผู้ใช้ตั้งเอง (ไม่ย่ออัตโนมัติ) เพื่อให้
  // ตัวเลข/ชื่อบนใบเสร็จคมชัด อ่านง่าย ไม่เล็กจนเบลอ
  const [fitOnePage, setFitOnePage] = useState<boolean>(false);

  const [discountStyle, setDiscountStyle] = useState<DiscountTableStyle>(DEFAULT_DISCOUNT_TABLE_STYLE);
  useEffect(() => {
    if (!id) return;
    try {
      const v = localStorage.getItem(`rds:printUseDiscount:${id}`);
      setUseDiscount(v == null ? true : v === "1");
    } catch { /* noop */ }
    try {
      const raw = localStorage.getItem(`rds:printDiscountStyle:${id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DiscountTableStyle>;
        setDiscountStyle({
          fontPx: clampNum(parsed.fontPx, 10, 18, DEFAULT_DISCOUNT_TABLE_STYLE.fontPx),
          align: parsed.align === "left" || parsed.align === "center" ? parsed.align : "right",
          padPx: clampNum(parsed.padPx, 0, 8, DEFAULT_DISCOUNT_TABLE_STYLE.padPx),
        });
      } else {
        setDiscountStyle(DEFAULT_DISCOUNT_TABLE_STYLE);
      }
    } catch { setDiscountStyle(DEFAULT_DISCOUNT_TABLE_STYLE); }
  }, [id]);
  const toggleDiscount = (v: boolean) => {
    setUseDiscount(v);
    try { if (id) localStorage.setItem(`rds:printUseDiscount:${id}`, v ? "1" : "0"); } catch { /* noop */ }
  };
  // จำค่า "พอดี 1 หน้า" ต่อเอกสาร และรีเซ็ตประเภทที่เลือกพิมพ์ทุกครั้งที่เปลี่ยนเอกสาร
  useEffect(() => {
    setPrintAsType(null);
    if (!id) return;
    try {
      const v = localStorage.getItem(`rds:printFitOnePage:${id}`);
      setFitOnePage(v === "1");
    } catch { /* noop */ }
  }, [id]);
  const toggleFitOnePage = (v: boolean) => {
    setFitOnePage(v);
    try { if (id) localStorage.setItem(`rds:printFitOnePage:${id}`, v ? "1" : "0"); } catch { /* noop */ }
  };
  const patchDiscountStyle = (p: Partial<DiscountTableStyle>) => {
    setDiscountStyle((prev) => {
      const next: DiscountTableStyle = { ...prev, ...p };
      try { if (id) localStorage.setItem(`rds:printDiscountStyle:${id}`, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const prefsSeededForDoc = useRef<string | null>(null);

  const patchPrefs = (p: Partial<PrintPrefs>) => setPrefs((prev) => {
    const next = { ...prev, ...p };
    savePrintPrefs(next);
    saveDocPrintPrefs(id, { ...next, bundle });
    return next;
  });

  const baseState = useMemo<DocFormState | null>(() => {
    if (!docQ.data?.doc) return null;
    return rowToState(docQ.data.doc, docQ.data.items);
  }, [docQ.data]);

  useEffect(() => {
    if (!baseState || !id || prefsSeededForDoc.current === id) return;
    prefsSeededForDoc.current = id;
    const perDoc = loadDocPrintPrefs(id);
    const global = loadPrintPrefs();
    // Per-document-type sticky prefs — persisted every time the user prints
    // this same doc type, so paper + margins stay consistent across sessions
    // without any explicit "remember" toggle.
    const perType = loadTypePrintPrefs(baseState.document_type);
    const next: PrintPrefs = perDoc
      ? { ...DEFAULT_PRINT_PREFS, ...global, ...perDoc, margins: perDoc.margins ?? global.margins ?? DEFAULT_PRINT_PREFS.margins, customPaper: perDoc.customPaper ?? global.customPaper ?? DEFAULT_PRINT_PREFS.customPaper }
      : { ...DEFAULT_PRINT_PREFS, paper: (baseState.paper_size ?? "A4") as PaperSize, fontScale: Number(baseState.font_scale ?? 1) || 1 };
    if (!perDoc && perType) {
      if (perType.paper != null) next.paper = perType.paper;
      if (perType.orient != null) next.orient = perType.orient;
      if (perType.customPaper != null) next.customPaper = perType.customPaper;
      if (perType.margins != null) next.margins = perType.margins;
    }
    // Simple mode: migrate any non-A4 saved paper (A5/80mm/Letter/Legal/custom)
    // back to A4 portrait so the primary preview never shows a narrow/skewed
    // sheet. Users can still switch paper via "ตั้งค่าเพิ่มเติม".
    let paper = next.paper ?? "A4";
    let orient = next.orient ?? "portrait";
    const isReceipt = baseState.document_type === "receipt";
    if (simpleMode) {
      paper = "A4";
      orient = "portrait";
      next.previewZoom = null;
    }
    // Receipt-only preset: default "อัตโนมัติ 19×27 ซม." when no per-doc pref
    // exists yet. For non-receipt doc types, migrate any leftover
    // "auto-receipt" value back to A4 so the preset doesn't leak.
    if (!isReceipt && paper === "auto-receipt") {
      paper = "A4";
    } else if (isReceipt && !perDoc) {
      // Receipt sticky preset wins even in simpleMode — request: ใบเสร็จ
      // ต้องล็อคกระดาษ 19×27 ซม. อัตโนมัติทุกครั้งจนกว่าผู้ใช้จะเปลี่ยนเอง.
      paper = perType?.paper ?? "auto-receipt";
      orient = perType?.orient ?? "portrait";
    }
    setPrefs({ ...next, paper, orient, customPaper: next.customPaper ?? { widthMm: 210, heightMm: 297 } });
  }, [baseState, id]);

  // Apply `?copies=N` from the URL once, right after the doc-scoped prefs
  // seed above so the bulk-print entry from the documents list drives the
  // "จำนวนชุด" counter without clobbering user edits after they land.
  const copiesSeededForDoc = useRef<string | null>(null);
  useEffect(() => {
    if (!id || copiesFromUrl == null) return;
    if (copiesSeededForDoc.current === id) return;
    copiesSeededForDoc.current = id;
    setPrefs((prev) => {
      if (prev.copies === copiesFromUrl) return prev;
      const next = { ...prev, copies: copiesFromUrl };
      savePrintPrefs(next);
      saveDocPrintPrefs(id, { ...next, bundle });
      return next;
    });
  }, [id, copiesFromUrl, bundle]);

  // ยอดก่อนหักส่วนลด (ผลรวมรายการ) — ใช้ตรวจสอบความถูกต้องของส่วนลดท้ายบิล
  const subtotalBeforeDiscount = useMemo(() => {
    if (!baseState) return 0;
    return computeTotals({ ...baseState, discount_amount: 0 }).subtotal;
  }, [baseState]);

  // ตรวจสอบส่วนลด: ต้องเป็นตัวเลข ไม่ติดลบ และไม่เกินยอดก่อนหัก (ตรรกะร่วมกับฟอร์ม)
  const discountCheck = useMemo(
    () => checkDiscount(baseState?.discount_amount ?? 0, subtotalBeforeDiscount),
    [baseState?.discount_amount, subtotalBeforeDiscount],
  );

  // ผู้ใช้เลือกได้ว่าจะพิมพ์เป็นเอกสารแบบไหน (ใบเสร็จ / ใบส่งของ / ใบเสนอราคา)
  // เป็นการเลือกเฉพาะตอนพิมพ์ ไม่แก้ประเภทที่บันทึกไว้ในฐานข้อมูล
  const printableTypes = useMemo<DocumentType[]>(() => {
    const allowed = allowedDocTypesForStore(storeSlug) as readonly string[];
    return (["receipt", "delivery", "quotation"] as DocumentType[]).filter((t) => allowed.includes(t));
  }, [storeSlug]);
  const resolvedType: DocumentType | undefined = useMemo(() => {
    if (!baseState) return undefined;
    if (printAsType && printableTypes.includes(printAsType)) return printAsType;
    return baseState.document_type;
  }, [baseState, printAsType, printableTypes]);

  const templateCfg = useMemo(() => {
    if (!baseState || !resolvedType) return null;
    const layout = pickLayout(layoutsQ.data ?? [], baseState.layout_id ?? null, resolvedType);
    const tpl = templateQ.data?.[resolvedType] ?? null;
    return mergeConfigWithLayout(tpl, layout);
  }, [layoutsQ.data, templateQ.data, baseState, resolvedType]);
  // Route the currently-selected paper preset + margins into the resolved
  // page layout so preview, print (lockDirectPrintPages / @page), and PDF
  // export all render at the same physical size. The "auto-receipt" preset
  // (190×270mm) and the custom size flow rely on this — without it the
  // preview + print stayed hard-locked to A4 210×297mm.
  const documentPageLayout = useMemo(() => {
    const dims = getPaperSizeMm(prefs.paper, prefs.orient, prefs.customPaper);
    return resolveDocumentPageLayout(templateCfg, {
      widthMm: dims.w,
      heightMm: dims.h,
      paddingMm: prefs.margins,
    });
  }, [templateCfg, prefs.paper, prefs.orient, prefs.customPaper, prefs.margins]);

  // วัดความสูง "หัวเอกสารจริง" จากพรีวิวที่เรนเดอร์อยู่ แล้วส่งให้ตัวคำนวณ
  // แบ่งหน้าใช้ค่าจริง (ไม่ใช่ค่าประมาณ/สเกลสมมติ) — ทั้งพรีวิว พิมพ์ และ PDF
  const measuredHeader = useMeasuredDocHeader([
    id,
    resolvedType,
    documentPageLayout.widthMm,
    documentPageLayout.heightMm,
    templateCfg?.footer_text,
  ]);

  // ตัวช่วยสร้างอินพุตของตัวคำนวณแบ่งหน้า (ใช้ร่วมกันทั้งโหมดตั้งเองและอัตโนมัติ)
  const paginateInputFor = useCallback(
    (st: DocFormState, footer?: string | null) => {
      const isA4 = documentPageLayout.widthMm === 210 && documentPageLayout.heightMm === 297;
      return {
        paperSize: (isA4 ? "A4" : "custom") as PaperSize,
        orient: "portrait" as const,
        customPaper: isA4 ? null : { widthMm: documentPageLayout.widthMm, heightMm: documentPageLayout.heightMm },
        marginsMm: documentPageLayout.paddingMm,
        items: st.items.map((it) => itemToPaginateHints({ name: it.name, description: it.description })),
        trailerMm: estimateTrailerMm(st, footer ?? undefined),
        headerFullMm: measuredHeader.full,
        headerCompactMm: measuredHeader.compact,
        trailerBlocks: [st.notes ? "notes" : null, "amountWords", "signature"].filter(Boolean) as any,
      };
    },
    [documentPageLayout, measuredHeader.full, measuredHeader.compact],
  );

  // "พอดี 1 หน้า" (ตัวเลือกเสริม): ย่อขนาดตัวอักษรเท่าที่จำเป็น แต่ไม่ย่อ
  // ต่ำกว่า 80% เพื่อไม่ให้ตัวเลข/ชื่อเล็กจนอ่านไม่ชัดเวลาพิมพ์จริง
  const onePageFit = useMemo(() => {
    if (!baseState) return { fontScale: prefs.fontScale, fits: true };
    const fitFor = (st: DocFormState, footer?: string | null) =>
      fitFontScaleToOnePage(paginateInputFor(st, footer), { max: prefs.fontScale, min: 0.8, step: 0.02 });

    // เอกสารหลัก (ตามชนิดที่เลือกพิมพ์) + ทุกใบที่ถูกเลือกในโหมดหลายใบ
    // ใช้อัตราย่อที่เล็กสุด เพื่อให้ "ทุกชนิดที่เลือก" อยู่ใบละหน้าเดียวจริง
    const candidates = [
      fitFor({ ...baseState, document_type: resolvedType ?? baseState.document_type }, templateCfg?.footer_text),
      ...(extraDocsQ.data ?? []).map(({ doc, items }: any) => fitFor(rowToState(doc, items), templateCfg?.footer_text)),
    ];
    const fontScale = Math.min(...candidates.map((c) => c.fontScale));
    return { fontScale, fits: candidates.every((c) => c.fits) };
  }, [baseState, resolvedType, paginateInputFor, templateCfg?.footer_text, prefs.fontScale, extraDocsQ.data]);

  const effectiveFontScale = fitOnePage ? onePageFit.fontScale : prefs.fontScale;

  // จำนวนหน้าที่จะพิมพ์จริงตามขนาดตัวอักษรที่ใช้อยู่ — ใช้เตือนผู้ใช้แบบสด
  const estimatedPages = useMemo(() => {
    if (!baseState) return 1;
    const main = paginateMainDocument({
      ...paginateInputFor({ ...baseState, document_type: resolvedType ?? baseState.document_type }, templateCfg?.footer_text),
      fontScale: effectiveFontScale,
    }).length;
    const extras = (extraDocsQ.data ?? []).map(({ doc, items }: any) =>
      paginateMainDocument({ ...paginateInputFor(rowToState(doc, items), templateCfg?.footer_text), fontScale: effectiveFontScale }).length,
    );
    return Math.max(main, ...(extras.length ? extras : [main]));
  }, [baseState, resolvedType, paginateInputFor, templateCfg?.footer_text, effectiveFontScale, extraDocsQ.data]);


  // Apply live prefs on top of the DB state without touching persisted values.
  const previewState = useMemo<DocFormState | null>(() => {
    if (!baseState || !resolvedType) return null;
    return {
      ...baseState,
      document_type: resolvedType,
      paper_size: prefs.paper as PaperSize,
      font_scale: effectiveFontScale,
      // ปุ่ม "ใช้ส่วนลด" เป็นการแสดงผลเฉพาะตอนพิมพ์ ไม่แก้ข้อมูลที่บันทึกไว้
      // ค่าที่ผิดรูปแบบ/เกินยอดก่อนหัก จะถูกจำกัดไว้เพื่อไม่ให้พิมพ์ยอดติดลบ
      discount_amount: useDiscount ? discountCheck.effective : 0,
    };
  }, [baseState, resolvedType, prefs.paper, effectiveFontScale, useDiscount, discountCheck.effective]);
  const totals = useMemo(() => (previewState ? computeTotals(previewState) : null), [previewState]);

  const docNo: string | null = docQ.data?.doc?.document_no ?? null;
  const docType = previewState?.document_type;

  // Build render-ready views for every extra document selected in bulk mode.
  // Each carries its own state / totals / templateConfig so the preview
  // matches what a solo print would show.
  const extraDocViews = useMemo(() => {
    const rows = extraDocsQ.data ?? [];
    if (!rows.length) return [] as Array<{
      id: string;
      docNo: string | null;
      state: DocFormState;
      totals: ReturnType<typeof computeTotals>;
      cfg: ReturnType<typeof mergeConfigWithLayout>;
    }>;
    return rows.map(({ doc, items }: any) => {
      const baseExtra = rowToState(doc, items);
      const stateExtra: DocFormState = {
        ...baseExtra,
        paper_size: prefs.paper as PaperSize,
        font_scale: effectiveFontScale,
      };
      const layout = pickLayout(layoutsQ.data ?? [], stateExtra.layout_id ?? null, stateExtra.document_type);
      const legacyTpl = templateQ.data?.[stateExtra.document_type] ?? null;
      const cfg = mergeConfigWithLayout(legacyTpl, layout);
      return {
        id: doc.id as string,
        docNo: (doc.document_no ?? null) as string | null,
        state: stateExtra,
        totals: computeTotals(stateExtra),
        cfg,
      };
    });
  }, [extraDocsQ.data, layoutsQ.data, templateQ.data, prefs.paper, effectiveFontScale]);
  const isBulk = extraDocViews.length > 0;

  const hiddenColumns = useMemo<string[]>(() => {
    if (!docType) return [];
    const out: string[] = [];
    for (const [k, v] of Object.entries(prefs.columnVisibility ?? {})) {
      if (v === false && k.startsWith(`${docType}:`)) out.push(k.slice(docType.length + 1));
    }
    return out;
  }, [prefs.columnVisibility, docType]);

  // Preview width mirrors the actual DocumentPreview frame (default A4
  // 210×297mm, content 190×270mm), not stale saved paper preferences.
  const paperDims = { w: documentPageLayout.widthMm, h: documentPageLayout.heightMm };
  const paperWidthMm = paperDims.w;
  const paperWidthPx = (paperWidthMm * 96) / 25.4;
  const paperCssSize = `${documentPageLayout.widthMm}mm ${documentPageLayout.heightMm}mm`;

  // Fit-to-container / explicit-zoom scaler. `previewZoom === null` → fit,
  // otherwise use the exact zoom factor. Only affects the on-screen preview;
  // the underlying #doc-print DOM keeps its logical paper size so exports
  // and print output are unaffected.
  // While the print queue is dispatching copies, freeze the preview scale
  // to whatever it was at the moment the queue kicked off. Without this,
  // the browser's beforeprint/afterprint reflow can nudge the container
  // width and cause copy #2..N to render at a slightly different scale —
  // visibly "jumping" between print dialogs.
  const [printLocked, setPrintLocked] = useState(false);
  useEffect(() => {
    return printQueue.onLifecycle((active) => {
      setPrintLocked(active);
    });
  }, []);
  // Simple mode always locks to fit-page so the primary preview never gets
  // stuck at 100% and clipped for users entering from the documents list.
  const effectiveZoom = simpleMode ? null : prefs.previewZoom;
  // สูตร fit ชุดเดียวของทั้งระบบ (computeViewportFitScale ผ่าน usePaperScale)
  // — หน้านี้ไม่มีคณิตศาสตร์ fit ของตัวเองอีกแล้ว
  const {
    containerRef: paperShellRef,
    sheetRef: paperInnerRef,
    scale: previewScale,
    wrapperHeightPx,
  } = usePaperScale({
    widthMm: paperWidthMm,
    heightMm: paperDims.h,
    scaleOverride: effectiveZoom ?? null,
    freezeScale: printLocked,
  });

  const bundleDocs: BundleDocRef[] = useMemo(() => {
    if (!previewState) return [];
    const existing = companionsQ.data ?? [];
    const byId = new Map(existing.map((doc) => [doc.id, doc]));
    const ids = defaultBundleDocIds(previewState.document_type, previewState.companion_set ?? "none");
    const possible: DocumentType[] = [];
    if (previewState.document_type !== "delivery") possible.push("delivery");
    if (previewState.document_type !== "receipt" && previewState.document_type !== "tax_invoice") possible.push("receipt");
    for (const type of possible) ids.push(`doc:${type}`);
    return Array.from(new Set(ids)).map((docId) => {
      if (docId === "doc:main") return { id: docId, type: previewState.document_type, docNo };
      const found = byId.get(docId);
      return found ?? { id: docId, type: docId.replace("doc:", "") as DocumentType, docNo: null };
    });
  }, [previewState, companionsQ.data, docNo]);

  const presetAttachments: BundleAttachmentRef[] = useMemo(() => {
    const s = storeQ.data;
    const out: BundleAttachmentRef[] = [];
    if (s?.attach_biz_reg_url) out.push({ id: "att:preset:biz_reg", label: "ใบทะเบียนพาณิชย์", url: s.attach_biz_reg_url });
    if (s?.attach_id_copy_url) out.push({ id: "att:preset:id_copy", label: "สำเนาบัตรประชาชน", url: s.attach_id_copy_url });
    if (s?.attach_bankbook_url) out.push({ id: "att:preset:bankbook", label: "สำเนาบัญชีธนาคาร", url: s.attach_bankbook_url });
    return out;
  }, [storeQ.data]);
  const bundleAttachments = useMemo(() => [...presetAttachments, ...uploadedAttachments], [presetAttachments, uploadedAttachments]);
  // Rasterize attachments (PDFs → one image per page, remote images → dataURL)
  // so Print / PDF / PNG / JPG all snapshot the same `<img>` nodes in bundle
  // order. Multi-page PDFs expand into multiple `.doc-page` sections here.
  const bundleAttachmentsWithPages = useBundleAttachmentPages(bundleAttachments);
  const bundleItems: BundlePickerItem[] = useMemo(() => [
    ...bundleDocs.map((doc) => ({
      id: doc.id,
      kind: "doc" as const,
      label: doc.id === "doc:main" ? `${docLabel(doc.type)} (เอกสารหลัก)` : docLabel(doc.type),
      detail: doc.docNo ?? (doc.id === "doc:main" ? "เลขที่เอกสาร" : "ยังไม่มีเลขที่/จะออกเมื่อบันทึก"),
      required: doc.id === "doc:main",
    })),
    ...bundleAttachments.map((att) => ({
      id: att.id,
      kind: att.id.startsWith("att:preset:") ? "preset" as const : "upload" as const,
      label: att.label,
      detail: att.file ? `${Math.round(att.file.size / 1024)} KB` : "เอกสารแนบ",
    })),
  ], [bundleDocs, bundleAttachments]);

  useEffect(() => {
    const ids = [...bundleDocs.map((doc) => doc.id), ...bundleAttachments.map((att) => att.id)];
    if (!ids.length) return;
    const stored = loadDocPrintPrefs(id)?.bundle;
    setBundle((prev) => {
      const next = reconcileBundle(stored ?? prev, ids);
      const selected = { ...next.selected, "doc:main": true };
      // Default = print ONLY the chosen document. Companion docs (ใบเสนอราคา /
      // ใบส่งของ / ใบเสร็จ ที่ไม่ใช่เอกสารหลัก) must stay unchecked unless the
      // user ticks them, otherwise printing a receipt also spits out a
      // quotation page.
      for (const doc of bundleDocs) {
        if (doc.id === "doc:main") continue;
        if (stored?.selected?.[doc.id] === true) continue;
        selected[doc.id] = false;
      }
      for (const att of bundleAttachments) {
        if (!next.order.includes(att.id)) continue;
        if (stored?.selected?.[att.id] === true) continue;
        selected[att.id] = false;
      }
      return { ...next, selected };
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, bundleDocs.length, bundleAttachments.length, previewState?.document_type]);


  const patchBundle = (next: PrintBundleSelection) => {
    const forced = { ...next, selected: { ...next.selected, "doc:main": true } };
    setBundle(forced);
    saveDocPrintPrefs(id, { ...prefs, bundle: forced });
  };

  async function doPrint() {
    const printArea = document.getElementById("documents-print-area") as HTMLElement | null;
    const preflight = (printArea ?? document.getElementById("doc-print")) as HTMLElement | null;
    const printableText = (preflight?.textContent ?? "").replace(/\s+/g, " ").trim();
    const hasPrintableContent = !!preflight && (
      printableText.length >= 10 ||
      preflight.querySelectorAll(".doc-page").length > 0 ||
      preflight.querySelectorAll("img,svg,canvas").length > 0 ||
      preflight.querySelectorAll("*").length > 5
    );
    if (!hasPrintableContent) {
      toast({ title: "ยังไม่มีเนื้อหาให้พิมพ์", description: "กรุณารอให้พรีวิวโหลดเสร็จก่อน", variant: "destructive" });
      return;
    }
    setBusy("print");
    try {
      const el = preflight;
      if (!el) throw new Error("ไม่พบเอกสารพรีวิว");
      // Persist current paper + margins as the sticky preset for this
      // document_type so the next print of any doc of the same type opens
      // with the same paper/orient/margins automatically.
      if (previewState) {
        saveTypePrintPrefs(previewState.document_type, {
          paper: prefs.paper,
          orient: prefs.orient,
          customPaper: prefs.customPaper,
          margins: prefs.margins,
        });
      }
      const bodyHtml = `<div>${el.outerHTML}</div>`;
      // Success modal MUST wait until the browser's afterprint event fires
      // (i.e. the print dialog has actually been dismissed). A blind
      // setTimeout showed "พิมพ์เรียบร้อยแล้ว" while the print dialog was
      // still open on top of a blank preview.
      const openPrintedOnce = (() => {
        let opened = false;
        return () => { if (!opened) { opened = true; setPrintedOpen(true); } };
      })();
      const opts: Parameters<typeof printViaCurrentDocument>[0] = {
        bodyHtml,
        paperSize: paperCssSize,
        orient: "portrait",
        margins: documentPageLayout.paddingMm,
        headerOnce: prefs.headerOnce,
        fontScale: effectiveFontScale,
        fontScope: prefs.fontScope,
        copies: prefs.copies,
        sourceEl: el,
        onAfterPrint: openPrintedOnce,
      };
      const printed = await printViaCurrentDocument(opts);
      if (!printed) {
        const ok = printViaHiddenIframe({ ...opts, onAfterPrint: openPrintedOnce });
        if (!ok) throw new Error("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ หรือเอกสารพิมพ์ว่าง");
      }
    } catch (e: any) {
      toast({ title: "เปิดหน้าต่างพิมพ์ไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function doPdf() {
    if (!previewState) return;
    setBusy("pdf");
    try {
      const el = document.getElementById("doc-print") as HTMLElement | null;
      if (!el) throw new Error("ไม่พบเอกสารพรีวิว");
      await waitForExportAssets(el);
      const blob = await elementToPdfBlob(el, "custom", "portrait", false, {
        widthMm: documentPageLayout.widthMm,
        heightMm: documentPageLayout.heightMm,
      });
      const { buildDocFilename } = await import("../lib/docFilename");
      const { saveBlobAsFile } = await import("../lib/pdfUtils");
      const res = await saveBlobAsFile(blob, buildDocFilename({
        document_type: previewState.document_type,
        document_no: docNo,
        document_date: previewState.document_date,
        customer_name: previewState.customer_name,
        org_name: (storeQ.data as any)?.name,
      }));
      if (res === "aborted") return;
      if (res === "failed") {
        toast({ title: "บันทึกไฟล์ไม่สำเร็จ", description: "เบราว์เซอร์บล็อกการดาวน์โหลด กรุณาเปิดหน้านี้ในแท็บใหม่แล้วลองอีกครั้ง", variant: "destructive" });
        return;
      }
      toast({
        title: res === "tab" ? "เปิดไฟล์ PDF แล้ว" : "บันทึกไฟล์ PDF สำเร็จ",
        description: res === "tab" ? "กดปุ่มแชร์ → บันทึกลงในไฟล์ เพื่อเซฟไฟล์" : undefined,
      });
    } catch (e: any) {
      toast({ title: "ดาวน์โหลด PDF ไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function doPng() {
    if (!previewState) return;
    setBusy("png");
    try {
      await waitForExportAssets();
      await exportDocumentAsPng(previewState, docNo);
      toast({ title: "บันทึกรูป PNG สำเร็จ" });
    } catch (e: any) {
      toast({ title: "บันทึกรูป PNG ไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    } finally { setBusy(null); }
  }
  async function doJpg() {
    if (!previewState) return;
    setBusy("jpg");
    try {
      await waitForExportAssets();
      await exportDocumentAsJpg(previewState, docNo);
      toast({ title: "บันทึกรูป JPG สำเร็จ" });
    } catch (e: any) {
      toast({ title: "บันทึกรูป JPG ไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    } finally { setBusy(null); }
  }
  async function doXlsx() {
    if (!previewState || !totals) return;
    setBusy("xlsx");
    try {
      exportDocumentAsXlsx({
        state: previewState, totals, items: previewState.items,
        store: storeQ.data ?? null, docNo,
        headerText: templateCfg?.header_text, footerText: templateCfg?.footer_text,
        hiddenColumns,
      });
      toast({ title: "ส่งออก Excel สำเร็จ" });
    } catch (e: any) {
      toast({ title: "ส่งออก Excel ไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    } finally { setBusy(null); }
  }
  function doCsv() {
    if (!previewState || !totals) return;
    try {
      exportDocumentAsCsv({
        state: previewState, totals, items: previewState.items,
        store: storeQ.data ?? null, docNo, hiddenColumns,
      });
      toast({ title: "ส่งออก CSV สำเร็จ", description: useDiscount ? "รวมส่วนลดตามที่ตั้งไว้" : "ไม่รวมส่วนลดตามที่ตั้งไว้" });
    } catch (e: any) {
      toast({ title: "ส่งออก CSV ไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    }
  }

  const loading = storeQ.isLoading || docQ.isLoading || templateQ.isLoading || companionsQ.isLoading;

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />กำลังโหลดเอกสาร…</div>;
  }
  if (!previewState || !storeQ.data || !totals) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">ไม่พบเอกสารหรือร้าน</p>
        <Button variant="outline" onClick={() => navigate(-1)} className="mt-3">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> กลับ
        </Button>
      </div>
    );
  }

  const backToDoc = () => {
    // Users arrive here from the documents list — back should always take
    // them there, never back into the edit form.
    if (storeSlug) navigate(`${storeBasePath(storeSlug)}/documents`);
    else navigate(-1);
  };

  const tint = docTypeTint(previewState.document_type);

  return (
    <div
      className="min-h-screen"
      style={{ background: tint.bg }}
      data-doc-type={previewState.document_type}
    >
      {/* Toolbar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto p-2 md:p-3 flex flex-wrap items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" onClick={backToDoc} data-testid="pp-back">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> กลับ
          </Button>
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border whitespace-nowrap"
            style={{ background: tint.bg, borderColor: tint.ring, color: tint.dot }}
            data-testid="pp-doctype-chip"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: tint.dot }}
              aria-hidden="true"
            />
            {tint.label}
          </span>
          <div className="flex items-center gap-1.5 text-sm">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">วันที่</Label>
            <Input
              type="date"
              value={previewState.document_date}
              readOnly
              className="h-8 w-[140px]"
              data-testid="pp-date"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setPanelOpen((v) => !v)} data-testid="pp-toggle-settings">
            <Settings2 className="h-4 w-4 mr-1.5" /> ตั้งค่าพิมพ์
          </Button>
          <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
            <Switch
              id="pp-use-discount"
              checked={useDiscount}
              onCheckedChange={toggleDiscount}
              data-testid="pp-use-discount"
            />
            <Label htmlFor="pp-use-discount" className="text-xs whitespace-nowrap cursor-pointer">
              {useDiscount ? "ใช้ส่วนลด" : "ไม่ใช้ส่วนลด"}
            </Label>
          </div>
          {isBulk && (
            <span
              className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary whitespace-nowrap"
              data-testid="pp-bulk-badge"
            >
              พิมพ์เป็นชุด · {extraDocViews.length + 1} เอกสาร × {prefs.copies} ชุด
            </span>
          )}
          <div className="hidden lg:block flex-1" />
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          {id && (
            <Button variant="outline" size="sm" asChild data-testid="pp-edit">
              <Link to={`${storeBasePath(storeSlug)}/documents/${id}/edit`}>
                <Pencil className="h-4 w-4 mr-1.5" /> แก้ไข
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={doXlsx} disabled={busy !== null} data-testid="pp-excel">
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={doCsv} disabled={busy !== null} data-testid="pp-csv">
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={doPdf} disabled={busy !== null} data-testid="pp-pdf">
            <FileText className="h-4 w-4 mr-1.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={doPng} disabled={busy !== null} data-testid="pp-png">
            <ImageIcon className="h-4 w-4 mr-1.5" /> PNG
          </Button>
          <Button variant="outline" size="sm" onClick={doJpg} disabled={busy !== null} data-testid="pp-jpg">
            <ImageIcon className="h-4 w-4 mr-1.5" /> JPG
          </Button>
          <Button size="sm" onClick={doPrint} disabled={busy !== null} data-testid="pp-print">
            {busy === "print" ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> กำลังเตรียมพิมพ์…</>
            ) : (
              <><Printer className="h-4 w-4 mr-1.5" /> {simpleMode ? "พิมพ์ A4" : "พิมพ์"}</>
            )}
          </Button>
          </div>
        </div>
      </div>

      {/* วิธีคำนวณส่วนลด + การแจ้งเตือนเมื่อกรอกส่วนลดผิดรูปแบบ/เกินยอดก่อนหัก */}
      {(discountCheck.raw !== 0 || discountCheck.problem) && (
        <div className="max-w-6xl mx-auto px-3 md:px-4 pt-3">
          <div className="rounded-lg border bg-background p-3 text-xs" data-testid="pp-discount-breakdown">
            <div className="mb-1.5 font-medium">วิธีคำนวณส่วนลด</div>
            <div className="grid gap-1 sm:grid-cols-3">
              <div>
                <div className="text-muted-foreground">ยอดก่อนหักส่วนลด</div>
                <div className="tabular-nums font-medium" data-testid="pp-discount-subtotal">
                  {subtotalBeforeDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">ส่วนลด{useDiscount ? "" : " (ปิดใช้งาน)"}</div>
                <div className="tabular-nums font-medium" data-testid="pp-discount-amount">
                  {(useDiscount ? discountCheck.effective : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {subtotalBeforeDiscount > 0 && (
                    <span className="ml-1 text-muted-foreground">
                      ({(((useDiscount ? discountCheck.effective : 0) / subtotalBeforeDiscount) * 100).toFixed(2)}% ของยอดก่อนหัก)
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">หลังหักส่วนลด</div>
                <div className="tabular-nums font-medium" data-testid="pp-discount-after">
                  {Math.max(0, subtotalBeforeDiscount - (useDiscount ? discountCheck.effective : 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              สูตร: หลังหักส่วนลด = ยอดก่อนหักส่วนลด − ส่วนลด (ค่าติดลบจะถูกปรับเป็น 0 อัตโนมัติ)
            </div>
            {discountCheck.problem && (
              <div
                className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900"
                role="alert"
                data-testid="pp-discount-warning"
              >
                {discountCheck.problem === "invalid" && "ส่วนลดที่บันทึกไว้ไม่ใช่ตัวเลขที่ถูกต้อง ระบบใช้ค่า 0 แทนเพื่อไม่ให้ยอดพิมพ์ผิด"}
                {discountCheck.problem === "negative" && "ส่วนลดติดลบไม่ถูกต้อง ระบบใช้ค่า 0 แทนเพื่อไม่ให้ยอดพิมพ์ติดลบ"}
                {discountCheck.problem === "exceeds" && `ส่วนลด (${discountCheck.raw.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) มากกว่ายอดก่อนหัก ระบบจำกัดไว้ที่ ${discountCheck.effective.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} เพื่อไม่ให้ยอดพิมพ์ติดลบ — กรุณาแก้ไขในหน้าแก้ไขเอกสาร`}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto grid md:grid-cols-[280px_1fr] gap-4 p-3 md:p-4">

        {/* Settings panel */}
        {panelOpen && (
          <aside className="rounded-lg border bg-background p-3 md:p-4 space-y-4 h-fit md:sticky md:top-16" data-testid="pp-settings-panel">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Settings2 className="h-4 w-4" /> ตั้งค่าพิมพ์
            </div>

            {/* สไตล์ตารางส่วนลด — ปรับให้พอดีกับกระดาษแต่ละขนาด */}
            <div className="space-y-2 rounded-md border p-2.5" data-testid="pp-discount-style">
              <div className="text-xs font-medium">สไตล์ตารางส่วนลด</div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">ขนาดตัวอักษร · {discountStyle.fontPx}px</Label>
                <Slider
                  min={10} max={18} step={1}
                  value={[discountStyle.fontPx]}
                  onValueChange={([v]) => patchDiscountStyle({ fontPx: v })}
                  data-testid="pp-discount-font"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">การจัดแนวตัวเลข</Label>
                <Select value={discountStyle.align} onValueChange={(v) => patchDiscountStyle({ align: v as DiscountTableStyle["align"] })}>
                  <SelectTrigger className="h-8 text-xs" data-testid="pp-discount-align"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">ชิดขวา</SelectItem>
                    <SelectItem value="center">กึ่งกลาง</SelectItem>
                    <SelectItem value="left">ชิดซ้าย</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">ระยะขอบแถว · {discountStyle.padPx}px</Label>
                <Slider
                  min={0} max={8} step={1}
                  value={[discountStyle.padPx]}
                  onValueChange={([v]) => patchDiscountStyle({ padPx: v })}
                  data-testid="pp-discount-pad"
                />
              </div>
              <Button
                variant="ghost" size="sm" className="h-7 w-full text-[11px]"
                onClick={() => patchDiscountStyle(DEFAULT_DISCOUNT_TABLE_STYLE)}
                data-testid="pp-discount-style-reset"
              >
                <RotateCw className="h-3 w-3 mr-1" /> คืนค่าเริ่มต้น
              </Button>
            </div>


            {printableTypes.length > 1 && (
              <div className="space-y-1" data-testid="pp-print-as">
                <Label className="text-xs">พิมพ์เป็นเอกสาร</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {printableTypes.map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant={resolvedType === t ? "default" : "outline"}
                      className="h-8 text-[11px] px-1"
                      onClick={() => setPrintAsType(t)}
                      data-testid={`pp-print-as-${t}`}
                    >
                      {t === "receipt" ? "ใบเสร็จรับเงิน" : t === "delivery" ? "ใบส่งของ" : "ใบเสนอราคา"}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* ปรับขนาดตัวอักษรที่จะพิมพ์เอง (ค่าหลัก) */}
            <div className="space-y-1.5 rounded-md border px-2.5 py-2" data-testid="pp-font-manual">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">
                  ขนาดตัวอักษรที่พิมพ์ <span className="font-mono">{Math.round(effectiveFontScale * 100)}%</span>
                </Label>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={fitOnePage}
                    onClick={() => patchPrefs({ fontScale: Math.max(0.7, Math.round((prefs.fontScale - 0.05) * 100) / 100) })}
                    data-testid="pp-font-minus"><Minus className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={fitOnePage}
                    onClick={() => patchPrefs({ fontScale: Math.min(1.6, Math.round((prefs.fontScale + 0.05) * 100) / 100) })}
                    data-testid="pp-font-plus"><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <Slider min={70} max={160} step={5}
                disabled={fitOnePage}
                value={[Math.round((fitOnePage ? effectiveFontScale : prefs.fontScale) * 100)]}
                onValueChange={(v) => patchPrefs({ fontScale: (v?.[0] ?? 100) / 100 })}
                data-testid="pp-font-slider" />
              <div className="flex flex-wrap gap-1.5">
                {[85, 90, 95, 100, 110].map((p) => (
                  <Button key={p} size="sm" variant={Math.round(prefs.fontScale * 100) === p ? "default" : "outline"}
                    className="h-7 px-2 text-[11px]" disabled={fitOnePage}
                    onClick={() => patchPrefs({ fontScale: p / 100 })}
                    data-testid={`pp-font-preset-${p}`}>{p}%</Button>
                ))}
              </div>
              <p className="text-[11px]" data-testid="pp-page-estimate">
                {estimatedPages <= 1
                  ? <span className="text-muted-foreground">พิมพ์ออกมาอยู่ใน 1 หน้า (A4 ของร้าน)</span>
                  : <span className="text-destructive">ขนาดนี้จะพิมพ์ {estimatedPages} หน้า — ลดขนาดตัวอักษรลงอีกนิด หรือเปิด "บีบให้พอดี 1 หน้า"</span>}
              </p>
            </div>

            <label className="flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs cursor-pointer">
              <Checkbox
                checked={fitOnePage}
                onCheckedChange={(v) => toggleFitOnePage(v === true)}
                data-testid="pp-fit-one-page"
              />
              <span>
                <span className="font-medium">บีบให้พอดี 1 หน้า (อัตโนมัติ)</span>
                <span className="block text-[11px] text-muted-foreground">
                  {fitOnePage
                    ? onePageFit.fits
                      ? `ย่อตัวอักษรเป็น ${Math.round(effectiveFontScale * 100)}% (ไม่ย่อต่ำกว่า 80% เพื่อให้ยังอ่านชัด)`
                      : "รายการยาวมาก ย่อถึง 80% แล้วยังเกิน 1 หน้า — แนะนำแยกใบหรือปิดตัวเลือกนี้"
                    : "ปิดอยู่ — ใช้ขนาดตัวอักษรที่คุณตั้งเองด้านบน"}
                </span>
              </span>
            </label>


            {simpleMode && (
              <div
                className="rounded-md border bg-primary/5 px-2.5 py-2 text-xs"
                data-testid="pp-paper-badge"
              >
                <div className="font-medium">กระดาษหลัก: A4 (210 × 297 มม.)</div>
                <div className="text-[11px] text-muted-foreground">แนวตั้ง · เปลี่ยนขนาด/แนวกระดาษได้ใน "ตั้งค่าเพิ่มเติม"</div>
              </div>
            )}

            {!simpleMode && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">ขนาดกระดาษ</Label>
                <Select
                  value={prefs.paper}
                  onValueChange={(v) => patchPrefs({ paper: v as PaperSize })}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="pp-paper">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {docType === "receipt" && (
                      <SelectItem value="auto-receipt">อัตโนมัติ (19×27 ซม.)</SelectItem>
                    )}
                    <SelectItem value="A4">A4 (210×297)</SelectItem>
                    <SelectItem value="A5">A5 (148×210)</SelectItem>
                    <SelectItem value="Letter">Letter (216×279)</SelectItem>
                    <SelectItem value="Legal">Legal (216×356)</SelectItem>
                    <SelectItem value="80mm">80mm</SelectItem>
                    <SelectItem value="custom">กำหนดเอง</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">แนวกระดาษ</Label>
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    size="sm"
                    variant={prefs.orient === "portrait" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => patchPrefs({ orient: "portrait" })}
                    data-testid="pp-orient-portrait"
                  >แนวตั้ง</Button>
                  <Button
                    size="sm"
                    variant={prefs.orient === "landscape" ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => patchPrefs({ orient: "landscape" })}
                    data-testid="pp-orient-landscape"
                  >แนวนอน</Button>
                </div>
              </div>
            </div>
            )}
            {!simpleMode && prefs.paper === "custom" && (
              <div className="space-y-1 rounded-md border bg-muted/20 p-2">
                <Label className="text-xs">ขนาดกำหนดเอง</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-muted-foreground">กว้าง (มม.)</div>
                    <Input
                      type="number"
                      min={50}
                      max={500}
                      step={1}
                      value={prefs.customPaper.widthMm}
                      onChange={(e) => patchPrefs({ customPaper: { ...prefs.customPaper, widthMm: Math.min(500, Math.max(50, Number(e.target.value) || 210)) } })}
                      className="h-8 text-xs"
                      data-testid="pp-custom-width"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-muted-foreground">สูง (มม.)</div>
                    <Input
                      type="number"
                      min={50}
                      max={500}
                      step={1}
                      value={prefs.customPaper.heightMm}
                      onChange={(e) => patchPrefs({ customPaper: { ...prefs.customPaper, heightMm: Math.min(500, Math.max(50, Number(e.target.value) || 297)) } })}
                      className="h-8 text-xs"
                      data-testid="pp-custom-height"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">ขนาดที่ใช้พิมพ์จริง: {paperDims.w}×{paperDims.h} มม.</p>
                {(prefs.customPaper.widthMm < 50 || prefs.customPaper.widthMm > 500 || prefs.customPaper.heightMm < 50 || prefs.customPaper.heightMm > 500) && (
                  <p className="text-[10px] text-destructive">กรุณากำหนดขนาด 50–500 มม.</p>
                )}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              พรีวิว / พิมพ์ / PDF / PNG / JPG ใช้ค่าตั้งเดียวกันเพื่อให้ไฟล์ที่ออกตรงกับหน้าจอ
            </p>

            {!simpleMode && (
              <BundlePicker
                items={bundleItems}
                selection={bundle}
                disabled={busy !== null}
                onChange={patchBundle}
                onUploadFiles={(files) => {
                  const additions = Array.from(files).map((file, idx) => ({
                    id: `att:upload:${Date.now()}-${idx}-${file.name}`,
                    label: file.name,
                    file,
                  }));
                  setUploadedAttachments((prev) => [...prev, ...additions]);
                }}
              />
            )}




            <div className="space-y-1">
              <Label className="text-xs">ซูมพรีวิว (บนหน้าจอเท่านั้น)</Label>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" data-testid="pp-zoom-minus"
                  onClick={() => patchPrefs({ previewZoom: Math.max(0.25, Math.round(((prefs.previewZoom ?? 1) - 0.1) * 100) / 100) })}>
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="font-mono text-xs px-2 self-center min-w-[3.5rem] text-center" data-testid="pp-zoom-value">
                  {prefs.previewZoom == null ? "พอดี" : `${Math.round(prefs.previewZoom * 100)}%`}
                </span>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" data-testid="pp-zoom-plus"
                  onClick={() => patchPrefs({ previewZoom: Math.min(3, Math.round(((prefs.previewZoom ?? 1) + 0.1) * 100) / 100) })}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-8" data-testid="pp-zoom-fit"
                  onClick={() => patchPrefs({ previewZoom: null })}>
                  <Maximize2 className="h-3.5 w-3.5 mr-1" /> พอดี
                </Button>
                <Button size="sm" variant="outline" className="h-8" data-testid="pp-zoom-100"
                  onClick={() => patchPrefs({ previewZoom: 1 })}>100%</Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">ระยะขอบ</Label>
              <div className="flex flex-wrap gap-1.5" data-testid="pp-margin-presets">
                {([
                  { key: "normal", label: "ปกติ", v: 15 },
                  { key: "narrow", label: "แคบ", v: 8 },
                  { key: "wide",   label: "กว้าง", v: 22 },
                ] as const).map((p) => {
                  const active = prefs.margins.top === p.v && prefs.margins.right === p.v && prefs.margins.bottom === p.v && prefs.margins.left === p.v;
                  return (
                    <Button
                      key={p.key}
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-8 text-xs"
                      data-testid={`pp-margin-preset-${p.key}`}
                      onClick={() => patchPrefs({ margins: { top: p.v, right: p.v, bottom: p.v, left: p.v } })}
                    >{p.label}</Button>
                  );
                })}
              </div>
              {!simpleMode && (
              <div className="grid grid-cols-4 gap-1.5">
                {(["top","right","bottom","left"] as const).map((side) => (
                  <div key={side} className="space-y-0.5">
                    <div className="text-[10px] text-muted-foreground uppercase">{side}</div>
                    <Input
                      type="number" min={0} max={30} step={1}
                      value={prefs.margins[side]}
                      onChange={(e) => patchPrefs({ margins: { ...prefs.margins, [side]: Math.min(30, Math.max(0, Number(e.target.value) || 0)) } })}
                      className="h-8 text-xs"
                      data-testid={`pp-margin-${side}`}
                    />
                  </div>
                ))}
              </div>
              )}
            </div>

            {!simpleMode && docType && (
              <div className="space-y-1">
                <Label className="text-xs">คอลัมน์ที่แสดง</Label>
                <div className="flex flex-col gap-1.5 text-sm">
                  {(["qty","unit","price"] as const).map((col) => {
                    const key = `${docType}:${col}`;
                    const label = col === "qty" ? "จำนวน" : col === "unit" ? "หน่วย" : "ราคาต่อหน่วย";
                    const visible = prefs.columnVisibility[key] !== false;
                    return (
                      <label key={col} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={visible}
                          onCheckedChange={(v) => patchPrefs({ columnVisibility: { ...prefs.columnVisibility, [key]: !!v } })}
                          data-testid={`pp-col-${col}`}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {simpleMode && (
              <div className="border-t pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-between h-8 text-xs"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  data-testid="pp-advanced-toggle"
                  aria-expanded={advancedOpen}
                >
                  <span className="flex items-center gap-1.5">
                    {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    ตั้งค่าเพิ่มเติม
                  </span>
                  <span className="text-[10px] text-muted-foreground">ขนาดกระดาษ · แนว · คอลัมน์ · แนบไฟล์</span>
                </Button>
                {advancedOpen && (
                  <div className="mt-2 space-y-3" data-testid="pp-advanced-panel">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">ขนาดกระดาษ</Label>
                        <Select value={prefs.paper} onValueChange={(v) => patchPrefs({ paper: v as PaperSize })}>
                          <SelectTrigger className="h-8 text-xs" data-testid="pp-paper"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {docType === "receipt" && (
                              <SelectItem value="auto-receipt">อัตโนมัติ (19×27 ซม.)</SelectItem>
                            )}
                            <SelectItem value="A4">A4 (210×297)</SelectItem>
                            <SelectItem value="A5">A5 (148×210)</SelectItem>
                            <SelectItem value="Letter">Letter (216×279)</SelectItem>
                            <SelectItem value="Legal">Legal (216×356)</SelectItem>
                            <SelectItem value="80mm">80mm</SelectItem>
                            <SelectItem value="custom">กำหนดเอง</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">แนวกระดาษ</Label>
                        <div className="grid grid-cols-2 gap-1">
                          <Button size="sm" variant={prefs.orient === "portrait" ? "default" : "outline"} className="h-8 text-xs" onClick={() => patchPrefs({ orient: "portrait" })} data-testid="pp-orient-portrait">แนวตั้ง</Button>
                          <Button size="sm" variant={prefs.orient === "landscape" ? "default" : "outline"} className="h-8 text-xs" onClick={() => patchPrefs({ orient: "landscape" })} data-testid="pp-orient-landscape">แนวนอน</Button>
                        </div>
                      </div>
                    </div>
                    {prefs.paper === "custom" && (
                      <div className="space-y-1 rounded-md border bg-muted/20 p-2">
                        <Label className="text-xs">ขนาดกำหนดเอง</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <div className="text-[10px] text-muted-foreground">กว้าง (มม.)</div>
                            <Input type="number" min={50} max={500} step={1} value={prefs.customPaper.widthMm} onChange={(e) => patchPrefs({ customPaper: { ...prefs.customPaper, widthMm: Math.min(500, Math.max(50, Number(e.target.value) || 210)) } })} className="h-8 text-xs" data-testid="pp-custom-width" />
                          </div>
                          <div className="space-y-0.5">
                            <div className="text-[10px] text-muted-foreground">สูง (มม.)</div>
                            <Input type="number" min={50} max={500} step={1} value={prefs.customPaper.heightMm} onChange={(e) => patchPrefs({ customPaper: { ...prefs.customPaper, heightMm: Math.min(500, Math.max(50, Number(e.target.value) || 297)) } })} className="h-8 text-xs" data-testid="pp-custom-height" />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["top","right","bottom","left"] as const).map((side) => (
                        <div key={side} className="space-y-0.5">
                          <div className="text-[10px] text-muted-foreground uppercase">{side}</div>
                          <Input type="number" min={0} max={30} step={1} value={prefs.margins[side]} onChange={(e) => patchPrefs({ margins: { ...prefs.margins, [side]: Math.min(30, Math.max(0, Number(e.target.value) || 0)) } })} className="h-8 text-xs" data-testid={`pp-margin-${side}`} />
                        </div>
                      ))}
                    </div>
                    {docType && (
                      <div className="space-y-1">
                        <Label className="text-xs">คอลัมน์ที่แสดง</Label>
                        <div className="flex flex-col gap-1.5 text-sm">
                          {(["qty","unit","price"] as const).map((col) => {
                            const key = `${docType}:${col}`;
                            const label = col === "qty" ? "จำนวน" : col === "unit" ? "หน่วย" : "ราคาต่อหน่วย";
                            const visible = prefs.columnVisibility[key] !== false;
                            return (
                              <label key={col} className="flex items-center gap-2 cursor-pointer">
                                <Checkbox checked={visible} onCheckedChange={(v) => patchPrefs({ columnVisibility: { ...prefs.columnVisibility, [key]: !!v } })} data-testid={`pp-col-${col}`} />
                                {label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <BundlePicker
                      items={bundleItems}
                      selection={bundle}
                      disabled={busy !== null}
                      onChange={patchBundle}
                      onUploadFiles={(files) => {
                        const additions = Array.from(files).map((file, idx) => ({
                          id: `att:upload:${Date.now()}-${idx}-${file.name}`,
                          label: file.name,
                          file,
                        }));
                        setUploadedAttachments((prev) => [...prev, ...additions]);
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t">
              <Button size="sm" variant="ghost" className="w-full"
                onClick={() => {
                  const next: PrintPrefs = {
                    ...DEFAULT_PRINT_PREFS,
                    paper: "A4",
                    orient: "portrait",
                    margins: { ...DEFAULT_PRINT_PREFS.margins },
                    customPaper: { widthMm: 210, heightMm: 297 },
                  };
                  setPrefs(next);
                  savePrintPrefs(next);
                  saveDocPrintPrefs(id, { ...next, bundle });
                }}
                data-testid="pp-reset">
                <RotateCw className="h-3.5 w-3.5 mr-1" /> รีเซ็ตค่าเริ่มต้น (A4)
              </Button>
            </div>
          </aside>
        )}

        {/* Preview */}
        <main className="min-w-0 overflow-auto">
          {/* Zoom quick-controls — visible right above the preview, no dialog */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap" data-testid="pp-zoom-bar">
            <span className="text-xs text-muted-foreground mr-1">ซูมพรีวิว</span>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" data-testid="pp-zoom-minus-top"
              onClick={() => patchPrefs({ previewZoom: Math.max(0.25, Math.round(((prefs.previewZoom ?? 1) - 0.1) * 100) / 100) })}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="font-mono text-xs px-2 min-w-[3.5rem] text-center" data-testid="pp-zoom-value-top">
              {prefs.previewZoom == null ? "พอดี" : `${Math.round(prefs.previewZoom * 100)}%`}
            </span>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" data-testid="pp-zoom-plus-top"
              onClick={() => patchPrefs({ previewZoom: Math.min(3, Math.round(((prefs.previewZoom ?? 1) + 0.1) * 100) / 100) })}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-8" data-testid="pp-zoom-fit-top"
              onClick={() => patchPrefs({ previewZoom: null })}>
              <Maximize2 className="h-3.5 w-3.5 mr-1" /> พอดีหน้า
            </Button>
            <Button size="sm" variant="outline" className="h-8" data-testid="pp-zoom-100-top"
              onClick={() => patchPrefs({ previewZoom: 1 })}>100%</Button>
            <span className="text-[10px] text-muted-foreground ml-1">(บนหน้าจอเท่านั้น ไม่กระทบไฟล์/พิมพ์จริง)</span>
          </div>
          {/* Paper shell: measures available width. `overflow-x: auto` lets
              the user pan the sheet at 100% zoom on narrow screens instead
              of clipping the right-hand side of the document. */}
          {/* fit mode: ห้าม overflow แนวนอน; manual zoom: ให้ผู้ใช้ pan ได้ */}
          <div
            ref={paperShellRef}
            className="w-full min-w-0"
            style={{ overflowX: effectiveZoom == null ? "hidden" : "auto" }}
            data-testid="pp-paper-shell"
            data-fit-mode={effectiveZoom == null ? "fit" : "manual"}
          >
            {/* Scaler reserves scaled height so following UI (dialogs, footer)
                doesn't overlap the paper. The inner container keeps the true
                logical paper width so template layout matches print/export. */}
            <div
              style={{
                width: paperWidthPx * previewScale,
                height: wrapperHeightPx > 0 ? wrapperHeightPx : undefined,
                margin: effectiveZoom == null ? "0 auto" : "0 0 0 0",
              }}
              data-testid="pp-paper-scaler"
            >
              <div
                ref={paperInnerRef}
                className="bg-white shadow rounded"
                style={{
                  width: `${paperWidthMm}mm`,
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                }}
                data-testid="pp-paper"
                data-print-locked={printLocked ? "true" : "false"}
              >
                <div id={isBulk ? "documents-print-area" : undefined}>
                  <BundlePrint
                    store={storeQ.data}
                    state={previewState}
                    totals={totals}
                    mainDocNo={docNo}
                    docs={bundleDocs}
                    attachments={bundleAttachmentsWithPages}
                    bundle={bundle}
                    templateConfig={templateCfg}
                    hiddenColumns={hiddenColumns}
                    orient={prefs.orient}
                    customPaper={prefs.customPaper}
                    pageLayout={documentPageLayout}
                    discountStyle={discountStyle}
                  />
                  {isBulk && extraDocViews.map((extra) => (
                    <div
                      key={extra.id}
                      className="doc-print-document pp-extra-doc"
                      data-doc-id={extra.id}
                      style={{
                        // Keep bulk extras off-screen on the preview surface;
                        // printWindow.lockDirectPrintPages() forces
                        // position:static + margin:0 auto on every
                        // `.doc-print-document` inside the direct print host,
                        // so the printed output still includes each one on
                        // its own page.
                        position: "absolute",
                        left: "-100000px",
                        top: 0,
                        width: `${paperWidthMm}mm`,
                      }}
                      aria-hidden="true"
                    >
                      <DocumentPreview
                        store={storeQ.data}
                        state={extra.state}
                        totals={extra.totals}
                        docNo={extra.docNo}
                        templateConfig={extra.cfg}
                        orient={prefs.orient}
                        customPaper={prefs.customPaper}
                        pageLayout={documentPageLayout}
                        rootId={null}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
      <PrintCompleteDialog
        open={printedOpen}
        onOpenChange={setPrintedOpen}
        onReprint={() => { setPrintedOpen(false); void doPrint(); }}
        onBackToList={() => {
          setPrintedOpen(false);
          if (storeSlug) navigate(`${storeBasePath(storeSlug)}/documents`);
          else navigate(-1);
        }}
      />
    </div>
  );
}