import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Share2, Loader2, Save, Eye, Printer, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import logoAsset from "@/assets/nattaporn-logo.jpg.asset.json";
import SeoHead from "@/components/SeoHead";
import {
  parseBulkPaste,
  poSubtotal,
  lineTotal,
  itemsToSummary,
  newPoKey,
  type POItem,
} from "./purchase-order/lib/parse";
import { sharePurchaseOrder, openLineOa, LINE_OA_URL } from "./purchase-order/lib/share";
import {
  waitForPoAssets,
  exportPurchaseOrderPdf,
  buildPoPages,
  A4_W_PX,
  A4_H_PX,
  PoRowTooTallError,
  PoBlockTooTallError,
} from "./purchase-order/lib/poPdf";

/**
 * Auto-grow <textarea>: sets height=auto then scrollHeight on mount and
 * whenever the controlled value changes. Programmatic loads (bulk paste,
 * server hydration) resize just like manual typing.
 */
function AutoGrowTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string },
) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}

const STORE = {
  name: "นัฐภรณ์ เชียงกลาง",
  address: "หน้าโรงพยาบาลเชียงกลาง อ.เชียงกลาง จ.น่าน",
  phone1: "094-779-9356 (หญิง)",
  phone2: "088-224-9749 (พี่ปิ่น)",
};

function emptyItem(): POItem {
  return { key: newPoKey(), name: "", quantity: 1, unit: "ชิ้น", price: 0 };
}

function todayParts() {
  const d = new Date();
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: String(d.getMonth() + 1).padStart(2, "0"),
    year: String(d.getFullYear() + 543),
  };
}

const money = (n: number) =>
  (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchaseOrder() {
  const { user, profile } = useAuth();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [schoolOrOrg, setSchoolOrOrg] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);

  const [items, setItems] = useState<POItem[]>([emptyItem()]);
  const [bulkText, setBulkText] = useState("");
  const [bulkWarnings, setBulkWarnings] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [sheetHeight, setSheetHeight] = useState<number>(A4_H_PX);
  const [previewPagesCount, setPreviewPagesCount] = useState(0);
  const previewCleanupRef = useRef<null | (() => void)>(null);
  const previewGenRef = useRef(0);

  const [poNumber, setPoNumber] = useState<string>("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (profile) {
      setCustomerName((v) => v || profile.full_name || profile.display_name || "");
      setCustomerPhone((v) => v || profile.phone || "");
      setSchoolOrOrg((v) => v || profile.school || profile.organization_name || "");
    }
  }, [profile]);

  const subtotal = useMemo(() => poSubtotal(items), [items]);
  const netTotal = useMemo(
    () => Math.max(0, subtotal - (Number(discount) || 0) + (Number(shipping) || 0)),
    [subtotal, discount, shipping],
  );
  const canSubmit = items.some((i) => i.name.trim()) && customerName.trim().length > 0;

  // Responsive A4 preview: measure the wrapper width and scale the sheet
  // down uniformly so the whole page is visible on phone/tablet without
  // cropping. Print / offscreen PDF paths reset scale to 1 (the CSS media
  // query below strips any inline transform for print, and the PDF
  // exporter neutralises the transform on its clone).
  // Responsive scale: ALWAYS measure the stable viewport (the outer
  // max-w-5xl container that stays in normal flow in both edit AND preview
  // modes). Never read width from `wrapRef` — in preview mode it becomes
  // `.po-source-hidden` (position:absolute, shrink-to-fit around the 210mm
  // child), which reports ~A4 width and would reset scale to 1 on mobile.
  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const compute = () => {
      const available = viewport.clientWidth;
      if (available <= 0) return;
      const s = Math.min(1, available / A4_W_PX);
      setPreviewScale(s);
    };
    const ro = new ResizeObserver(compute);
    ro.observe(viewport);
    compute();
    return () => ro.disconnect();
  }, []);

  // Separate observer for edit-mode height reservation: measures the
  // source sheet's real scrollHeight. Only used for the wrapper height in
  // edit mode — never for scale.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || typeof ResizeObserver === "undefined") return;
    const compute = () => {
      const raw = sheet.scrollHeight || A4_H_PX;
      setSheetHeight(raw);
    };
    const ro = new ResizeObserver(compute);
    ro.observe(sheet);
    compute();
    return () => ro.disconnect();
  }, []);

  const setItem = (idx: number, p: Partial<POItem>) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  const addItem = () => setItems((arr) => [...arr, emptyItem()]);
  const removeItem = (idx: number) =>
    setItems((arr) => (arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr));
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    setItems((arr) => {
      const copy = [...arr];
      const [r] = copy.splice(from, 1);
      copy.splice(to, 0, r);
      return copy;
    });
  };

  const runBulkParse = () => {
    const { items: parsed, warnings } = parseBulkPaste(bulkText);
    setBulkWarnings(warnings);
    if (!parsed.length) {
      toast.error("อ่านรายการไม่ได้ ลองปรับรูปแบบและวางใหม่");
      return;
    }
    setItems((cur) => {
      const cleaned = cur.filter((it) => it.name.trim());
      return [...cleaned, ...parsed];
    });
    setBulkText("");
    toast.success(`เพิ่มรายการ ${parsed.length} แถวเรียบร้อย`);
  };

  const persist = async (opts: { submit: boolean }): Promise<{ id: string; po: string } | null> => {
    if (!user) { toast.error("กรุณาเข้าสู่ระบบก่อนใช้งาน"); return null; }
    let po = poNumber;
    if (!po) {
      const { data, error } = await supabase.rpc("next_customer_po_number");
      if (error) { toast.error(`สร้างเลขที่ไม่สำเร็จ: ${error.message}`); return null; }
      po = data as string;
      setPoNumber(po);
    }
    const payload = {
      po_number: po,
      user_id: user.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      school_or_org: schoolOrOrg,
      seller_name: sellerName,
      items: items.filter((it) => it.name.trim()) as any,
      subtotal,
      note,
      status: opts.submit ? "submitted" : "draft",
      source: "customer",
      submitted_at: opts.submit ? new Date().toISOString() : null,
    };
    // เซสชันหมดอายุจะทำให้ query วิ่งแบบ anon แล้วโดน permission denied
    // แปลงเป็นข้อความที่ผู้ใช้เข้าใจได้ แทนข้อความ error ดิบจากฐานข้อมูล
    const saveError = (message: string) =>
      /permission denied|JWT|42501/i.test(message)
        ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วบันทึกอีกครั้ง"
        : `บันทึกไม่สำเร็จ: ${message}`;
    let id = savedId;
    if (id) {
      const { error } = await supabase.from("customer_purchase_orders").update(payload).eq("id", id);
      if (error) { toast.error(saveError(error.message)); return null; }
    } else {
      const { data, error } = await supabase.from("customer_purchase_orders").insert(payload).select("id").single();
      if (error) { toast.error(saveError(error.message)); return null; }
      id = data.id as string;
      setSavedId(id);
    }
    return { id, po };
  };

  const saveDraft = async () => {
    setSaving(true);
    const r = await persist({ submit: false });
    setSaving(false);
    if (r) toast.success(`บันทึก ${r.po} เรียบร้อย`);
  };

  const share = async () => {
    setSharing(true);
    const r = await persist({ submit: true });
    if (!r) { setSharing(false); return; }
    supabase.functions.invoke("line-notify", { body: { kind: "purchase_order", purchase_order_id: r.id } }).catch(() => {});
    const summary = itemsToSummary(items, { poNumber: r.po, customer: customerName, org: schoolOrOrg });
    const out = await sharePurchaseOrder({ poNumber: r.po, summary });
    setSharing(false);
    if (out.channel === "webshare") toast.success("แชร์เรียบร้อย");
    else if (out.channel === "clipboard") toast.success("คัดลอกข้อความไปยังคลิปบอร์ดแล้ว");
    else if (out.channel === "download") toast.success("ดาวน์โหลดสรุปเป็นไฟล์ .txt");
    else toast.error(`แชร์ไม่สำเร็จ: ${out.error ?? ""}`);
  };

  const doPrint = async () => {
    await waitForPoAssets(document.getElementById("po-print-root"));
    document.body.classList.add("po-printing");
    const cleanup = () => {
      document.body.classList.remove("po-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(() => window.print(), 60);
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const root = document.getElementById("po-print-root");
      if (!root) { toast.error("ไม่พบเอกสารสำหรับส่งออก"); return; }
      await exportPurchaseOrderPdf(root, `ใบสั่งสินค้า-${poNumber || "draft"}.pdf`);
      toast.success("ดาวน์โหลด PDF เรียบร้อย");
    } catch (e: any) {
      if (e instanceof PoRowTooTallError || e instanceof PoBlockTooTallError) {
        toast.error(e.message);
      } else {
        toast.error(`สร้าง PDF ไม่สำเร็จ: ${e?.message ?? String(e)}`);
      }
    } finally {
      setPdfBusy(false);
    }
  };

  // ---- True multi-page A4 preview ---------------------------------------
  // Re-runs when relevant document data changes while preview is open, so
  // the preview stays in sync (debounced to avoid flicker).
  const rebuildPreview = useCallback(async () => {
    const host = previewHostRef.current;
    const src = document.getElementById("po-print-root");
    if (!host || !src) return;
    // Claim a generation token for this rebuild. Any concurrent/older
    // rebuild becomes stale and MUST discard its output.
    const myGen = ++previewGenRef.current;
    const isStale = () => myGen !== previewGenRef.current || !host.isConnected;

    // Wipe any previous preview DOM before starting the (async) rebuild.
    if (previewCleanupRef.current) {
      previewCleanupRef.current();
      previewCleanupRef.current = null;
    }
    await waitForPoAssets(src);
    if (isStale()) return; // preview closed / newer rebuild scheduled
    try {
      const { container, pages } = buildPoPages(src, { offscreen: false });
      if (isStale()) {
        if (container.parentNode) container.parentNode.removeChild(container);
        return;
      }
      host.appendChild(container); // moves out of body sandbox into the host
      setPreviewPagesCount(pages.length);
      previewCleanupRef.current = () => {
        if (container.parentNode) container.parentNode.removeChild(container);
      };
    } catch (e: any) {
      if (isStale()) return;
      if (e instanceof PoRowTooTallError || e instanceof PoBlockTooTallError) {
        toast.error(e.message);
      } else {
        toast.error(`สร้างตัวอย่างไม่สำเร็จ: ${e?.message ?? String(e)}`);
      }
      setPreviewMode(false);
    }
  }, []);

  useEffect(() => {
    if (!previewMode) {
      // Invalidate any in-flight rebuild.
      previewGenRef.current++;
      if (previewCleanupRef.current) {
        previewCleanupRef.current();
        previewCleanupRef.current = null;
      }
      setPreviewPagesCount(0);
      return;
    }
    // Debounce rebuilds while typing.
    const t = setTimeout(() => { void rebuildPreview(); }, 120);
    return () => clearTimeout(t);
  }, [
    previewMode, rebuildPreview,
    items, customerName, customerPhone, schoolOrOrg, customerAddress,
    sellerName, note, discount, shipping, poNumber, savedId,
  ]);

  useEffect(() => () => {
    // On unmount: invalidate + wipe any preview DOM.
    previewGenRef.current++;
    if (previewCleanupRef.current) previewCleanupRef.current();
  }, []);
  // ------------------------------------------------------------------------

  const t = todayParts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-rose-100 pb-24">
      <SeoHead
        title="ใบสั่งสินค้า — นัฐภรณ์ เชียงกลาง"
        description="แบบฟอร์มใบสั่งสินค้าออนไลน์สำหรับลูกค้าร้านนัฐภรณ์ เชียงกลาง เพื่อประเมินราคาเบื้องต้น"
        path="/purchase-order"
      />

      {/* FLOATING TOOLBAR — never printed */}
      <div
        data-print-exclude="true"
        className="po-no-print sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-orange-200 shadow-sm"
      >
        <div className="mx-auto max-w-5xl px-3 py-2 flex flex-wrap items-center gap-2 overflow-x-auto">
          <div className="font-semibold text-orange-700 mr-2 shrink-0">ใบสั่งสินค้า</div>
          <Button size="sm" variant="outline" onClick={() => setPreviewMode((v) => !v)}
            className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50 shrink-0">
            <Eye className="h-4 w-4 mr-1" />{previewMode ? "แก้ไข" : "ดูตัวอย่าง"}
          </Button>
          <Button size="sm" variant="outline" onClick={share} disabled={sharing || !canSubmit}
            className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50 shrink-0">
            {sharing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />}
            แชร์
          </Button>
          <Button size="sm" variant="outline" onClick={doPrint}
            className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50 shrink-0">
            <Printer className="h-4 w-4 mr-1" />พิมพ์
          </Button>
          <Button size="sm" variant="outline" onClick={downloadPdf} disabled={pdfBusy}
            className="bg-white text-gray-700 border-gray-300 hover:bg-gray-50 shrink-0">
            {pdfBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
            ดาวน์โหลด PDF
          </Button>
          <Button size="sm" onClick={saveDraft} disabled={saving || !canSubmit}
            className="bg-orange-600 hover:bg-orange-700 text-white shrink-0">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            บันทึก
          </Button>
          <a
            href={LINE_OA_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); openLineOa(); }}
            className="ml-auto inline-flex items-center justify-center h-9 w-9 rounded-full bg-[#06C755] hover:brightness-95 text-white shadow shrink-0"
            aria-label="ส่งผ่าน LINE"
            title="ส่งผ่าน LINE"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M19.365 9.89c0-3.943-3.953-7.153-8.815-7.153C5.688 2.737 1.735 5.947 1.735 9.89c0 3.535 3.135 6.494 7.372 7.052.288.062.68.19.78.435.089.222.058.57.028.796l-.126.756c-.038.223-.178.874.766.477.944-.398 5.089-3 6.943-5.135h-.001c1.28-1.404 1.868-2.83 1.868-4.381zM8.02 12.34a.211.211 0 0 1-.211.212H6.14c-.117 0-.211-.095-.211-.212V8.14c0-.117.094-.212.211-.212h.29c.117 0 .212.095.212.212v3.777h1.377c.117 0 .211.095.211.212v.211zm.98-.001a.211.211 0 0 1-.211.212h-.291a.211.211 0 0 1-.211-.212V8.14c0-.117.094-.212.211-.212h.29c.117 0 .212.095.212.212v4.199zm3.865 0a.211.211 0 0 1-.211.212h-.29a.211.211 0 0 1-.17-.085l-1.827-2.47v2.343a.211.211 0 0 1-.211.212h-.29a.211.211 0 0 1-.212-.212V8.14c0-.117.094-.212.211-.212h.334a.211.211 0 0 1 .17.085l1.827 2.47V8.14c0-.117.094-.212.211-.212h.29c.117 0 .212.095.212.212v4.2zm3.207-3.665a.211.211 0 0 1-.211.212h-1.377v.855h1.377c.117 0 .211.095.211.212v.29a.211.211 0 0 1-.211.212h-1.377v.855h1.377c.117 0 .211.095.211.212v.29a.211.211 0 0 1-.211.212h-1.879a.211.211 0 0 1-.211-.212V8.14c0-.117.094-.212.211-.212h1.879c.117 0 .211.095.211.212v.245z"/>
            </svg>
          </a>
        </div>
      </div>

      {/* PASTE INPUT — screen only */}
      <div data-print-exclude="true" className="po-no-print mx-auto max-w-5xl px-3 pt-4">
        <details className="rounded-lg border border-orange-200 bg-white p-3">
          <summary className="cursor-pointer font-medium text-orange-800">
            📋 วางรายการสินค้า (ก็อปจาก Excel / Sheets / ข้อความได้เลย)
          </summary>
          <div className="mt-3 space-y-2">
            <Textarea
              rows={5}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"วางได้ทุกรูปแบบ TSV/CSV/ข้อความ\nระบบจะแยก ชื่อ · จำนวน · หน่วย · ราคา อัตโนมัติ\nตัวอย่าง:\nกระดาษ A4\t5\tรีม\t120\nปากกา\t10\tด้าม\t7"}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={runBulkParse}>วิเคราะห์และเพิ่มรายการ</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setBulkText(""); setBulkWarnings([]); }}>ล้าง</Button>
            </div>
            {bulkWarnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 space-y-0.5">
                {bulkWarnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
          </div>
        </details>
      </div>

      {/* A4 DOCUMENT ROOT — only content that prints.
          This container is the STABLE preview viewport: it stays in normal
          flow in both edit and preview modes, so `previewScale` is always
          computed from real available width. */}
      <div ref={previewViewportRef} className="mx-auto max-w-5xl px-3 py-6">
        {/* Visible preview host — shown ONLY in preview mode. Contains
            statically-paginated A4 pages built by the same paginator as PDF. */}
        {previewMode && (
          <div
            data-po-preview-host="true"
            className="po-preview-host mb-6"
            style={{
              // Reserve the combined scaled height of all pages + gaps so
              // the surrounding page reflows correctly on phone/tablet.
              minHeight: previewScale < 1
                ? `${(A4_H_PX * previewPagesCount + 24 * Math.max(0, previewPagesCount - 1)) * previewScale}px`
                : undefined,
              transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
              transformOrigin: "top left",
              width: previewScale < 1 ? `${A4_W_PX}px` : undefined,
            }}
          >
            <div ref={previewHostRef} className="po-preview-pages" />
          </div>
        )}

        <div
          ref={wrapRef}
          className={`po-sheet-wrap ${previewMode ? "po-source-hidden" : ""}`}
          style={{
            // In edit mode reserve the ACTUAL sheet height * scale so tall
            // documents (many rows, long note) never overlap siblings.
            height: !previewMode && previewScale < 1
              ? `${sheetHeight * previewScale}px`
              : undefined,
          }}
        >
          <div
            id="po-print-root"
            ref={sheetRef}
            data-po-print="true"
            className={"po-sheet text-[12pt] leading-relaxed"}
            style={{
              transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
              transformOrigin: "top left",
            }}
          >
            {/* HEADER */}
            <div data-po-section="header" className="po-block-keep flex justify-between items-start gap-6 pb-3 border-b-2 border-orange-500">
              <div className="flex items-center gap-4">
                <img
                  src={logoAsset.url}
                  alt="โลโก้ นัฐภรณ์ เชียงกลาง"
                  crossOrigin="anonymous"
                  className="h-24 w-24 object-contain bg-white"
                />
                <div>
                  <div className="font-bold text-[16pt] text-gray-900">{STORE.name}</div>
                  <div className="text-[10.5pt] text-gray-700">{STORE.address}</div>
                  <div className="text-[10.5pt] text-gray-700">โทร. {STORE.phone1}</div>
                  <div className="text-[10.5pt] text-gray-700">โทร. {STORE.phone2}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <h1 className="text-[28pt] font-extrabold text-orange-600 leading-none tracking-tight">
                  ใบสั่งสินค้า
                </h1>
                <div className="text-[10pt] text-gray-500 mt-1">Purchase Order</div>
                <div className="mt-3 text-[11pt] flex items-center gap-2 justify-end">
                  <span className="text-gray-600">เลขที่ใบสั่งสินค้า</span>
                  <span className="font-mono font-semibold min-w-[120px] inline-block border-b border-dotted border-gray-400 px-1 text-right">
                    {poNumber || "................................"}
                  </span>
                </div>
                <div className="mt-1 text-[11pt] flex items-center gap-2 justify-end">
                  <span className="text-gray-600">วันที่ออกเอกสาร</span>
                  <span className="border-b border-dotted border-gray-400 px-2">{t.day}</span>/
                  <span className="border-b border-dotted border-gray-400 px-2">{t.month}</span>/
                  <span className="border-b border-dotted border-gray-400 px-2">{t.year}</span>
                </div>
                <div className="mt-1 text-[11pt] flex items-center gap-2 justify-end">
                  <span className="text-gray-600">ชื่อผู้ขาย/ผู้จัดทำ</span>
                  <span className="border-b border-dotted border-gray-400 px-2 min-w-[120px] text-right inline-block">
                    {sellerName || "................................"}
                  </span>
                </div>
              </div>
            </div>

            {/* NOTICE */}
            <div data-po-section="notice" className="po-notice mt-4 po-block-keep">
              <div className="font-bold text-[12pt] mb-1">คำชี้แจง ›› ใบสั่งสินค้า</div>
              <div className="text-[10.5pt] whitespace-pre-line">
                {"ใบสั่งสินค้าเป็นเอกสารประเมินราคาเท่านั้น\nไม่ใช่ใบส่งของ และไม่ใช่ใบเสนอราคา\n\nหากลูกค้าต้องการใบเสนอราคา หรือใบส่งของ สามารถเลือกสินค้าและกดคำสั่งซื้อ เพื่อให้แอดมินจัดทำเอกสารให้ได้เลยค่ะ"}
              </div>
            </div>

            {/* CUSTOMER + DOCUMENT DATA */}
            <div data-po-section="info" className="grid grid-cols-2 gap-8 mt-5 po-block-keep">
              <div>
                <div className="font-bold text-orange-700 text-[12pt] border-b border-orange-300 pb-1 mb-2">
                  ข้อมูลลูกค้า
                </div>
                <div className="space-y-2 text-[11pt]">
                  <label className="block">
                    <span className="text-gray-600 mr-2">ชื่อลูกค้า</span>
                    <input className="po-input-line" value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)} placeholder="ชื่อ-สกุล" />
                  </label>
                  <label className="block">
                    <span className="text-gray-600 mr-2">เบอร์โทร</span>
                    <input className="po-input-line" value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)} placeholder="0xx-xxx-xxxx" />
                  </label>
                  <label className="block">
                    <span className="text-gray-600 mr-2">โรงเรียน/หน่วยงาน</span>
                    <input className="po-input-line" value={schoolOrOrg}
                      onChange={(e) => setSchoolOrOrg(e.target.value)} placeholder="เช่น รร.เชียงกลาง" />
                  </label>
                  <label className="block">
                    <span className="text-gray-600 mr-2">ที่อยู่/รายละเอียดเพิ่มเติม</span>
                    <input className="po-input-line" value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)} placeholder="ที่อยู่จัดส่ง" />
                  </label>
                </div>
              </div>
              <div>
                <div className="font-bold text-orange-700 text-[12pt] border-b border-orange-300 pb-1 mb-2">
                  ข้อมูลเอกสาร
                </div>
                <div className="space-y-2 text-[11pt]">
                  <div>
                    <span className="text-gray-600 mr-2">เลขที่ใบสั่งสินค้า</span>
                    <span className="font-mono border-b border-dotted border-gray-400 px-2 inline-block min-w-[160px]">
                      {poNumber || "................................"}
                    </span>
                  </div>
                  <label className="block">
                    <span className="text-gray-600 mr-2">ชื่อผู้ขาย/ผู้จัดทำ</span>
                    <input className="po-input-line" value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)} placeholder="เช่น หญิง / พี่ปิ่น" />
                  </label>
                  <div>
                    <span className="text-gray-600 mr-2">วันที่</span>
                    <span className="border-b border-dotted border-gray-400 px-2">{t.day}</span> /
                    <span className="border-b border-dotted border-gray-400 px-2">{t.month}</span> /
                    <span className="border-b border-dotted border-gray-400 px-2">{t.year}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 mr-2">สถานะเอกสาร</span>
                    <span className="border-b border-dotted border-gray-400 px-2">
                      {savedId ? "บันทึกแล้ว" : "ร่าง (ยังไม่บันทึก)"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* PRODUCT TABLE */}
            <table data-po-section="items" className="po-items mt-5">
              <thead>
                <tr>
                  <th style={{ width: "10mm" }}>ลำดับ</th>
                  <th>รายการสินค้า</th>
                  <th style={{ width: "20mm" }}>จำนวน</th>
                  <th style={{ width: "20mm" }}>หน่วย</th>
                  <th style={{ width: "26mm" }}>ราคา/หน่วย</th>
                  <th style={{ width: "28mm" }}>ยอดรวม</th>
                  <th style={{ width: "22mm" }} className="po-no-print" data-print-exclude="true"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.key}>
                    <td className="text-center align-top">{idx + 1}</td>
                    <td>
                      <AutoGrowTextarea
                        rows={1}
                        className="po-textarea-line"
                        style={{ minHeight: 34 }}
                        value={it.name}
                        onChange={(e) => setItem(idx, { name: e.target.value })}
                        placeholder="ชื่อสินค้าและรายละเอียดเพิ่มเติม"
                      />
                    </td>
                    <td>
                      <input type="number" min={0} className="po-input-line text-right" value={it.quantity}
                        onChange={(e) => setItem(idx, { quantity: Number(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <input className="po-input-line text-center" value={it.unit}
                        onChange={(e) => setItem(idx, { unit: e.target.value })} />
                    </td>
                    <td>
                      <input type="number" min={0} step="0.01" className="po-input-line text-right" value={it.price}
                        onChange={(e) => setItem(idx, { price: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="text-right tabular-nums font-medium">{money(lineTotal(it))}</td>
                    <td className="po-no-print" data-print-exclude="true">
                      <div className="flex items-center gap-0.5">
                        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === 0} onClick={() => moveItem(idx, idx - 1)}><ArrowUp className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === items.length - 1} onClick={() => moveItem(idx, idx + 1)}><ArrowDown className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-3">— ยังไม่มีรายการ —</td></tr>
                )}
              </tbody>
            </table>

            <div className="mt-2 po-no-print" data-print-exclude="true">
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1" />เพิ่มแถว
              </Button>
            </div>

            {/* TOTALS */}
            <div data-po-section="totals" className="mt-6 flex justify-end po-block-keep">
              <div className="w-full max-w-sm text-[11pt]">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">ยอดรวมสินค้า</span>
                  <span className="tabular-nums font-medium">{money(subtotal)} บาท</span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-gray-600">ส่วนลด</span>
                  <span className="inline-flex items-center gap-1">
                    <input type="number" min={0} step="0.01" className="po-input-line text-right w-24" value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
                    <span>บาท</span>
                  </span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-gray-600">ค่าจัดส่ง</span>
                  <span className="inline-flex items-center gap-1">
                    <input type="number" min={0} step="0.01" className="po-input-line text-right w-24" value={shipping}
                      onChange={(e) => setShipping(Number(e.target.value) || 0)} />
                    <span>บาท</span>
                  </span>
                </div>
                <div className="mt-2 border-t-2 border-orange-500 pt-2 flex justify-between items-baseline">
                  <span className="font-bold text-[13pt] text-orange-700">ยอดรวมสุทธิ</span>
                  <span className="font-bold text-[16pt] text-orange-700 tabular-nums">{money(netTotal)} บาท</span>
                </div>
              </div>
            </div>

            {/* NOTES + SIGNATURE */}
            <div data-po-section="notes" className="grid grid-cols-2 gap-8 mt-8 po-block-keep">
              <div>
                <div className="font-bold text-orange-700 text-[12pt] mb-2">หมายเหตุ</div>
                <AutoGrowTextarea
                  className="po-textarea-line"
                  rows={4}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ระบุความต้องการเพิ่มเติม เช่น กำหนดส่ง / งบประมาณ"
                />
              </div>
              <div className="text-center flex flex-col justify-end">
                <div className="border-b border-gray-500 mx-8 mt-8 mb-1">&nbsp;</div>
                <div className="text-[11pt]">ลงชื่อ .......................................</div>
                <div className="text-[10pt] text-gray-600 mt-1">ผู้จัดทำ / ผู้ขาย</div>
                <div className="text-[10.5pt] mt-2">
                  วันที่
                  <span className="border-b border-dotted border-gray-400 px-2 mx-1">{t.day}</span>/
                  <span className="border-b border-dotted border-gray-400 px-2 mx-1">{t.month}</span>/
                  <span className="border-b border-dotted border-gray-400 px-2 mx-1">{t.year}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground pt-4 po-no-print" data-print-exclude="true">
          <Link to="/my-orders" className="underline">ดูใบสั่งสินค้าและคำสั่งซื้อของฉัน</Link>
        </div>
      </div>
    </div>
  );
}