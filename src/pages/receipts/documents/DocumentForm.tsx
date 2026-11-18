import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore, storeBasePath, useStoreSlug } from "../useStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkDiscount, parseDiscountInput, afterDiscount } from "@/pages/receipts/lib/discount";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Save, Printer, Sparkles, CloudUpload, Download, AlertTriangle, History as HistoryIcon, Check, Send, Ban, RotateCw, CheckCircle2, XCircle, Loader2, FilePlus2, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useDocumentForm, defaultsForStore, validateItems, calcLineTotal, emptyItem, newKey, STATUS_LABEL, TEMPLATE_LABEL, type ItemIssue, type DocumentType, type PaperSize, type VatMode, type PriceType, type DocFormState, type DocTemplate, type StatusWorkflow, type PrintMode, type CompanionSet } from "./useDocumentForm";
import ItemsTable from "./ItemsTable";
import SmartImportDialog from "./SmartImportDialog";
import AiDocAssistantDialog from "./AiDocAssistantDialog";
import type { AiDocMapping } from "./aiDocAssist";
import CustomerPicker from "./CustomerPicker";
import DocumentPreview from "./DocumentPreview";
import BundlePicker, { type BundlePickerItem } from "./BundlePicker";
import { BundlePrint, bundleCompanionSet, defaultBundleDocIds, type BundleAttachmentRef, type BundleDocRef } from "./BundlePrint";
import { useBundleAttachmentPages } from "./useBundleAttachmentPages";
import { reconcileBundle, resolveInitialPrefs, saveDocPrintPrefs, type PrintBundleSelection, type PrintPrefs } from "../lib/printPrefs";
import { bahttext } from "./bahttext";
import { saveDraft, loadDraft, clearDraft, draftHasContent } from "../lib/drafts";
import { useFormGuard } from "@/hooks/useFormGuard";
import { usePaymentMethods } from "../lib/paymentMethods";
import SaveSummaryDialog, { type SavedDocSummary } from "./SaveSummaryDialog";
import ConfirmTypeChangeDialog from "./ConfirmTypeChangeDialog";
import TypeChangeSummaryDialog from "./TypeChangeSummaryDialog";
import { logDocActivity } from "../lib/activityLog";
import { getDocLabel, allowedDocTypesForStore, isDocTypeAllowedForStore, getDocLabelForStore } from "../lib/docTheme";
import DocActivityDialog from "./DocActivityDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { tbl, rpc } from "../lib/tbl";
import { useAuth } from "@/contexts/AuthContext";
import { combinePrintBlocks, isInIframe, openPrintWindow, printViaHiddenIframe } from "../lib/printWindow";
import { useDocLayouts, pickLayout, mergeConfigWithLayout } from "../lib/layouts";

const DOC_TYPES: { value: DocumentType; label: string; vatOnly?: boolean }[] = [
  // Per-store filtering happens via allowedDocTypesForStore; labels are
  // relabelled per store via getDocLabelForStore (nattaworks → "ใบสั่งจ้าง").
  { value: "quotation", label: "ใบเสนอราคา" },
  { value: "delivery", label: "ใบส่งของ" },
  { value: "tax_invoice", label: "ใบกำกับภาษี", vatOnly: true },
  { value: "receipt", label: "ใบเสร็จรับเงิน" },
];

function AutoSyncBanner({
  state, sheet, drive, error, at, onRetry,
}: {
  state: "syncing" | "success" | "failed" | "partial" | "idle";
  sheet?: "success" | "failed";
  drive?: "success" | "failed";
  error?: string;
  at?: number;
  onRetry: () => void | Promise<void>;
}) {
  const cls =
    state === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
    : state === "failed" ? "border-destructive/40 bg-destructive/10 text-destructive"
    : state === "partial" ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
    : "border-muted bg-muted/40 text-foreground";
  const icon =
    state === "syncing" ? <Loader2 className="h-4 w-4 animate-spin" />
    : state === "success" ? <CheckCircle2 className="h-4 w-4" />
    : state === "failed" ? <XCircle className="h-4 w-4" />
    : <AlertTriangle className="h-4 w-4" />;
  const title =
    state === "syncing" ? "กำลังซิงก์ Google Sheets/Drive…"
    : state === "success" ? "ซิงก์อัตโนมัติสำเร็จ"
    : state === "failed" ? "ซิงก์อัตโนมัติล้มเหลว"
    : state === "partial" ? "ซิงก์อัตโนมัติบางส่วน"
    : "";
  return (
    <div className={`rounded-md border p-3 text-sm flex items-start justify-between gap-3 ${cls}`}>
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-0.5">{icon}</span>
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {sheet && <span>Sheets: <b>{sheet === "success" ? "สำเร็จ" : "ล้มเหลว"}</b></span>}
            {drive && <span>Drive: <b>{drive === "success" ? "สำเร็จ" : "ล้มเหลว"}</b></span>}
            {at && <span className="opacity-70">เมื่อ {new Date(at).toLocaleTimeString("th-TH")}</span>}
          </div>
          {error && state !== "success" && (
            <div className="text-xs mt-1 break-words opacity-90">{error}</div>
          )}
        </div>
      </div>
      {state !== "syncing" && state !== "success" && (
        <Button size="sm" variant="outline" onClick={() => void onRetry()} className="shrink-0">
          <RotateCw className="h-3.5 w-3.5 mr-1" /> ลองซิงก์ใหม่
        </Button>
      )}
    </div>
  );
}

export default function DocumentForm() {
  const storeSlug = useStoreSlug();
  const { id: editingDocId } = useParams<{ id?: string }>();
  const { store, isLoading } = useCurrentStore();
  const navigate = useNavigate();
  const location = useLocation();

  const form = useDocumentForm();
  const { state, setState, patch, setItem, addItem, addItems, removeItem, moveItem, totals, resetForm } = form;
  const { isAdmin, isOwner } = useAuth();
  const canViewAttachments = isAdmin || isOwner;
  // Keep a live ref to the latest state so save() can read post-patch
  // values even when invoked from a handler that captured a stale `state`.
  const stateRef = useRef(state);
  stateRef.current = state;
  const [smartOpen, setSmartOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  // ส่วนลดท้ายบิล — เก็บข้อความที่ผู้ใช้พิมพ์ไว้ต่างหาก เพื่อให้พิมพ์ทศนิยมได้ลื่น
  const [discountInput, setDiscountInput] = useState<string>("");
  useEffect(() => {
    // ซิงก์เฉพาะเมื่อค่าที่บันทึกต่างจากที่พิมพ์อยู่ (เช่น โหลดเอกสารเดิม/ล้างฟอร์ม)
    setDiscountInput((prev) => {
      const parsed = parseDiscountInput(prev);
      const cur = Number(state.discount_amount || 0);
      if (Number.isFinite(parsed) && parsed === cur) return prev;
      return cur ? String(cur) : "";
    });
  }, [state.discount_amount]);

  const subtotalBeforeDiscount = totals.subtotal;
  const discountCheck = useMemo(
    () => checkDiscount(discountInput, subtotalBeforeDiscount),
    [discountInput, subtotalBeforeDiscount],
  );

  const [aiSummary, setAiSummary] = useState<null | { missing: string[]; notices: string[]; items: number }>(null);
  const [saving, setSaving] = useState(false);
  const [savedDocNo, setSavedDocNo] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // true = ซิงก์ขึ้นระบบแล้ว, false = เก็บไว้ในเครื่องก่อน (ออฟไลน์/เซสชันหมด)
  const [draftSynced, setDraftSynced] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  // Optional page-range filter applied to the printable copy. Empty string
  // means "print all pages" (default).
  const [printPageRange, setPrintPageRange] = useState<string>("");
  // Print copies + the pending "after settings confirmed" action.
  const [printCopies, setPrintCopies] = useState<number>(1);
  const pendingPrintPrefsRef = useRef<PrintPrefs | null>(null);
  const pendingPrintWindowRef = useRef<Window | null>(null);
  const pendingPrintStatusDocIdRef = useRef<string | null>(null);
  const [prePrintOpen, setPrePrintOpen] = useState(false);
  const [prePrintAction, setPrePrintAction] = useState<"print" | "save-print">("print");
  const [downloading, setDownloading] = useState(false);
  const [issues, setIssues] = useState<ItemIssue[]>([]);
  const [showProjectError, setShowProjectError] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<any[]>([]);
  /**
   * All companion documents already persisted for the current main row.
   * Each entry has its OWN running document number (QT / DN / RC …) and
   * back-references the main doc via `related_document_no` in the DB.
   */
  const [companionDocs, setCompanionDocs] = useState<{ type: DocumentType; doc_no: string; id: string }[]>([]);
  const [bundleSelection, setBundleSelection] = useState<PrintBundleSelection>(() => reconcileBundle(undefined, ["doc:main"]));
  const [uploadedBundleAttachments, setUploadedBundleAttachments] = useState<BundleAttachmentRef[]>([]);
  const purchaseOrderSourceRef = useRef<string | null>(null);
  // Summary dialog shown after a successful save: lists the main doc + any
  // companions (QT/DN/RC) with deep links.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    main: SavedDocSummary | null;
    companions: SavedDocSummary[];
    relatedDocumentNo: string | null;
  }>({ main: null, companions: [], relatedDocumentNo: null });
  // Confirmation + post-action summary for "change saved doc to another type".
  const [pendingTypeChange, setPendingTypeChange] = useState<DocumentType | null>(null);
  const [typeChangeBusy, setTypeChangeBusy] = useState(false);
  const [typeChangeSummary, setTypeChangeSummary] = useState<null | {
    fromNo: string | null;
    fromType: DocumentType | null;
    newNo: string;
    newId: string;
    newType: DocumentType;
  }>(null);
  // Audit-log timeline dialog (re-used from the saved-doc header and the
  // type-change summary). When `null`, the dialog is closed.
  const [activityDialog, setActivityDialog] = useState<null | { docId: string; docNo: string | null }>(null);
  // Server-side print status for THIS document. Used to render the
  // "ทำเครื่องหมายว่าพิมพ์แล้ว" banner on saved ใบเสนอราคา so users have an
  // explicit way to satisfy the DN-issue gate.
  const [qtPrintInfo, setQtPrintInfo] = useState<{ print_status: string | null; last_printed_at: string | null }>(
    { print_status: null, last_printed_at: null },
  );
  // Idempotency key — generated once per "fresh form" instance and rotated
  // after every successful save. Sent with INSERT so the backend's partial
  // unique index can dedupe rapid double-clicks / network retries.
  const idempotencyKeyRef = useRef<string>(
    (typeof crypto !== "undefined" && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const newIdempotencyKey = () => {
    idempotencyKeyRef.current =
      (typeof crypto !== "undefined" && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };
  // Hard guard against concurrent invocations (double-click, programmatic
  // calls). The setSaving() state flips async so a ref is required.
  const savingRef = useRef(false);
  /**
   * Companion types the user has chosen to issue alongside the main doc,
   * merged with any already-persisted companions. Drives both the live
   * preview and the print payload. Each entry is independent and keeps
   * its own running document number (QT / DN / RC).
   */
  const plannedCompanions = (() => {
    const cs = (state as any).companion_set ?? "none";
    const wanted: DocumentType[] = [];
    if (cs === "delivery") wanted.push("delivery");
    else if (cs === "receipt") wanted.push("receipt");
    else if (cs === "both") wanted.push("delivery", "receipt");
    const set = new Set<DocumentType>(wanted.filter((t) => t !== state.document_type));
    // Include persisted companions even if not currently checked (so reprints
    // include them and the user can see what's linked to this doc).
    for (const c of companionDocs) set.add(c.type);
    // Colorlab now behaves like the printing store — all companion types are
    // included in the printable DOM.
    return Array.from(set).map((t) => ({
      type: t,
      doc_no: companionDocs.find((c) => c.type === t)?.doc_no ?? null,
    }));
  })();

  const bundleDocs: BundleDocRef[] = useMemo(() => {
    const out: BundleDocRef[] = [{ id: "doc:main", type: state.document_type, docNo: savedDocNo }];
    const possible: DocumentType[] = [];
    if (state.document_type !== "delivery") possible.push("delivery");
    if (state.document_type !== "receipt" && state.document_type !== "tax_invoice") possible.push("receipt");
    for (const t of possible) {
      const existing = companionDocs.find((c) => c.type === t);
      out.push({ id: `doc:${t}`, type: t, docNo: existing?.doc_no ?? null });
    }
    return out;
  }, [state.document_type, savedDocNo, companionDocs]);

  const presetBundleAttachments: BundleAttachmentRef[] = useMemo(() => {
    const out: BundleAttachmentRef[] = [];
    if (store?.attach_biz_reg_url) out.push({ id: "att:preset:biz_reg", label: "ใบทะเบียนพาณิชย์", url: store.attach_biz_reg_url });
    if (store?.attach_id_copy_url) out.push({ id: "att:preset:id_copy", label: "สำเนาบัตรประชาชน", url: store.attach_id_copy_url });
    if (store?.attach_bankbook_url) out.push({ id: "att:preset:bankbook", label: "สำเนาบัญชีธนาคาร", url: store.attach_bankbook_url });
    return out;
  }, [store?.attach_biz_reg_url, store?.attach_id_copy_url, store?.attach_bankbook_url]);

  const bundleAttachments = useMemo(
    () => [...presetBundleAttachments, ...uploadedBundleAttachments],
    [presetBundleAttachments, uploadedBundleAttachments],
  );
  // Rasterize attachments so the always-mounted printable copy contains only
  // page-shaped `<img>` nodes (no iframes) — this makes Print / PDF / PNG /
  // JPG output honour the same bundle order and page boundaries as the
  // on-screen preview.
  const bundleAttachmentsWithPages = useBundleAttachmentPages(bundleAttachments);

  const bundlePickerItems: BundlePickerItem[] = useMemo(() => [
    ...bundleDocs.map((doc) => ({
      id: doc.id,
      kind: "doc" as const,
      label: doc.id === "doc:main" ? `${getDocLabel(doc.type)} (เอกสารหลัก)` : getDocLabel(doc.type),
      detail: doc.docNo ?? (doc.id === "doc:main" ? "เลขที่หลังบันทึก" : "จะสร้างตอนบันทึกถ้าเลือก"),
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
    const availableIds = [
      ...bundleDocs.map((doc) => doc.id),
      ...bundleAttachments.map((att) => att.id),
    ];
    const desiredDocIds = new Set(defaultBundleDocIds(state.document_type, state.companion_set ?? "none"));
    setBundleSelection((prev) => {
      const next = reconcileBundle(prev, availableIds);
      const selected = { ...next.selected, "doc:main": true };
      for (const id of availableIds) {
        if (id.startsWith("doc:") && id !== "doc:main" && !prev.order.includes(id) && selected[id] == null) {
          selected[id] = desiredDocIds.has(id);
        }
        if (id.startsWith("att:") && !prev.order.includes(id) && selected[id] == null) selected[id] = false;
      }
      return { ...next, selected };
    });
  }, [bundleDocs, bundleAttachments, state.companion_set, state.document_type]);

  useEffect(() => {
    if (!savedDocId) return;
    saveDocPrintPrefs(savedDocId, { ...resolveInitialPrefs({}, savedDocId), bundle: bundleSelection });
  }, [savedDocId, bundleSelection]);
  // Auto-sync status indicator for the most recent save
  const [autoSync, setAutoSync] = useState<{
    state: "idle" | "syncing" | "success" | "failed" | "partial";
    sheet?: "success" | "failed";
    drive?: "success" | "failed";
    error?: string;
    at?: number;
  }>({ state: "idle" });
  // Auto-fit-to-A4 has been removed — documents now always print at actual size.
  const [hSearch, setHSearch] = useState("");
  const [hAction, setHAction] = useState<string>("all");
  const [hFrom, setHFrom] = useState<string>("");
  const [hTo, setHTo] = useState<string>("");
  const [hActor, setHActor] = useState<string>("");
  const initializedRef = useRef(false);
  const skipDirtyRef = useRef(true);
  const editLoadedRef = useRef(false);
  const printableRef = useRef<HTMLDivElement | null>(null);

  // Print settings / export controls have moved to the dedicated
  // /documents/:id/print-preview route. This form stays focused on data entry.
  // Bumped after each successful save to force a clean re-initialisation of
  // the form, so users get a blank document without having to clear fields
  // manually.
  const [formNonce, setFormNonce] = useState(0);
  // Snapshot of state at last successful save — used to diff for activity logs
  const lastSavedSnapshotRef = useRef<DocFormState | null>(null);

  // beforeunload guard
  useFormGuard(dirty || isPrinting);

  // Initialize a new document exactly once. Drafts/copies restore silently so the
  // user can continue working without a disruptive "start over / restore" prompt.
  useEffect(() => {
    if (!store) return;
    if (editingDocId) return; // when editing, hydrate from DB instead of defaults
    if (initializedRef.current) return;
    let cancelled = false;
    (async () => {
      skipDirtyRef.current = true;
      const defaults = defaultsForStore(store);
      let next: Partial<DocFormState> = defaults;

      const params = new URLSearchParams(window.location.search);
      const rawPoPrefill = (location.state as any)?.prefill;
      const poPrefill = rawPoPrefill?.source === "customer_purchase_order" ? rawPoPrefill : null;
      const mapPoDocType = (v: string | null | undefined): DocumentType | null =>
        v === "delivery_note" ? "delivery"
        : v === "quotation" || v === "receipt" ? v
        : null;
      const typeParam = params.get("type") ?? params.get("doc_type");
      // Policy: a brand-new document may start as either ใบเสนอราคา (quotation)
      // or ใบเสร็จรับเงิน (receipt). ใบส่งของ (delivery) is the ONLY type that
      // must be derived from a printed quotation, so we coerce direct ?type=delivery
      // deep links back to a safe default (quotation).
      const overrideAllow = allowedDocTypesForStore(store.slug) as readonly string[];
      // Accept quotation/receipt as before, plus tax_invoice when the store's
      // policy allows it (e.g. colorlab issues only tax_invoice).
      const overrideType: DocumentType | null =
        typeParam && overrideAllow.includes(typeParam) &&
        (typeParam === "quotation" || typeParam === "receipt" || typeParam === "tax_invoice")
          ? (typeParam as DocumentType)
          : poPrefill && mapPoDocType(poPrefill.doc_type) && overrideAllow.includes(mapPoDocType(poPrefill.doc_type)!)
            ? mapPoDocType(poPrefill.doc_type)
          : null;
      const copyRaw = params.get("copy") === "1" ? sessionStorage.getItem("rds_copy_doc") : null;
      if (poPrefill) {
        const poType = mapPoDocType(poPrefill.doc_type) ?? "quotation";
        purchaseOrderSourceRef.current = poPrefill.po_id ?? null;
        next = {
          ...defaults,
          document_type: poType,
          paper_size: "A4",
          template: "modern",
          status_workflow: "draft",
          document_date: new Date().toISOString().slice(0, 10),
          show_document_date: true,
          customer_name: poPrefill.customer?.name ?? "",
          customer_phone: poPrefill.customer?.phone ?? "",
          customer_address: poPrefill.customer?.organization ?? "",
          customer_tax_id: "",
          customer_branch: "",
          payment_method: "cash",
          show_payment_method: true,
          show_payment_date: false,
          show_footer_document_date: false,
          notes: poPrefill.note ?? "",
          project_name: poPrefill.customer?.organization || poPrefill.customer?.name || "ใบสั่งสินค้า",
          related_document_no: poPrefill.po_number ? `ใบสั่งสินค้า ${poPrefill.po_number}` : null,
          companion_set: "none",
          items: Array.isArray(poPrefill.items) && poPrefill.items.length
            ? poPrefill.items.map((it: any) => ({
                key: newKey(),
                product_id: null,
                name: it.name ?? "",
                description: "",
                price: Number(it.price ?? 0),
                quantity: Number(it.quantity ?? 1),
                unit: it.unit ?? "",
                discount_percent: 0,
                discount_amount: 0,
              }))
            : [emptyItem()],
        };
        toast({ title: `เติมข้อมูลจากใบสั่งสินค้า ${poPrefill.po_number ?? ""}`.trim() });
      } else if (copyRaw) {
        try {
          const parsed = JSON.parse(copyRaw);
          sessionStorage.removeItem("rds_copy_doc");
          const d = parsed?.doc ?? {};
          const items = Array.isArray(parsed?.items) ? parsed.items : [];
          next = {
            ...defaults,
            document_type: d.document_type ?? "receipt",
            paper_size: d.paper_size ?? "A4",
            print_mode: d.print_mode ?? "fit_a4",
            auto_fit_a4: d.auto_fit_a4 ?? true,
            print_scale: d.print_scale != null ? Number(d.print_scale) : null,
            font_scale: d.font_scale != null ? Number(d.font_scale) : null,
            template: d.template ?? "modern",
            layout_id: d.layout_id ?? null,
            status_workflow: "draft",
            document_date: new Date().toISOString().slice(0, 10),
            show_document_date: d.show_document_date !== false,
            vat_mode: d.vat_mode ?? (defaults.vat_mode as VatMode) ?? "none",
            vat_rate: Number(d.vat_rate ?? defaults.vat_rate ?? 0),
            price_type: d.price_type ?? (defaults.price_type as PriceType) ?? "no_vat",
            withholding_tax_enabled: !!d.withholding_tax_enabled,
            withholding_tax_rate: Number(d.withholding_tax_rate ?? 3),
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
            internal_sale_type:
              ((d as any).internal_sale_type === "bill_only" ? "bill_only" : "real_goods"),
            // Preserve the source-doc back-reference (e.g. "สร้างจาก QT-0005")
            // so the new doc stores the audit link on first save.
            related_document_no: d.related_document_no ?? null,
            companion_set: "none",
            items: items.length ? items.map((it: any) => ({
              key: newKey(),
              product_id: it.product_id ?? null,
              name: it.name ?? "",
              description: it.description ?? "",
              price: Number(it.price ?? 0),
              quantity: Number(it.quantity ?? 1),
              unit: it.unit ?? "",
              discount_percent: Number(it.discount_percent ?? 0),
              discount_amount: Number(it.discount_amount ?? 0),
            })) : [emptyItem()],
          };
        } catch { /* fall back to defaults */ }
      } else {
        try {
          const draft = await loadDraft(store.id, "document");
          if (draftHasContent("document", draft)) {
            const draftState = (draft.state ?? draft) as Partial<DocFormState>;
            next = { ...defaults, ...draftState };
          }
        } catch { /* local defaults are enough */ }
      }

      if (overrideType) {
        next = { ...next, document_type: overrideType };
      }
      // Lock policy: for brand-new docs (no editingDocId, no copy payload),
      // only `quotation` or `receipt` are allowed as the starting type.
      // Anything else (e.g. a stale draft saved as `delivery`) is coerced
      // to the explicit overrideType, or quotation by default.
      if (!editingDocId && !copyRaw && !poPrefill) {
        const dt = (next as any).document_type as DocumentType | undefined;
        const allowed = allowedDocTypesForStore(store.slug) as readonly string[];
        const preferredDefault: DocumentType =
          overrideType ??
          ((allowed.includes("quotation") ? "quotation" : (allowed[0] as DocumentType)));
        if (!dt || !allowed.includes(dt)) {
          next = { ...next, document_type: preferredDefault };
        }
        // Colorlab default: เมื่อเริ่มใหม่จาก QT ให้ออก DN + RC พร้อมกันโดยอัตโนมัติ
        // (ผู้ใช้ยังกด toggle เปลี่ยนได้จาก companion-set select ก่อนบันทึก)
        if (
          store.slug === "colorlab" &&
          ((next as any).document_type ?? preferredDefault) === "quotation"
        ) {
          next = { ...next, companion_set: "both" };
        }
      }

      // Store policy: colorlab keeps the companion selector fully available.
      // The DN companion is still allowed to be *created* in the DB, but
      // print/download paths block delivery output (see plannedCompanions
      // and DocumentsList row actions).

      if (cancelled) return;
      setState((s) => ({ ...s, ...next }));
      setTimeout(() => { skipDirtyRef.current = false; initializedRef.current = true; }, 0);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, formNonce]);

  // Load existing doc when editing via /documents/:id/edit
  useEffect(() => {
    if (!store || !editingDocId || editLoadedRef.current) return;
    (async () => {
      try {
        const [{ data: doc, error: de }, { data: items, error: ie }] = await Promise.all([
          supabase.from(tbl("documents") as any).select("*").eq("id", editingDocId).maybeSingle(),
          supabase.from(tbl("document_items") as any).select("*").eq("document_id", editingDocId).order("item_order"),
        ]);
        if (de || !doc) throw de || new Error("ไม่พบเอกสาร");
        if (ie) throw ie;
        const d: any = doc;
        setState((s) => ({
          ...s,
          document_type: d.document_type,
          paper_size: d.paper_size,
          print_mode: (d.print_mode as PrintMode) ?? "fit_a4",
          auto_fit_a4: d.auto_fit_a4 ?? true,
          print_scale: d.print_scale != null ? Number(d.print_scale) : null,
          font_scale: d.font_scale != null ? Number(d.font_scale) : null,
          template: d.template ?? s.template,
          layout_id: d.layout_id ?? s.layout_id ?? null,
          status_workflow: d.status_workflow ?? s.status_workflow,
          document_date: d.document_date,
          show_document_date: d.show_document_date,
          vat_mode: d.vat_mode,
          vat_rate: Number(d.vat_rate),
          price_type: d.price_type,
          withholding_tax_enabled: !!d.withholding_tax_enabled,
          withholding_tax_rate: Number(d.withholding_tax_rate ?? 0),
          discount_amount: Number(d.discount_amount ?? 0),
          customer_id: d.customer_id,
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
          project_name: (d as any).project_name ?? "",
          internal_sale_type:
            ((d as any).internal_sale_type === "bill_only" ? "bill_only" : "real_goods"),
          // Source-document back-reference (e.g. created จาก QT-0005).
          related_document_no: d.related_document_no ?? null,
          companion_set: "none",
          items: ((items as any[]) ?? []).length ? ((items as any[]) ?? []).map((it: any) => ({
            key: it.id,
            product_id: it.product_id,
            name: it.name,
            description: it.description ?? "",
            price: Number(it.price),
            quantity: Number(it.quantity),
            unit: it.unit ?? "",
            discount_percent: Number(it.discount_percent ?? 0),
            discount_amount: Number(it.discount_amount ?? 0),
          })) : [emptyItem()],
        }));
        setSavedDocId(editingDocId);
        setSavedDocNo(d.document_no);
        // Restore any companions already issued for this doc by querying
        // peers that point back at us via related_document_no. Each one
        // keeps its own running number so re-prints reuse them.
        try {
          const { data: peers } = await supabase
            .from(tbl("documents") as any)
            .select("id, document_no, document_type, deleted_at")
            .eq("store_id", store.id)
            .eq("related_document_no", d.document_no);
          const arr = ((peers as any[]) ?? [])
            .filter((p) => !p.deleted_at)
            .map((p) => ({ id: p.id, doc_no: p.document_no, type: p.document_type as DocumentType }));
          setCompanionDocs(arr);
        } catch { /* noop */ }
        editLoadedRef.current = true;
        setTimeout(() => {
          skipDirtyRef.current = false;
          initializedRef.current = true;
          lastSavedSnapshotRef.current = null; // baseline snapshot set after first user save
        }, 0);
        refreshRevisions(editingDocId);
      } catch (e: any) {
        toast({ title: "โหลดเอกสารไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, editingDocId]);

  // Mark dirty + autosave draft (debounced)
  useEffect(() => {
    if (!store || !initializedRef.current) return;
    if (skipDirtyRef.current) return;
    setDirty(true);
    const handle = window.setTimeout(async () => {
      try {
        const res = await saveDraft(store.id, "document", { state, savedAt: Date.now() });
        if (res.local || res.synced) setLastSavedAt(Date.now());
        setDraftSynced(res.synced);
      } catch {
        setDraftSynced(false);
      }
    }, 800);
    return () => window.clearTimeout(handle);
  }, [state, store?.id]);

  // (colorlab no longer force-clears companion_set — the print pipeline
  // filters delivery out at render time instead.)

  // Lookup units/tax rates per store
  const unitsQ = useQuery({
    queryKey: ["rds_units", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("units") as any)
        .select("name")
        .eq("store_id", store!.id)
        .order("name");
      if (error) throw error;
      return (data as any[])?.map((r) => r.name) ?? [];
    },
  });

  const taxRatesQ = useQuery({
    queryKey: ["rds_tax_rates", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("tax_rates") as any)
        .select("rate,label")
        .eq("store_id", store!.id)
        .order("rate");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const paymentMethodsQ = usePaymentMethods(store?.id);

  const templateConfigQ = useQuery({
    queryKey: ["rds_document_templates", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from(tbl("document_templates") as any)
        .select("template_key, header_text, footer_text")
        .eq("store_id", store!.id);
      const map: Record<string, { header_text: string; footer_text: string }> = {};
      ((data as any[]) ?? []).forEach((r) => { map[r.template_key] = { header_text: r.header_text ?? "", footer_text: r.footer_text ?? "" }; });
      return map;
    },
  });

  // Editable layout system: header/footer + margins + show-flags + accent.
  // Falls back to the legacy `rds_document_templates` map when no layout is set.
  const layoutsQ = useDocLayouts(store?.id);
  const activeLayout = useMemo(
    () => pickLayout(layoutsQ.data, state.layout_id, state.document_type),
    [layoutsQ.data, state.layout_id, state.document_type],
  );
  const resolvedTemplateCfg = useMemo(() => {
    const legacy = templateConfigQ.data?.[state.template ?? "modern"];
    return mergeConfigWithLayout(legacy, activeLayout);
  }, [templateConfigQ.data, state.template, activeLayout]);

  // Hook: keep server-side print status in sync for the saved doc.
  // Declared above the early returns so the total hook count never changes
  // between renders (fixes "Rendered more hooks than during the previous
  // render" when `store` transitions from undefined → loaded).
  useEffect(() => {
    let cancelled = false;
    if (!savedDocId) {
      setQtPrintInfo({ print_status: null, last_printed_at: null });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from(tbl("documents") as any)
        .select("print_status, last_printed_at")
        .eq("id", savedDocId)
        .maybeSingle();
      if (!cancelled && data) {
        setQtPrintInfo({
          print_status: (data as any).print_status ?? null,
          last_printed_at: (data as any).last_printed_at ?? null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [savedDocId]);

  if (isLoading) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (!store) return <Navigate to="/receipts" replace />;

  const storeAllowed = allowedDocTypesForStore(store.slug) as readonly string[];
  const availableDocTypes = DOC_TYPES
    .filter((d) => store.vat_enabled || !d.vatOnly)
    .filter((d) => storeAllowed.includes(d.value))
    .map((d) => ({ ...d, label: getDocLabelForStore(store.slug, d.value) }));
  const template: DocTemplate = state.template ?? "classic";
  const statusWorkflow: StatusWorkflow = state.status_workflow ?? "draft";
  const STATUS_VARIANT: Record<StatusWorkflow, "secondary" | "default" | "outline" | "destructive"> = {
    draft: "secondary", pending: "outline", approved: "default", cancelled: "destructive",
  };

  async function logRevision(docId: string, action: string, note?: string) {
    try {
      await supabase.from(tbl("document_revisions") as any).insert({
        document_id: docId,
        store_id: store!.id,
        action,
        note: note ?? null,
        snapshot: { state, totals } as any,
        actor: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
    } catch { /* noop */ }
  }

  // Diff two form states for activity-log purposes
  function diffForLog(prev: DocFormState, next: DocFormState) {
    const fields: string[] = [];
    const trackFields: (keyof DocFormState)[] = [
      "customer_name", "customer_phone", "customer_address", "customer_tax_id",
      "customer_branch", "notes", "payment_method", "vat_mode", "vat_rate",
      "price_type", "document_type", "paper_size", "print_mode", "withholding_tax_enabled",
      "withholding_tax_rate", "auto_fit_a4", "print_scale", "font_scale", "project_name",
      "show_payment_method", "show_payment_date", "show_footer_document_date",
      "internal_sale_type",
    ];
    for (const f of trackFields) {
      if (JSON.stringify(prev[f]) !== JSON.stringify(next[f])) fields.push(String(f));
    }
    const prevItems = prev.items.filter((it) => it.name || it.price);
    const nextItems = next.items.filter((it) => it.name || it.price);
    const prevKeys = new Set(prevItems.map((it) => it.key));
    const nextKeys = new Set(nextItems.map((it) => it.key));
    const added = nextItems.filter((it) => !prevKeys.has(it.key)).map((it) => it.name);
    const removed = prevItems.filter((it) => !nextKeys.has(it.key)).map((it) => it.name);
    const modified: string[] = [];
    for (const ni of nextItems) {
      const pi = prevItems.find((it) => it.key === ni.key);
      if (pi && (pi.name !== ni.name || pi.price !== ni.price || pi.quantity !== ni.quantity || pi.unit !== ni.unit)) {
        modified.push(ni.name || `(แถว ${ni.key.slice(0, 4)})`);
      }
    }
    return { changed_fields: fields, items_diff: { added, removed, modified } };
  }

  async function logEditIfDirty(docId: string) {
    const prev = lastSavedSnapshotRef.current;
    if (!prev) return;
    const d = diffForLog(prev, state);
    const hasChanges = d.changed_fields.length > 0
      || d.items_diff.added.length > 0
      || d.items_diff.removed.length > 0
      || d.items_diff.modified.length > 0;
    if (!hasChanges) return;
    try {
      await supabase.from(tbl("activity_logs") as any).insert({
        store_id: store!.id,
        action: "document_edit",
        target_type: "document",
        target_id: docId,
        detail: d as any,
      });
    } catch { /* noop */ }
    const noteParts: string[] = [];
    if (d.changed_fields.length) noteParts.push(`แก้: ${d.changed_fields.join(", ")}`);
    if (d.items_diff.added.length) noteParts.push(`+รายการ: ${d.items_diff.added.join(", ")}`);
    if (d.items_diff.removed.length) noteParts.push(`-รายการ: ${d.items_diff.removed.join(", ")}`);
    if (d.items_diff.modified.length) noteParts.push(`แก้รายการ: ${d.items_diff.modified.join(", ")}`);
    await logRevision(docId, "edit", noteParts.join(" · "));
  }

  async function refreshRevisions(docId: string) {
    const { data } = await supabase
      .from(tbl("document_revisions") as any)
      .select("id, action, note, created_at, actor")
      .eq("document_id", docId)
      .order("created_at", { ascending: false });
    setRevisions((data as any[]) ?? []);
  }

  async function markPrintStatus(docId: string, status: "printed" | "print_error", errorMsg?: string) {
    try {
      const updates: any = { print_status: status };
      if (status === "printed") updates.last_printed_at = new Date().toISOString();
      await supabase.from(tbl("documents") as any).update(updates).eq("id", docId);
      await supabase.from(tbl("activity_logs") as any).insert({
        store_id: store!.id,
        action: status === "printed" ? "document_print" : "document_print_error",
        target_type: "document",
        target_id: docId,
        detail: errorMsg ? { error: errorMsg } : null,
      });
      // Keep the local QT banner in sync without a re-fetch round trip.
      if (savedDocId === docId) {
        setQtPrintInfo({
          print_status: status,
          last_printed_at: status === "printed" ? new Date().toISOString() : qtPrintInfo.last_printed_at,
        });
      }
    } catch { /* noop */ }
  }

  async function updateStatus(next: StatusWorkflow) {
    if (!savedDocId || !store) { patch({ status_workflow: next }); return; }
    const updates: any = { status_workflow: next };
    if (next === "approved") { updates.approved_at = new Date().toISOString(); updates.approved_by = (await supabase.auth.getUser()).data.user?.id ?? null; }
    if (next === "cancelled") { updates.cancelled_at = new Date().toISOString(); }
    const { error } = await supabase.from(tbl("documents") as any).update(updates).eq("id", savedDocId);
    if (error) { toast({ title: "เปลี่ยนสถานะไม่สำเร็จ", description: error.message, variant: "destructive" }); return; }
    patch({ status_workflow: next });
    await logRevision(savedDocId, `status_${next}`);
    await refreshRevisions(savedDocId);
    toast({ title: `เปลี่ยนสถานะเป็น "${STATUS_LABEL[next]}"` });
  }

  // Create a new document of any type using the current form's customer/items
  // as a starting point. Lets users quickly issue a forgotten companion file
  // (e.g. delivery → receipt) without re-typing everything.
  function createFromThisAs(newType: DocumentType) {
    try {
      const docPayload = {
        document_type: newType,
        paper_size: state.paper_size,
        print_mode: state.print_mode,
        auto_fit_a4: state.auto_fit_a4,
        print_scale: state.print_scale,
        font_scale: state.font_scale,
        template: state.template,
        vat_mode: state.vat_mode,
        vat_rate: state.vat_rate,
        price_type: state.price_type,
        withholding_tax_enabled: state.withholding_tax_enabled,
        withholding_tax_rate: state.withholding_tax_rate,
        discount_amount: state.discount_amount,
        customer_id: state.customer_id,
        customer_name: state.customer_name,
        customer_phone: state.customer_phone,
        customer_address: state.customer_address,
        customer_tax_id: state.customer_tax_id,
        customer_branch: state.customer_branch,
        payment_method: state.payment_method,
        show_payment_method: state.show_payment_method,
        show_payment_date: state.show_payment_date,
        show_footer_document_date: state.show_footer_document_date,
        notes: state.notes,
        project_name: state.project_name,
        internal_sale_type: state.internal_sale_type,
        // Source-doc back-reference: e.g. "สร้างจาก QT-0005".
        // The new document still gets its own running number (DN-xxxx,
        // RC-xxxx) — this is metadata only, used for history/audit.
        related_document_no: savedDocNo ?? null,
      };
      const itemsPayload = state.items.map((it) => ({
        product_id: it.product_id,
        name: it.name,
        description: it.description,
        price: it.price,
        quantity: it.quantity,
        unit: it.unit,
        discount_percent: it.discount_percent,
        discount_amount: it.discount_amount,
      }));
      sessionStorage.setItem("rds_copy_doc", JSON.stringify({ doc: docPayload, items: itemsPayload }));
      navigate(`${storeBasePath(storeSlug)}/documents/new?copy=1&type=${newType}`);
    } catch (e: any) {
      toast({ title: "สร้างเอกสารไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    }
  }

  /**
   * Duplicate the currently-saved document as another document type. The
   * new doc gets its OWN running number via rds_next_doc_no (so prefixes
   * QT / DN / RC stay independent and never collide) and back-references
   * the source via `related_document_no`. Used by the Select-type-change
   * confirmation flow.
   *
   * The original row is untouched. On success we open a summary dialog
   * with the new number and a "เปิดเอกสารใหม่" button.
   */
  async function duplicateAsType(newType: DocumentType): Promise<void> {
    if (!store || !savedDocId || !savedDocNo) return;
    setTypeChangeBusy(true);
    try {
      const { data: noData, error: nErr } = await supabase.rpc(tbl("next_doc_no") as any, {
        p_store_id: store.id,
        p_document_type: newType,
      });
      if (nErr) throw nErr;
      const newNo = noData as string;
      const payload: any = {
        store_id: store.id,
        document_type: newType,
        document_no: newNo,
        document_date: state.document_date,
        show_document_date: state.show_document_date,
        paper_size: state.paper_size,
        print_mode: state.print_mode ?? "fit_a4",
        auto_fit_a4: state.auto_fit_a4 ?? true,
        print_scale: state.print_scale ?? null,
        font_scale: state.font_scale ?? null,
        template: state.template ?? "classic",
        customer_id: state.customer_id,
        customer_name: state.customer_name,
        customer_phone: state.customer_phone,
        customer_address: state.customer_address,
        customer_tax_id: state.customer_tax_id,
        customer_branch: state.customer_branch,
        price_type: state.price_type,
        vat_mode: state.vat_mode,
        vat_rate: state.vat_rate,
        discount_amount: state.discount_amount || 0,
        discount_percent: 0,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        amount_before_vat: totals.amount_before_vat,
        vat_amount: totals.vat_amount,
        withholding_tax_enabled: state.withholding_tax_enabled,
        withholding_tax_rate: state.withholding_tax_rate,
        withholding_tax_amount: totals.withholding_tax_amount,
        grand_total: totals.grand_total,
        net_total: totals.net_total,
        payment_method: state.payment_method,
        payment_status: newType === "receipt" ? "paid" : "unpaid",
        status: "issued",
        notes: state.notes,
        project_name: state.project_name || null,
        internal_sale_type: state.internal_sale_type ?? "real_goods",
        related_document_no: savedDocNo,
        show_payment_method: state.show_payment_method !== false,
        show_payment_date: state.show_payment_date !== false,
        show_footer_document_date: state.show_footer_document_date !== false,
      };
      const { data: ins, error: insErr } = await supabase
        .from(tbl("documents") as any)
        .insert(payload)
        .select("id, document_no")
        .single();
      if (insErr) throw insErr;
      const newId = (ins as any).id as string;
      const itemsPayload = state.items
        .filter((it) => it.name || it.price)
        .map((it, idx) => ({
          document_id: newId,
          product_id: it.product_id,
          item_order: idx + 1,
          name: it.name,
          description: null,
          price: it.price,
          quantity: it.quantity,
          unit: it.unit || null,
          discount_percent: Number(it.discount_percent ?? 0),
          discount_amount: Number(it.discount_amount ?? 0),
          line_total: calcLineTotal(it),
        }));
      if (itemsPayload.length) {
        const { error: ie } = await supabase
          .from(tbl("document_items") as any)
          .insert(itemsPayload);
        if (ie) throw ie;
      }
      await logDocActivity(store.id, "document_type_change", newId, {
        from_type: state.document_type,
        from_no: savedDocNo,
        from_doc_id: savedDocId,
        to_type: newType,
        new_no: newNo,
        to_doc_id: newId,
        related_document_no: savedDocNo,
      });
      // Mirror entry on the source row so opening the OLD document also
      // surfaces the migration in its activity timeline.
      await logDocActivity(store.id, "document_type_change", savedDocId, {
        from_type: state.document_type,
        from_no: savedDocNo,
        from_doc_id: savedDocId,
        to_type: newType,
        new_no: newNo,
        to_doc_id: newId,
        related_document_no: savedDocNo,
      });
      toast({ title: `สร้างใบใหม่: ${newNo}` });
      setTypeChangeSummary({
        fromNo: savedDocNo,
        fromType: state.document_type,
        newNo,
        newId,
        newType,
      });
    } catch (e: any) {
      toast({
        title: "เปลี่ยนประเภทไม่สำเร็จ",
        description: e?.message ?? "",
        variant: "destructive",
      });
    } finally {
      setTypeChangeBusy(false);
      setPendingTypeChange(null);
    }
  }

  async function save(
    thenAction?: "print" | "pdf",
    printCfg?: PrintPrefs,
    overrides?: Partial<DocFormState>,
  ): Promise<string | null> {
    if (!store) return null;
    // Concurrency guard — reject re-entry while a save is in flight.
    if (savingRef.current) {
      return null;
    }
    savingRef.current = true;
    // Allow callers (e.g. the "ออกใบเสร็จพร้อมใบส่งของ" shortcut) to override
    // the form state for this save without waiting for React to commit a
    // patch(). The outer `state` from the hook may still be the pre-patch
    // snapshot when save() is invoked right after dispatching patch().
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const state: DocFormState = { ...stateRef.current, ...(overrides ?? {}) };
    state.companion_set = bundleCompanionSet(bundleSelection, state.document_type);
    // Auto-fill project name so users are never blocked. If empty, fall back
    // to the customer name, otherwise use a neutral placeholder. This keeps
    // NATTAWORKS "ใบสั่งจ้าง" saves frictionless while still recording
    // a project name on every document.
    if (!(state.project_name ?? "").trim()) {
      const fallback = (state.customer_name ?? "").trim() || "งานทั่วไป";
      state.project_name = fallback;
      patch({ project_name: fallback });
      setShowProjectError(false);
    }
    // Validate before save
    const v = validateItems(state.items);
    setIssues(v.issues);
    if (v.nonEmpty === 0) {
      savingRef.current = false;
      toast({ title: "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ", variant: "destructive" });
      return null;
    }
    if (!v.valid) {
      savingRef.current = false;
      toast({
        title: `ตรวจสอบไม่ผ่าน ${v.issues.length} แถว`,
        description: "ไฮไลต์สีแดงในตาราง — แก้ไขแล้วลองอีกครั้ง",
        variant: "destructive",
      });
      // scroll to first issue
      setTimeout(() => {
        const el = document.querySelector(`[data-row-index="${v.issues[0].index}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return null;
    }
    setSaving(true);
    try {
      // Policy: a ใบส่งของ (delivery) may only be issued when a ใบเสนอราคา
      // (quotation) already exists AND has been printed at least once. This
      // applies to brand-new docs only — updates to existing rows are
      // allowed. Co-issued companions (where DN is produced together with
      // a freshly-made QT via `companion_set`) bypass this rule because the
      // pair is created in the same atomic save.
      if (!savedDocId && state.document_type === "delivery" && !purchaseOrderSourceRef.current) {
        const relNo = (state.related_document_no ?? "").trim();
        let ok = false;
        let blockReason: "missing_quotation" | "quotation_not_printed" = "missing_quotation";
        let qtPrintStatus: string | null = null;
        let qtLastPrintedAt: string | null = null;
        let qtId: string | null = null;
        if (relNo) {
          const { data: qt } = await supabase
            .from(tbl("documents") as any)
            .select("id, document_type, print_status, last_printed_at")
            .eq("store_id", store.id)
            .eq("document_no", relNo)
            .maybeSingle();
          if (qt && (qt as any).document_type === "quotation") {
            qtId = (qt as any).id ?? null;
            qtPrintStatus = (qt as any).print_status ?? null;
            qtLastPrintedAt = (qt as any).last_printed_at ?? null;
            const printed =
              (qt as any).print_status === "printed" ||
              !!(qt as any).last_printed_at;
            if (printed) {
              ok = true;
            } else {
              blockReason = "quotation_not_printed";
            }
          }
        }
        // Allow if companion_set will create a QT alongside (legacy path),
        // but main is delivery → still missing prior QT, so block.
        if (!ok) {
          savingRef.current = false;
          setSaving(false);
          const desc =
            blockReason === "quotation_not_printed"
              ? `กรุณากด "พิมพ์" ใบเสนอราคา ${relNo} ก่อน จึงจะออกใบส่งของได้`
              : "ระบบบังคับให้ออก 'ใบเสนอราคา' ก่อนและพิมพ์ออกมา 1 ครั้ง จึงจะออกใบส่งของได้ — สร้างใบเสนอราคาก่อน แล้วใช้ปุ่ม 'สร้างจากใบนี้ → ใบส่งของ'";
          toast({
            title: "ต้องออกและพิมพ์ใบเสนอราคาก่อน",
            description: desc,
            variant: "destructive",
          });
          void logDocActivity(store.id, "delivery_blocked_no_quotation", null, {
            reason: blockReason,
            attempted_document_type: state.document_type,
            attempted_total: totals.grand_total,
            attempted_customer: state.customer_name,
            related_document_no: relNo || null,
            qt_id: qtId,
            qt_print_status: qtPrintStatus,
            qt_last_printed_at: qtLastPrintedAt,
          });
          return null;
        }
      }
      // When editing, reuse existing doc number; otherwise get the next one.
      // Treat any save after the first successful save as an UPDATE so that
      // re-clicking Save / Save+Print on a new document doesn't burn running
      // numbers and create duplicate rows.
      const isUpdate = !!savedDocId;
      let documentNo: string;
      if (isUpdate) {
        documentNo = savedDocNo!;
      } else {
        const { data: docNoData, error: rpcError } = await supabase.rpc(tbl("next_doc_no") as any, {
          p_store_id: store.id,
          p_document_type: state.document_type,
        });
        if (rpcError) throw rpcError;
        documentNo = docNoData as string;
      }

      // Resolve customer
      let customer_id = state.customer_id;
      if (!customer_id && state.customer_name) {
        // Only reuse an existing customer when BOTH name (case-insensitive)
        // AND phone match — otherwise two different customers who happen to
        // share a common name (e.g. "สมชาย") would get commingled.
        const nameTrim = state.customer_name.trim();
        const phoneTrim = (state.customer_phone || "").trim();
        let q = supabase
          .from(tbl("customers") as any)
          .select("id,phone")
          .eq("store_id", store.id)
          .ilike("name", nameTrim)
          .limit(1);
        if (phoneTrim) {
          q = q.eq("phone", phoneTrim);
        } else {
          q = q.or("phone.is.null,phone.eq.");
        }
        const { data: existing } = await q.maybeSingle();
        if (existing && (existing as any).id) {
          customer_id = (existing as any).id;
        } else {
          const { data: cust, error: ce } = await supabase
            .from(tbl("customers") as any)
            .insert({
              store_id: store.id,
              name: nameTrim,
              phone: state.customer_phone || null,
              address: state.customer_address || null,
              tax_id: state.customer_tax_id || null,
              branch_name: state.customer_branch || null,
            })
            .select("id")
            .single();
          if (ce) throw ce;
          customer_id = (cust as any).id;
        }
      }

      const docPayload: any = {
        store_id: store.id,
        document_type: state.document_type,
        document_no: documentNo,
        document_date: state.document_date,
        show_document_date: state.show_document_date,
        paper_size: state.paper_size,
        print_mode: state.print_mode ?? "fit_a4",
        auto_fit_a4: state.auto_fit_a4 ?? true,
        print_scale: state.print_scale ?? null,
        font_scale: state.font_scale ?? null,
        customer_id,
        customer_name: state.customer_name,
        customer_phone: state.customer_phone,
        customer_address: state.customer_address,
        customer_tax_id: state.customer_tax_id,
        customer_branch: state.customer_branch,
        price_type: state.price_type,
        vat_mode: state.vat_mode,
        vat_rate: state.vat_rate,
        discount_amount: state.discount_amount || 0,
        discount_percent: 0,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        amount_before_vat: totals.amount_before_vat,
        vat_amount: totals.vat_amount,
        withholding_tax_enabled: state.withholding_tax_enabled,
        withholding_tax_rate: state.withholding_tax_rate,
        withholding_tax_amount: totals.withholding_tax_amount,
        grand_total: totals.grand_total,
        net_total: totals.net_total,
        payment_method: state.payment_method,
        payment_status: state.document_type === "receipt" ? "paid" : "unpaid",
        status: "issued",
        notes: state.notes,
        project_name: state.project_name || null,
        internal_sale_type: state.internal_sale_type ?? "real_goods",
        show_payment_method: state.show_payment_method !== false,
        show_payment_date: state.show_payment_date !== false,
        show_footer_document_date: state.show_footer_document_date !== false,
        layout_id: state.layout_id ?? null,
      };
      // Preserve the source-doc back-reference (e.g. "created from QT-0005")
      // so the database keeps the audit trail even after the form is reset.
      if (state.related_document_no) {
        docPayload.related_document_no = state.related_document_no;
      }
      // Idempotency key — only attached on INSERT (new docs). UPDATEs reuse
      // the existing row, so the key is irrelevant there.
      const currentIdemKey = idempotencyKeyRef.current;
      if (!isUpdate) {
        docPayload.idempotency_key = currentIdemKey;
      }
      let docId: string;
      if (isUpdate) {
        const { error: ue } = await supabase
          .from(tbl("documents") as any)
          .update(docPayload)
          .eq("id", savedDocId!);
        if (ue) throw ue;
        docId = savedDocId!;
        // Replace items
        const { error: dle } = await supabase
          .from(tbl("document_items") as any)
          .delete()
          .eq("document_id", docId);
        if (dle) throw dle;
      } else {
        const { data: doc, error: de } = await supabase
          .from(tbl("documents") as any)
          .insert(docPayload)
          .select("id, document_no")
          .single();
        if (de) {
          // Idempotency: a partial-unique index on (store_id, idempotency_key)
          // catches duplicate submits (double-click, retry). When that fires
          // (Postgres 23505), reuse the existing row instead of erroring.
          const code = (de as any)?.code;
          if (code === "23505") {
            const { data: existing } = await supabase
              .from(tbl("documents") as any)
              .select("id, document_no")
              .eq("store_id", store.id)
              .eq("idempotency_key", currentIdemKey)
              .maybeSingle();
            if (existing && (existing as any).id) {
              docId = (existing as any).id as string;
              documentNo = (existing as any).document_no as string;
              // Items were already inserted by the first call; skip re-insert
              setSavedDocNo(documentNo);
              setSavedDocId(docId);
              setSaving(false);
              savingRef.current = false;
              toast({ title: `บันทึกแล้ว: ${documentNo}` });
              setSummaryData({
                main: { id: docId, document_no: documentNo, document_type: state.document_type },
                companions: [],
                relatedDocumentNo: state.related_document_no ?? null,
              });
              setSummaryOpen(true);
              return docId;
            }
          }
          throw de;
        }
        docId = (doc as any).id as string;
      }

      // Insert items
      const itemsPayload = state.items
        .filter((it) => it.name || it.price)
        .map((it, idx) => ({
          document_id: docId,
          product_id: it.product_id,
          item_order: idx + 1,
          name: it.name,
          description: null,
          price: it.price,
          quantity: it.quantity,
          unit: it.unit || null,
          discount_percent: Number(it.discount_percent ?? 0),
          discount_amount: Number(it.discount_amount ?? 0),
          line_total: calcLineTotal(it),
        }));
      const { error: ie } = await supabase.from(tbl("document_items") as any).insert(itemsPayload);
      if (ie) throw ie;

      // "ซื้อของจริง" → deduct stock. "ซื้อบิล" → never touches stock
      // (the RPC itself no-ops for bill_only / draft / cancelled docs).
      if ((state.internal_sale_type ?? "real_goods") === "real_goods") {
        await supabase.rpc("rds_apply_document_stock" as any, { p_document_id: docId } as any);
      }

      // Activity log
      await supabase.from(tbl("activity_logs") as any).insert({
        store_id: store.id,
        action: isUpdate ? "document_update" : "document_create",
        target_type: "document",
        target_id: docId,
          detail: { document_no: documentNo, document_type: state.document_type, total: totals.net_total },
      });

      setSavedDocNo(documentNo);
      setSavedDocId(docId);
      saveDocPrintPrefs(docId, { ...resolveInitialPrefs({}, docId), bundle: bundleSelection });
      // Log diff vs prior save (if any) before overwriting the snapshot
      await logEditIfDirty(docId);
      lastSavedSnapshotRef.current = JSON.parse(JSON.stringify(state));
      // Log create revision + status workflow column
      await supabase.from(tbl("documents") as any).update({
        status_workflow: state.status_workflow ?? "draft",
        template: state.template ?? "classic",
      }).eq("id", docId);
      await logRevision(docId, isUpdate ? "update" : "create");

      // === Companion documents ===
      // Each companion (delivery / receipt) gets its OWN running number
      // from `rds_next_doc_no` so QT / DN / RC sequences stay independent.
      // Companions back-reference the main via `related_document_no` =
      // main.document_no, never shared numbers.
      const wantedTypes: DocumentType[] = [];
      const cs = state.companion_set ?? "none";
      if (cs === "delivery") wantedTypes.push("delivery");
      else if (cs === "receipt") wantedTypes.push("receipt");
      else if (cs === "both") wantedTypes.push("delivery", "receipt");
      // Never duplicate the main type as a companion.
      const toCreate = wantedTypes.filter((t) => t !== state.document_type);
      const issuedCompanions: { type: DocumentType; doc_no: string; id: string }[] = [];
      const createdInThisCall: string[] = []; // ids to roll back on failure
      const buildCompanionPayload = (t: DocumentType, no: string) => ({
        store_id: store.id,
        document_type: t,
        document_no: no,
        document_date: state.document_date,
        show_document_date: state.show_document_date,
        paper_size: state.paper_size,
        customer_id,
        customer_name: state.customer_name,
        customer_phone: state.customer_phone,
        customer_address: state.customer_address,
        customer_tax_id: state.customer_tax_id,
        customer_branch: state.customer_branch,
        price_type: state.price_type,
        vat_mode: state.vat_mode,
        vat_rate: state.vat_rate,
        discount_amount: state.discount_amount || 0,
        discount_percent: 0,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        amount_before_vat: totals.amount_before_vat,
        vat_amount: totals.vat_amount,
        withholding_tax_enabled: state.withholding_tax_enabled,
        withholding_tax_rate: state.withholding_tax_rate,
        withholding_tax_amount: totals.withholding_tax_amount,
        grand_total: totals.grand_total,
        net_total: totals.net_total,
        payment_method: state.payment_method,
        payment_status: t === "receipt" ? "paid" : "unpaid",
        status: "issued",
        notes: state.notes,
        related_document_no: documentNo,
        template: state.template ?? "classic",
        project_name: state.project_name || null,
        internal_sale_type: state.internal_sale_type ?? "real_goods",
        show_payment_method: state.show_payment_method !== false,
        show_payment_date: state.show_payment_date !== false,
        show_footer_document_date: state.show_footer_document_date !== false,
      });
      try {
        for (const t of toCreate) {
          // Re-use an existing companion of the same type (avoids burning
          // a new running number on every re-save).
          const existing = companionDocs.find((c) => c.type === t);
          if (existing) {
            const { error: uE } = await supabase
              .from(tbl("documents") as any)
              .update(buildCompanionPayload(t, existing.doc_no))
              .eq("id", existing.id);
            if (uE) throw uE;
            await supabase.from(tbl("document_items") as any).delete().eq("document_id", existing.id);
            const { error: iE } = await supabase
              .from(tbl("document_items") as any)
              .insert(itemsPayload.map((it) => ({ ...it, document_id: existing.id })));
            if (iE) throw iE;
            issuedCompanions.push(existing);
          } else {
            const { data: noData, error: nErr } = await supabase.rpc(tbl("next_doc_no") as any, {
              p_store_id: store.id,
              p_document_type: t,
            });
            if (nErr) throw nErr;
            const newNo = noData as string;
            const { data: cDoc, error: cE } = await supabase
              .from(tbl("documents") as any)
              .insert(buildCompanionPayload(t, newNo))
              .select("id")
              .single();
            if (cE) throw cE;
            const cId = (cDoc as any).id as string;
            createdInThisCall.push(cId);
            const { error: iE } = await supabase
              .from(tbl("document_items") as any)
              .insert(itemsPayload.map((it) => ({ ...it, document_id: cId })));
            if (iE) throw iE;
            issuedCompanions.push({ type: t, doc_no: newNo, id: cId });
          }
        }
        // Preserve any earlier-issued companions whose type isn't part of
        // the current set (they remain in the DB, just not refreshed here).
        const keep = companionDocs.filter((c) => !toCreate.includes(c.type));
        setCompanionDocs([...keep, ...issuedCompanions.filter((c) => !keep.find((k) => k.id === c.id))]);
      } catch (e: any) {
        // Roll back companions WE just created in this call. Pre-existing
        // companions (UPDATE path) keep their numbers — only the failed
        // INSERTs are removed.
        for (const cid of createdInThisCall) {
          try {
            await supabase.from(tbl("document_items") as any).delete().eq("document_id", cid);
            await supabase.from(tbl("documents") as any).delete().eq("id", cid);
          } catch { /* best-effort */ }
        }
        // If main was freshly inserted (not an update), roll it back too so
        // the user isn't left with a half-saved set.
        if (!isUpdate) {
          try {
            await supabase.from(tbl("document_items") as any).delete().eq("document_id", docId);
            await supabase.from(tbl("documents") as any).delete().eq("id", docId);
          } catch { /* best-effort */ }
        }
        const _detail = [e?.message, (e as any)?.details, (e as any)?.hint, (e as any)?.code]
          .filter(Boolean).join(" • ");
        toast({
          title: "สร้างเอกสารคู่กันไม่สำเร็จ — ยกเลิกการบันทึกทั้งหมด",
          description: _detail || "ไม่ทราบสาเหตุ",
          variant: "destructive",
        });
        throw e;
      }
      const receiptNo = issuedCompanions.find((c) => c.type === "receipt")?.doc_no ?? null;

      {
          const _cust = (state.customer_name || "").trim();
        toast({
          title: `บันทึกแล้ว: ${documentNo}${_cust ? ` — ${_cust}` : ""}`,
        });
      }
      if (receiptNo) toast({ title: `ออกใบเสร็จเลขที่ ${receiptNo} แล้ว` });
      refreshRevisions(docId);
      // success → clear draft + dirty flag (do NOT reset form)
      try { await clearDraft(store.id, "document"); } catch { /* noop */ }
      setDirty(false);
      setIssues([]);

      // Populate + show the post-save summary dialog with deep links to the
      // main doc and any companions (QT/DN/RC). User can open, print, copy.
      setSummaryData({
        main: { id: docId, document_no: documentNo, document_type: state.document_type },
        companions: issuedCompanions.map((c) => ({
          id: c.id, document_no: c.doc_no, document_type: c.type,
        })),
        relatedDocumentNo: state.related_document_no ?? null,
      });
      setSummaryOpen(true);

      if (purchaseOrderSourceRef.current) {
        try {
          await supabase
            .from("customer_purchase_orders" as any)
            .update({ status: "converted" })
            .eq("id", purchaseOrderSourceRef.current);
        } catch { /* noop */ }
      }

      // Rotate idempotency key so the next save (e.g. another new doc) uses
      // a fresh key. Re-saving this row goes through the UPDATE path which
      // ignores the key entirely.
      newIdempotencyKey();

      // fire-and-forget Google Sheets sync (background)
      try {
        const { triggerSync } = await import("../lib/syncStub");
        const autoUpload = localStorage.getItem("rds_auto_upload_pdf") !== "0";
        setAutoSync({ state: "syncing" });
        (async () => {
          let target: "both" | "sheet" = autoUpload ? "both" : "sheet";
          let pdf64: string | undefined;
          if (autoUpload) {
            try {
              const { renderDocToPdfBase64 } = await import("../lib/pdfUtils");
              pdf64 = await renderDocToPdfBase64(
                store,
                state,
                totals,
                documentNo,
                state.paper_size,
                "portrait",
                false,
                resolvedTemplateCfg,
              ) || undefined;
            } catch {
              // PDF render failed — sync Sheets only now, and mark Drive as
              // pending so "ซิงก์ที่ค้าง" on DocumentsList picks it up later.
              target = "sheet";
              try {
                await supabase
                  .from(tbl("documents") as any)
                  .update({ google_drive_sync_status: "pending" })
                  .eq("id", docId);
              } catch { /* noop */ }
            }
          }
          try {
            const r = await triggerSync([docId], target, pdf64 ? { [docId]: pdf64 } : undefined, "document_full");
            // Re-read row to get per-target status (triggerSync only tells us overall)
            const { data: row } = await supabase
              .from(tbl("documents") as any)
              .select("google_sheet_sync_status, google_drive_sync_status, last_sync_error")
              .eq("id", docId)
              .maybeSingle();
            const sheet = (row as any)?.google_sheet_sync_status as "success" | "failed" | undefined;
            const drive = target === "both" ? ((row as any)?.google_drive_sync_status as "success" | "failed" | undefined) : undefined;
            const err = (row as any)?.last_sync_error as string | null;
            const okSheet = sheet === "success";
            const okDrive = target === "both" ? drive === "success" : true;
            const allOk = okSheet && okDrive;
            const anyOk = okSheet || okDrive;
            setAutoSync({
              state: allOk ? "success" : anyOk ? "partial" : "failed",
              sheet, drive,
              error: err ?? (r.errors?.[0] ?? undefined),
              at: Date.now(),
            });
          } catch (e: any) {
            setAutoSync({ state: "failed", error: e?.message ?? "sync error", at: Date.now() });
          }
        })();
      } catch { /* noop */ }

      if (thenAction === "print") {
        setIsPrinting(true);
        setPrintError(null);
        pendingPrintStatusDocIdRef.current = docId;
        // Wait for the printable copy (incl. companion receipt) to mount,
        // then trigger print with the user's pre-print config so margins,
        // headerOnce, font-scale and copies apply to both documents.
        setTimeout(() => { void triggerPrintWithFallback(printCfg); }, 450);
      }
      // Reset form after successful save so the user can immediately start
      // a new document. Print path snapshots #doc-print synchronously inside
      // triggerPrintWithFallback, so resetting state shortly after is safe.
      const resetAfterSave = () => {
        try {
          skipDirtyRef.current = true;
          const defaults = defaultsForStore(store);
          resetForm(defaults);
          setSavedDocId(null);
          setSavedDocNo(null);
          setCompanionDocs([]);
          setRevisions([]);
          setIssues([]);
          setPrintError(null);
          setAutoSync({ state: "idle" });
          lastSavedSnapshotRef.current = null;
          setDirty(false);
          if (editingDocId && storeSlug) {
            navigate(`${storeBasePath(storeSlug)}/documents/new`, { replace: true });
          }
          // Force a clean re-initialisation so any cached refs/state are wiped
          // and the user sees a true "new document" form every time.
          initializedRef.current = false;
          editLoadedRef.current = false;
          setFormNonce((n) => n + 1);
        } catch { /* noop */ }
      };
      // Keep the form mounted after save so the user can review the
      // saved record, change status, retry sync, print again, or open
      // the revision history. Use the dedicated "ใหม่" / navigation
      // controls to start a fresh document. (We intentionally no longer
      // call resetAfterSave() here.)
      void resetAfterSave; // referenced for future explicit "new doc" action
      return docId;
    } catch (e: any) {
      toast({ title: "บันทึกไม่สำเร็จ", description: e.message, variant: "destructive" });
      return null;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  async function downloadPdf(cfg?: Partial<import("../lib/printPrefs").PrintPrefs>) {
    if (!store) return;
    const v = validateItems(state.items);
    setIssues(v.issues);
    if (v.nonEmpty === 0) {
      toast({ title: "กรุณาเพิ่มรายการก่อนดาวน์โหลด", variant: "destructive" });
      return;
    }
    if (!v.valid) {
      toast({
        title: `ตรวจสอบไม่ผ่าน ${v.issues.length} แถว`,
        description: "แก้ไขแถวที่ไฮไลต์แดงก่อนดาวน์โหลด",
        variant: "destructive",
      });
      return;
    }
    setDownloading(true);
    try {
      const { renderToStaticMarkup } = await import("react-dom/server");
      const React = await import("react");
      const { renderPrintHtmlToPdfBlob, saveBlobAsFile } = await import("../lib/pdfUtils");
      const html = renderToStaticMarkup(
        React.createElement(DocumentPreview, { store, state, totals, docNo: savedDocNo ?? "DRAFT", templateConfig: resolvedTemplateCfg }),
      );
      const div = document.createElement("div");
      div.style.position = "fixed";
      div.style.left = "-10000px";
      div.style.top = "0";
      div.innerHTML = html;
      document.body.appendChild(div);
      try {
        const el = div.querySelector("#doc-print") as HTMLElement | null;
        if (!el) throw new Error("ไม่พบเอกสารที่จะแปลงเป็น PDF");
        const blob = await renderPrintHtmlToPdfBlob(el, {
          paper: (cfg?.paper as any) ?? (state.paper_size as any) ?? "A4",
          orient: cfg?.orient ?? "portrait",
          margins: cfg?.margins,
          fontScale: cfg?.fontScale ?? state.font_scale ?? 1,
          fontScope: cfg?.fontScope,
          headerOnce: cfg?.headerOnce,
        });
        const { buildDocFilename } = await import("../lib/docFilename");
        const name = buildDocFilename({
          document_type: state.document_type,
          document_no: savedDocNo,
          document_date: state.document_date,
          customer_name: state.customer_name,
          org_name: (store as any)?.name,
        });
        const res = await saveBlobAsFile(blob, name);
        if (res === "aborted") return;
        if (res === "failed") {
          toast({ title: "บันทึกไฟล์ไม่สำเร็จ", description: "เบราว์เซอร์บล็อกการดาวน์โหลด กรุณาเปิดหน้านี้ในแท็บใหม่แล้วลองอีกครั้ง", variant: "destructive" });
          return;
        }
        toast({
          title: res === "tab" ? "เปิดไฟล์ PDF แล้ว" : "บันทึกไฟล์ PDF สำเร็จ",
          description: res === "tab" ? "กดปุ่มแชร์ → บันทึกลงในไฟล์ เพื่อเซฟไฟล์" : undefined,
        });
      } finally {
        document.body.removeChild(div);
      }
    } catch (e: any) {
      toast({ title: "ดาวน์โหลดไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  /**
   * Open the PrePrintSettings dialog. When the user confirms, the chosen
   * config is applied (font_scale, paper_size, page-range, copies) and the
   * deferred action runs ("print" → triggerPrintWithFallback,
   * "save-print" → save("print")).
   */
  function openPrePrint(action: "print" | "save-print") {
    setPrePrintAction(action);
    setPrePrintOpen(true);
  }

  function getDirectPrintPrefs(): PrintPrefs {
    return {
      ...resolveInitialPrefs({
      fontScale: state.font_scale ?? 1,
      paper: (state.paper_size as any) ?? "A4",
      pageRange: printPageRange,
      }, savedDocNo ?? (state as any)?.id ?? null),
      printMode: "auto",
    };
  }

  function getPrintableText(root: HTMLElement | null): string {
    if (!root) return "";
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[id="doc-print"]'));
    const source = blocks.length ? blocks : [root];
    return source.map((el) => el.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
  }

  async function waitForPrintableDom(root: HTMLElement): Promise<void> {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try { requestAnimationFrame(() => finish()); } catch { /* noop */ }
      setTimeout(finish, 80);
    });
    try {
      // @ts-ignore — document.fonts is standard in modern browsers.
      if (document?.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 500))]);
    } catch { /* noop */ }
    try {
      await Promise.all(
        Array.from(root.querySelectorAll("img")).map(async (img) => {
          if ((img as HTMLImageElement).complete) {
            try { await (img as HTMLImageElement).decode?.(); } catch { /* noop */ }
            return;
          }
          await Promise.race([
            new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
            new Promise((resolve) => setTimeout(resolve, 800)),
          ]);
        }),
      );
    } catch { /* noop */ }
  }

  function printNow() {
    // New flow: open the dedicated print route in a NEW tab (must be
    // called synchronously from the click handler to bypass popup
    // blockers). The print page fetches fresh data, waits for fonts,
    // then fires window.print() automatically.
    if (!savedDocId || !storeSlug) {
      // Fall through to save-and-print path when we have no saved doc yet.
      saveAndPrintNow();
      return;
    }
    // New flow: navigate to the pre-print preview page in the SAME tab so
    // the user can adjust paper size, font, margins, columns and choose
    // between print / PDF / PNG / JPG / Excel from one place.
    navigate(`${storeBasePath(storeSlug)}/documents/${savedDocId}/print-preview`);
  }

  function saveAndPrintNow() {
    // ไม่จองแท็บล่วงหน้าอีกต่อไป: เส้นทางนี้ไปหน้าพรีวิวในแท็บเดิมเสมอ
    // การเปิดแท็บว่างแล้วปิดทิ้งทำให้ iOS/PWA ค้างที่หน้า about:blank
    // ("ไม่แสดงหน้านี้")
    const reservedTab: Window | null = null;
    pendingPrintPrefsRef.current = null;
    pendingPrintWindowRef.current = reservedTab;
    (async () => {
      try {
        // Save without triggering the legacy print pipeline; capture the id.
        const docId = (await save()) ?? savedDocId;
        // The pre-print preview lives in the receipts shell and needs the
        // same-tab navigation for React Router; close any reserved popup.
        try { reservedTab?.close(); } catch { /* noop */ }
        if (docId && storeSlug) {
          navigate(`${storeBasePath(storeSlug)}/documents/${docId}/print-preview`);
        }
      } catch {
        try { reservedTab?.close(); } catch { /* noop */ }
      }
    })();
  }

  async function applyPrePrintAndRun(cfg: PrintPrefs, reservedPrintWindow?: Window | null) {
    pendingPrintPrefsRef.current = cfg;
    pendingPrintWindowRef.current = reservedPrintWindow ?? null;
    // Apply config to local state so the printable copy reflects it.
    patch({
      font_scale: cfg.fontScale,
      paper_size: cfg.paper as any,
    });
    setPrintPageRange(cfg.pageRange);
    setPrintCopies(cfg.copies);
    // Wait for React to commit + DOM to reflow. Safari/iOS need a bit
    // more time and web fonts fully loaded before the offscreen preview
    // stage produces reliable computed styles.
    await new Promise((r) => setTimeout(r, 120));
    try {
      // @ts-ignore — document.fonts is standard in modern browsers.
      if (document?.fonts?.ready) await document.fonts.ready;
    } catch { /* noop */ }
    if (prePrintAction === "save-print") {
      await save("print", cfg);
    } else {
      // Two frames so style + font_scale changes commit before preview.
      // Fall back to setTimeout when RAF is throttled (Safari background
      // tabs / in-app browsers).
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        try {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => finish())
          );
        } catch { /* noop */ }
        setTimeout(finish, 200);
      });
      setIsPrinting(true);
      setPrintError(null);
      await triggerPrintWithFallback(cfg);
    }
  }

  // Trigger window.print() with status toasts and automatic PDF fallback when
  // the browser silently blocks the print dialog (e.g. in-app browsers, iOS).
  async function triggerPrintWithFallback(cfg?: PrintPrefs) {
    const printableRoot = printableRef.current ?? null;
    const printable = (printableRoot?.querySelector("#doc-print") ?? document.getElementById("doc-print")) as HTMLElement | null;
    // Note: the printable copy is `hidden print:block`, so it has
    // offsetHeight === 0 on screen. Only fail when the node is missing.
    if (!printable) {
      setIsPrinting(false);
      setPrintError("ไม่พบเอกสารสำหรับพิมพ์");
      toast({ title: "เปิดหน้าต่างพิมพ์ไม่สำเร็จ", description: "กำลังดาวน์โหลด PDF ให้แทน", variant: "destructive" });
      if (savedDocId) markPrintStatus(savedDocId, "print_error", "ไม่พบเอกสารสำหรับพิมพ์");
      await downloadPdf();
      return;
    }
    await waitForPrintableDom(printableRoot ?? printable);
    const currentPrintableText = getPrintableText(printableRoot ?? printable);
    if (currentPrintableText.length < 10) {
      setIsPrinting(false);
      const msg = "เอกสารสำหรับพิมพ์ว่างหรือยังโหลดไม่สมบูรณ์";
      setPrintError(msg);
      toast({ title: "พิมพ์ไม่สำเร็จ", description: msg, variant: "destructive" });
      if (savedDocId) markPrintStatus(savedDocId, "print_error", msg);
      return;
    }

    let beforePrintSeen = false;
    let afterPrintSeen = false;
    let helperPrintFallback: (() => boolean) | null = null;
    // Preserve the user's scroll position so the page doesn't jump after
    // window.print() returns (Safari/Chrome reset scroll on some pages).
    const savedScrollX = window.scrollX;
    const savedScrollY = window.scrollY;
    const restoreScroll = () => window.scrollTo(savedScrollX, savedScrollY);
    document.body.classList.add("is-printing");
    const headerOnce = cfg?.headerOnce !== false;
    if (headerOnce) document.body.classList.add("header-once");
    // Inject @page with chosen margins for non-iframe print path.
    const marginCss = cfg?.margins
      ? `${cfg.margins.top}mm ${cfg.margins.right}mm ${cfg.margins.bottom}mm ${cfg.margins.left}mm`
      : "0";
    const selectedPaper = (cfg?.paper as any) ?? state.paper_size ?? "A4";
    const selectedOrient = cfg?.orient ?? "portrait";
    const paperSizeCss = selectedPaper === "80mm" ? "80mm 200mm" : selectedPaper;
    const pageStyle = document.createElement("style");
    pageStyle.id = "rds-form-print-page";
    pageStyle.textContent =
      `@page { size: ${paperSizeCss} ${selectedOrient}; margin: ${marginCss}; }\n` +
      (headerOnce
        ? `body.is-printing.header-once .doc-page:not([data-page-idx="1"]) .doc-header-group { display: none !important; }
           body.is-printing.header-once .doc-page:not([data-page-idx="1"]) { padding-top: 6mm !important; }`
        : "") +
      `#doc-print, .doc-print-document { --doc-font-scale: ${cfg?.fontScale ?? state.font_scale ?? 1}; --doc-font-scope: ${cfg?.fontScope ?? "content"}; }`;
    document.getElementById("rds-form-print-page")?.remove();
    document.head.appendChild(pageStyle);
    const cleanupPrintFlag = () => {
      document.body.classList.remove("is-printing");
      document.body.classList.remove("header-once");
      document.getElementById("rds-form-print-page")?.remove();
    };
    // Apply optional page-range filter (e.g. "1,3,5-7"). The cleanup runs
    // after print so the on-screen preview stays unaffected.
    let cleanupPageFilter: () => void = () => { /* noop */ };
    if (printPageRange.trim()) {
      try {
        const { applyPrintPageFilter } = await import("./printRange");
        cleanupPageFilter = applyPrintPageFilter(printable, printPageRange);
      } catch { /* noop */ }
    }
    // Auto-fit-to-A4 removed: print at the document's actual size.
    const onBefore = () => {
      beforePrintSeen = true;
      toast({ title: "เปิดหน้าต่างพิมพ์แล้ว", description: "เลือกเครื่องพิมพ์แล้วกด พิมพ์ — กลับมาทำงานต่อได้ทันทีเมื่อปิดหน้าต่าง" });
    };
    const onAfter = async () => {
      afterPrintSeen = true;
      toast({ title: "ส่งงานพิมพ์แล้ว" });
      const statusDocId = pendingPrintStatusDocIdRef.current ?? savedDocId;
      pendingPrintStatusDocIdRef.current = null;
      if (statusDocId) markPrintStatus(statusDocId, "printed");
      setIsPrinting(false);
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
      try {
        const { resetDocPrintFit } = await import("../lib/pdfUtils");
        resetDocPrintFit(printable);
      } catch { /* noop */ }
      cleanupPrintFlag();
      restoreScroll();
      cleanupPageFilter();
    };
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);

    try {
      const paperSize = paperSizeCss;
      const allDocsRaw = printableRef.current
        ? Array.from(printableRef.current.querySelectorAll('[id="doc-print"]')) as HTMLElement[]
        : [printable];
      const combinedHtml = allDocsRaw.length > 0
        ? combinePrintBlocks(allDocsRaw)
        : printable.outerHTML;
      const opts = {
        bodyHtml: combinedHtml,
        sourceEl: printableRef.current ?? printable,
        paperSize,
        orient: selectedOrient,
        copies: printCopies,
        margins: cfg?.margins,
        headerOnce,
        fontScale: cfg?.fontScale,
        fontScope: cfg?.fontScope,
        manualPrintToolbar: true,
        onPrintDispatched: () => {
          beforePrintSeen = true;
          setPrintError(null);
        },
        onPrintFailed: (reason: string) => {
          setPrintError(reason);
        },
        onAfterPrint: () => onAfter(),
      };
      const reservedPrintWindow = pendingPrintWindowRef.current;
      pendingPrintWindowRef.current = null;
      helperPrintFallback = () => {
        const inFrame = isInIframe();
        if (inFrame) {
          return !!openPrintWindow(opts, reservedPrintWindow) || printViaHiddenIframe(opts);
        }
        return printViaHiddenIframe(opts) || !!openPrintWindow(opts, reservedPrintWindow);
      };
      // Respect the user-chosen print mode from PrintPrefs. "auto" keeps
      // the previous fallback strategy; explicit modes let the user work
      // around device-specific quirks (popup blockers, in-app browsers).
      const mode = cfg?.printMode ?? "auto";
      const tryNative = () => {
        try {
          window.focus();
          window.print();
          return true;
        } catch { return false; }
      };
      let printed = false;
      if (mode === "native") {
        printed = tryNative();
      } else if (mode === "popup") {
        printed = !!openPrintWindow(opts, reservedPrintWindow);
      } else if (mode === "iframe") {
        printed = printViaHiddenIframe(opts);
      } else {
        // Auto: on PC / top-level tab, call the browser's native
        // window.print() directly so Chrome's own Print Preview UI opens
        // in the same tab — no popup, no hidden iframe. Fallbacks only
        // run when we're inside an iframe (Lovable preview) where the
        // parent frame owns the print dialog.
        if (!isInIframe()) {
          printed = tryNative();
        } else {
          printed = !!openPrintWindow(opts, reservedPrintWindow);
          if (!printed) printed = printViaHiddenIframe(opts);
        }
      }
      if (!printed) throw new Error("popup_blocked");
    } catch (err: any) {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
      setIsPrinting(false);
      setPrintError(err?.message || "พิมพ์ไม่สำเร็จ");
      toast({ title: "พิมพ์ไม่สำเร็จ", description: "กำลังดาวน์โหลด PDF ให้แทน", variant: "destructive" });
      const statusDocId = pendingPrintStatusDocIdRef.current ?? savedDocId;
      pendingPrintStatusDocIdRef.current = null;
      if (statusDocId) markPrintStatus(statusDocId, "print_error", err?.message || "พิมพ์ไม่สำเร็จ");
      try {
        const { resetDocPrintFit } = await import("../lib/pdfUtils");
        resetDocPrintFit(printable);
      } catch { /* noop */ }
      cleanupPrintFlag();
      restoreScroll();
      cleanupPageFilter();
      await downloadPdf();
      return;
    }

    // Fallback: if no beforeprint within ~4s, assume the browser blocked
    // the dialog (common on iOS/in-app browsers) and download PDF instead.
    window.setTimeout(async () => {
      if (!beforePrintSeen && !afterPrintSeen) {
        // On PC/top-level tabs we intentionally rely on native
        // window.print() only. Do NOT attempt popup/iframe fallbacks
        // here — they've historically confused users. Only try the
        // helper chain when we're actually inside an iframe.
        if (isInIframe()) {
          const fallbackDispatched = helperPrintFallback?.() ?? false;
          if (fallbackDispatched) return;
        }
        window.removeEventListener("beforeprint", onBefore);
        window.removeEventListener("afterprint", onAfter);
        setIsPrinting(false);
        setPrintError("เบราว์เซอร์บล็อกหน้าต่างพิมพ์");
        toast({ title: "เปิดหน้าต่างพิมพ์ไม่สำเร็จ", description: "กำลังดาวน์โหลด PDF ให้แทน", variant: "destructive" });
        if (savedDocId) markPrintStatus(savedDocId, "print_error", "เบราว์เซอร์บล็อกหน้าต่างพิมพ์");
        try {
          const { resetDocPrintFit } = await import("../lib/pdfUtils");
          resetDocPrintFit(printable);
        } catch { /* noop */ }
        cleanupPrintFlag();
        restoreScroll();
        cleanupPageFilter();
        await downloadPdf();
      }
    }, 4000);

    // Hard safety: clear the print lock no matter what.
    window.setTimeout(() => {
      setIsPrinting(false);
      cleanupPrintFlag();
      cleanupPageFilter();
    }, 8000);
  }

  /**
   * นำผลจาก "AI ผู้ช่วยออกเอกสาร" ลงฟอร์ม
   * - บังคับเป็นใบเสนอราคาฉบับร่างเสมอ (กติกาถูกบังคับซ้ำใน mapAiResultToForm)
   * - AI ไม่บันทึก/ออกเลขเอกสารเอง ผู้ใช้ต้องกดบันทึกเอง
   */
  function applyAiMapping(mapping: AiDocMapping, meta: { fileNames: string[]; prompt: string }) {
    setState((s) => ({
      ...s,
      ...mapping.patch,
      items: mapping.items.length ? mapping.items.map((r) => ({ ...emptyItem(), ...r })) : s.items,
    }));
    setDirty(true);
    setAiSummary({ missing: mapping.missing, notices: mapping.notices, items: mapping.items.length });
    if (store?.id) {
      // Audit: เก็บแหล่งที่มา/เวลา/จำนวนรายการ (ไม่เก็บข้อความ OCR ดิบ)
      void logDocActivity(store.id, "ai_doc_assist_import", savedDocId, {
        file_names: meta.fileNames,
        has_prompt: meta.prompt.length > 0,
        items: mapping.items.length,
        missing_fields: mapping.missing,
        forced_document_type: "quotation",
        store_slug: store.slug,
      });
    }
    toast({
      title: "AI กรอกข้อมูลลงใบเสนอราคาแล้ว",
      description: mapping.missing.length
        ? `กรุณาตรวจสอบช่องที่ยังไม่พบข้อมูล ${mapping.missing.length} ช่องก่อนบันทึก`
        : "กรุณาตรวจสอบความถูกต้องก่อนกดบันทึก",
    });
  }

  return (
    <>
    <div className="space-y-4 print:hidden max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">ออกเอกสาร</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            {store.name}
            <Badge variant={STATUS_VARIANT[statusWorkflow]}>{STATUS_LABEL[statusWorkflow]}</Badge>
            {companionDocs.length > 0 && (
              <span className="text-xs">
                {" "}· คู่:{" "}
                {companionDocs.map((c) => c.doc_no).join(", ")}
              </span>
            )}
            {state.related_document_no && (
              <span className="text-xs">
                {" "}· สร้างจาก{" "}
                <span className="font-mono font-semibold">{state.related_document_no}</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap md:flex-nowrap overflow-x-auto -mx-2 px-2 md:mx-0 md:px-0 md:overflow-visible">
          {dirty && (
            <span className={`text-xs self-center hidden md:inline ${draftSynced ? "text-muted-foreground" : "text-amber-600"}`}>
              <CloudUpload className="h-3 w-3 inline mr-1" />
              {lastSavedAt
                ? draftSynced
                  ? `บันทึกร่างอัตโนมัติ ${new Date(lastSavedAt).toLocaleTimeString()}`
                  : `เก็บร่างไว้ในเครื่อง ${new Date(lastSavedAt).toLocaleTimeString()} (ยังไม่ซิงก์)`
                : "ยังไม่ได้บันทึก"}
            </span>
          )}
          {savedDocId && (
            <Button variant="outline" onClick={() => { setHistoryOpen(true); refreshRevisions(savedDocId); }}>
              <HistoryIcon className="h-4 w-4 mr-1.5" /> ประวัติ
            </Button>
          )}
          {savedDocId && (
            <Button
              variant="outline"
              onClick={() => setActivityDialog({ docId: savedDocId, docNo: savedDocNo })}
              data-testid="open-activity-log"
            >
              <HistoryIcon className="h-4 w-4 mr-1.5" /> Audit Log
            </Button>
          )}
          <Button onClick={() => save()} disabled={saving || isPrinting} variant="outline" data-testid="save-only">
            <Save className="h-4 w-4 mr-1.5" /> บันทึก
          </Button>
          {/* Quickly start a new document of another type using the same
              customer + line items as the current form. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="create-from-this">
                <FilePlus2 className="h-4 w-4 mr-1.5" />
                สร้างจากใบนี้
                <ChevronDown className="h-4 w-4 ml-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>เลือกประเภทเอกสารใหม่</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableDocTypes.filter((t) => t.value !== state.document_type).map((t) => (
                <DropdownMenuItem
                  key={t.value}
                  onClick={() => createFromThisAs(t.value)}
                  data-testid={`create-from-this-${t.value}`}
                >
                  + {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={saveAndPrintNow} disabled={saving || isPrinting} data-testid="save-and-print">
            <Printer className="h-4 w-4 mr-1.5" /> บันทึก + ดูตัวอย่างพิมพ์
          </Button>
        </div>
      </div>

      {savedDocId && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">เปลี่ยนสถานะ:</span>
          <Button size="sm" variant="outline" onClick={() => updateStatus("pending")} disabled={statusWorkflow === "pending"}>
            <Send className="h-3.5 w-3.5 mr-1" /> ส่งให้แอดมิน
          </Button>
          <Button size="sm" variant="outline" onClick={() => updateStatus("approved")} disabled={statusWorkflow === "approved"}>
            <Check className="h-3.5 w-3.5 mr-1" /> อนุมัติ
          </Button>
          <Button size="sm" variant="outline" onClick={() => updateStatus("cancelled")} disabled={statusWorkflow === "cancelled"}>
            <Ban className="h-3.5 w-3.5 mr-1" /> ยกเลิก
          </Button>
        </div>
      )}

      {/* ขนาดตัวอักษรย้ายไปอยู่ในหน้า "ตั้งค่าก่อนพิมพ์" แล้ว */}

      {savedDocId && autoSync.state !== "idle" && (
        <AutoSyncBanner
          state={autoSync.state}
          sheet={autoSync.sheet}
          drive={autoSync.drive}
          error={autoSync.error}
          at={autoSync.at}
          onRetry={async () => {
            if (!savedDocId || !store) return;
            setAutoSync({ state: "syncing" });
            try {
              const { triggerSync } = await import("../lib/syncStub");
              const autoUpload = localStorage.getItem("rds_auto_upload_pdf") !== "0";
              let pdf64: string | undefined;
              let target: "both" | "sheet" = autoUpload ? "both" : "sheet";
              if (autoUpload) {
                try {
                  const { renderDocToPdfBase64 } = await import("../lib/pdfUtils");
                  pdf64 = await renderDocToPdfBase64(
                    store, state, totals,
                    savedDocNo ?? "DOC",
                    state.paper_size, "portrait",
                    false,
                    resolvedTemplateCfg,
                  ) || undefined;
                } catch {
                  target = "sheet";
                  try {
                    await supabase
                      .from(tbl("documents") as any)
                      .update({ google_drive_sync_status: "pending" })
                      .eq("id", savedDocId);
                  } catch { /* noop */ }
                }
              }
              const r = await triggerSync([savedDocId], target, pdf64 ? { [savedDocId]: pdf64 } : undefined, "document_full");
              const { data: row } = await supabase
                .from(tbl("documents") as any)
                .select("google_sheet_sync_status, google_drive_sync_status, last_sync_error")
                .eq("id", savedDocId)
                .maybeSingle();
              const sheet = (row as any)?.google_sheet_sync_status as any;
              const drive = target === "both" ? ((row as any)?.google_drive_sync_status as any) : undefined;
              const err = (row as any)?.last_sync_error as string | null;
              const okSheet = sheet === "success";
              const okDrive = target === "both" ? drive === "success" : true;
              const allOk = okSheet && okDrive;
              const anyOk = okSheet || okDrive;
              setAutoSync({
                state: allOk ? "success" : anyOk ? "partial" : "failed",
                sheet, drive,
                error: err ?? (r.errors?.[0] ?? undefined),
                at: Date.now(),
              });
              if (allOk) toast({ title: "ซิงก์สำเร็จ" });
              else toast({ title: "ซิงก์ยังไม่ครบ — ดูรายละเอียดด้านบน", variant: "destructive" });
            } catch (e: any) {
              setAutoSync({ state: "failed", error: e?.message ?? "sync error", at: Date.now() });
              toast({ title: "ลองซิงก์ใหม่ไม่สำเร็จ", description: e?.message, variant: "destructive" });
            }
          }}
        />
      )}

      {issues.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            ตรวจสอบไม่ผ่าน {issues.length} แถว
          </div>
          <ul className="mt-1 text-xs space-y-0.5 list-disc list-inside">
            {issues.slice(0, 5).map((it) => (
              <li key={it.index}>แถวที่ {it.index + 1}: {it.reason}</li>
            ))}
            {issues.length > 5 && <li className="text-muted-foreground">…และอีก {issues.length - 5} แถว</li>}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">
            ตัวอย่างที่ใช้ได้: <code>120</code> · <code>1,250</code> · <code>฿1 250.00</code> · <code>(1,250)</code>
          </p>
        </div>
      )}

      {printError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm flex items-center justify-between gap-3">
          <span>พิมพ์ไม่สำเร็จ: {printError} — ข้อมูลของคุณยังอยู่ครบ</span>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => { setPrintError(null); save("print"); }}>
              ลองพิมพ์อีกครั้ง
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPrintError(null); downloadPdf(); }} disabled={downloading}>
              <Download className="h-3.5 w-3.5 mr-1" /> พิมพ์ผ่าน PDF
            </Button>
          </div>
        </div>
      )}

      {savedDocNo && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>
            บันทึกแล้ว · เลขที่เอกสาร <span className="font-mono font-bold">{savedDocNo}</span>
            {state.customer_name?.trim() && (
              <> — <span className="font-medium">{state.customer_name.trim()}</span></>
            )}
            {companionDocs.length > 0 && (
              <>
                {" "}· คู่กัน:{" "}
                {companionDocs.map((c) => (
                  <span key={c.id} className="font-mono font-bold mr-2">{c.doc_no}</span>
                ))}
              </>
            )}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(savedDocNo); toast({ title: "คัดลอกเลขที่เอกสารแล้ว" }); }}>
              คัดลอกเลขที่
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`${storeBasePath(storeSlug)}/documents?q=${encodeURIComponent(savedDocNo)}`)}>
              ดูในรายการ
            </Button>
          </div>
        </div>
      )}

      {/* "Mark as printed" banner — only on saved ใบเสนอราคา. Gives users
          an explicit, recorded way to satisfy the DN-issue gate without
          opening the printer every time. */}
      {savedDocId && state.document_type === "quotation" && (
        <Alert
          variant={qtPrintInfo.print_status === "printed" || qtPrintInfo.last_printed_at ? "default" : "destructive"}
          data-testid="qt-print-banner"
        >
          <AlertTitle>
            {qtPrintInfo.print_status === "printed" || qtPrintInfo.last_printed_at
              ? "ใบเสนอราคานี้พิมพ์แล้ว"
              : "ยังไม่ได้พิมพ์ใบเสนอราคา"}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {qtPrintInfo.print_status === "printed" || qtPrintInfo.last_printed_at ? (
                <>พร้อมใช้ออก "ใบส่งของ" ที่อ้างอิงเลขที่ <span className="font-mono">{savedDocNo}</span> ได้ทันที</>
              ) : (
                <>ระบบจะบล็อกการสร้าง "ใบส่งของ" จนกว่าจะกดพิมพ์ หรือทำเครื่องหมายว่าพิมพ์แล้ว</>
              )}
            </span>
            {qtPrintInfo.print_status !== "printed" && !qtPrintInfo.last_printed_at && (
              <Button
                size="sm"
                variant="outline"
                data-testid="qt-mark-printed"
                onClick={async () => {
                  if (!savedDocId) return;
                  await markPrintStatus(savedDocId, "printed");
                  toast({ title: "ทำเครื่องหมายว่าพิมพ์แล้ว" });
                }}
              >
                ทำเครื่องหมายว่าพิมพ์แล้ว
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Header fields */}
      <Card className="p-4 grid md:grid-cols-3 gap-4">
        <div>
          <Label>ประเภทเอกสาร</Label>
          <Select
            value={state.document_type}
            disabled={false}
            onValueChange={(v) => {
              const next = v as DocumentType;
              if (next === state.document_type) return;
              // For brand-new (unsaved) documents only ใบเสนอราคา or
              // ใบเสร็จรับเงิน may be picked directly. ใบส่งของ must be
              // derived from a printed quotation via "สร้างจากใบนี้".
              if (!savedDocId && next !== "quotation" && next !== "receipt") {
                toast({
                  title: "ใบส่งของต้องอ้างอิงใบเสนอราคา",
                  description: "ออกใบเสนอราคา พิมพ์ 1 ครั้ง แล้วใช้ปุ่ม 'สร้างจากใบนี้ → ใบส่งของ'",
                  variant: "destructive",
                });
                return;
              }
              // If this doc was already saved, "เปลี่ยนประเภท" must produce a
              // brand-new document with its own running number + prefix (QT /
              // DN / RC / …) — never overwrite the saved row's number with a
              // different prefix. Ask the user to confirm via dialog, then
              // call duplicateAsType (atomic insert + new running number).
              if (savedDocId) {
                setPendingTypeChange(next);
                return;
              }
              patch({ document_type: next });
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableDocTypes.map((d) => (
                <SelectItem
                  key={d.value}
                  value={d.value}
                  disabled={!savedDocId && d.value !== "quotation" && d.value !== "receipt"}
                >
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!savedDocId && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              เริ่มต้นได้จาก <b>ใบเสนอราคา</b> หรือ <b>ใบเสร็จรับเงิน</b> เท่านั้น —
              <b className="mx-1">ใบส่งของ</b> ต้องออกใบเสนอราคาก่อนและพิมพ์ 1 ครั้ง
              แล้วใช้ปุ่ม <span className="mx-1 rounded bg-muted px-1">สร้างจากใบนี้</span>
            </p>
          )}
        </div>
        <div>
          <Label>ขนาดกระดาษ</Label>
          <Select value={state.paper_size} onValueChange={(v) => patch({ paper_size: v as PaperSize })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="A5">A5</SelectItem>
              <SelectItem value="80mm">ใบเสร็จ 80mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>เทมเพลตเอกสาร</Label>
          <Select value={template} onValueChange={(v) => patch({ template: v as DocTemplate })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TEMPLATE_LABEL) as DocTemplate[]).map((k) => (
                <SelectItem key={k} value={k}>{TEMPLATE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>เลย์เอาต์ (หัว/ท้ายกระดาษ)</Label>
          <Select
            value={state.layout_id ?? "__default__"}
            onValueChange={(v) => patch({ layout_id: v === "__default__" ? null : v })}
          >
            <SelectTrigger><SelectValue placeholder="ใช้ค่าเริ่มต้น" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                {activeLayout && !state.layout_id ? `ค่าเริ่มต้น (${activeLayout.name})` : "ค่าเริ่มต้น"}
              </SelectItem>
              {(layoutsQ.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                  {l.doc_type ? ` · ${l.doc_type}` : ""}
                  {l.is_default ? " · default" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            จัดการเลย์เอาต์ได้ที่ ตั้งค่า → เทมเพลตเอกสาร (ใหม่)
          </p>
        </div>
        <div>
          <Label>วันที่ออกเอกสาร</Label>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={state.document_date}
              onChange={(e) => patch({ document_date: e.target.value })}
            />
            <div className="flex items-center gap-1 shrink-0">
              <Switch
                checked={state.show_document_date}
                onCheckedChange={(v) => patch({ show_document_date: v })}
              />
              <span className="text-xs text-muted-foreground">แสดง</span>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="project_name_input">ชื่อโครงการ</Label>
          <Input
            id="project_name_input"
            placeholder="ชื่อโครงการ (ไม่บังคับ — ถ้าว่างจะใช้ชื่อลูกค้าอัตโนมัติ)"
            value={state.project_name ?? ""}
            onChange={(e) => {
              patch({ project_name: e.target.value });
              if (e.target.value.trim()) setShowProjectError(false);
            }}
          />
        </div>

        {/* Staff-only: internal sale classification. Never rendered on
            customer-facing prints/PDFs — used purely for back-office
            filtering and reporting. */}
        <div className="md:col-span-2" data-testid="internal-sale-type-field">
          <Label className="flex items-center gap-2">
            ประเภทภายในร้าน
            <span className="text-[11px] font-normal text-muted-foreground">
              (แสดงเฉพาะหลังบ้าน · ไม่ปรากฏในใบพิมพ์ลูกค้า)
            </span>
          </Label>
          <div className="inline-flex rounded-md border overflow-hidden mt-1" role="group" aria-label="ประเภทภายในร้าน">
            {([
              { v: "real_goods", label: "ซื้อของจริง" },
              { v: "bill_only", label: "ซื้อบิล" },
            ] as const).map((opt) => {
              const active = (state.internal_sale_type ?? "real_goods") === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  data-testid={`internal-sale-type-${opt.v}`}
                  aria-pressed={active}
                  onClick={() => patch({ internal_sale_type: opt.v })}
                  className={
                    "px-4 py-1.5 text-sm transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted")
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>โหมด VAT</Label>
          <Select value={state.vat_mode} onValueChange={(v) => patch({ vat_mode: v as VatMode })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ไม่มี VAT</SelectItem>
              <SelectItem value="exclusive">ไม่รวม VAT (บวกทีหลัง)</SelectItem>
              <SelectItem value="inclusive">รวม VAT แล้ว</SelectItem>
              <SelectItem value="inclusive_note">VAT รวมอยู่ในราคาแล้ว</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>อัตราภาษี (%)</Label>
          <Select
            value={String(state.vat_rate)}
            onValueChange={(v) => patch({ vat_rate: Number(v) })}
            disabled={state.vat_mode === "none"}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0%</SelectItem>
              <SelectItem value="7">7%</SelectItem>
              <SelectItem value="10">10%</SelectItem>
              {taxRatesQ.data?.map((r: any) => (
                ![0, 7, 10].includes(Number(r.rate)) && (
                  <SelectItem key={r.rate} value={String(r.rate)}>
                    {r.label ?? `${r.rate}%`}
                  </SelectItem>
                )
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>ประเภทราคา</Label>
          <Select value={state.price_type} onValueChange={(v) => patch({ price_type: v as PriceType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="exclude_vat">ราคาก่อน VAT</SelectItem>
              <SelectItem value="include_vat">ราคารวม VAT</SelectItem>
              <SelectItem value="no_vat">ไม่มี VAT</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-3 flex flex-wrap items-end gap-4 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={state.withholding_tax_enabled}
              onCheckedChange={(v) => patch({ withholding_tax_enabled: v })}
            />
            <Label className="!mb-0">หัก ณ ที่จ่าย</Label>
          </div>
          {state.withholding_tax_enabled && (
            <div>
              <Label>อัตรา %</Label>
              <Select
                value={String(state.withholding_tax_rate)}
                onValueChange={(v) => patch({ withholding_tax_rate: Number(v) })}
              >
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1%</SelectItem>
                  <SelectItem value="2">2%</SelectItem>
                  <SelectItem value="3">3%</SelectItem>
                  <SelectItem value="5">5%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>ชำระเงิน</Label>
            <div className="flex items-center gap-2">
              <Select value={state.payment_method} onValueChange={(v) => patch({ payment_method: v })}>
                <SelectTrigger className="w-40" data-testid="doc-payment-method-trigger"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentMethodsQ.methods.map((m) => (
                    <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 shrink-0">
                <Switch
                  checked={state.show_payment_method !== false}
                  onCheckedChange={(v) => patch({ show_payment_method: v })}
                />
                <span className="text-xs text-muted-foreground">แสดง</span>
              </div>
            </div>
          </div>
          <div className="md:col-span-3 w-full">
            <BundlePicker
              items={bundlePickerItems}
              selection={bundleSelection}
              disabled={saving || isPrinting}
              onChange={(next) => {
                const forced = { ...next, selected: { ...next.selected, "doc:main": true } };
                setBundleSelection(forced);
                patch({ companion_set: bundleCompanionSet(forced, state.document_type) as CompanionSet });
              }}
              onUploadFiles={(files) => {
                const additions = Array.from(files).map((file, idx) => ({
                  id: `att:upload:${Date.now()}-${idx}-${file.name}`,
                  label: file.name,
                  file,
                }));
                setUploadedBundleAttachments((prev) => [...prev, ...additions]);
              }}
            />
          </div>
        </div>
      </Card>

      {/* Customer */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">ข้อมูลลูกค้า</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>ค้นหา/ชื่อลูกค้า</Label>
            <CustomerPicker
              storeId={store.id}
              value={state.customer_name}
              onChange={(v) => patch({ customer_name: v, customer_id: null })}
              onPick={(c) =>
                patch({
                  customer_id: c.id,
                  customer_name: c.name,
                  customer_phone: c.phone ?? "",
                  customer_address: c.address ?? "",
                  customer_tax_id: c.tax_id ?? "",
                  customer_branch: c.branch_name ?? "",
                })
              }
            />
          </div>
          <div>
            <Label>เบอร์โทร</Label>
            <Input value={state.customer_phone} onChange={(e) => patch({ customer_phone: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>ที่อยู่</Label>
            <Textarea
              value={state.customer_address}
              onChange={(e) => patch({ customer_address: e.target.value })}
              rows={2}
            />
          </div>
          <div>
            <Label>เลขประจำตัวผู้เสียภาษี</Label>
            <Input value={state.customer_tax_id} onChange={(e) => patch({ customer_tax_id: e.target.value })} />
          </div>
          <div>
            <Label>สาขา</Label>
            <Input
              placeholder="สำนักงานใหญ่"
              value={state.customer_branch}
              onChange={(e) => patch({ customer_branch: e.target.value })}
            />
          </div>
        </div>
      </Card>

      {/* AI ผู้ช่วยออกเอกสาร */}
      <Card className="p-4 flex flex-col gap-3 border-primary/40 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <div className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI ผู้ช่วยออกเอกสาร
          </div>
          <p className="text-sm text-muted-foreground">
            พิมพ์บอก AI หรือแนบไฟล์ (PDF / รูป / Excel / CSV) แล้วให้ AI กรอกลงใบเสนอราคาให้ — ทุกงานเริ่มจากใบเสนอราคาก่อนเสมอ
          </p>
        </div>
        <Button onClick={() => setAiOpen(true)} data-testid="open-ai-doc-assistant" className="shrink-0">
          <Sparkles className="h-4 w-4 mr-1.5" /> ให้ AI ช่วยกรอก
        </Button>
      </Card>

      {aiSummary && (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>AI กรอกข้อมูลลงฟอร์มแล้ว — กรุณาตรวจสอบก่อนบันทึก</AlertTitle>
          <AlertDescription className="space-y-1">
            <div>นำเข้ารายการ {aiSummary.items} รายการ เป็นใบเสนอราคา (ฉบับร่าง)</div>
            {aiSummary.notices.map((n, i) => (
              <div key={i}>• {n}</div>
            ))}
            {aiSummary.missing.length > 0 && <div>ยังไม่พบข้อมูล (ต้องตรวจสอบ): {aiSummary.missing.join(", ")}</div>}
          </AlertDescription>
        </Alert>
      )}

      {/* Items */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">รายการสินค้า/บริการ</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saving || isPrinting || downloading}
              onClick={() => {
                const ok = window.confirm(
                  "ล้างข้อมูลในหน้านี้ทั้งหมดและเริ่มออกเอกสารใบใหม่?\n(ข้อมูลที่ยังไม่บันทึกจะหายไป)"
                );
                if (!ok) return;
                newIdempotencyKey();
                skipDirtyRef.current = true;
                const defaults = defaultsForStore(store);
                resetForm(defaults);
                setSavedDocId(null);
                setSavedDocNo(null);
                setCompanionDocs([]);
                setRevisions([]);
                setIssues([]);
                setPrintError(null);
                setAutoSync({ state: "idle" });
                lastSavedSnapshotRef.current = null;
                setDirty(false);
                if (editingDocId && storeSlug) {
                  navigate(`${storeBasePath(storeSlug)}/documents/new`, { replace: true });
                }
                initializedRef.current = false;
                editLoadedRef.current = false;
                setFormNonce((n) => n + 1);
                toast({ title: "ล้างเอกสารแล้ว", description: "เริ่มออกใบใหม่ได้เลย" });
              }}
            >
              <RotateCw className="h-4 w-4 mr-1.5" /> {editingDocId ? "เริ่มใบใหม่" : "ล้างเอกสาร"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSmartOpen(true)}>
              <Sparkles className="h-4 w-4 mr-1.5" /> Smart Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
              <Sparkles className="h-4 w-4 mr-1.5" /> AI ผู้ช่วย
            </Button>
          </div>
        </div>
        <ItemsTable
          storeId={store.id}
          items={state.items}
          units={unitsQ.data ?? []}
          onSetItem={setItem}
          onAdd={addItem}
          onRemove={removeItem}
          onMove={moveItem}
          onPasteRows={addItems}
          issues={issues}
        />
      </Card>

      {/* Totals + Notes */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <Label>หมายเหตุ</Label>
          <Textarea value={state.notes} onChange={(e) => patch({ notes: e.target.value })} rows={5} />
        </Card>
        <Card className="p-4">
          <h2 className="font-semibold mb-3">สรุปยอด</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">รวม</dt>
              <dd className="tabular-nums">{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">ส่วนลดท้ายบิล (บาท)</dt>
              <dd className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  className="h-8 w-28 text-right tabular-nums"
                  value={discountInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDiscountInput(v);
                    const parsed = parseDiscountInput(v);
                    patch({ discount_amount: Number.isFinite(parsed) && parsed > 0 ? parsed : 0 });
                  }}
                  onBlur={() => setDiscountInput(state.discount_amount ? String(state.discount_amount) : "")}
                  placeholder="0.00"
                  aria-label="ส่วนลดท้ายบิล"
                />
              </dd>
            </div>
            {discountCheck.message && (
              <p className="text-xs text-destructive text-right">{discountCheck.message}</p>
            )}
            {discountCheck.effective > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">หลังหักส่วนลด</dt>
                <dd className="tabular-nums">
                  {afterDiscount(subtotalBeforeDiscount, discountCheck.effective).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </dd>
              </div>
            )}

            {state.vat_mode !== "none" && (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ก่อน VAT</dt>
                  <dd className="tabular-nums">{totals.amount_before_vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">VAT {state.vat_rate}%</dt>
                  <dd className="tabular-nums">{totals.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-base border-t border-border pt-2">
              <dt>ยอดรวม</dt>
              <dd className="tabular-nums">{totals.grand_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
            </div>
            {state.withholding_tax_enabled && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <dt>หัก ณ ที่จ่าย {state.withholding_tax_rate}%</dt>
                  <dd className="tabular-nums">-{totals.withholding_tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
                </div>
                <div className="flex justify-between font-bold text-base">
                  <dt>ยอดสุทธิ</dt>
                  <dd className="tabular-nums">{totals.net_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="mt-3 text-xs italic text-muted-foreground text-right">
            ({bahttext(totals.net_total || totals.grand_total)})
          </p>
        </Card>
      </div>

      <SmartImportDialog open={smartOpen} onOpenChange={setSmartOpen} onImport={addItems} storeId={store?.id ?? null} />

      <AiDocAssistantDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        store={store}
        current={{ paper_size: state.paper_size, template: state.template, document_date: state.document_date }}
        onApply={applyAiMapping}
      />

      <ConfirmTypeChangeDialog
        open={pendingTypeChange !== null && !typeChangeBusy}
        onCancel={() => setPendingTypeChange(null)}
        onConfirm={() => {
          if (pendingTypeChange) void duplicateAsType(pendingTypeChange);
        }}
        fromNo={savedDocNo}
        fromLabel={getDocLabel(state.document_type)}
        toLabel={getDocLabel(pendingTypeChange)}
      />

      <TypeChangeSummaryDialog
        open={!!typeChangeSummary}
        onClose={() => setTypeChangeSummary(null)}
        storeSlug={storeSlug}
        fromNo={typeChangeSummary?.fromNo ?? null}
        fromType={typeChangeSummary?.fromType ?? null}
        newNo={typeChangeSummary?.newNo ?? null}
        newId={typeChangeSummary?.newId ?? null}
        newType={typeChangeSummary?.newType ?? null}
        onOpenNew={() => {
          if (typeChangeSummary?.newId && storeSlug) {
            navigate(`${storeBasePath(storeSlug)}/documents/${typeChangeSummary.newId}/edit`);
          }
          setTypeChangeSummary(null);
        }}
        onViewActivity={() => {
          if (typeChangeSummary?.newId) {
            setActivityDialog({ docId: typeChangeSummary.newId, docNo: typeChangeSummary.newNo });
          }
        }}
      />

      <DocActivityDialog
        open={!!activityDialog}
        onClose={() => setActivityDialog(null)}
        storeId={store?.id ?? null}
        docId={activityDialog?.docId ?? null}
        docNo={activityDialog?.docNo ?? null}
      />

      <SaveSummaryDialog
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        storeSlug={storeSlug}
        main={summaryData.main}
        companions={summaryData.companions}
        relatedDocumentNo={summaryData.relatedDocumentNo}
        onPrintAll={() => { setSummaryOpen(false); printNow(); }}
        onNewDocument={() => {
          // Force a fresh form & new idempotency key
          newIdempotencyKey();
          skipDirtyRef.current = true;
          const defaults = defaultsForStore(store);
          resetForm(defaults);
          setSavedDocId(null);
          setSavedDocNo(null);
          setCompanionDocs([]);
          setRevisions([]);
          setIssues([]);
          setPrintError(null);
          setAutoSync({ state: "idle" });
          lastSavedSnapshotRef.current = null;
          setDirty(false);
          if (editingDocId && storeSlug) {
            navigate(`${storeBasePath(storeSlug)}/documents/new`, { replace: true });
          }
          initializedRef.current = false;
          editLoadedRef.current = false;
          setFormNonce((n) => n + 1);
        }}
      />

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>ประวัติการแก้ไข{savedDocNo ? ` — ${savedDocNo}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <Input placeholder="ค้นหา (action/note)" value={hSearch} onChange={(e) => setHSearch(e.target.value)} className="col-span-2" />
            <Select value={hAction} onValueChange={setHAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุก action</SelectItem>
                <SelectItem value="create">create</SelectItem>
                <SelectItem value="download">download</SelectItem>
                <SelectItem value="status_pending">status_pending</SelectItem>
                <SelectItem value="status_approved">status_approved</SelectItem>
                <SelectItem value="status_cancelled">status_cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={hFrom} onChange={(e) => setHFrom(e.target.value)} />
            <Input type="date" value={hTo} onChange={(e) => setHTo(e.target.value)} />
            <Input placeholder="ผู้แก้ไข" value={hActor} onChange={(e) => setHActor(e.target.value)} className="col-span-2 md:col-span-5" />
          </div>
          {(() => {
            const filtered = revisions.filter((r) => {
              if (hAction !== "all" && r.action !== hAction) return false;
              if (hSearch && !`${r.action} ${r.note ?? ""}`.toLowerCase().includes(hSearch.toLowerCase())) return false;
              if (hActor && !String(r.actor ?? "").toLowerCase().includes(hActor.toLowerCase())) return false;
              const ts = new Date(r.created_at).getTime();
              if (hFrom && ts < new Date(hFrom).getTime()) return false;
              if (hTo && ts > new Date(hTo).getTime() + 86399000) return false;
              return true;
            });
            if (revisions.length === 0) return <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ</p>;
            if (filtered.length === 0) return <p className="text-sm text-muted-foreground">ไม่พบรายการตามตัวกรอง</p>;
            return (
              <ul className="space-y-2 max-h-[55vh] overflow-auto mt-2">
                {filtered.map((r) => (
                  <li key={r.id} className="border border-border rounded-md p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{r.action}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("th-TH")}</span>
                    </div>
                    {r.actor && <p className="text-[11px] text-muted-foreground mt-1">โดย {String(r.actor).slice(0, 8)}…</p>}
                    {r.note && <p className="text-xs italic mt-1 border-l-2 border-border pl-2 text-foreground/80 whitespace-pre-line">{r.note}</p>}
                  </li>
                ))}
              </ul>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>

      {/* Always-mounted printable copy at root (outside print:hidden wrapper).
          This is the source of truth for window.print() — guarantees the
          document renders whether or not the Preview dialog is open. */}
      <div ref={printableRef} className="hidden print:block" aria-hidden="true">
        <BundlePrint
          store={store}
          state={{ ...state, paper_size: "A4" }}
          totals={totals}
          mainDocNo={savedDocNo}
          docs={bundleDocs}
          attachments={bundleAttachmentsWithPages}
          bundle={bundleSelection}
          templateConfig={resolvedTemplateCfg}
        />
      </div>

    </>
  );
}