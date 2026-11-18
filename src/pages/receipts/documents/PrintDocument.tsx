import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tbl } from "../lib/tbl";
import DocumentPreview from "./DocumentPreview";
import { recordPrintDiagnostics } from "../lib/printDebug";
import { useDocLayouts, pickLayout, mergeConfigWithLayout } from "../lib/layouts";
import {
  computeTotals,
  emptyItem,
  type DocFormState,
  type DocumentType,
  type DocTemplate,
  type PaperSize,
} from "./useDocumentForm";
import type { RdsStore } from "../types";
import { asCustomPaper, getPaperCssSize, type PaperSize as PrintPaperSize } from "../lib/printPrefs";
import { printQueue } from "../lib/printQueue";

/**
 * Standalone print route: /receipts/:storeSlug/documents/:id/print
 *
 * Loads the document(s) fresh from the DB, renders them with the same
 * <DocumentPreview> component the rest of the app uses, then triggers
 * window.print() once fonts + images are ready. Runs OUTSIDE the receipts
 * shell (no sidebar / header) so the printed page is exactly the document.
 *
 * Supports single-doc mode (path :id) and multi-doc mode via
 * `?ids=a,b,c` query.
 */

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

export default function PrintDocument() {
  const { storeSlug, id } = useParams<{ storeSlug: string; id: string }>();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const idsParam = search.get("ids");
  const debugMode = search.get("debug") === "1";
  // The repeating table header (logo + shop name + doc-type + doc no + date)
  // duplicates DocumentPreview's own title block, so keep it OFF by default.
  // Opt in with `?repeatHeader=1` when a document spans multiple pages and
  // you need a top-of-page reference on every printed sheet.
  const showRepeatHeader = search.get("repeatHeader") === "1";
  const orientParam = (search.get("orient") === "landscape" ? "landscape" : "portrait") as "portrait" | "landscape";
  const paperParam = (search.get("paper") ?? "") as PrintPaperSize | "";
  const copies = Math.min(10, Math.max(1, Math.round(Number(search.get("copies") ?? "1") || 1)));
  const routePaper: PrintPaperSize | null =
    paperParam === "A4" || paperParam === "A5" || paperParam === "Letter" || paperParam === "Legal" || paperParam === "80mm" || paperParam === "custom"
      ? paperParam
      : null;
  const customPaper = asCustomPaper({ widthMm: search.get("w"), heightMm: search.get("h") });
  const ids = useMemo(() => {
    if (idsParam) return idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    return id ? [id] : [];
  }, [idsParam, id]);

  const printedRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "printing" | "done" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState({
    fontsReady: false,
    imgTotal: 0,
    imgDecoded: 0,
    imgFailed: 0,
    prepMs: 0,
  });

  // Load store by slug (fresh — no cache issues)
  const storeQ = useQuery({
    queryKey: ["print-store", storeSlug],
    enabled: !!storeSlug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("stores") as any)
        .select(
          "id, slug, name, tax_id, phone, address, logo_url, default_vat_rate, vat_enabled, brand_color, doc_theme, attach_biz_reg_url, attach_id_copy_url, attach_bankbook_url"
        )
        .eq("slug", storeSlug!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as RdsStore | null;
    },
  });

  // Load documents + items
  const docsQ = useQuery({
    queryKey: ["print-docs", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [{ data: docs, error: de }, { data: items, error: ie }] = await Promise.all([
        supabase.from(tbl("documents") as any).select("*").in("id", ids),
        supabase
          .from(tbl("document_items") as any)
          .select("*")
          .in("document_id", ids)
          .order("item_order"),
      ]);
      if (de) throw de;
      if (ie) throw ie;
      const docsArr = (docs as any[]) ?? [];
      const itemsArr = (items as any[]) ?? [];
      // preserve URL order
      const byId = new Map(docsArr.map((d) => [d.id, d]));
      return ids
        .map((docId) => byId.get(docId))
        .filter(Boolean)
        .map((d: any) => ({
          doc: d,
          items: itemsArr.filter((it) => it.document_id === d.id),
        }));
    },
  });

  // Template config (optional)
  const templateQ = useQuery({
    queryKey: ["print-templates", storeQ.data?.id],
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

  // Editable layouts (headers/footers/margins/show-flags/accent per store).
  const layoutsQ = useDocLayouts(storeQ.data?.id);

  const dataLoaded =
    !storeQ.isLoading && !docsQ.isLoading && !templateQ.isLoading && !layoutsQ.isLoading &&
    !!storeQ.data && !!docsQ.data;

  // Body class + page-size CSS for the entire route
  useEffect(() => {
    document.body.classList.add("print-route", "is-printing");
    const isMulti = (docsQ.data?.length ?? 0) > 1;
    if (isMulti) document.body.classList.add("is-printing-multi");
    const firstPaper = (routePaper ?? docsQ.data?.[0]?.doc?.paper_size ?? "A4") as PrintPaperSize;
    const paperCss = getPaperCssSize(firstPaper, orientParam, customPaper);
    // IMPORTANT: keep @page margin:0 to match the global print rules in
    // src/index.css. The document's .doc-page carries its own padding
    // (scaled with --doc-font-scale), so any extra @page margin causes the
    // 210mm .doc-page to overflow the printable area → blank preview.
    // Orientation comes from the ?orient=landscape query when set — the
    // route no longer hardcodes portrait.
    const style = document.createElement("style");
    style.id = "print-route-page-rule";
    style.textContent = `
      @page { size: ${paperCss}; margin: 0; }
      @media print {
        html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
        /* film-shop.css injects a global @media print rule that forces
           html/body to 80mm width and hides every direct <body> child
           except #print-root. That collapses #root (and everything under
           it, including this standalone print route) to display:none.
           Undo it while we're on the print route. */
        html:has(body.print-route),
        body.print-route { width: auto !important; }
        body.print-route > * { display: revert !important; }
        body.print-route #root {
          display: block !important;
          visibility: visible !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          text-align: left !important;
        }
        body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .print-route .no-print { display: none !important; }
        /* Override the global print rules in src/index.css that were
           designed for #doc-print being a direct child of <body>.
           In this standalone route #doc-print sits inside a <table>
           wrapper (for the repeating per-page header), and the global
           position:absolute rule pulls it out of the <td>, collapsing
           the table row to 0 height and producing a blank print preview.
           Force it back to static flow, and keep all ancestors visible. */
        body.print-route #doc-print {
          position: static !important;
          left: auto !important;
          top: auto !important;
          width: auto !important;
          margin: 0 auto !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          color: #000 !important;
          background: #ffffff !important;
        }
        body.print-route .print-route-container,
        body.print-route .print-doc-block,
        body.print-route .print-doc-table,
        body.print-route .print-doc-table > thead,
        body.print-route .print-doc-table > tbody,
        body.print-route .print-doc-table > thead > tr,
        body.print-route .print-doc-table > tbody > tr,
        body.print-route .print-doc-table > thead > tr > td,
        body.print-route .print-doc-table > tbody > tr > td,
        body.print-route .print-repeat-header,
        body.print-route .print-repeat-header * {
          visibility: visible !important;
          opacity: 1 !important;
        }
        body.print-route .print-doc-table {
          width: 100% !important;
          border-collapse: collapse !important;
          display: table !important;
        }
        body.print-route .print-doc-table > thead { display: table-header-group !important; }
        body.print-route .print-doc-table > tbody { display: table-row-group !important; }
        body.print-route .print-doc-table > thead > tr,
        body.print-route .print-doc-table > tbody > tr { display: table-row !important; }
        body.print-route .print-doc-table > thead > tr > td,
        body.print-route .print-doc-table > tbody > tr > td { display: table-cell !important; padding: 0 !important; }
        /* Neutralize wrappers so the global #doc-print print rules position
           the document correctly relative to the page. */
        .print-route,
        .print-route .print-route-container,
        .print-route .print-doc-block {
          display: block !important;
          position: static !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        body.is-printing-multi .print-route .print-doc-block {
          page-break-after: always;
          break-after: page;
          page-break-before: always;
          break-before: page;
          page-break-inside: auto;
        }
        body.is-printing-multi .print-route .print-doc-block:first-child {
          page-break-before: auto;
          break-before: auto;
        }
        body.is-printing-multi .print-route .print-doc-block:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        /* Repeating per-page header: browsers auto-repeat <thead> on every
           printed page of a table. We wrap each document in a
           .print-doc-table so the header prints on every page even when a
           single document spills across pages. */
        .print-route .print-doc-table {
          width: 100%;
          border-collapse: collapse;
        }
        .print-route .print-doc-table thead { display: table-header-group; }
        .print-route .print-doc-table tbody { display: table-row-group; }
        .print-route .print-repeat-header {
          break-inside: avoid;
          page-break-inside: avoid;
          padding: 4mm 10mm 2mm 10mm;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          gap: 8mm;
          font-family: inherit;
        }
        .print-route .print-repeat-header img.pr-logo {
          height: 14mm; width: auto; object-fit: contain;
        }
        .print-route .print-repeat-header .pr-title {
          font-size: 11pt; font-weight: 600; line-height: 1.2;
        }
        .print-route .print-repeat-header .pr-meta {
          margin-left: auto; text-align: right; font-size: 9pt; color: #374151;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.body.classList.remove("print-route", "is-printing", "is-printing-multi");
      document.getElementById("print-route-page-rule")?.remove();
    };
  }, [docsQ.data, orientParam, routePaper, customPaper.widthMm, customPaper.heightMm]);

  // Wait for fonts + images, then print — exactly once.
  useEffect(() => {
    if (!dataLoaded || printedRef.current) return;
    if (!docsQ.data || docsQ.data.length === 0) {
      setStatus("error");
      setErrMsg("ไม่พบเอกสาร");
      return;
    }
    if (docsQ.error || storeQ.error) {
      setStatus("error");
      setErrMsg((docsQ.error as any)?.message || (storeQ.error as any)?.message || "โหลดเอกสารไม่สำเร็จ");
      return;
    }
    printedRef.current = true;
    setStatus("ready");

    let cancelled = false;
    (async () => {
      const t0 = performance.now();
      // 2× rAF so React commit + style recalc finish first.
      await new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      });
      let fontsReady = false;
      try {
        // @ts-ignore — modern browsers
        if (document?.fonts?.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((r) => setTimeout(r, 1500)),
          ]);
          fontsReady = true;
        }
      } catch { /* noop */ }
      // Wait for all images inside the print area to decode.
      let imgTotal = 0, imgDecoded = 0, imgFailed = 0;
      try {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(".print-route img"));
        imgTotal = imgs.length;
        await Promise.all(
          imgs.map((img) =>
            img.complete
              ? img.decode().then(() => { imgDecoded++; }).catch(() => { imgFailed++; })
              : new Promise<void>((r) => {
                  const done = () => r();
                  img.addEventListener("load", () => { imgDecoded++; done(); }, { once: true });
                  img.addEventListener("error", () => { imgFailed++; done(); }, { once: true });
                  setTimeout(done, 1500);
                })
          )
        );
      } catch { /* noop */ }
      if (cancelled) return;

      const prepMs = Math.round(performance.now() - t0);
      setDiag({ fontsReady, imgTotal, imgDecoded, imgFailed, prepMs });
      try {
        recordPrintDiagnostics({
          startedAt: Date.now(),
          paperSize: docsQ.data?.[0]?.doc?.paper_size ?? "A4",
          orient: orientParam,
          sourceElProvided: true,
          bodyHtmlBytes: 0,
          copiedLinkCount: 0,
          copiedStyleCount: 0,
          stylesheetsReady: fontsReady,
          stylesheetsLoaded: imgDecoded,
          stylesheetsTotal: imgTotal,
          stylesheetWaitMs: prepMs,
          timedOut: false,
          fallbackReason: "none",
          errors: [],
        });
      } catch { /* noop */ }

      // Debug mode: stop here — let the user inspect the panel and click
      // "Print now" manually.
      if (debugMode) {
        setStatus("ready");
        return;
      }

      const completePrintRun = () => {
        setStatus("done");
        // If the tab was opened by the app (window.open) close it.
        // Otherwise leave the confirmation overlay visible.
        const openedByApp = !!(window.opener && !window.opener.closed);
        if (openedByApp) {
          setTimeout(() => {
            try { window.close(); } catch { /* noop */ }
          }, 200);
        }
      };

      const waitForAfterPrint = () => new Promise<void>((resolve) => {
        let settled = false;
        let timer = 0;
        const mql = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
        const done = () => {
          if (settled) return;
          settled = true;
          try { window.removeEventListener("afterprint", done); } catch { /* noop */ }
          try { mql?.removeEventListener("change", onMedia); } catch { /* noop */ }
          try { window.clearTimeout(timer); } catch { /* noop */ }
          resolve();
        };
        const onMedia = (e: MediaQueryListEvent) => { if (!e.matches) done(); };
        try { window.addEventListener("afterprint", done, { once: true }); } catch { /* noop */ }
        try { mql?.addEventListener("change", onMedia); } catch { /* noop */ }
        timer = window.setTimeout(done, 60_000);
      });

      // Mark documents as printed (best effort — errors don't block print).
      (async () => {
        try {
          await supabase
            .from(tbl("documents") as any)
            .update({
              print_status: "printed",
              last_printed_at: new Date().toISOString(),
            })
            .in("id", ids);
        } catch { /* noop */ }
      })();

      setStatus("printing");
      let runStarted = false;
      try {
        printQueue.beginExternalRun();
        runStarted = true;
        // Multi-copy prints render N clones inline (see render loop below)
        // so a single window.print() dispatches every copy in one OS
        // dialog. Cancelling that dialog cancels the whole run — no more
        // "click Print 5 times" for N copies, no more phantom dialogs
        // after cancel.
        const afterPrintDone = waitForAfterPrint();
        window.focus();
        window.print();
        await afterPrintDone;
        if (cancelled) return;
        completePrintRun();
      } catch (e: any) {
        setStatus("error");
        setErrMsg(e?.message ?? "พิมพ์ไม่สำเร็จ");
      } finally {
        if (runStarted) printQueue.endExternalRun();
      }
    })();

    return () => { cancelled = true; };
  }, [dataLoaded, docsQ.data, docsQ.error, storeQ.error, storeQ.data, ids, debugMode, copies]);

  if (status === "error") {
    return (
      <div className="no-print p-8 max-w-md mx-auto text-center">
        <h1 className="text-lg font-semibold mb-2">พิมพ์ไม่สำเร็จ</h1>
        <p className="text-sm text-gray-600 mb-4">{errMsg}</p>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 bg-gray-800 text-white rounded"
        >
          ปิดหน้าต่าง
        </button>
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <PrintLoadingPanel
        storeLoading={storeQ.isLoading}
        storeReady={!!storeQ.data}
        docsLoading={docsQ.isLoading}
        docsReady={!!docsQ.data}
        docsCount={docsQ.data?.length ?? 0}
      />
    );
  }

  const store = storeQ.data ?? null;
  const templateMap = templateQ.data ?? {};
  const docs = docsQ.data ?? [];

  return (
    <div className="print-route-container bg-white">
      {/* Reprint popup removed by request — sticky toolbar below already has
          พิมพ์อีกครั้ง / ปิดหน้าต่าง, so no modal is needed. */}
      {debugMode && (
        <PrintDebugPanel
          diag={diag}
          docsCount={docs.length}
          storeReady={!!store}
          status={status}
        />
      )}
      {/* Manual re-print / close controls — hidden on paper */}
      <div className="no-print sticky top-0 z-10 bg-white/95 backdrop-blur border-b p-3 flex gap-2 justify-center">
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm"
        >
          พิมพ์อีกครั้ง
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-1.5 border rounded text-sm"
        >
          ปิดหน้าต่าง
        </button>
      </div>

      {Array.from({ length: Math.max(1, copies) }).flatMap((_, copyIdx) => docs.map(({ doc, items }, docIdx) => {
        const state = { ...rowToState(doc, items), paper_size: (routePaper ?? doc.paper_size ?? "A4") as PaperSize };
        const totals = computeTotals(state);
        const legacy = templateMap[state.document_type];
        const layout = pickLayout(layoutsQ.data, state.layout_id, state.document_type);
        const cfg = mergeConfigWithLayout(legacy, layout);
        return (
          <div key={`${doc.id}-c${copyIdx}`} className="print-doc-block" data-copy-index={copyIdx + 1}>
            <table className="print-doc-table">
              {showRepeatHeader ? (
                <thead>
                  <tr>
                    <td>
                      <PrintRepeatingHeader
                        store={store}
                        docType={state.document_type}
                        docNo={doc.document_no ?? null}
                        docDate={state.document_date}
                      />
                    </td>
                  </tr>
                </thead>
              ) : null}
              <tbody>
                <tr>
                  <td>
                    <DocumentPreview
                      store={store}
                      state={state}
                      totals={totals}
                      docNo={doc.document_no ?? null}
                      templateConfig={cfg}
                      orient={orientParam}
                      customPaper={customPaper}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      }))}
    </div>
  );
}

const DOC_TYPE_LABEL: Record<string, string> = {
  receipt: "ใบเสร็จรับเงิน",
  quotation: "ใบเสนอราคา",
  invoice: "ใบแจ้งหนี้",
  tax_invoice: "ใบกำกับภาษี",
  delivery_note: "ใบส่งของ",
  credit_note: "ใบลดหนี้",
  debit_note: "ใบเพิ่มหนี้",
};

function PrintRepeatingHeader({
  store,
  docType,
  docNo,
  docDate,
}: {
  store: RdsStore | null;
  docType: DocumentType;
  docNo: string | null;
  docDate: string;
}) {
  const label =
    store?.slug === "colorlab" && (docType === "receipt" || docType === "tax_invoice")
      ? "ใบเสร็จรับเงิน/ใบกำกับภาษี"
      : DOC_TYPE_LABEL[docType] ?? docType;
  return (
    <div className="print-repeat-header">
      {store?.logo_url ? (
        <img src={store.logo_url} alt="" className="pr-logo" />
      ) : null}
      <div className="pr-title">
        <div>{store?.name ?? ""}</div>
        <div style={{ fontSize: "9pt", fontWeight: 400, color: "#6b7280" }}>
          {label}
        </div>
      </div>
      <div className="pr-meta">
        {docNo ? <div>เลขที่: {docNo}</div> : null}
        {docDate ? <div>วันที่: {docDate}</div> : null}
      </div>
    </div>
  );
}

function PrintDebugPanel({
  diag,
  docsCount,
  storeReady,
  status,
}: {
  diag: { fontsReady: boolean; imgTotal: number; imgDecoded: number; imgFailed: number; prepMs: number };
  docsCount: number;
  storeReady: boolean;
  status: string;
}) {
  const allImagesDone = diag.imgTotal > 0 ? diag.imgDecoded + diag.imgFailed >= diag.imgTotal : true;
  const ready = storeReady && docsCount > 0 && diag.fontsReady && allImagesDone;
  const reasons: string[] = [];
  if (!storeReady) reasons.push("ร้านค้า");
  if (docsCount === 0) reasons.push("เอกสาร");
  if (!diag.fontsReady) reasons.push("ฟอนต์");
  if (!allImagesDone) reasons.push(`รูป ${diag.imgDecoded}/${diag.imgTotal}`);
  // Log every state change to console for debugging.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info("[print-debug]", {
      ready, storeReady, docsCount, fontsReady: diag.fontsReady,
      images: `${diag.imgDecoded}/${diag.imgTotal}`, imgFailed: diag.imgFailed,
      prepMs: diag.prepMs, status, waitingFor: reasons,
    });
  }, [ready, storeReady, docsCount, diag.fontsReady, diag.imgDecoded, diag.imgTotal, diag.imgFailed, diag.prepMs, status]);
  const handlePrintNow = async () => {
    if (!ready) return;
        // eslint-disable-next-line no-console
        console.info("[print-debug] user clicked พิมพ์เดี๋ยวนี้ — waiting 2× rAF");
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    window.print();
  };
  const row = (label: string, ok: boolean, value: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span>
        <span style={{ color: ok ? "#16a34a" : "#dc2626", marginRight: 8 }}>{ok ? "✓" : "…"}</span>
        {label}
      </span>
      <span style={{ color: "#374151", fontFamily: "ui-monospace, monospace" }}>{value}</span>
    </div>
  );
  const reasonsId = "print-debug-reasons";
  return (
    <div
      className="no-print"
      role="region"
      aria-label="Print debug panel"
      style={{
        maxWidth: 640,
        margin: "16px auto",
        padding: 16,
        border: "1px solid #fbbf24",
        background: "#fffbeb",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ fontWeight: 700, marginBottom: 8, color: "#92400e" }}
      >
        Print Debug Mode {ready ? "— พร้อมพิมพ์" : "— กำลังเตรียม…"}
      </div>
      {row("Store loaded", storeReady, storeReady ? "yes" : "no")}
      {row("Documents loaded", docsCount > 0, String(docsCount))}
      {row("Fonts ready", diag.fontsReady, diag.fontsReady ? "yes" : "waiting")}
      {row(
        "Images decoded",
        allImagesDone,
        `${diag.imgDecoded}/${diag.imgTotal}${diag.imgFailed ? ` (fail ${diag.imgFailed})` : ""}`,
      )}
      {row("Prep time", true, `${diag.prepMs} ms`)}
      {row("Status", true, status)}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handlePrintNow}
          disabled={!ready}
          aria-disabled={!ready}
          aria-describedby={!ready ? reasonsId : undefined}
          title={ready ? "" : `รอ: ${reasons.join(", ")}`}
          style={{
            padding: "6px 14px",
            background: ready ? "#2563eb" : "#94a3b8",
            color: "white",
            borderRadius: 6,
            fontSize: 13,
            cursor: ready ? "pointer" : "not-allowed",
            outlineOffset: 2,
          }}
        >
          ลองพิมพ์เดี๋ยวนี้
        </button>
        <button
          type="button"
          aria-label="คัดลอกข้อมูล diagnostics ไปยังคลิปบอร์ด"
          onClick={() => {
            try {
              navigator.clipboard.writeText(
                JSON.stringify((window as any).__lovablePrintDiagnostics ?? diag, null, 2),
              );
            } catch { /* noop */ }
          }}
          style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
        >
          คัดลอก diagnostics
        </button>
        <button
          type="button"
          aria-label="ปิดหน้าต่างพิมพ์"
          onClick={() => window.close()}
          style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
        >
          ปิดหน้าต่าง
        </button>
      </div>
      {!ready && reasons.length > 0 && (
        <div id={reasonsId} style={{ marginTop: 8, fontSize: 12, color: "#92400e" }}>
          กำลังรอ: {reasons.join(", ")}
        </div>
      )}
    </div>
  );
}

function PrintLoadingPanel({
  storeLoading,
  storeReady,
  docsLoading,
  docsReady,
  docsCount,
}: {
  storeLoading: boolean;
  storeReady: boolean;
  docsLoading: boolean;
  docsReady: boolean;
  docsCount: number;
}) {
  const steps = [
    { label: "โหลดข้อมูลร้านค้า", done: storeReady, pending: storeLoading },
    { label: `โหลดเอกสาร${docsReady && docsCount ? ` (${docsCount} ฉบับ)` : ""}`, done: docsReady, pending: docsLoading },
    { label: "เตรียมฟอนต์ภาษาไทย + รูปภาพ", done: false, pending: docsReady },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <div
      className="no-print"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby="print-loading-title"
      style={{
        maxWidth: 480,
        margin: "80px auto",
        padding: 24,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        background: "white",
        boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
        fontSize: 14,
      }}
    >
      <div id="print-loading-title" style={{ fontWeight: 600, marginBottom: 4, fontSize: 16 }}>
        กำลังเตรียมเอกสารเพื่อพิมพ์
      </div>
      <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>โปรดรอสักครู่…</div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`เตรียมเอกสารสำหรับพิมพ์ ${pct}%`}
        style={{ height: 6, background: "#f1f5f9", borderRadius: 999, overflow: "hidden", marginBottom: 16 }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: "#2563eb", transition: "width 300ms" }} />
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((s, i) => (
          <li
            key={i}
            aria-current={s.pending && !s.done ? "step" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex", width: 20, height: 20, borderRadius: 999,
                background: s.done ? "#16a34a" : s.pending ? "#fbbf24" : "#e5e7eb",
                color: "white", alignItems: "center", justifyContent: "center", fontSize: 12,
              }}
            >
              {s.done ? "✓" : s.pending ? "…" : ""}
            </span>
            <span style={{ color: s.done ? "#111827" : "#6b7280" }}>{s.label}</span>
            <span className="sr-only">{s.done ? " เสร็จแล้ว" : s.pending ? " กำลังทำ" : " รอดำเนินการ"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrintDonePanel({
  onReprint,
  onBack,
  onClose,
}: {
  onReprint: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const reprintRef = useRef<HTMLButtonElement>(null);

  // Focus first action on mount + trap focus + close on Escape.
  useEffect(() => {
    reprintRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-done-title"
      aria-describedby="print-done-desc"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        style={{
          background: "white",
          padding: 28,
          borderRadius: 12,
          maxWidth: 420,
          width: "90%",
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 56, height: 56, borderRadius: 999, background: "#dcfce7",
            color: "#16a34a", fontSize: 30, display: "inline-flex",
            alignItems: "center", justifyContent: "center", marginBottom: 12,
          }}
        >✓</div>
        <h2 id="print-done-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, margin: 0 }}>
          พิมพ์เอกสารเรียบร้อยแล้ว
        </h2>
        <div id="print-done-desc" style={{ color: "#6b7280", fontSize: 13, marginBottom: 20, marginTop: 4 }}>
          หากพิมพ์ไม่ครบ สามารถกด "พิมพ์อีกครั้ง" ได้
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            ref={reprintRef}
            type="button"
            onClick={onReprint}
            style={{ padding: "10px 16px", background: "#2563eb", color: "white", borderRadius: 8, fontSize: 14, fontWeight: 500 }}
          >พิมพ์อีกครั้ง</button>
          <button
            type="button"
            onClick={onBack}
            style={{ padding: "10px 16px", background: "white", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
          >กลับไปที่รายการเอกสาร</button>
          <button
            type="button"
            aria-label="ปิดหน้าต่างพิมพ์ (Esc)"
            onClick={onClose}
            style={{ padding: "10px 16px", background: "white", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#6b7280" }}
          >ปิดหน้าต่าง</button>
        </div>
      </div>
    </div>
  );
}