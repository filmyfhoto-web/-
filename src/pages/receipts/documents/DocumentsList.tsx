import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { liveChannel } from "@/lib/realtimeChannel";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore, storeBasePath, useStoreSlug } from "../useStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import DocActivityDialog from "./DocActivityDialog";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { Eye, Pencil, Copy, Printer, Trash2, FileSpreadsheet, FileDown, RefreshCw, X, Undo2, ArrowRightLeft, History as HistoryIcon, MoreHorizontal, CloudUpload, AlertTriangle, RotateCw, FilePlus2, Ban, ChevronDown } from "lucide-react";
import DocumentPreview from "./DocumentPreview";
import { resolveInitialPrefs, type PrintPrefs } from "../lib/printPrefs";
import { downloadXlsx } from "@/lib/xlsx";
import { downloadCsv } from "@/lib/csv";
import { triggerSync, fetchDocumentFromSheets, type HeaderIssue } from "../lib/syncStub";
import { elementToPdfBlob, downloadBlob, zipAndDownload, mergeAndDownload, fitDocPrintToSinglePage } from "../lib/pdfUtils";
import { buildDocFilename, buildBundleFilename } from "../lib/docFilename";
import { DOC_TYPE_ORDER, DOC_TYPE_LABEL, resolveDocTheme, displayDocLabelForStore, docTypesForTab, visibleTabsForStore } from "../lib/docTheme";
import { docTypeTint } from "./docTypeTint";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast as sonnerToast } from "sonner";
import { tbl, rpc } from "../lib/tbl";
import { isInIframe, openPrintWindow, printViaCurrentDocument, printViaHiddenIframe } from "../lib/printWindow";
import {
  useIncompleteReceiptIds,
  isIncompleteReceipt,
  filterIncompleteReceipts,
  INCOMPLETE_TOOLTIP,
} from "@/lib/incompleteReceipts";

const LAST_TAB_KEY = (slug?: string) => `rds_docs_last_tab_${slug ?? "default"}`;
const FILTERS_KEY = (slug?: string) => `rds_docs_filters_${slug ?? "default"}`;
const PAGE_SIZE_KEY = (slug?: string) => `rds_docs_page_size_${slug ?? "default"}`;
const PAGE_INDEX_KEY = (slug?: string) => `rds_docs_page_idx_${slug ?? "default"}`;
const QUERY_DEBUG_KEY = (slug?: string) => `rds_docs_query_debug_${slug ?? "default"}`;
// Options exposed in the "จำนวนต่อหน้า" selector. `ทั้งหมด` uses a very high
// ceiling so we still bound the request and never OOM the browser.
const PAGE_SIZE_OPTIONS: { label: string; value: number }[] = [
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "200", value: 200 },
  { label: "500", value: 500 },
  { label: "1000", value: 1000 },
  { label: "ทั้งหมด", value: 100000 },
];
const DEFAULT_PAGE_SIZE = 200;
function readPageSize(slug?: string): number {
  try {
    const raw = localStorage.getItem(PAGE_SIZE_KEY(slug));
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch { /* noop */ }
  return DEFAULT_PAGE_SIZE;
}

type PersistedFilters = {
  status?: string;
  from?: string;
  to?: string;
  print?: string;
  sync?: string;
  internal?: string;
  q?: string;
  project?: string;
  type?: string;
};

function readPersistedFilters(slug?: string): PersistedFilters {
  try {
    // Prefer localStorage so filters survive across tabs/sessions. Fall back
    // to sessionStorage for backward compatibility with pre-existing users.
    const raw =
      localStorage.getItem(FILTERS_KEY(slug)) ??
      sessionStorage.getItem(FILTERS_KEY(slug));
    if (!raw) return {};
    return JSON.parse(raw) as PersistedFilters;
  } catch { return {}; }
}

const DOC_LABEL: Record<string, string> = {
  receipt: "ใบเสร็จรับเงิน",
  delivery: "ใบส่งของ",
  job_order: "ใบสั่งจ้าง",
  // Legacy only — kept so old rows still show a label in the list.
  invoice: "ใบแจ้งหนี้ (เลิกใช้)",
  quotation: "ใบเสนอราคา",
  tax_invoice: "ใบกำกับภาษี",
};

function SyncBadge({ status, label, at, error }: { status: string | null; label: string; at?: string | null; error?: string | null }) {
  const variant = status === "success" ? "default" : status === "failed" ? "destructive" : status === "pending" ? "secondary" : "outline";
  const text = status === "success" ? "✓" : status === "failed" ? "✕" : status === "pending" ? "…" : "—";
  const titleParts: string[] = [`${label}: ${status ?? "—"}`];
  if (at) titleParts.push(`เมื่อ ${new Date(at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}`);
  if (status === "failed" && error) titleParts.push(error);
  return (
    <Badge variant={variant as any} className="text-[10px] px-1.5 py-0" title={titleParts.join("\n")}>
      {label} {text}
    </Badge>
  );
}

function PrintStatusBadge({ status, at }: { status: string | null; at: string | null }) {
  const s = status || "not_printed";
  const map: Record<string, { variant: string; label: string }> = {
    not_printed: { variant: "outline", label: "ยังไม่พิมพ์" },
    printed: { variant: "default", label: "พิมพ์แล้ว" },
    print_error: { variant: "destructive", label: "พิมพ์ผิดพลาด" },
  };
  const m = map[s] ?? map.not_printed;
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={m.variant as any} className="text-[10px] px-1.5 py-0 w-fit">{m.label}</Badge>
      {at && <span className="text-[10px] text-muted-foreground">{new Date(at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>}
    </div>
  );
}

export default function DocumentsList() {
  const storeSlug = useStoreSlug();
  const { store } = useCurrentStore();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const _persistedInit = readPersistedFilters(storeSlug);
  const [search, setSearch] = useState(searchParams.get("q") ?? _persistedInit.q ?? "");
  const [debounced, setDebounced] = useState("");
  const [projectSearch, setProjectSearch] = useState(searchParams.get("project") ?? _persistedInit.project ?? "");
  const [projectDebounced, setProjectDebounced] = useState("");
  const [docType, setDocType] = useState<string>(() => {
    const fromUrl = searchParams.get("type");
    if (fromUrl) return fromUrl;
    if (_persistedInit.type) return _persistedInit.type;
    try {
      const stored =
        localStorage.getItem(LAST_TAB_KEY(storeSlug)) ??
        sessionStorage.getItem(LAST_TAB_KEY(storeSlug));
      if (stored) return stored;
    } catch { /* noop */ }
    return "all";
  });
  const _initFilters = {
    status: searchParams.get("status") ?? _persistedInit.status ?? "all",
    from: searchParams.get("from") ?? _persistedInit.from ?? "",
    to: searchParams.get("to") ?? _persistedInit.to ?? "",
    print: searchParams.get("print") ?? _persistedInit.print ?? "all",
    sync: searchParams.get("sync") ?? _persistedInit.sync ?? "all",
    internal: searchParams.get("internal") ?? _persistedInit.internal ?? "all",
  };
  const [status, setStatus] = useState<string>(_initFilters.status);
  const [from, setFrom] = useState(_initFilters.from);
  const [to, setTo] = useState(_initFilters.to);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<null | { id: string; no: string }>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);
  // (was: loadMoreSentinelRef for the infinite-scroll sentinel — removed
  // in favor of numbered pagination.)

  // Pagination — page-based. `page` is 0-indexed and drives a Postgres
  // `.range()` fetch, so users jump to any page directly without scrolling.
  // Both pageSize and page are persisted per-store in localStorage.
  const [pageSize, setPageSize] = useState<number>(() => readPageSize(storeSlug));
  const [page, setPage] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(PAGE_INDEX_KEY(storeSlug));
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch { return 0; }
  });
  useEffect(() => {
    try { localStorage.setItem(PAGE_SIZE_KEY(storeSlug), String(pageSize)); } catch { /* noop */ }
  }, [pageSize, storeSlug]);
  useEffect(() => {
    try { localStorage.setItem(PAGE_INDEX_KEY(storeSlug), String(page)); } catch { /* noop */ }
  }, [page, storeSlug]);

  const PRINT_PREFS_KEY = "rds-print-prefs:v1";
  const loadedPrefs = (() => {
    try { return JSON.parse(localStorage.getItem(PRINT_PREFS_KEY) || "{}"); } catch { return {}; }
  })();
  const [printPaper, setPrintPaper] = useState<"auto" | "A4" | "A5" | "80mm">(loadedPrefs.paper ?? "auto");
  const [printOrient, setPrintOrient] = useState<"portrait" | "landscape">(loadedPrefs.orient ?? "portrait");
  const [printTemplate, setPrintTemplate] = useState<"auto" | "delivery" | "quotation" | "receipt" | "tax_invoice">(loadedPrefs.template ?? "auto");
  const [defaultCopies, setDefaultCopies] = useState<number>(loadedPrefs.copies ?? 1);
  const [bulkProgress, setBulkProgress] = useState<null | { current: number; total: number; mode: "combined" | "each"; label?: string }>(null);
  function savePrintPrefs(p: Partial<{ paper: string; orient: string; template: string; copies: number }>) {
    try {
      const next = { ...loadedPrefs, ...p };
      localStorage.setItem(PRINT_PREFS_KEY, JSON.stringify(next));
    } catch { /* noop */ }
  }

  function getPrintableText(root: HTMLElement | null): string {
    if (!root) return "";
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[id="doc-print"], [data-doc-print]'));
    const source = blocks.length ? blocks : [root];
    return source.map((el) => el.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
  }

  async function waitForPrintAreaReady(root: HTMLElement): Promise<void> {
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
  }

  function getDirectPrintPrefs(ids: string[], copies = defaultCopies): PrintPrefs {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const first = ids.map((id) => byId.get(id)).find(Boolean) as any | undefined;
    const paper = printPaper === "auto"
      ? ((first?.paper_size as any) ?? "A4")
      : (printPaper as any);
    return {
      ...resolveInitialPrefs({
        paper,
        orient: printOrient,
        copies,
        fontScale: first?.font_scale != null ? Number(first.font_scale) : 1,
      }, first?.document_no ?? first?.id ?? null),
      paper,
      orient: printOrient,
      copies,
      printMode: "auto",
    };
  }

  function printIdsNow(ids: string[], mode: "combined" | "each" | "single" = "single", copies = defaultCopies) {
    if (!ids.length) {
      toast({ title: "เลือกเอกสารก่อน" });
      return;
    }
    // Single/combined path routes through the in-app Print Preview so users
    // land on the settings panel (paper, copies, margins, font scale) shown
    // in the design reference. Multi-doc selections carry `ids=` so the
    // preview can load every document and print them in one sequential
    // queue (no more blank Chrome dialog from the /print route).
    if (mode !== "each" && storeSlug) {
      const clamped = Math.max(1, Math.min(10, Math.round(copies || 1)));
      setDefaultCopies(clamped);
      savePrintPrefs({ copies: clamped });
      const params = new URLSearchParams();
      params.set("settings", "1");
      if (ids.length > 1) params.set("ids", ids.join(","));
      if (clamped > 1) params.set("copies", String(clamped));
      navigate(`${storeBasePath(storeSlug)}/documents/${ids[0]}/print-preview?${params.toString()}`);
      return;
    }
    const cfg = getDirectPrintPrefs(ids, copies);
    setDefaultCopies(copies);
    savePrintPrefs({ copies });
    const paper = printPaper === "auto" ? null : cfg.paper;
    const tmpl = printTemplate === "auto" ? null : printTemplate;
    if (mode === "each") {
      void runPrintSequential(ids, paper, cfg.orient, tmpl, cfg.copies, cfg);
    } else {
      void runPrint(ids, paper, cfg.orient, tmpl, cfg.copies, { prefs: cfg });
    }
  }
  const [printStatusFilter, setPrintStatusFilter] = useState<string>(_initFilters.print);
  const [syncStatusFilter, setSyncStatusFilter] = useState<string>(_initFilters.sync);
  // Staff/store-only internal sale classification filter.
  const [internalSaleFilter, setInternalSaleFilter] = useState<string>(_initFilters.internal);
  const [headerIssue, setHeaderIssue] = useState<HeaderIssue | null>(null);
  // Audit-log timeline dialog opened from a row's more-actions menu.
  const [activityDialog, setActivityDialog] = useState<null | { docId: string; docNo: string | null }>(null);

  // Group-by-customer view toggle (persisted in sessionStorage per store).
  const GROUP_KEY = (slug?: string) => `rds-docs-group-by-customer:${slug ?? ""}`;
  const [groupByCustomer, setGroupByCustomer] = useState<boolean>(() => {
    try { return sessionStorage.getItem(GROUP_KEY(storeSlug)) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(GROUP_KEY(storeSlug), groupByCustomer ? "1" : "0"); } catch { /* noop */ }
  }, [groupByCustomer, storeSlug]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Bulk "sync stuck" state — walks all pending/failed docs and re-uploads.
  const [bulkSyncBusy, setBulkSyncBusy] = useState(false);
  const [bulkSyncProgress, setBulkSyncProgress] = useState<{ done: number; total: number; ok: number; failed: number } | null>(null);
  // Per-file live status for the "ซิงก์ที่ค้าง" button. Latest first, capped to
  // the most recent 20 rows so the panel doesn't grow unbounded.
  const [bulkSyncItems, setBulkSyncItems] = useState<
    { docNo: string; status: "syncing" | "ok" | "failed"; error?: string }[]
  >([]);

  // Quick Open by document_no (+ Sheets recovery)
  const [quickOpenNo, setQuickOpenNo] = useState("");
  const [quickOpenBusy, setQuickOpenBusy] = useState(false);
  const [quickOpenMatches, setQuickOpenMatches] = useState<any[] | null>(null);
  const [sheetsRecover, setSheetsRecover] = useState<null | {
    no: string;
    header: Record<string, string>;
    items: Record<string, string>[];
    tab: string | null;
  }>(null);

  async function handleQuickOpen() {
    const no = quickOpenNo.trim();
    if (!no || !store?.id) return;
    setQuickOpenBusy(true);
    try {
      const { data, error } = await supabase
        .from(tbl("documents") as any)
        .select("id, document_no, document_type, customer_name, document_date, status, deleted_at")
        .eq("store_id", store.id)
        .ilike("document_no", `%${no}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const list = (data as any[]) ?? [];
      if (list.length === 1) {
        navigate(`${storeBasePath(storeSlug)}/documents/${list[0].id}/edit`);
        return;
      }
      if (list.length > 1) {
        setQuickOpenMatches(list);
        return;
      }
      // Not found — try Sheets recovery
      toast({ title: "ไม่พบในฐานข้อมูล", description: "กำลังค้นใน Google Sheets…" });
      const res = await fetchDocumentFromSheets(store.id, no);
      if (res.ok && res.header) {
        setSheetsRecover({ no, header: res.header, items: res.items, tab: res.tab });
      } else {
        toast({
          title: "ไม่พบเอกสาร",
          description: res.error || "ไม่พบทั้งในฐานข้อมูลและ Google Sheets",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "ค้นหาผิดพลาด", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setQuickOpenBusy(false);
    }
  }

  async function confirmRestoreFromSheets() {
    if (!sheetsRecover || !store?.id) return;
    try {
      const { data, error } = await supabase.rpc(tbl("restore_from_sheets") as any, {
        p_store_id: store.id,
        p_document_no: sheetsRecover.no,
        p_header: sheetsRecover.header as any,
        p_items: sheetsRecover.items as any,
      });
      if (error) throw error;
      toast({ title: "กู้เอกสารจาก Google Sheets สำเร็จ" });
      setSheetsRecover(null);
      setQuickOpenNo("");
      qc.invalidateQueries({ queryKey: ["rds_docs"] });
      if (data) navigate(`${storeBasePath(storeSlug)}/documents/${data}/edit`);
    } catch (e: any) {
      toast({ title: "กู้คืนไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    }
  }

  const templateConfigQ = useQuery({
    queryKey: ["rds_document_templates", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from(tbl("document_templates") as any)
        .select("template_key, header_text, footer_text")
        .eq("store_id", store!.id);
      const map: Record<string, { header_text: string; footer_text: string }> = {};
      ((data as any[]) ?? []).forEach((r) => {
        map[r.template_key] = { header_text: r.header_text ?? "", footer_text: r.footer_text ?? "" };
      });
      return map;
    },
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setProjectDebounced(projectSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [projectSearch]);

  // Sync `?q=` URL param ↔ search state (e.g. arriving from "ดูในรายการ" button)
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q && q !== search) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync `?type=` URL param → tab state (sidebar shortcuts).
  useEffect(() => {
    const t = searchParams.get("type") ?? "all";
    if (t !== docType) setDocType(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-trigger "sync all old docs → Drive" when arrived via
  // `?bulkSyncDriveAll=1` (from the Settings shortcut). Guarded so it fires
  // once per navigation, waits for the store/template config to be ready,
  // and clears the flag from the URL to avoid re-firing on refresh.
  const bulkAllTriggered = useRef(false);
  useEffect(() => {
    if (bulkAllTriggered.current) return;
    if (searchParams.get("bulkSyncDriveAll") !== "1") return;
    if (!store?.id || bulkSyncBusy) return;
    if (templateConfigQ.isLoading) return;
    bulkAllTriggered.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("bulkSyncDriveAll");
    setSearchParams(next, { replace: true });
    void syncStuck("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, searchParams, bulkSyncBusy, templateConfigQ.isLoading]);

  // Persist tab and reflect to URL so reload returns to the same category.
  useEffect(() => {
    try { localStorage.setItem(LAST_TAB_KEY(storeSlug), docType); } catch { /* noop */ }
    const next = new URLSearchParams(searchParams);
    const current = next.get("type") ?? "all";
    if (docType === "all") {
      if (current !== "all") next.delete("type");
      else return;
    } else if (current !== docType) {
      next.set("type", docType);
    } else {
      return;
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, storeSlug]);

  // Persist filters (search / project / date / status / print / sync / internal / type)
  // in localStorage so the user comes back to the same view across sessions.
  // URL params are still updated to keep deep links working.
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_KEY(storeSlug),
        JSON.stringify({
          status, from, to,
          print: printStatusFilter,
          sync: syncStatusFilter,
          internal: internalSaleFilter,
          q: search,
          project: projectSearch,
          type: docType,
        }),
      );
    } catch { /* noop */ }
    const next = new URLSearchParams(searchParams);
    const setOrDel = (k: string, v: string, def = "all") => {
      if (v && v !== def) next.set(k, v); else next.delete(k);
    };
    setOrDel("status", status);
    setOrDel("from", from, "");
    setOrDel("to", to, "");
    setOrDel("print", printStatusFilter);
    setOrDel("sync", syncStatusFilter);
    setOrDel("internal", internalSaleFilter);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, from, to, printStatusFilter, syncStatusFilter, internalSaleFilter, search, projectSearch, docType, storeSlug]);

  const listQ = useQuery({
    queryKey: ["rds_docs", store?.id, debounced, projectDebounced, docType, status, from, to, printStatusFilter, syncStatusFilter, internalSaleFilter, page, pageSize],
    enabled: !!store?.id,
    queryFn: async () => {
      const rangeFrom = page * pageSize;
      const rangeTo = rangeFrom + pageSize - 1;
      let q = supabase
        .from(tbl("documents") as any)
        .select("*")
        .eq("store_id", store!.id)
        .order("document_date", { ascending: false })
        .order("created_at", { ascending: false })
        // Page window — server-side pagination via .range() so the user
        // can jump straight to any page. countQ below drives the total.
        .range(rangeFrom, rangeTo);
      if (status === "trash") q = q.not("deleted_at", "is", null);
      else {
        q = q.is("deleted_at", null);
        if (status !== "all") q = q.eq("status", status);
      }
      if (docType !== "all") {
        const types = docTypesForTab(storeSlug, docType);
        if (types.length === 1) q = q.eq("document_type", types[0]);
        else q = q.in("document_type", types);
      }
      if (printStatusFilter !== "all") q = q.eq("print_status", printStatusFilter);
      if (internalSaleFilter !== "all") q = q.eq("internal_sale_type", internalSaleFilter);
      if (syncStatusFilter !== "all") {
        if (syncStatusFilter === "pending") {
          q = q.or("google_sheet_sync_status.is.null,google_sheet_sync_status.eq.pending,google_drive_sync_status.is.null,google_drive_sync_status.eq.pending");
        } else {
          q = q.or(`google_sheet_sync_status.eq.${syncStatusFilter},google_drive_sync_status.eq.${syncStatusFilter}`);
        }
      }
      if (from) q = q.gte("document_date", from);
      if (to) q = q.lte("document_date", to);
      if (debounced) {
        q = q.or(
          `document_no.ilike.%${debounced}%,customer_name.ilike.%${debounced}%,customer_phone.ilike.%${debounced}%,notes.ilike.%${debounced}%,project_name.ilike.%${debounced}%`,
        );
      }
      if (projectDebounced) {
        q = q.ilike("project_name", `%${projectDebounced}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  // True total for the current filter set (independent of fetchLimit). Used
  // to show "X / Y" and gate the load-more control so we never claim there
  // are more rows than actually exist.
  const countQ = useQuery({
    queryKey: ["rds_docs_count", store?.id, debounced, projectDebounced, docType, status, from, to, printStatusFilter, syncStatusFilter, internalSaleFilter],
    enabled: !!store?.id,
    queryFn: async () => {
      let q = supabase
        .from(tbl("documents") as any)
        .select("id", { count: "exact", head: true })
        .eq("store_id", store!.id);
      if (status === "trash") q = q.not("deleted_at", "is", null);
      else {
        q = q.is("deleted_at", null);
        if (status !== "all") q = q.eq("status", status);
      }
      if (docType !== "all") {
        const types = docTypesForTab(storeSlug, docType);
        if (types.length === 1) q = q.eq("document_type", types[0]);
        else q = q.in("document_type", types);
      }
      if (printStatusFilter !== "all") q = q.eq("print_status", printStatusFilter);
      if (internalSaleFilter !== "all") q = q.eq("internal_sale_type", internalSaleFilter);
      if (syncStatusFilter !== "all") {
        if (syncStatusFilter === "pending") {
          q = q.or("google_sheet_sync_status.is.null,google_sheet_sync_status.eq.pending,google_drive_sync_status.is.null,google_drive_sync_status.eq.pending");
        } else {
          q = q.or(`google_sheet_sync_status.eq.${syncStatusFilter},google_drive_sync_status.eq.${syncStatusFilter}`);
        }
      }
      if (from) q = q.gte("document_date", from);
      if (to) q = q.lte("document_date", to);
      if (debounced) {
        q = q.or(
          `document_no.ilike.%${debounced}%,customer_name.ilike.%${debounced}%,customer_phone.ilike.%${debounced}%,notes.ilike.%${debounced}%,project_name.ilike.%${debounced}%`,
        );
      }
      if (projectDebounced) q = q.ilike("project_name", `%${projectDebounced}%`);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
  const totalCount = countQ.data ?? 0;

  // Reset back to page 0 whenever any filter/tab/search or pageSize
  // changes — otherwise the user could sit on an out-of-range page.
  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, projectDebounced, docType, status, from, to, printStatusFilter, syncStatusFilter, internalSaleFilter, pageSize, store?.id]);

  // Snap page back into range once the count comes in (e.g. when filters
  // shrink the result set below the previously-viewed page).
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [pageCount, page]);

  // Runtime self-check: the visible page must never exceed the count query.
  // If it does, the two queries disagree on filters and rows would go missing.
  useEffect(() => {
    if (listQ.isLoading || countQ.isLoading) return;
    const fetched = listQ.data?.length ?? 0;
    if (fetched > pageSize) {
      console.warn("[DocumentsList] page window exceeded pageSize", { fetched, pageSize });
    }
    if (totalCount > 0 && fetched === 0 && page === 0) {
      console.warn("[DocumentsList] count > 0 but no rows returned — filter drift?", { totalCount });
    }
    // Expected rows on the current page window given the true total.
    const expected = Math.max(0, Math.min(pageSize, totalCount - page * pageSize));
    if (fetched !== expected) {
      console.warn("[DocumentsList] listQ/countQ mismatch", {
        page, pageSize, fetched, expected, totalCount,
      });
      setConsistencyIssue({ page, pageSize, fetched, expected, totalCount });
    } else {
      setConsistencyIssue(null);
    }
  }, [listQ.data, listQ.isLoading, countQ.isLoading, pageSize, totalCount, page]);

  // Latest listQ/countQ mismatch (null when in sync). Surfaced in the
  // Query Debug panel so QA can catch drift without opening devtools.
  const [consistencyIssue, setConsistencyIssue] = useState<
    null | { page: number; pageSize: number; fetched: number; expected: number; totalCount: number }
  >(null);

  // Query-debug panel visibility, persisted per-store. Off by default.
  const [showQueryDebug, setShowQueryDebug] = useState<boolean>(() => {
    try { return localStorage.getItem(QUERY_DEBUG_KEY(storeSlug)) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(QUERY_DEBUG_KEY(storeSlug), showQueryDebug ? "1" : "0"); } catch { /* noop */ }
  }, [showQueryDebug, storeSlug]);

  // Realtime
  useEffect(() => {
    if (!store?.id) return;
    const ch = liveChannel(`rds_docs_${store.id}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: tbl("documents"), filter: `store_id=eq.${store.id}` },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ["rds_docs", store.id] });
          const n = payload?.new;
          if (!n?.id) return;
          const label = DOC_LABEL[n.document_type] || n.document_type || "เอกสาร";
          sonnerToast.success(`สร้าง${label}สำเร็จ`, {
            description: `${n.document_no ?? ""}${n.customer_name ? ` · ${n.customer_name}` : ""}`,
            action: {
              label: "เปิดเอกสาร",
              onClick: () => navigate(`${storeBasePath(storeSlug)}/documents/${n.id}/edit`),
            },
          });
        }
      )
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: tbl("documents"), filter: `store_id=eq.${store.id}` },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ["rds_docs", store.id] });
          const o = payload?.old; const n = payload?.new;
          if (!n?.id || !o) return;
          if (o.status !== n.status) {
            sonnerToast(`เปลี่ยนสถานะ ${n.document_no ?? ""}`, {
              description: `${o.status ?? "—"} → ${n.status ?? "—"}`,
              action: {
                label: "เปิดเอกสาร",
                onClick: () => navigate(`${storeBasePath(storeSlug)}/documents/${n.id}/edit`),
              },
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [store?.id, qc, navigate, storeSlug]);

  const rows = listQ.data ?? [];

  // Incomplete tax_invoice/receipt (no items, or status draft/void). Shared
  // between list display, tab counts, row buttons, and bulk actions.
  const incompleteInfo = useIncompleteReceiptIds(store?.id);
  const isSkippableIncomplete = (r: { id?: string | null; document_type?: string | null } | null | undefined) =>
    !!r && isIncompleteReceipt(r, incompleteInfo);
  function filterIncomplete<T extends { id?: string | null; document_type?: string | null }>(list: T[]): { kept: T[]; skipped: number } {
    return filterIncompleteReceipts(list, incompleteInfo);
  }
  /** Combined skip: blocked delivery + incomplete receipt. Returns totals for toast. */
  function filterSkippable<T extends { id?: string | null; document_type?: string | null }>(list: T[]) {
    const a = filterBlockedDelivery(list);
    const b = filterIncompleteReceipts(a.kept, incompleteInfo);
    return {
      kept: b.kept,
      skippedDelivery: a.skipped,
      skippedIncomplete: b.skipped,
      total: a.skipped + b.skipped,
    };
  }
  function reportSkipped(deliverySkipped: number, incompleteSkipped: number) {
    if (deliverySkipped > 0) toast({ title: `ข้ามใบส่งของ ${deliverySkipped} ฉบับ`, description: blockedTooltip });
    if (incompleteSkipped > 0) toast({ title: `ข้ามเอกสารที่ยังไม่พร้อม ${incompleteSkipped} ฉบับ`, description: INCOMPLETE_TOOLTIP });
  }

  // Colorlab now supports full QT/DN/RC print flow like the printing store —
  // no print/download blocking rules remain.
  const isBlockedDelivery = (_r: { document_type?: string | null } | null | undefined) => false;
  const blockedTooltip = "";
  function filterBlockedDelivery<T extends { document_type?: string | null }>(list: T[]): { kept: T[]; skipped: number } {
    return { kept: list, skipped: 0 };
  }

  // Counts per document_type, honoring all OTHER active filters so the tab
  // badges reflect what the user would actually see if they switched tabs.
  const countsQ = useQuery({
    queryKey: [
      "rds_docs_counts",
      store?.id,
      debounced,
      projectDebounced,
      status,
      from,
      to,
      printStatusFilter,
      syncStatusFilter,
      internalSaleFilter,
    ],
    enabled: !!store?.id,
    queryFn: async () => {
      const types = ["all", ...DOC_TYPE_ORDER] as const;
      const results = await Promise.all(
        types.map(async (t) => {
          let q = supabase
            .from(tbl("documents") as any)
            .select("id", { count: "exact", head: true })
            .eq("store_id", store!.id);
          if (status === "trash") q = q.not("deleted_at", "is", null);
          else {
            q = q.is("deleted_at", null);
            if (status !== "all") q = q.eq("status", status);
          }
          if (t !== "all") q = q.eq("document_type", t);
          if (printStatusFilter !== "all") q = q.eq("print_status", printStatusFilter);
          if (internalSaleFilter !== "all") q = q.eq("internal_sale_type", internalSaleFilter);
          if (syncStatusFilter !== "all") {
            if (syncStatusFilter === "pending") {
              q = q.or("google_sheet_sync_status.is.null,google_sheet_sync_status.eq.pending,google_drive_sync_status.is.null,google_drive_sync_status.eq.pending");
            } else {
              q = q.or(`google_sheet_sync_status.eq.${syncStatusFilter},google_drive_sync_status.eq.${syncStatusFilter}`);
            }
          }
          if (from) q = q.gte("document_date", from);
          if (to) q = q.lte("document_date", to);
          if (debounced) {
            q = q.or(
              `document_no.ilike.%${debounced}%,customer_name.ilike.%${debounced}%,customer_phone.ilike.%${debounced}%,notes.ilike.%${debounced}%,project_name.ilike.%${debounced}%`,
            );
          }
          if (projectDebounced) q = q.ilike("project_name", `%${projectDebounced}%`);
          const { count } = await q;
          return [t, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(results) as Record<string, number>;
    },
  });
  const rawCounts = countsQ.data ?? {};
  // Colorlab merges receipt + tax_invoice (+ legacy invoice) into a single
  // "ใบเสร็จรับเงิน/ใบกำกับภาษี" bucket. Combine here so the tab badge shows
  // the total without double-counting the raw types.
  const mergedRawCounts = useMemo(() => {
    if (storeSlug !== "colorlab") return rawCounts;
    const out: Record<string, number> = { ...rawCounts };
    out["receipt_tax"] = (out["receipt"] ?? 0) + (out["tax_invoice"] ?? 0) + (out["invoice"] ?? 0);
    return out;
  }, [rawCounts, storeSlug]);
  // Baseline per-tab counts that ignore ALL secondary filters (search / print /
  // sync / internal / date / status) so we can show `n / N` and reveal when
  // hidden filters are cutting the list. Only respects deleted_at trash-toggle
  // and the store scope.
  const unfilteredCountsQ = useQuery({
    queryKey: ["rds_docs_counts_unfiltered", store?.id, status === "trash"],
    enabled: !!store?.id,
    queryFn: async () => {
      const types = ["all", ...DOC_TYPE_ORDER] as const;
      const results = await Promise.all(
        types.map(async (t) => {
          let q = supabase
            .from(tbl("documents") as any)
            .select("id", { count: "exact", head: true })
            .eq("store_id", store!.id);
          if (status === "trash") q = q.not("deleted_at", "is", null);
          else q = q.is("deleted_at", null);
          if (t !== "all") q = q.eq("document_type", t);
          const { count } = await q;
          return [t, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(results) as Record<string, number>;
    },
  });
  const unfilteredCounts = unfilteredCountsQ.data ?? {};
  const mergedUnfilteredCounts = useMemo(() => {
    if (storeSlug !== "colorlab") return unfilteredCounts;
    const out: Record<string, number> = { ...unfilteredCounts };
    out["receipt_tax"] = (out["receipt"] ?? 0) + (out["tax_invoice"] ?? 0) + (out["invoice"] ?? 0);
    return out;
  }, [unfilteredCounts, storeSlug]);
  // Subtract incomplete tax_invoice/receipt from the DB counts so tab badges
  // reflect exactly what's visible below.
  const counts = useMemo(() => {
    const out: Record<string, number> = { ...mergedRawCounts };
    const incTax = incompleteInfo.countByType["tax_invoice"] ?? 0;
    const incRec = incompleteInfo.countByType["receipt"] ?? 0;
    if (typeof out["tax_invoice"] === "number") out["tax_invoice"] = Math.max(0, out["tax_invoice"] - incTax);
    if (typeof out["receipt"] === "number") out["receipt"] = Math.max(0, out["receipt"] - incRec);
    if (typeof out["receipt_tax"] === "number") out["receipt_tax"] = Math.max(0, out["receipt_tax"] - incTax - incRec);
    if (typeof out["all"] === "number") out["all"] = Math.max(0, out["all"] - incTax - incRec);
    return out;
  }, [mergedRawCounts, incompleteInfo, storeSlug]);

  // Plain-language summary of currently-applied filters — shown in tab tooltip.
  const activeFilterParts: string[] = [];
  if (status !== "all") activeFilterParts.push(`สถานะ=${status === "trash" ? "ถังขยะ" : status}`);
  if (from) activeFilterParts.push(`ตั้งแต่ ${from}`);
  if (to) activeFilterParts.push(`ถึง ${to}`);
  if (debounced) activeFilterParts.push(`ค้นหา “${debounced}”`);
  if (projectDebounced) activeFilterParts.push(`โครงการ “${projectDebounced}”`);
  if (printStatusFilter !== "all") activeFilterParts.push(`การพิมพ์=${printStatusFilter}`);
  if (syncStatusFilter !== "all") activeFilterParts.push(`ซิงก์=${syncStatusFilter}`);
  if (internalSaleFilter !== "all") activeFilterParts.push(`ประเภทภายใน=${internalSaleFilter}`);
  const hasActiveFilters = activeFilterParts.length > 0;
  const filterSummary = hasActiveFilters ? activeFilterParts.join(" · ") : "ไม่มีตัวกรองพิเศษ";

  function clearAllFilters() {
    setStatus("all");
    setFrom("");
    setTo("");
    setSearch("");
    setProjectSearch("");
    setPrintStatusFilter("all");
    setSyncStatusFilter("all");
    setInternalSaleFilter("all");
    const next = new URLSearchParams(searchParams);
    ["q", "project", "status", "from", "to", "print", "sync", "internal"].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
    try { sessionStorage.removeItem(FILTERS_KEY(storeSlug)); } catch { /* noop */ }
  }

  function resetAll() {
    setDocType("all");
    setSelected(new Set());
    clearAllFilters();
    try { sessionStorage.removeItem(LAST_TAB_KEY(storeSlug)); } catch { /* noop */ }
    toast({ title: "รีเซ็ตแท็บและตัวกรองแล้ว", description: "กลับสู่ค่าเริ่มต้น (แสดงเอกสารทั้งหมด)" });
  }


  // Rows the user can see & interact with in the table/cards.
  // Every document that matches the active filters is listed — including
  // incomplete receipts and blocked deliveries. They are merely gated at
  // print/export time (and flagged in the row), never hidden, so the list
  // always matches the real document count.
  const visibleRows = rows;
  const allChecked = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(visibleRows.map((r) => r.id)));

  // Ordering for group-by-customer view: QT → invoice → DO → RC → tax_invoice.
  const GROUP_TYPE_ORDER: Record<string, number> = {
    quotation: 1, invoice: 2, delivery: 3, receipt: 4, tax_invoice: 5,
  };
  const groupedRows = useMemo(() => {
    if (!groupByCustomer) return null;
    const map = new Map<string, { key: string; label: string; rows: any[] }>();
    for (const r of visibleRows) {
      const key = (r.customer_id as string) || `n:${(r.customer_name ?? "").trim()}` || "unknown";
      const label = (r.customer_name && String(r.customer_name).trim()) || "— ไม่ระบุลูกค้า —";
      if (!map.has(key)) map.set(key, { key, label, rows: [] });
      map.get(key)!.rows.push(r);
    }
    const groups = Array.from(map.values());
    // Sort rows within each group by workflow order, then date desc.
    for (const g of groups) {
      g.rows.sort((a, b) => {
        const oa = GROUP_TYPE_ORDER[a.document_type] ?? 99;
        const ob = GROUP_TYPE_ORDER[b.document_type] ?? 99;
        if (oa !== ob) return oa - ob;
        return String(b.document_date ?? "").localeCompare(String(a.document_date ?? ""));
      });
    }
    // Sort groups: those with any activity today first, else by label.
    groups.sort((a, b) => a.label.localeCompare(b.label, "th"));
    return groups;
  }, [groupByCustomer, visibleRows]);

  function toggleGroup(key: string) {
    setCollapsedGroups((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  async function loadItems(docIds: string[]) {
    const { data, error } = await supabase
      .from(tbl("document_items") as any)
      .select("*")
      .in("document_id", docIds)
      .order("item_order");
    if (error) throw error;
    return (data as any[]) ?? [];
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    const { error } = await supabase.rpc(tbl("soft_delete_documents") as any, { p_ids: ids });
    if (error) {
      toast({ title: "ลบไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `ย้ายไป Trash ${ids.length} ฉบับแล้ว` });
    setSelected(new Set());
    setConfirmDelete(false);
    qc.invalidateQueries({ queryKey: ["rds_docs"] });
  }

  async function bulkRestore() {
    const ids = Array.from(selected);
    const { error } = await supabase.rpc(tbl("restore_documents") as any, { p_ids: ids });
    if (error) {
      toast({ title: "กู้คืนไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `กู้คืน ${ids.length} ฉบับแล้ว` });
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["rds_docs"] });
  }

  async function bulkExcel() {
    const { kept: keptRows, skippedDelivery, skippedIncomplete, total } = filterSkippable(selectedRows);
    reportSkipped(skippedDelivery, skippedIncomplete);
    if (keptRows.length === 0) {
      if (total > 0) toast({ title: "ไม่มีเอกสารที่พร้อมส่งออก", variant: "destructive" });
      return;
    }
    const ids = keptRows.map((r) => r.id);
    const items = await loadItems(ids);
    const docs = keptRows.map((r) => ({
      เลขที่: r.document_no,
      วันที่: r.document_date,
      ประเภท: DOC_LABEL[r.document_type] || r.document_type,
      ลูกค้า: r.customer_name,
      เบอร์โทร: r.customer_phone,
      เลขผู้เสียภาษี: r.customer_tax_id ?? "",
      ก่อน_VAT: Number(r.amount_before_vat),
      VAT: Number(r.vat_amount),
      ยอดรวม: Number(r.grand_total),
      หัก_ณ_ที่จ่าย: Number(r.withholding_tax_amount),
      สุทธิ: Number(r.net_total),
      สถานะ: r.status,
      Sheet_Sync: r.google_sheet_sync_status ?? "",
      Drive_Sync: r.google_drive_sync_status ?? "",
    }));
    const docNoById = new Map(keptRows.map((r) => [r.id, r.document_no]));
    const itemsRows = items.map((it: any) => ({
      เลขที่: docNoById.get(it.document_id) ?? it.document_id,
      ลำดับ: it.item_order,
      ชื่อ: it.name,
      รายละเอียด: it.description ?? "",
      ราคา: Number(it.price),
      จำนวน: Number(it.quantity),
      หน่วย: it.unit ?? "",
      ส่วนลดเปอร์เซ็นต์: Number(it.discount_percent),
      ส่วนลดบาท: Number(it.discount_amount),
      รวม: Number(it.line_total),
    }));
    downloadXlsx(`เอกสาร_${store?.slug}_${new Date().toISOString().slice(0, 10)}`, {
      เอกสาร: docs,
      รายการสินค้า: itemsRows,
    });
    toast({ title: `ส่งออก ${docs.length} ฉบับเป็น Excel แล้ว` });
  }

  async function bulkCsv() {
    const { kept: keptRows, skippedDelivery, skippedIncomplete, total } = filterSkippable(selectedRows);
    reportSkipped(skippedDelivery, skippedIncomplete);
    if (keptRows.length === 0) {
      if (total > 0) toast({ title: "ไม่มีเอกสารที่พร้อมส่งออก", variant: "destructive" });
      return;
    }
    const ids = keptRows.map((r) => r.id);
    const items = await loadItems(ids);
    const docNoById = new Map(keptRows.map((r) => [r.id, r.document_no]));
    const rowsOut: Record<string, any>[] = keptRows.flatMap<Record<string, any>>((r) => {
      const myItems = items.filter((it: any) => it.document_id === r.id);
      if (!myItems.length) {
        return [{
          เลขที่: r.document_no,
          วันที่: r.document_date,
          ประเภท: DOC_LABEL[r.document_type] || r.document_type,
          ลูกค้า: r.customer_name ?? "",
          เบอร์โทร: r.customer_phone ?? "",
          รายการ: "",
          จำนวน: "" as any,
          ราคา: "" as any,
          รวม_บรรทัด: "" as any,
          ยอดรวม: Number(r.grand_total),
          สุทธิ: Number(r.net_total),
          สถานะ: r.status,
        } as Record<string, any>];
      }
      return myItems.map<Record<string, any>>((it: any) => ({
        เลขที่: docNoById.get(it.document_id) ?? r.document_no,
        วันที่: r.document_date,
        ประเภท: DOC_LABEL[r.document_type] || r.document_type,
        ลูกค้า: r.customer_name ?? "",
        เบอร์โทร: r.customer_phone ?? "",
        รายการ: it.name,
        จำนวน: Number(it.quantity),
        ราคา: Number(it.price),
        รวม_บรรทัด: Number(it.line_total),
        ยอดรวม: Number(r.grand_total),
        สุทธิ: Number(r.net_total),
        สถานะ: r.status,
      }));
    });
    downloadCsv(`เอกสาร_${store?.slug}_${new Date().toISOString().slice(0, 10)}.csv`, rowsOut);
    toast({ title: `ส่งออก CSV ${rowsOut.length} แถวแล้ว` });
  }

  async function runPdf(
    ids: string[],
    paperOverride: string | null,
    orient: "portrait" | "landscape",
    templateOverride: string | null,
    prefs?: Partial<PrintPrefs>,
    /** How multiple documents are delivered: separate files (zip) or one merged PDF. */
    bundle: "zip" | "merged" = "zip",
  ) {
    toast({ title: "กำลังสร้าง PDF..." });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const requested = ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
    const { kept: docsToRender, skippedDelivery, skippedIncomplete, total } = filterSkippable(requested);
    reportSkipped(skippedDelivery, skippedIncomplete);
    if (docsToRender.length === 0) {
      if (total > 0) toast({ title: "ไม่มีเอกสารที่พร้อมส่งออก", variant: "destructive" });
      return;
    }
    ids = docsToRender.map((d) => d.id);
    const items = await loadItems(ids);
    const itemsByDoc = items.reduce((m: any, it: any) => {
      (m[it.document_id] ??= []).push(it);
      return m;
    }, {});
    const files: { name: string; blob: Blob }[] = [];
    for (const doc of docsToRender) {
      const div = document.createElement("div");
      div.style.position = "fixed";
      div.style.left = "-10000px";
      div.style.top = "0";
      document.body.appendChild(div);
      const { renderToStaticMarkup } = await import("react-dom/server");
      const React = await import("react");
      const renderDoc = templateOverride
        ? { ...doc, document_type: templateOverride }
        : doc;
      const renderState = docToFormState(renderDoc, itemsByDoc[doc.id] || []);
      const html = renderToStaticMarkup(
        React.createElement(DocumentPreview, {
          store,
          state: renderState,
          totals: docToTotals(doc),
          docNo: doc.document_no,
          templateConfig: templateConfigQ.data?.[renderState.template ?? "modern"],
        })
      );
      div.innerHTML = html;
      const el = div.querySelector("#doc-print") as HTMLElement;
      if (el) {
        const paper = paperOverride ?? doc.paper_size ?? "A4";
        const { renderPrintHtmlToPdfBlob } = await import("../lib/pdfUtils");
        const blob = await renderPrintHtmlToPdfBlob(el, {
          paper: paper as any,
          orient,
          margins: prefs?.margins,
          fontScale: prefs?.fontScale,
          fontScope: prefs?.fontScope,
          headerOnce: prefs?.headerOnce,
        });
        files.push({
          name: buildDocFilename({
            document_type: doc.document_type,
            document_no: doc.document_no,
            document_date: doc.document_date,
            customer_name: doc.customer_name,
            org_name: store?.name,
          }),
          blob,
        });
      }
      document.body.removeChild(div);
    }
    let saveResult: import("../lib/pdfUtils").SaveFileResult;
    if (files.length === 1) {
      const { saveBlobAsFile } = await import("../lib/pdfUtils");
      saveResult = await saveBlobAsFile(files[0].blob, files[0].name);
    } else if (bundle === "merged") {
      saveResult = await mergeAndDownload(files, buildBundleFilename(docsToRender as any[], "pdf"));
    } else {
      saveResult = await zipAndDownload(files, buildBundleFilename(docsToRender as any[], "zip"));
    }
    if (saveResult === "aborted") return;
    if (saveResult === "failed") {
      toast({ title: "บันทึกไฟล์ไม่สำเร็จ", description: "เบราว์เซอร์บล็อกการดาวน์โหลด กรุณาเปิดหน้านี้ในแท็บใหม่แล้วลองอีกครั้ง", variant: "destructive" });
      return;
    }
    if (saveResult === "tab") {
      toast({ title: `เปิดไฟล์ PDF ${files.length} ฉบับในแท็บใหม่`, description: "กดแชร์ → บันทึกลงในไฟล์ เพื่อเซฟลงเครื่อง" });
    } else {
      toast({ title: `ดาวน์โหลด PDF ${files.length} ฉบับสำเร็จ` });
    }
    // mark printed (PDF export counts as a printable output)
    try {
      await supabase.from(tbl("documents") as any).update({
        print_status: "printed",
        last_printed_at: new Date().toISOString(),
      }).in("id", ids);
      await supabase.from(tbl("activity_logs") as any).insert(
        ids.map((id) => ({ store_id: store!.id, action: "document_pdf_download", target_type: "document", target_id: id }))
      );
      qc.invalidateQueries({ queryKey: ["rds_docs"] });
    } catch { /* noop */ }
  }

  async function runPrint(
    ids: string[],
    paperOverride: string | null,
    orient: "portrait" | "landscape",
    templateOverride: string | null,
    copies: number = 1,
    opts: { silentProgress?: boolean; prefs?: Partial<PrintPrefs>; reservedPrintWindow?: Window | null } = {},
  ) {
    console.log("[runPrint] start", { ids, paperOverride, orient, templateOverride, copies });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const requested = ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
    const { kept: docsToRender, skippedDelivery, skippedIncomplete, total } = filterSkippable(requested);
    reportSkipped(skippedDelivery, skippedIncomplete);
    if (docsToRender.length === 0) {
      if (total > 0) toast({ title: "ไม่มีเอกสารที่พร้อมพิมพ์", variant: "destructive" });
      return;
    }
    ids = docsToRender.map((d) => d.id);
    console.log("[runPrint] docsToRender", docsToRender.length);
    const items = await loadItems(ids);
    const itemsByDoc = items.reduce((m: any, it: any) => {
      (m[it.document_id] ??= []).push(it);
      return m;
    }, {});
    if (!printAreaRef.current) {
      toast({ title: "พิมพ์ไม่สำเร็จ", description: "ไม่พบพื้นที่เอกสารสำหรับพิมพ์", variant: "destructive" });
      return;
    }
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");
    const firstDocPaper = docsToRender[0]?.paper_size ?? "A4";
    const resolvedPaper = paperOverride ?? firstDocPaper;
    const paperSizeStr =
      paperOverride === "A5" ? "A5"
      : paperOverride === "80mm" ? "80mm 200mm"
      : paperOverride === "A4" ? "A4"
      : resolvedPaper === "A5" ? "A5"
      : resolvedPaper === "80mm" ? "80mm 200mm"
      : "A4";
    const prefs = opts.prefs;
    const marginCss = prefs?.margins
      ? `${prefs.margins.top}mm ${prefs.margins.right}mm ${prefs.margins.bottom}mm ${prefs.margins.left}mm`
      : "0";
    const styleEl = document.createElement("style");
    styleEl.id = "rds-print-page-size";
    styleEl.textContent =
      `@page { size: ${paperSizeStr} ${orient}; margin: ${marginCss}; }\n` +
      (prefs?.headerOnce !== false
        ? `body.is-printing.header-once .doc-page:not([data-page-idx="1"]) .doc-header-group { display: none !important; }
           body.is-printing.header-once .doc-page:not([data-page-idx="1"]) { padding-top: 6mm !important; }`
        : "") +
      (prefs?.fontScale
        ? `#doc-print, .doc-print-document { --doc-font-scale: ${prefs.fontScale}; --doc-font-scope: ${prefs.fontScope ?? "content"}; }`
        : "");
    document.getElementById("rds-print-page-size")?.remove();
    document.head.appendChild(styleEl);
    const singleRun = docsToRender
      .map((doc, idx) => {
        const renderState = docToFormState(templateOverride ? { ...doc, document_type: templateOverride } : doc, itemsByDoc[doc.id] || []);
        return renderToStaticMarkup(
          React.createElement(
            "div",
            {
              className: "doc-print-document",
              "data-doc-id": doc.id,
              "data-doc-no": doc.document_no,
            "data-doc-print": "true",
              style: {
                pageBreakAfter: idx === docsToRender.length - 1 ? "auto" : "always",
                breakAfter: idx === docsToRender.length - 1 ? "auto" : "page",
              },
            },
            React.createElement(DocumentPreview, {
              store,
              state: renderState,
              totals: docToTotals(doc),
              docNo: doc.document_no,
              templateConfig: templateConfigQ.data?.[renderState.template ?? "modern"],
            })
          )
        );
      })
      .join("");
    const n = Math.max(1, Math.min(20, Math.floor(copies || 1)));
    // Render one complete selected-document bundle only. Copy count is handled
    // by the print helpers as a sequential afterprint-gated queue; duplicating
    // the HTML here would print copies × copies and lets layouts drift.
    const html = singleRun;
    printAreaRef.current.innerHTML = html;
    await waitForPrintAreaReady(printAreaRef.current);
    if (getPrintableText(printAreaRef.current).length < 10) {
      toast({ title: "พิมพ์ไม่สำเร็จ", description: "เอกสารสำหรับพิมพ์ว่างหรือยังโหลดไม่สมบูรณ์", variant: "destructive" });
      printAreaRef.current.innerHTML = "";
      document.getElementById("rds-print-page-size")?.remove();
      return;
    }
    if (!opts.silentProgress) {
      setBulkProgress({ current: 1, total: 1, mode: "combined", label: n > 1 ? `กำลังพิมพ์ ${ids.length} ฉบับ × ${n} ชุด` : `กำลังพิมพ์ ${ids.length} ฉบับ` });
    }
    // Preserve the user's scroll position so closing the print dialog
    // doesn't bounce the list back to the top.
    const savedScrollX = window.scrollX;
    const savedScrollY = window.scrollY;
    document.body.classList.add("is-printing");
    document.body.classList.add("is-printing-multi");
    if (prefs?.headerOnce !== false) document.body.classList.add("header-once");
    let cleanedUp = false;
    let beforePrintSeen = false;
    let afterPrintSeen = false;
    let helperPrintFallback: (() => boolean) | null = null;
    let markedPrinted = false;
    function onBeforePrint() { beforePrintSeen = true; }
    function onAfterPrint() { afterPrintSeen = true; markPrinted(); cleanup(); }
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      document.body.classList.remove("is-printing");
      document.body.classList.remove("is-printing-multi");
      document.body.classList.remove("header-once");
      document.getElementById("rds-print-page-size")?.remove();
      if (printAreaRef.current) printAreaRef.current.innerHTML = "";
      window.scrollTo(savedScrollX, savedScrollY);
      if (!opts.silentProgress) setBulkProgress(null);
    };
    const markPrinted = () => {
      if (markedPrinted) return;
      markedPrinted = true;
      (async () => {
        try {
          await supabase.from(tbl("documents") as any).update({
            print_status: "printed",
            last_printed_at: new Date().toISOString(),
          }).in("id", ids);
          await supabase.from(tbl("activity_logs") as any).insert(
            ids.map((id) => ({ store_id: store!.id, action: "document_print", target_type: "document", target_id: id }))
          );
          qc.invalidateQueries({ queryKey: ["rds_docs"] });
        } catch { /* noop */ }
      })();
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint, { once: true });
    // Safety net in case afterprint never fires (some in-app browsers).
    window.setTimeout(cleanup, 60_000);
    setTimeout(async () => {
      try {
        const docRoots = printAreaRef.current?.querySelectorAll<HTMLElement>("#doc-print");
        docRoots?.forEach((r) => fitDocPrintToSinglePage(r, paperOverride ?? r.dataset.paper ?? "A4"));
      } catch { /* noop */ }
      try {
        console.log("[runPrint] dispatch print", { mode: prefs?.printMode ?? "auto", inIframe: isInIframe() });
        const paper = paperSizeStr; // already in "A4" | "A5" | "80mm 200mm"
        const bodyHtml = printAreaRef.current?.innerHTML ?? "";
        const printOpts = {
          bodyHtml,
          sourceEl: printAreaRef.current ?? undefined,
          paperSize: paper,
          orient,
          bodyClass: "is-printing is-printing-multi",
          copies,
          margins: prefs?.margins,
          headerOnce: prefs?.headerOnce !== false,
          fontScale: prefs?.fontScale,
          fontScope: prefs?.fontScope,
          manualPrintToolbar: true,
          onPrintDispatched: () => {
            beforePrintSeen = true;
            markPrinted();
          },
          onPrintFailed: (reason: string) => {
            toast({ title: "พิมพ์ไม่สำเร็จ", description: reason, variant: "destructive" });
          },
          onAfterPrint: () => { afterPrintSeen = true; markPrinted(); cleanup(); },
        };
        helperPrintFallback = () => {
          if (isInIframe()) {
            return !!openPrintWindow(printOpts, opts.reservedPrintWindow) || printViaHiddenIframe(printOpts);
          }
          return printViaHiddenIframe(printOpts) || !!openPrintWindow(printOpts, opts.reservedPrintWindow);
        };
        const mode = prefs?.printMode ?? "auto";
        const tryNative = () => printViaCurrentDocument(printOpts);
        let dispatched = false;
        if (mode === "native") {
          dispatched = await tryNative();
        } else if (mode === "popup") {
          dispatched = !!openPrintWindow(printOpts, opts.reservedPrintWindow);
        } else if (mode === "iframe") {
          dispatched = printViaHiddenIframe(printOpts);
        } else {
          // Auto: on PC / top-level tab, use Chrome's native
          // window.print() dialog directly. No popup, no hidden iframe.
          // Fallback chain only runs inside an iframe.
          if (!isInIframe()) {
            dispatched = await tryNative();
          } else {
            dispatched = !!openPrintWindow(printOpts, opts.reservedPrintWindow);
            if (!dispatched) dispatched = printViaHiddenIframe(printOpts);
          }
        }
        if (!dispatched) {
          toast({ title: "พิมพ์ไม่สำเร็จ", description: "เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาเลือกโหมด Popup หรืออนุญาต popup", variant: "destructive" });
          cleanup();
          return;
        }
        window.setTimeout(() => {
          if (beforePrintSeen || afterPrintSeen || markedPrinted) return;
          // On PC/top-level tabs stick with native print; only try
          // helper fallbacks when we're inside an iframe.
          const fallbackDispatched = isInIframe()
            ? (helperPrintFallback?.() ?? false)
            : false;
          if (!fallbackDispatched) {
            toast({ title: "พิมพ์ไม่สำเร็จ", description: "ไม่สามารถเปิดหน้าต่างพิมพ์ได้", variant: "destructive" });
            cleanup();
          }
        }, 4000);
      } catch (err: any) {
        toast({ title: "พิมพ์ไม่สำเร็จ", description: err?.message ?? "", variant: "destructive" });
        cleanup();
        return;
      }
    }, 250);
  }

  async function runPrintSequential(
    ids: string[],
    paperOverride: string | null,
    orient: "portrait" | "landscape",
    templateOverride: string | null,
    copies: number = 1,
    prefs?: Partial<PrintPrefs>,
  ) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const requested = ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
    const { kept, skippedDelivery, skippedIncomplete, total } = filterSkippable(requested);
    reportSkipped(skippedDelivery, skippedIncomplete);
    if (kept.length === 0) {
      if (total > 0) toast({ title: "ไม่มีเอกสารที่พร้อมพิมพ์", variant: "destructive" });
      return;
    }
    ids = kept.map((d) => d.id);
    setBulkProgress({ current: 0, total: ids.length, mode: "each" });
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const docNo = rows.find((r) => r.id === id)?.document_no ?? "";
      setBulkProgress({ current: i + 1, total: ids.length, mode: "each", label: `กำลังพิมพ์ ${docNo} (${i + 1}/${ids.length})` });
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          window.removeEventListener("afterprint", finish);
          resolve();
        };
        window.addEventListener("afterprint", finish);
        // safety: ถ้า afterprint ไม่ยิง (บาง in-app browser) ปิดให้เอง
        window.setTimeout(finish, 15000);
        runPrint([id], paperOverride, orient, templateOverride, copies, { silentProgress: true, prefs });
      });
      toast({ title: `พิมพ์ ${docNo || "เอกสาร"} เสร็จแล้ว` });
      // เว้นจังหวะให้ browser คืนค่าก่อนเปิด print ครั้งถัดไป
      await new Promise((r) => setTimeout(r, 400));
    }
    setBulkProgress(null);
    toast({ title: `สั่งพิมพ์ ${ids.length} ฉบับเสร็จสิ้น` });
  }

  async function exportRowExcel(doc: any) {
    if (isBlockedDelivery(doc)) {
      toast({ title: "ไม่สามารถส่งออกใบส่งของของร้านนี้", description: blockedTooltip, variant: "destructive" });
      return;
    }
    if (isSkippableIncomplete(doc)) {
      toast({ title: "เอกสารยังไม่พร้อมส่งออก", description: INCOMPLETE_TOOLTIP, variant: "destructive" });
      return;
    }
    const items = await loadItems([doc.id]);
    const docRow = {
      เลขที่: doc.document_no,
      วันที่: doc.document_date,
      ประเภท: DOC_LABEL[doc.document_type] || doc.document_type,
      ลูกค้า: doc.customer_name ?? "",
      เบอร์โทร: doc.customer_phone ?? "",
      เลขผู้เสียภาษี: doc.customer_tax_id ?? "",
      ก่อน_VAT: Number(doc.amount_before_vat),
      VAT: Number(doc.vat_amount),
      ยอดรวม: Number(doc.grand_total),
      หัก_ณ_ที่จ่าย: Number(doc.withholding_tax_amount),
      สุทธิ: Number(doc.net_total),
    };
    const itemRows = items.map((it: any) => ({
      ลำดับ: it.item_order,
      ชื่อ: it.name,
      รายละเอียด: it.description ?? "",
      ราคา: Number(it.price),
      จำนวน: Number(it.quantity),
      หน่วย: it.unit ?? "",
      ส่วนลดเปอร์เซ็นต์: Number(it.discount_percent ?? 0),
      ส่วนลดบาท: Number(it.discount_amount ?? 0),
      รวม: Number(it.line_total),
    }));
    downloadXlsx(`${doc.document_no}`, { เอกสาร: [docRow], รายการ: itemRows });
    toast({ title: "ดาวน์โหลด Excel สำเร็จ" });
  }

  async function convertToReceipt(doc: any) {
    if (doc.document_type !== "delivery") return;
    try {
      const items = await loadItems([doc.id]);
      sessionStorage.setItem("rds_copy_doc", JSON.stringify({
        doc: { ...doc, document_type: "receipt" },
        items,
      }));
      window.location.href = `${storeBasePath(storeSlug)}/documents/new?copy=1`;
    } catch (e: any) {
      toast({ title: "แปลงไม่สำเร็จ", description: e.message, variant: "destructive" });
    }
  }

  async function syncBulk(target: "sheet" | "drive") {
    const ids = Array.from(selected);
    try {
      const r = await triggerSync(ids, target);
      if (r.skipped?.length) {
        toast({ title: `ข้าม ${r.skipped.length} รายการที่กำลังซิงค์อยู่`, description: "รอให้รอบก่อนหน้าจบก่อนค่อยกดใหม่" });
        if (!r.failed.length && r.skipped.length === ids.length) return;
      }
      if (r.headerIssue) {
        setHeaderIssue(r.headerIssue);
        toast({ title: "หัวคอลัมน์ Google Sheet ไม่ตรง", description: "คลิกดูรายละเอียดเพื่อแก้คอลัมน์ที่ต่างกัน", variant: "destructive" });
      } else if (r.ok) {
        toast({ title: `Sync ${target === "sheet" ? "Google Sheets" : "Google Drive"} สำเร็จ` });
      } else {
        toast({ title: `Sync ${target} ล้มเหลว`, description: r.errors.slice(0, 2).join(" · ") || undefined, variant: "destructive" });
      }
    } catch {
      toast({ title: `Sync ${target} ไม่สำเร็จ`, variant: "destructive" });
    }
    qc.invalidateQueries({ queryKey: ["rds_docs"] });
  }

  async function syncOne(docId: string, target: "sheet" | "drive") {
    try {
      const r = await triggerSync([docId], target);
      if (r.skipped?.length) {
        toast({ title: "รายการนี้กำลังซิงค์อยู่", description: "กรุณารอสักครู่ก่อนกดซ้ำ" });
        return;
      }
      if (r.headerIssue) {
        setHeaderIssue(r.headerIssue);
        toast({ title: "หัวคอลัมน์ Google Sheet ไม่ตรง", description: "คลิกดูรายละเอียดเพื่อแก้คอลัมน์ที่ต่างกัน", variant: "destructive" });
      } else if (r.ok) {
        toast({ title: "Sync สำเร็จ" });
      } else {
        toast({ title: "Sync ไม่สำเร็จ", description: r.errors.slice(0, 2).join(" · ") || undefined, variant: "destructive" });
      }
    } catch {
      toast({ title: "Sync ไม่สำเร็จ", variant: "destructive" });
    }
    qc.invalidateQueries({ queryKey: ["rds_docs"] });
  }

  // Render the doc PDF in-browser then upload to Drive via the edge function.
  async function syncDriveRow(doc: any) {
    if (!store) return;
    try {
      toast({ title: `กำลังเตรียม PDF ${doc.document_no}…` });
      const items = await loadItems([doc.id]);
      const state = docToFormState(doc, items);
      const totals = docToTotals(doc);
      const { renderDocToPdfBase64 } = await import("../lib/pdfUtils");
      const pdf64 = await renderDocToPdfBase64(store, state, totals, doc.document_no, doc.paper_size, "portrait", true, templateConfigQ.data?.[state.template ?? "modern"]);
      if (!pdf64) throw new Error("เตรียม PDF ไม่สำเร็จ");
      const r = await triggerSync([doc.id], "drive", { [doc.id]: pdf64 });
      if (r.ok) toast({ title: "อัปโหลดเข้า Google Drive สำเร็จ" });
      else toast({ title: "อัปโหลดล้มเหลว — ลองอีกครั้งหรือดูประวัติ", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "อัปโหลดไม่สำเร็จ", description: e?.message ?? "", variant: "destructive" });
    }
    qc.invalidateQueries({ queryKey: ["rds_docs"] });
  }

  // Bulk: sync every doc in the current filter that is missing on Drive or has
  // pending/failed status. Renders each PDF client-side then reuses triggerSync.
  // When scope === "all", ignores the current visible list and pulls every
  // non-deleted document from the DB whose drive file is missing so old
  // records that were saved before the Drive integration can be backfilled.
  async function syncStuck(scope: "visible" | "all" = "visible") {
    if (!store) return;
    let candidates: any[] = [];
    if (scope === "all") {
      // Fetch every non-deleted doc for this store missing a Drive file id.
      // Paged in chunks of 500 to be safe with PostgREST default limits.
      const pageSize = 500;
      let from = 0;
      // Loading toast so the user knows we're gathering the queue.
      toast({ title: "กำลังรวบรวมเอกสารเก่าที่ยังไม่ได้ขึ้น Drive…" });
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from(tbl("documents") as any)
          .select("*")
          .eq("store_id", store.id)
          .is("deleted_at", null)
          .is("google_drive_file_id", null)
          .order("document_date", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) {
          toast({ title: "โหลดรายการเอกสารไม่สำเร็จ", description: error.message, variant: "destructive" });
          return;
        }
        const chunk = (data as any[]) ?? [];
        candidates.push(...chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
      }
    } else {
      candidates = visibleRows.filter((r: any) => {
        const st = r.google_drive_sync_status;
        return !r.google_drive_file_id || st === "pending" || st === "failed" || !st;
      });
    }
    // Optional disjoint batches let a long backfill run in parallel browser workers
    // without changing the normal one-click behavior.
    if (scope === "all") {
      const offset = Math.max(0, Number(searchParams.get("bulkSyncOffset") ?? 0) || 0);
      const limitParam = Number(searchParams.get("bulkSyncLimit") ?? 0) || 0;
      const worker = Math.max(0, Number(searchParams.get("bulkSyncWorker") ?? 0) || 0);
      const workers = Math.max(0, Number(searchParams.get("bulkSyncWorkers") ?? 0) || 0);
      if (workers > 1) candidates = candidates.filter((_, index) => index % workers === worker % workers);
      if (offset || limitParam) candidates = candidates.slice(offset, limitParam > 0 ? offset + limitParam : undefined);
    }
    if (!candidates.length) {
      toast({ title: scope === "all" ? "ไม่มีเอกสารเก่าที่ต้องอัปโหลดเข้า Drive" : "ไม่มีเอกสารค้างซิงก์ในรายการนี้" });
      return;
    }
    // Preflight: ตรวจการเข้าถึง Sheets + Drive ก่อนยิงหลายๆ ครั้ง จะได้
    // ไม่วนขึ้น 404/403 เต็มหน้าจอ
    try {
      const { data: pre } = await supabase.functions.invoke("rds-google-sync", {
        body: { mode: "test_access", store_id: store.id },
      });
      if (pre && (pre as any).ok === false) {
        const sheetMsg = (pre as any).sheet?.error || (pre as any).sheet?.code;
        const driveMsg = (pre as any).drive?.error || (pre as any).drive?.code;
        toast({
          title: "หยุดก่อนซิงก์ — ตรวจการเข้าถึงไม่ผ่าน",
          description: [sheetMsg && `Sheets: ${sheetMsg}`, driveMsg && `Drive: ${driveMsg}`].filter(Boolean).join(" · ") || "ดูรายละเอียดในหน้า Settings",
          variant: "destructive",
        });
        return;
      }
    } catch { /* ถ้า preflight พังเอง ปล่อยผ่านไป bulk เดิมจะจับ error รายไฟล์ */ }
    setBulkSyncBusy(true);
    setBulkSyncProgress({ done: 0, total: candidates.length, ok: 0, failed: 0 });
    setBulkSyncItems([]);
    const { renderDocToPdfBase64 } = await import("../lib/pdfUtils");
    const failList: string[] = [];
    const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          window.setTimeout(() => reject(new Error(`${label} ใช้เวลานานเกิน ${Math.round(timeoutMs / 1000)} วินาที`)), timeoutMs);
        }),
      ]);
    const validatePdf = async (base64: string): Promise<void> => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const parsed = await PDFDocument.load(bytes);
      if (parsed.getPageCount() < 1) throw new Error("PDF ไม่มีหน้าเอกสาร");
    };
    // Sequential to avoid PDF render/GPU contention. A bad/stuck document must
    // fail by itself so the rest of the backfill queue can continue.
    for (const doc of candidates) {
      setBulkSyncItems((xs) => [{ docNo: doc.document_no, status: "syncing" as const }, ...xs].slice(0, 20));
      try {
        const items = await loadItems([doc.id]);
        const state = docToFormState(doc, items);
        const totals = docToTotals(doc);
        const pdf64 = await withTimeout(
          renderDocToPdfBase64(
            store, state, totals, doc.document_no, doc.paper_size, "portrait", true,
            templateConfigQ.data?.[state.template ?? "modern"],
            // Bulk backfill favors throughput while retaining readable PDF output.
            // A single broken image is bounded by the renderer and outer timeout.
            { scale: 1, imageTimeoutMs: 3_000 },
          ),
          45_000,
          "การสร้าง PDF",
        );
        if (!pdf64) throw new Error("สร้าง PDF ไม่สำเร็จ");
        await withTimeout(validatePdf(pdf64), 10_000, "การตรวจ PDF");
        const r = await withTimeout(
          triggerSync([doc.id], "both", { [doc.id]: pdf64 }, "document_full"),
          75_000,
          "การอัปโหลดเอกสาร",
        );
        if (!r.ok) throw new Error(r.errors[0] ?? "ซิงก์ไม่สำเร็จ");
        setBulkSyncProgress((p) => p && ({ ...p, done: p.done + 1, ok: p.ok + 1 }));
        setBulkSyncItems((xs) => xs.map((x, i) => i === 0 ? { ...x, status: "ok" } : x));
      } catch (e: any) {
        failList.push(`${doc.document_no}: ${e?.message ?? "error"}`);
        setBulkSyncProgress((p) => p && ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
        setBulkSyncItems((xs) => xs.map((x, i) => i === 0 ? { ...x, status: "failed", error: e?.message ?? "error" } : x));
      }
    }
    setBulkSyncBusy(false);
    qc.invalidateQueries({ queryKey: ["rds_docs"] });
    if (failList.length === 0) toast({ title: `ซิงก์สำเร็จ ${candidates.length} ฉบับ` });
    else toast({ title: `ซิงก์เสร็จ (สำเร็จ ${candidates.length - failList.length}/${candidates.length})`, description: failList.slice(0, 3).join(" · "), variant: failList.length === candidates.length ? "destructive" : "default" });
  }

  async function openPreview(doc: any) {
    // Row Eye button — always route to full-page print preview with the
    // settings panel open. Native print / dialog preview are no longer
    // triggered from the list itself; users configure & print from there.
    navigate(`${storeBasePath(storeSlug)}/documents/${doc.id}/print-preview?settings=1`);
  }

  function goPrintPreview(doc: any) {
    navigate(`${storeBasePath(storeSlug)}/documents/${doc.id}/print-preview?settings=1`);
  }

  async function copyDoc(doc: any) {
    // Quick copy: just open new doc page (data carried via sessionStorage)
    const items = await loadItems([doc.id]);
    sessionStorage.setItem("rds_copy_doc", JSON.stringify({ doc, items }));
    window.location.href = `${storeBasePath(storeSlug)}/documents/new?copy=1`;
  }

  return (
    <>
    <div className="space-y-4 max-w-7xl print:hidden">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">จัดการเอกสาร</h1>
          <p className="text-sm text-muted-foreground">{store?.name}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <Link to={`${storeBasePath(storeSlug)}/sync-history`}>ประวัติสำรอง</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`${storeBasePath(storeSlug)}/documents/sheet-template`}>เทมเพลต Google Sheets</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid="new-doc-menu">
                <FilePlus2 className="h-4 w-4 mr-1.5" />
                สร้างเอกสารใหม่
                <ChevronDown className="h-4 w-4 ml-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {[
                { type: "quotation", label: "+ ใบเสนอราคา" },
              ].map((it) => (
                <DropdownMenuItem key={it.type} asChild>
                  <Link
                    to={`${storeBasePath(storeSlug)}/documents/new?type=${it.type}`}
                    data-testid={`new-doc-${it.type}`}
                  >
                    {it.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Document-type tabs with theme-colored underline */}
      <Card className="p-2 overflow-x-auto">
        <div className="px-2 pt-1 pb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            ตัวเลขในแท็บสอดคล้องกับตัวกรองด้านล่าง · ทางลัดในแถบข้างนับเอกสารทั้งหมดของหมวด
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={resetAll}
            disabled={!hasActiveFilters && docType === "all"}
            title="คืนค่าแท็บและตัวกรองทั้งหมดเป็นค่าเริ่มต้น"
            className="h-7 text-xs shrink-0"
          >
            <RotateCw className="h-3.5 w-3.5 mr-1" />
            รีเซ็ตแท็บและตัวกรอง
          </Button>
        </div>
        <div role="tablist" aria-label="ประเภทเอกสาร" className="flex items-stretch gap-1 min-w-max">

          {(["all", ...visibleTabsForStore(storeSlug)] as const)
            .filter((t) => {
              if (t === "all") return true;
              if (t === docType) return true; // active tab always visible
              const c = counts[t];
              if (typeof c !== "number") return true; // loading — keep to avoid flicker
              return c > 0;
            })
            .map((t) => {
            const isAll = t === "all";
            const label = isAll ? "ทั้งหมด" : displayDocLabelForStore(storeSlug, t);
            const color = isAll ? "hsl(var(--foreground))" : resolveDocTheme(t, store).header || "hsl(var(--foreground))";
            const active = docType === t;
            const count = counts[t];
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                onClick={() => { setDocType(t); setSelected(new Set()); }}
                className={`relative px-3 py-2 text-sm whitespace-nowrap rounded-md transition-colors flex items-center gap-2 border-b-[3px] ${active ? "font-semibold" : "text-muted-foreground hover:text-foreground"}`}
                style={{
                  borderBottomColor: active ? color : "transparent",
                  backgroundColor: active ? `color-mix(in srgb, ${color} 10%, transparent)` : undefined,
                  color: active ? color : undefined,
                }}
                data-testid={`doc-type-tab-${t}`}
              >
                {!isAll && (
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                )}
                <span>{label}</span>
                {typeof count === "number" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded-full cursor-help"
                        style={{
                          backgroundColor: active ? color : "hsl(var(--muted))",
                          color: active ? "white" : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {typeof mergedUnfilteredCounts[t] === "number" && mergedUnfilteredCounts[t] !== count
                          ? `${count} / ${mergedUnfilteredCounts[t]}`
                          : count}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[260px]">
                      <div className="font-medium mb-0.5">นับตามตัวกรองปัจจุบัน</div>
                      <div className="text-muted-foreground">{filterSummary}</div>
                      {typeof mergedUnfilteredCounts[t] === "number" && mergedUnfilteredCounts[t] !== count && (
                        <div className="mt-1 text-muted-foreground">
                          ทั้งหมดในหมวดนี้: <b>{mergedUnfilteredCounts[t]}</b> · ถูกซ่อนโดยตัวกรอง: <b>{Math.max(0, mergedUnfilteredCounts[t] - count)}</b>
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {hasActiveFilters && (
        <Card className="p-2.5 border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-amber-800 dark:text-amber-200 mr-1">
              ตัวกรองที่เปิดอยู่ (ทำให้บางเอกสารถูกซ่อน):
            </span>
            {status !== "all" && (
              <Badge variant="secondary" className="gap-1 pr-1">
                สถานะ: {status === "trash" ? "ถังขยะ" : status}
                <button aria-label="ล้างสถานะ" onClick={() => setStatus("all")} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {from && (
              <Badge variant="secondary" className="gap-1 pr-1">
                ตั้งแต่ {from}
                <button aria-label="ล้างวันเริ่ม" onClick={() => setFrom("")} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {to && (
              <Badge variant="secondary" className="gap-1 pr-1">
                ถึง {to}
                <button aria-label="ล้างวันสิ้นสุด" onClick={() => setTo("")} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {debounced && (
              <Badge variant="secondary" className="gap-1 pr-1">
                ค้นหา: “{debounced}”
                <button aria-label="ล้างค้นหา" onClick={() => {
                  setSearch("");
                  const next = new URLSearchParams(searchParams); next.delete("q"); setSearchParams(next, { replace: true });
                }} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {projectDebounced && (
              <Badge variant="secondary" className="gap-1 pr-1">
                โครงการ: “{projectDebounced}”
                <button aria-label="ล้างโครงการ" onClick={() => {
                  setProjectSearch("");
                  const next = new URLSearchParams(searchParams); next.delete("project"); setSearchParams(next, { replace: true });
                }} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {printStatusFilter !== "all" && (
              <Badge variant="secondary" className="gap-1 pr-1">
                การพิมพ์: {printStatusFilter}
                <button aria-label="ล้างสถานะการพิมพ์" onClick={() => setPrintStatusFilter("all")} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {syncStatusFilter !== "all" && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Sync: {syncStatusFilter}
                <button aria-label="ล้างสถานะซิงก์" onClick={() => setSyncStatusFilter("all")} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            {internalSaleFilter !== "all" && (
              <Badge variant="secondary" className="gap-1 pr-1">
                ประเภทภายใน: {internalSaleFilter}
                <button aria-label="ล้างประเภทภายใน" onClick={() => setInternalSaleFilter("all")} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            )}
            <div className="ml-auto">
              <Button size="sm" variant="outline" onClick={clearAllFilters} className="h-7">
                <X className="h-3.5 w-3.5 mr-1" />
                ล้างตัวกรองทั้งหมด
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4 grid md:grid-cols-5 gap-3">
        <div className="md:col-span-5 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center pb-2 border-b">
          <Label className="text-xs whitespace-nowrap text-muted-foreground">เปิดเอกสารจากเลขที่:</Label>
          <div className="flex gap-2 flex-1">
            <Input
              placeholder="พิมพ์เลขเอกสาร เช่น DN-2569-0042 แล้วกด Enter"
              value={quickOpenNo}
              onChange={(e) => setQuickOpenNo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleQuickOpen(); } }}
              disabled={quickOpenBusy}
              className="flex-1"
            />
            <Button onClick={handleQuickOpen} disabled={quickOpenBusy || !quickOpenNo.trim()} size="sm">
              {quickOpenBusy ? "กำลังค้น…" : "เปิด"}
            </Button>
          </div>
          <span className="text-[11px] text-muted-foreground">หากไม่พบในระบบ จะลองดึงจาก Google Sheets ให้</span>
        </div>
        <div className="md:col-span-2">
          <Input
            placeholder="ค้นหาเลขที่ / ลูกค้า / เบอร์ / ชื่อโครงการ"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set("q", e.target.value); else next.delete("q");
              setSearchParams(next, { replace: true });
            }}
          />
        </div>
        <div>
          <Input
            placeholder="ค้นหาชื่อโครงการเท่านั้น"
            value={projectSearch}
            onChange={(e) => {
              setProjectSearch(e.target.value);
              const next = new URLSearchParams(searchParams);
              if (e.target.value) next.set("project", e.target.value); else next.delete("project");
              setSearchParams(next, { replace: true });
            }}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="สถานะ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            <SelectItem value="issued">ออกแล้ว</SelectItem>
            <SelectItem value="paid">ชำระแล้ว</SelectItem>
            <SelectItem value="unpaid">ค้างชำระ</SelectItem>
            <SelectItem value="cancelled">ยกเลิก</SelectItem>
            <SelectItem value="trash">Trash</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Select value={printStatusFilter} onValueChange={setPrintStatusFilter}>
          <SelectTrigger><SelectValue placeholder="สถานะการพิมพ์" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">การพิมพ์: ทุกสถานะ</SelectItem>
            <SelectItem value="not_printed">ยังไม่พิมพ์</SelectItem>
            <SelectItem value="printed">พิมพ์แล้ว</SelectItem>
            <SelectItem value="print_error">พิมพ์ผิดพลาด</SelectItem>
          </SelectContent>
        </Select>
        <Select value={syncStatusFilter} onValueChange={setSyncStatusFilter}>
          <SelectTrigger><SelectValue placeholder="สถานะการซิงก์" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sync: ทุกสถานะ</SelectItem>
            <SelectItem value="success">ซิงก์สำเร็จ</SelectItem>
            <SelectItem value="pending">รอซิงก์</SelectItem>
            <SelectItem value="failed">ซิงก์ล้มเหลว</SelectItem>
          </SelectContent>
        </Select>
        <Select value={internalSaleFilter} onValueChange={setInternalSaleFilter}>
          <SelectTrigger data-testid="filter-internal-sale-type">
            <SelectValue placeholder="ประเภทภายในร้าน" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ประเภทภายใน: ทั้งหมด</SelectItem>
            <SelectItem value="real_goods">ซื้อของจริง</SelectItem>
            <SelectItem value="bill_only">ซื้อบิล</SelectItem>
          </SelectContent>
        </Select>
        <div className="md:col-span-5 flex flex-wrap items-center gap-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground">ตัวกรองที่ใช้อยู่:</span>
          {hasActiveFilters ? (
            activeFilterParts.map((p, i) => (
              <Badge key={i} variant="secondary" className="text-[11px] font-normal">{p}</Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground italic">ไม่มี</span>
          )}
          <Badge variant="outline" className="text-[11px] font-normal">
            ผลลัพธ์ {listQ.isLoading ? "…" : `${visibleRows.length}${countQ.data != null ? ` / ${totalCount}` : ""}`} รายการ
            {listQ.isFetching && !listQ.isLoading && (
              <RefreshCw className="inline-block h-3 w-3 ml-1 animate-spin text-muted-foreground" />
            )}
          </Badge>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">ต่อหน้า</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-7 text-xs w-[92px]" data-testid="page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1" />
          <Button
            variant={groupByCustomer ? "default" : "outline"}
            size="sm"
            onClick={() => setGroupByCustomer((v) => !v)}
            title="สลับมุมมองระหว่างตารางปกติกับจัดกลุ่มตามลูกค้า"
          >
            {groupByCustomer ? "มุมมองตาราง" : "จัดกลุ่มตามลูกค้า"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncStuck("visible")}
            disabled={bulkSyncBusy}
            title="อัปโหลดเอกสารที่ยังไม่มีไฟล์บน Google Drive หรือค้าง/ล้มเหลว"
          >
            <RotateCw className={`h-3.5 w-3.5 mr-1 ${bulkSyncBusy ? "animate-spin" : ""}`} />
            {bulkSyncBusy && bulkSyncProgress
              ? `กำลังซิงก์ ${bulkSyncProgress.done}/${bulkSyncProgress.total}`
              : "ซิงก์ที่ค้าง"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncStuck("all")}
            disabled={bulkSyncBusy}
            title="อัปโหลดเอกสารเก่าทั้งหมดที่ยังไม่มีไฟล์บน Google Drive"
          >
            <CloudUpload className={`h-3.5 w-3.5 mr-1 ${bulkSyncBusy ? "animate-pulse" : ""}`} />
            ซิงก์เอกสารเก่าทั้งหมด → Drive
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetAll}
            disabled={!hasActiveFilters && docType === "all"}
          >
            รีเซ็ตแท็บและตัวกรอง
          </Button>
          <Button
            variant={showQueryDebug ? "default" : "ghost"}
            size="sm"
            onClick={() => setShowQueryDebug((v) => !v)}
            title="แสดง/ซ่อนสรุปสถานะ query — ค่าคำค้น/ตัวกรอง/หน้า/จำนวนที่ count คืน"
          >
            {showQueryDebug ? "ซ่อน Query Debug" : "Query Debug"}
          </Button>
        </div>
      </Card>

      {showQueryDebug && (
        <Card className="p-3 text-xs space-y-1.5 border-dashed" data-testid="docs-query-debug">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Query Debug</span>
            <span className={consistencyIssue ? "text-destructive" : "text-emerald-600"}>
              {listQ.isFetching || countQ.isFetching
                ? "กำลังโหลด…"
                : consistencyIssue
                ? "⚠ listQ/countQ ไม่ตรงกัน"
                : "✓ listQ = countQ (ต่อหน้า)"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 font-mono">
            <div><span className="text-muted-foreground">tab:</span> {docType}</div>
            <div><span className="text-muted-foreground">status:</span> {status}</div>
            <div><span className="text-muted-foreground">q:</span> {debounced || "—"}</div>
            <div><span className="text-muted-foreground">project:</span> {projectDebounced || "—"}</div>
            <div><span className="text-muted-foreground">from:</span> {from || "—"}</div>
            <div><span className="text-muted-foreground">to:</span> {to || "—"}</div>
            <div><span className="text-muted-foreground">print:</span> {printStatusFilter}</div>
            <div><span className="text-muted-foreground">sync:</span> {syncStatusFilter}</div>
            <div><span className="text-muted-foreground">internal:</span> {internalSaleFilter}</div>
            <div><span className="text-muted-foreground">page:</span> {page + 1} / {pageCount}</div>
            <div><span className="text-muted-foreground">pageSize:</span> {pageSize}</div>
            <div><span className="text-muted-foreground">countQ:</span> {countQ.isLoading ? "…" : totalCount}</div>
            <div><span className="text-muted-foreground">listQ.rows:</span> {listQ.isLoading ? "…" : (listQ.data?.length ?? 0)}</div>
            <div><span className="text-muted-foreground">range:</span> {page * pageSize + 1}–{Math.min(totalCount, (page + 1) * pageSize)}</div>
            <div><span className="text-muted-foreground">expected:</span> {Math.max(0, Math.min(pageSize, totalCount - page * pageSize))}</div>
            <div><span className="text-muted-foreground">store:</span> {store?.id?.slice(0, 8) ?? "—"}</div>
          </div>
          {consistencyIssue && (
            <div className="text-destructive text-[11px] pt-1 border-t">
              คาดว่าจะมี {consistencyIssue.expected} แถวในหน้านี้ แต่ listQ คืน {consistencyIssue.fetched} แถว —
              อาจมีตัวกรองที่ไม่ตรงกันระหว่าง countQ กับ listQ กรุณาตรวจ console
            </div>
          )}
        </Card>
      )}

      {(bulkSyncBusy || bulkSyncItems.length > 0) && bulkSyncProgress && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">สถานะการซิงก์ Google Drive/Sheets</span>
            <span className="text-muted-foreground">
              {bulkSyncProgress.done}/{bulkSyncProgress.total} • สำเร็จ {bulkSyncProgress.ok} • ล้มเหลว{" "}
              <span className={bulkSyncProgress.failed ? "text-destructive" : ""}>{bulkSyncProgress.failed}</span>
            </span>
          </div>
          <Progress
            value={bulkSyncProgress.total > 0 ? (bulkSyncProgress.done / bulkSyncProgress.total) * 100 : 0}
          />
          {bulkSyncItems.length > 0 && (
            <ul className="text-xs space-y-1 max-h-40 overflow-auto border-t pt-2">
              {bulkSyncItems.map((it, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="font-mono truncate">{it.docNo}</span>
                  {it.status === "syncing" && <span className="text-muted-foreground">กำลังซิงก์…</span>}
                  {it.status === "ok" && <span className="text-emerald-600">✓ สำเร็จ</span>}
                  {it.status === "failed" && (
                    <span className="text-destructive truncate max-w-[60%]" title={it.error}>✕ {it.error ?? "ล้มเหลว"}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!bulkSyncBusy && bulkSyncItems.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setBulkSyncItems([]); setBulkSyncProgress(null); }}>
                ปิด
              </Button>
            </div>
          )}
        </Card>
      )}

      {selected.size > 0 && (
        <Card className="p-3 sticky top-2 z-30 bg-primary/5 border-primary/30 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium mr-2">เลือก {selected.size} ฉบับ</span>
          <Button size="sm" variant="outline" onClick={() => {
            const ids = Array.from(selected);
            printIdsNow(ids, "combined", defaultCopies);
          }}><Printer className="h-3.5 w-3.5 mr-1" />พิมพ์รวมเป็นชุด</Button>
          <Button size="sm" variant="outline" onClick={() => {
            const ids = Array.from(selected);
            printIdsNow(ids, "each", defaultCopies);
          }}><Printer className="h-3.5 w-3.5 mr-1" />พิมพ์แยกทีละฉบับ</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><FileDown className="h-3.5 w-3.5 mr-1" />ดาวน์โหลด PDF</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => {
                const ids = Array.from(selected);
                if (!ids.length) { toast({ title: "เลือกเอกสารก่อน" }); return; }
                runPdf(ids, printPaper === "auto" ? null : printPaper, printOrient, printTemplate === "auto" ? null : printTemplate, undefined, "zip");
              }}>แยกไฟล์ต่อรายการ (.zip)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const ids = Array.from(selected);
                if (!ids.length) { toast({ title: "เลือกเอกสารก่อน" }); return; }
                runPdf(ids, printPaper === "auto" ? null : printPaper, printOrient, printTemplate === "auto" ? null : printTemplate, undefined, "merged");
              }}>รวมเป็นไฟล์เดียว (.pdf)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><FileSpreadsheet className="h-3.5 w-3.5 mr-1" />ส่งออก</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={bulkExcel}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={bulkCsv}>CSV (.csv)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={() => syncBulk("sheet")}><RefreshCw className="h-3.5 w-3.5 mr-1" />Sync Sheets</Button>
          <Button size="sm" variant="outline" onClick={() => syncBulk("drive")}><RefreshCw className="h-3.5 w-3.5 mr-1" />Sync Drive</Button>
          {status === "trash" ? (
            <Button size="sm" variant="outline" onClick={bulkRestore}><Undo2 className="h-3.5 w-3.5 mr-1" />กู้คืน</Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5 mr-1" />ลบ</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="h-3.5 w-3.5" /></Button>
        </Card>
      )}

      {/* Mobile: card list. Desktop / tablet (md+): table. Neither variant
          creates its own horizontal scrollbar; secondary columns collapse
          progressively so the layout fits inside the content area at every
          breakpoint. */}
      <div className="grid w-full min-w-0 gap-3 md:hidden">
        {listQ.isLoading && Array.from({ length: 4 }).map((_, i) => (
          <Card key={`m-sk-${i}`} className="p-3 w-full min-w-0">
            <Skeleton className="h-4 w-2/3 mb-2" />
            <Skeleton className="h-3 w-1/2 mb-1" />
            <Skeleton className="h-3 w-1/3" />
          </Card>
        ))}
        {!listQ.isLoading && visibleRows.length === 0 && (
          <Card className="p-6 w-full min-w-0 text-center text-sm text-muted-foreground">
            {hasActiveFilters ? "ไม่พบเอกสารที่ตรงกับตัวกรอง" : "ยังไม่มีเอกสาร"}
          </Card>
        )}
        {!listQ.isLoading && visibleRows.map((r: any) => (
          <Card
            key={`m-${r.id}`}
            className={`w-full min-w-0 max-w-full p-3 ${selected.has(r.id) ? "bg-accent/30" : ""}`}
          >
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm font-semibold break-words">{r.document_no}</div>
                <div className="text-xs text-muted-foreground break-words flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ background: docTypeTint(r.document_type).dot }}
                    aria-hidden="true"
                  />
                  {displayDocLabelForStore(storeSlug, r.document_type) || r.document_type} · {r.document_date}
                </div>
                <div className="text-sm mt-1 break-words min-w-0">{r.customer_name || "-"}</div>
                {r.project_name && (
                  <div className="text-xs text-muted-foreground break-words min-w-0">{r.project_name}</div>
                )}
              </div>
              <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-right tabular-nums font-medium">
                {Number(r.net_total || r.grand_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.status}</Badge>
                <PrintStatusBadge status={r.print_status} at={r.last_printed_at} />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 xs:flex xs:flex-wrap xs:justify-end">
              <Button size="sm" variant="outline" className="h-10 w-full xs:w-auto px-2" onClick={() => openPreview(r)}>
                <Eye className="h-3.5 w-3.5 mr-1" />ดู
              </Button>
              <Button size="sm" variant="outline" className="h-10 w-full xs:w-auto px-2" asChild>
                <Link to={`${storeBasePath(storeSlug)}/documents/${r.id}/edit`}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />แก้ไข
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 w-full xs:w-auto px-2"
                disabled={isBlockedDelivery(r)}
                title={isBlockedDelivery(r) ? blockedTooltip : undefined}
                onClick={() => {
                  if (isBlockedDelivery(r)) return;
                  goPrintPreview(r);
                }}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />พิมพ์
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 w-full xs:w-auto px-2"
                disabled={isBlockedDelivery(r)}
                title={isBlockedDelivery(r) ? blockedTooltip : "ดาวน์โหลด PDF"}
                data-testid={`m-download-${r.document_no}`}
                onClick={() => { if (!isBlockedDelivery(r)) runPdf([r.id], null, "portrait", null); }}
              >
                <FileDown className="h-3.5 w-3.5 mr-1" />ดาวน์โหลด
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="col-span-2 h-10 w-full xs:w-auto px-2" aria-label="เมนูเพิ่มเติม">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => copyDoc(r)}>
                    <Copy className="h-3.5 w-3.5 mr-2" />คัดลอก
                  </DropdownMenuItem>
                  {r.status !== "cancelled" && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setConfirmCancel({ id: r.id, no: r.document_no })}
                    >
                      <Ban className="h-3.5 w-3.5 mr-2" />ยกเลิกเอกสาร
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setActivityDialog({ docId: r.id, docNo: r.document_no })}
                  >
                    <HistoryIcon className="h-3.5 w-3.5 mr-2" />Audit Log
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}
      </div>

      <Card className="hidden md:block w-full min-w-0 max-w-full">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-9 px-2"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></TableHead>
              <TableHead className="w-[20%] lg:w-[16%] xl:w-[12%]">เลขที่</TableHead>
              <TableHead className="w-[9%] xl:w-[7%] hidden lg:table-cell">วันที่</TableHead>
              <TableHead className="w-[9%] hidden xl:table-cell">ประเภท</TableHead>
              <TableHead className="w-[28%] lg:w-[20%] xl:w-[15%]">ลูกค้า</TableHead>
              <TableHead className="w-[12%] hidden xl:table-cell">ชื่อโครงการ</TableHead>
              <TableHead className="w-[9%] hidden 2xl:table-cell">ประเภทภายใน</TableHead>
              <TableHead className="w-[18%] lg:w-[13%] xl:w-[10%] text-right">ยอดสุทธิ</TableHead>
              <TableHead className="w-[9%] xl:w-[7%] hidden lg:table-cell">สถานะ</TableHead>
              <TableHead className="w-[8%] hidden xl:table-cell">การพิมพ์</TableHead>
              <TableHead className="w-[6%] hidden 2xl:table-cell">Sync</TableHead>
              <TableHead className="w-[22%] lg:w-[17%] xl:w-[11%] text-right">การทำงาน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(listQ.isLoading || (listQ.isFetching && (listQ.data?.length ?? 0) === 0)) && (
              Array.from({ length: Math.min(8, pageSize) }).map((_, i) => (
                <TableRow key={`sk-${i}`} data-testid="docs-row-skeleton">
                  {Array.from({ length: 12 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            )}
            {!listQ.isLoading && visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-10">
                  <div className="flex flex-col items-center gap-3 text-center" data-testid="docs-empty-state">
                    <FilePlus2 className="h-10 w-10 text-muted-foreground/60" />
                    <div className="space-y-1">
                      <div className="font-medium">
                        {docType === "all"
                          ? "ยังไม่มีเอกสารในหมวดนี้"
                          : `ยังไม่มี${DOC_TYPE_LABEL[docType as keyof typeof DOC_TYPE_LABEL] ?? "เอกสาร"}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {hasActiveFilters
                          ? `ไม่พบเอกสารที่ตรงกับตัวกรอง: ${filterSummary}`
                          : "เริ่มสร้างเอกสารใหม่ได้จากปุ่มด้านล่าง"}
                      </div>
                    </div>
                    {hasActiveFilters ? (
                      <Button size="sm" variant="outline" onClick={resetAll}>
                        <RotateCw className="h-4 w-4 mr-1.5" />
                        รีเซ็ตแท็บและตัวกรอง
                      </Button>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <Button asChild size="sm">
                          <Link to={`${storeBasePath(storeSlug)}/documents/new?type=quotation`}>
                            <FilePlus2 className="h-4 w-4 mr-1.5" />
                            สร้างใบเสนอราคา
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="secondary">
                          <Link to={`${storeBasePath(storeSlug)}/documents/new?type=receipt`}>
                            <FilePlus2 className="h-4 w-4 mr-1.5" />
                            {storeSlug === "colorlab" ? "สร้างใบเสร็จรับเงิน/ใบกำกับภาษี" : "สร้างใบเสร็จรับเงิน"}
                          </Link>
                        </Button>
                        <p className="basis-full text-center text-xs text-muted-foreground pt-1">
                          ใบส่งของและใบกำกับภาษีต้องสร้างจากใบเสนอราคา/ใบเสร็จที่พิมพ์แล้ว
                        </p>
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {(() => {
              const renderRow = (r: any) => (
              <TableRow key={r.id} className={selected.has(r.id) ? "bg-accent/30" : ""}>
                <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} /></TableCell>
                <TableCell className="font-mono text-xs align-top min-w-0 break-words">
                  <div>{r.document_no}</div>
                  {r.customer_name && (
                    <div className="text-[11px] text-muted-foreground font-sans truncate">
                      {r.customer_name}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs hidden lg:table-cell align-top">{r.document_date}</TableCell>
                <TableCell className="text-xs hidden xl:table-cell align-top">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: docTypeTint(r.document_type).dot }}
                      aria-hidden="true"
                    />
                    {displayDocLabelForStore(storeSlug, r.document_type) || r.document_type}
                  </span>
                </TableCell>
                <TableCell className="text-sm align-top min-w-0 break-words">{r.customer_name || "-"}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden xl:table-cell align-top truncate" title={r.project_name || ""}>{r.project_name || "-"}</TableCell>
                <TableCell className="text-xs hidden 2xl:table-cell align-top">
                  <Badge
                    variant={r.internal_sale_type === "bill_only" ? "secondary" : "outline"}
                    className="text-[11px]"
                    data-testid={`row-internal-sale-type-${r.id}`}
                  >
                    {r.internal_sale_type === "bill_only" ? "ซื้อบิล" : "ซื้อของจริง"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium align-top">
                  {Number(r.net_total || r.grand_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="hidden lg:table-cell align-top"><Badge variant="outline" className="text-xs">{r.status}</Badge></TableCell>
                <TableCell className="hidden xl:table-cell align-top">
                  <PrintStatusBadge status={r.print_status} at={r.last_printed_at} />
                </TableCell>
                <TableCell className="hidden 2xl:table-cell align-top">
                  <div className="flex flex-col gap-0.5">
                    <SyncBadge status={r.google_sheet_sync_status} label="S" at={r.google_sheet_synced_at} error={r.last_sync_error} />
                    <SyncBadge status={r.google_drive_sync_status} label="D" at={r.google_drive_synced_at} error={r.last_sync_error} />
                    {(r.google_sheet_sync_status === "failed" || r.google_drive_sync_status === "failed") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-1.5 text-[10px] mt-0.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                        title={r.last_sync_error ?? "ลองซิงก์ใหม่"}
                        onClick={async () => {
                          if (r.google_drive_sync_status === "failed") await syncDriveRow(r);
                          if (r.google_sheet_sync_status === "failed") await syncOne(r.id, "sheet");
                        }}
                      >
                        <RotateCw className="h-3 w-3 mr-1" /> ลองซิงก์ใหม่
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-0.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="ดูตัวอย่าง A4" data-testid={`row-eye-${r.document_no}`} onClick={() => openPreview(r)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="แก้ไข" asChild>
                      <Link to={`${storeBasePath(storeSlug)}/documents/${r.id}/edit`}><Pencil className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title={isBlockedDelivery(r) ? blockedTooltip : `ตั้งค่าและพิมพ์ A4 · ${DOC_LABEL[r.document_type] || r.document_type}`}
                      data-testid={`row-print-${r.document_no}`}
                      disabled={isBlockedDelivery(r)}
                      onClick={() => {
                        if (isBlockedDelivery(r)) return;
                        goPrintPreview(r);
                      }}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant={r.google_drive_sync_status === "failed" ? "destructive" : "ghost"} className="h-7 w-7" title="เพิ่มเติม">
                          {r.google_drive_sync_status === "failed" ? <AlertTriangle className="h-3.5 w-3.5" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          disabled={isBlockedDelivery(r)}
                          onClick={() => {
                            if (isBlockedDelivery(r)) return;
                            goPrintPreview(r);
                          }}
                          title={isBlockedDelivery(r) ? blockedTooltip : undefined}
                        ><Printer className="h-3.5 w-3.5 mr-2" />ตั้งค่าและพิมพ์</DropdownMenuItem>
                         <DropdownMenuItem onClick={() => copyDoc(r)}><Copy className="h-3.5 w-3.5 mr-2" />คัดลอก</DropdownMenuItem>
                         <DropdownMenuItem onClick={async () => {
                           const { data, error } = await supabase.rpc(tbl("duplicate_document") as any, { p_id: r.id });
                           if (error) { toast({ title: "ทำสำเนาไม่สำเร็จ", description: error.message, variant: "destructive" }); return; }
                           toast({ title: "ทำสำเนาเอกสารแล้ว" });
                           qc.invalidateQueries({ queryKey: ["rds_docs"] });
                           if (data) navigate(`${storeBasePath(storeSlug)}/documents/${data}/edit`);
                         }}><FilePlus2 className="h-3.5 w-3.5 mr-2" />ทำสำเนา (เลขใหม่)</DropdownMenuItem>
                         {r.status !== "cancelled" && (
                           <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmCancel({ id: r.id, no: r.document_no })}>
                             <Ban className="h-3.5 w-3.5 mr-2" />ยกเลิกเอกสาร
                           </DropdownMenuItem>
                         )}
                        {r.document_type === "delivery" && (
                          <DropdownMenuItem onClick={() => convertToReceipt(r)}><ArrowRightLeft className="h-3.5 w-3.5 mr-2" />แปลงเป็นใบเสร็จ</DropdownMenuItem>
                        )}
                        <DropdownMenuItem asChild>
                          <Link to={`${storeBasePath(storeSlug)}/documents/${r.id}/revisions`}><HistoryIcon className="h-3.5 w-3.5 mr-2" />ประวัติแก้ไข</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setActivityDialog({ docId: r.id, docNo: r.document_no })}
                          data-testid={`row-activity-${r.document_no}`}
                        >
                          <HistoryIcon className="h-3.5 w-3.5 mr-2" />Audit Log (ย้ายประเภท/บล็อก)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isBlockedDelivery(r)}
                          onClick={() => { if (!isBlockedDelivery(r)) runPdf([r.id], null, "portrait", null); }}
                          title={isBlockedDelivery(r) ? blockedTooltip : undefined}
                        ><FileDown className="h-3.5 w-3.5 mr-2" />ดาวน์โหลด PDF</DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isBlockedDelivery(r)}
                          onClick={() => { if (!isBlockedDelivery(r)) exportRowExcel(r); }}
                          title={isBlockedDelivery(r) ? blockedTooltip : undefined}
                        ><FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Excel (.xlsx)</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => syncOne(r.id, "sheet")}><RefreshCw className="h-3.5 w-3.5 mr-2" />Sync Sheets</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => syncDriveRow(r)}>
                          {r.google_drive_sync_status === "failed" ? <AlertTriangle className="h-3.5 w-3.5 mr-2" /> : <CloudUpload className="h-3.5 w-3.5 mr-2" />}
                          {r.google_drive_sync_status === "failed" ? "ซิงก์ Drive ล้มเหลว — ลองใหม่" : "ซิงก์ Google Drive"}
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`${storeBasePath(storeSlug)}/documents/${r.id}/sync`}><HistoryIcon className="h-3.5 w-3.5 mr-2" />ประวัติการอัปโหลด</Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
              );
              if (groupByCustomer && groupedRows) {
                return groupedRows.map((g) => {
                  const collapsed = collapsedGroups.has(g.key);
                  const counts: Record<string, number> = {};
                  for (const row of g.rows) counts[row.document_type] = (counts[row.document_type] ?? 0) + 1;
                  return (
                    <>
                      <TableRow
                        key={`h-${g.key}`}
                        className="bg-muted/60 hover:bg-muted cursor-pointer"
                        onClick={() => toggleGroup(g.key)}
                      >
                        <TableCell colSpan={12} className="py-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                            <span className="font-semibold text-sm">{g.label}</span>
                            <span className="text-xs text-muted-foreground">({g.rows.length} ฉบับ)</span>
                            <div className="flex gap-1 flex-wrap">
                              {Object.entries(counts).map(([t, c]) => (
                                <Badge
                                  key={t}
                                  variant="outline"
                                  className="text-[10px] font-normal"
                                  style={{ borderColor: `color-mix(in srgb, ${resolveDocTheme(t, store).header || "hsl(var(--foreground))"} 40%, transparent)` }}
                                >
                                  {displayDocLabelForStore(storeSlug, t) || t}: {c}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      {!collapsed && g.rows.map(renderRow)}
                    </>
                  );
                });
              }
              return visibleRows.map(renderRow);
            })()}
          </TableBody>
        </Table>
      </Card>

      {/* Numbered pager. Server-side pagination via range() — page numbers
          are computed from countQ (the same filter set as listQ) so nothing
          slips through. */}
      {(() => {
        const fetched = rows.length;
        const startIdx = totalCount === 0 ? 0 : page * pageSize + 1;
        const endIdx = page * pageSize + fetched;
        // Build a compact page list: first, last, current ± 2, with ellipsis.
        const pageNumbers: (number | "…")[] = [];
        if (pageCount <= 7) {
          for (let i = 0; i < pageCount; i++) pageNumbers.push(i);
        } else {
          const push = (n: number | "…") => {
            if (pageNumbers[pageNumbers.length - 1] !== n) pageNumbers.push(n);
          };
          push(0);
          if (page > 3) push("…");
          for (let i = Math.max(1, page - 2); i <= Math.min(pageCount - 2, page + 2); i++) push(i);
          if (page < pageCount - 4) push("…");
          push(pageCount - 1);
        }
        return (
          <div className="flex flex-col items-center gap-2 py-4">
            {totalCount > 0 && !listQ.isLoading && (
              <div className="w-full flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span data-testid="docs-page-range">
                  แสดง {startIdx}–{endIdx} จากทั้งหมด {totalCount} รายการ
                </span>
                <span>หน้า {page + 1} / {pageCount}</span>
              </div>
            )}
            {pageCount > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1" data-testid="docs-pager">
                <Button
                  variant="outline" size="sm" className="h-7 px-2"
                  onClick={() => setPage(0)}
                  disabled={page === 0 || listQ.isFetching}
                >« หน้าแรก</Button>
                <Button
                  variant="outline" size="sm" className="h-7 px-2"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || listQ.isFetching}
                >‹ ก่อนหน้า</Button>
                {pageNumbers.map((n, i) =>
                  n === "…" ? (
                    <span key={`e${i}`} className="px-2 text-xs text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={n}
                      variant={n === page ? "default" : "outline"}
                      size="sm"
                      className="h-7 min-w-[32px] px-2 text-xs"
                      onClick={() => setPage(n)}
                      disabled={listQ.isFetching}
                      data-testid={`docs-pager-${n + 1}`}
                    >{n + 1}</Button>
                  ),
                )}
                <Button
                  variant="outline" size="sm" className="h-7 px-2"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1 || listQ.isFetching}
                >ถัดไป ›</Button>
                <Button
                  variant="outline" size="sm" className="h-7 px-2"
                  onClick={() => setPage(pageCount - 1)}
                  disabled={page >= pageCount - 1 || listQ.isFetching}
                >สุดท้าย »</Button>
              </div>
            )}
            {pageCount <= 1 && fetched > 0 && !listQ.isLoading && (
              <span className="text-xs text-muted-foreground" data-testid="docs-all-shown">
                แสดงครบทั้งหมด {fetched} รายการ
              </span>
            )}
          </div>
        );
      })()}

      {/* Preview dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto bg-muted">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <DialogTitle>{previewDoc?.document_no}</DialogTitle>
              <div className="flex items-center gap-2">
                {!isBlockedDelivery(previewDoc) && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const id = previewDoc?.id;
                      if (!id) return;
                      setPreviewDoc(null);
                      setTimeout(() => printIdsNow([id], "single", defaultCopies), 150);
                    }}
                  >
                    <Printer className="h-4 w-4 mr-1" /> พิมพ์
                  </Button>
                )}
                {isBlockedDelivery(previewDoc) && (
                  <span className="text-[11px] text-muted-foreground italic">
                    โหมดแสดงผลอย่างเดียว — ร้านนี้ไม่พิมพ์ใบส่งของ
                  </span>
                )}
                <Button size="sm" variant="outline" onClick={() => setPreviewDoc(null)}>ปิด</Button>
              </div>
            </div>
          </DialogHeader>
          {previewDoc && (
            <DocumentPreview
              store={store}
              state={docToFormState(previewDoc, previewDoc._items || [])}
              totals={docToTotals(previewDoc)}
              docNo={previewDoc.document_no}
              templateConfig={templateConfigQ.data?.[previewDoc.template ?? "modern"]}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ?</AlertDialogTitle>
            <AlertDialogDescription>
              เอกสาร {selected.size} ฉบับจะถูกย้ายไปที่ Trash สามารถกู้คืนได้ภายหลัง
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete}>ย้ายไป Trash</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmCancel} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยกเลิกเอกสาร {confirmCancel?.no}?</AlertDialogTitle>
            <AlertDialogDescription>
              เอกสารจะถูกเปลี่ยนสถานะเป็น "ยกเลิก" แต่ยังคงเก็บไว้ในระบบและ Google Sheets เพื่อเป็นประวัติ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ปิด</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!confirmCancel) return;
              const { error } = await supabase.rpc(tbl("cancel_document") as any, { p_id: confirmCancel.id, p_reason: null });
              if (error) { toast({ title: "ยกเลิกไม่สำเร็จ", description: error.message, variant: "destructive" }); return; }
              toast({ title: `ยกเลิกเอกสาร ${confirmCancel.no} แล้ว` });
              // re-sync to update Sheets status
              try { await triggerSync([confirmCancel.id], "sheet", undefined, "document_full"); } catch { /* noop */ }
              setConfirmCancel(null);
              qc.invalidateQueries({ queryKey: ["rds_docs"] });
            }}>ยืนยันการยกเลิก</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Open: multi-match selector */}
      <Dialog open={!!quickOpenMatches} onOpenChange={(o) => !o && setQuickOpenMatches(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>พบเอกสารหลายฉบับ — เลือกฉบับที่ต้องการเปิด</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-[60vh] overflow-auto">
            {(quickOpenMatches ?? []).map((d) => (
              <button
                key={d.id}
                className="w-full text-left p-2 rounded hover:bg-accent border flex justify-between gap-2"
                onClick={() => {
                  setQuickOpenMatches(null);
                  setQuickOpenNo("");
                  navigate(`${storeBasePath(storeSlug)}/documents/${d.id}/edit`);
                }}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.document_no}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {displayDocLabelForStore(storeSlug, d.document_type) || d.document_type} · {d.customer_name || "—"} · {d.document_date}
                  </div>
                </div>
                <Badge variant={d.deleted_at ? "destructive" : "outline"} className="text-[10px] h-fit">
                  {d.deleted_at ? "Trash" : d.status}
                </Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sheets recovery confirm */}
      <AlertDialog open={!!sheetsRecover} onOpenChange={(o) => !o && setSheetsRecover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>พบเอกสารใน Google Sheets — กู้กลับเข้าระบบ?</AlertDialogTitle>
            <AlertDialogDescription>
              เลข <b>{sheetsRecover?.no}</b> {sheetsRecover?.tab ? `(แท็บ "${sheetsRecover.tab}")` : ""}
              <br />
              ลูกค้า: {sheetsRecover?.header?.customer_name || "—"}
              <br />
              รายการสินค้า: {sheetsRecover?.items?.length ?? 0} รายการ
              <br /><br />
              ระบบจะสร้างเอกสารกลับเข้าฐานข้อมูลด้วยเลขเดิม แล้วเปิดให้แก้ไขทันที
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestoreFromSheets}>กู้เอกสาร</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {bulkProgress && (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-card shadow-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{bulkProgress.mode === "each" ? "พิมพ์แยกทีละฉบับ" : "พิมพ์รวมเป็นชุด"}</span>
            <span className="text-muted-foreground">{bulkProgress.current}/{bulkProgress.total}</span>
          </div>
          <Progress value={bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0} />
          {bulkProgress.label && (
            <p className="text-xs text-muted-foreground truncate">{bulkProgress.label}</p>
          )}
        </div>
      )}

      {/* Header mismatch dialog */}
      <Dialog open={!!headerIssue} onOpenChange={(o) => !o && setHeaderIssue(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>หัวคอลัมน์ Google Sheet ไม่ตรง</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              ระบบหยุด sync ไว้ก่อน เพราะหัวตารางในชีตไม่ตรงกับลำดับที่ระบบส่ง — โปรดแก้คอลัมน์ด้านล่างให้ตรง แล้วลอง Sync ใหม่
            </p>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">คอลัมน์</TableHead>
                    <TableHead>ที่ระบบคาดไว้</TableHead>
                    <TableHead>ที่พบในชีต</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headerIssue?.mismatches.map((m) => (
                    <TableRow key={m.col}>
                      <TableCell className="font-mono">{m.col}</TableCell>
                      <TableCell className="text-emerald-700">{m.expected || <em className="text-muted-foreground">(ว่าง)</em>}</TableCell>
                      <TableCell className="text-destructive">{m.actual || <em className="text-muted-foreground">(ว่าง)</em>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeaderIssue(null)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    {/* Print area must live OUTSIDE the `print:hidden` wrapper so
        window.print() (non-iframe path) can actually show its contents. */}
    <div ref={printAreaRef} id="documents-print-area" className="hidden print:block" />
    <DocActivityDialog
      open={!!activityDialog}
      onClose={() => setActivityDialog(null)}
      storeId={store?.id ?? null}
      docId={activityDialog?.docId ?? null}
      docNo={activityDialog?.docNo ?? null}
    />
    </>
  );
}

export function docToFormState(r: any, items: any[]): any {
  return {
    document_type: r.document_type,
    paper_size: r.paper_size,
    print_mode: r.print_mode ?? "fit_a4",
    auto_fit_a4: r.auto_fit_a4 ?? true,
    print_scale: r.print_scale != null ? Number(r.print_scale) : null,
    template: r.template ?? "modern",
    status_workflow: r.status_workflow ?? "draft",
    document_date: r.document_date,
    show_document_date: r.show_document_date,
    vat_mode: r.vat_mode,
    vat_rate: Number(r.vat_rate),
    price_type: r.price_type,
    withholding_tax_enabled: r.withholding_tax_enabled,
    withholding_tax_rate: Number(r.withholding_tax_rate),
    discount_amount: Number(r.discount_amount),
    customer_id: r.customer_id,
    customer_name: r.customer_name ?? "",
    customer_phone: r.customer_phone ?? "",
    customer_address: r.customer_address ?? "",
    customer_tax_id: r.customer_tax_id ?? "",
    customer_branch: r.customer_branch ?? "",
    payment_method: r.payment_method ?? "",
    notes: r.notes ?? "",
    project_name: r.project_name ?? "",
    show_payment_method: r.show_payment_method !== false,
    show_payment_date: r.show_payment_date !== false,
    show_footer_document_date: r.show_footer_document_date !== false,
    items: items.map((it: any) => ({
      key: it.id,
      product_id: it.product_id,
      name: it.name,
      description: it.description ?? "",
      price: Number(it.price),
      quantity: Number(it.quantity),
      unit: it.unit ?? "",
      discount_percent: Number(it.discount_percent),
      discount_amount: Number(it.discount_amount),
    })),
  };
}

function docToTotals(r: any) {
  return {
    subtotal: Number(r.subtotal),
    discount_total: Number(r.discount_total),
    amount_before_vat: Number(r.amount_before_vat),
    vat_amount: Number(r.vat_amount),
    grand_total: Number(r.grand_total),
    withholding_tax_amount: Number(r.withholding_tax_amount),
    net_total: Number(r.net_total),
  };
}