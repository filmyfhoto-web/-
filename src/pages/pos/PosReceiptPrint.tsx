import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Printer, ArrowLeft, FileDown, Loader2, ExternalLink } from "lucide-react";
import { openReceiptInNewTab, safeReturnTo } from "./openReceipt";
import {
  PAPER_LABEL,
  computeVat,
  formatBaht,
  formatThaiDateTime,
  loadPosSettings,
  loadReceiptPaper,
  paperBodyWidth,
  paperFontPx,
  paperPageCss,
  saveReceiptPaper,
  type PosPaperSize,
} from "./receiptPrefs";
import { parsePosNotes } from "@/lib/posNotes";
import { fetchStoreProfile, type PosStoreProfile } from "@/lib/posStoreProfile";
import { loadRegisterPrefs } from "./posRegisterPrefs";

type Receipt = {
  id: string;
  receipt_number: string;
  created_at: string;
  customer_name: string | null;
  payment_type: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  total: number;
  cash_received: number | null;
  change_amount: number | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_reason?: string | null;
  branch?: string | null;
};
type Item = {
  id: string;
  name: string;
  qty: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
  variant_label: string | null;
};

const PAY_LABEL: Record<string, string> = { cash: "เงินสด", qr: "QR", transfer: "โอน", card: "บัตร", credit: "ลงบัญชี" };

/**
 * Why the receipt could not be shown. A permission/query/network failure must
 * never be reported as "ไม่พบใบเสร็จ" — the operator needs to know whether to
 * retry, sign in again, or call the owner.
 */
export type ReceiptLoadError = "denied" | "expired" | "offline" | "query" | "not_found";

/** Map a PostgREST/Supabase error onto an actionable Thai state. */
export function classifyReceiptError(err: unknown): ReceiptLoadError {
  if (!err) return "not_found";
  const e = err as { code?: string; status?: number; message?: string };
  const code = String(e.code ?? "");
  const status = Number(e.status ?? 0);
  const msg = String(e.message ?? "").toLowerCase();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (status === 401 || /jwt expired|invalid jwt|refresh token/i.test(msg)) return "expired";
  if (status === 403 || code === "42501" || code === "PGRST301" || /permission denied|row-level security|not authorized/i.test(msg)) {
    return "denied";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "offline";
  return "query";
}

const ERROR_TEXT: Record<ReceiptLoadError, { title: string; hint: string }> = {
  denied: {
    title: "บัญชีนี้ไม่มีสิทธิ์เปิดใบเสร็จนี้",
    hint: "กรุณาเข้าสู่ระบบด้วยบัญชีพนักงาน/แอดมินที่ได้รับสิทธิ์ POS แล้วลองใหม่",
  },
  expired: {
    title: "เซสชันหมดอายุ",
    hint: "กรุณาเข้าสู่ระบบใหม่แล้วเปิดใบเสร็จอีกครั้ง",
  },
  offline: {
    title: "เชื่อมต่ออินเทอร์เน็ตไม่ได้",
    hint: "ตรวจสอบสัญญาณแล้วกดลองใหม่ — ใบเสร็จถูกบันทึกไว้แล้ว ไม่หาย",
  },
  query: {
    title: "โหลดข้อมูลใบเสร็จไม่สำเร็จ",
    hint: "เกิดข้อผิดพลาดในการอ่านข้อมูล กรุณากดลองใหม่",
  },
  not_found: {
    title: "ไม่พบใบเสร็จ",
    hint: "เลขที่บิลนี้อาจถูกลบ หรือลิงก์ไม่ถูกต้อง",
  },
};

/**
 * Auto-print is opt-in and desktop-only. Firing `window.print()` on mount is
 * what made iOS Safari / installed PWAs bounce out of the app, so production
 * defaults to a manual button press.
 */
export function shouldAutoPrint(search: URLSearchParams, win?: Window): boolean {
  if (search.get("autoprint") !== "1") return false;
  const w = win ?? (typeof window !== "undefined" ? window : undefined);
  if (!w) return false;
  const ua = String(w.navigator?.userAgent ?? "");
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return false;
  try {
    if (w.matchMedia?.("(display-mode: standalone)")?.matches) return false;
  } catch { /* matchMedia unavailable → treat as browser tab */ }
  // @ts-expect-error iOS Safari standalone flag
  if (w.navigator?.standalone) return false;
  return true;
}

/** Fonts + two frames, so Thai glyphs are laid out before the print dialog. */
async function waitForPrintReady(): Promise<void> {
  try {
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) await fonts.ready;
  } catch { /* fonts API optional */ }
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== "function") return resolve();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export default function PosReceiptPrint() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [r, setR] = useState<Receipt | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<ReceiptLoadError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [prefs] = useState(() => loadPosSettings());
  const [paper, setPaper] = useState<PosPaperSize>(() => loadReceiptPaper());
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [storeProfile, setStoreProfile] = useState<PosStoreProfile | null>(null);
  const printedRef = useRef(false);
  const printingRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const stateReturn = (location.state as { returnTo?: string } | null)?.returnTo;
  const returnTo = safeReturnTo(stateReturn ?? sp.get("returnTo"));
  const backLabel = returnTo.startsWith("/pos/history") ? "กลับประวัติ" : "กลับไป POS";
  const autoPrint = shouldAutoPrint(sp);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoaded(false);
    setErr(null);
    (async () => {
      const [head, lines] = await Promise.all([
        supabase.from("pos_receipts").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("pos_receipt_items")
          .select("id,name,qty,unit,unit_price,line_total,variant_label")
          .eq("receipt_id", id),
      ]);
      if (!alive) return;
      // A permission or query failure must not print a half-empty receipt.
      const failure = head.error ?? lines.error;
      if (failure) {
        setErr(classifyReceiptError(failure));
        setR(null);
        setItems([]);
        setLoaded(true);
        return;
      }
      if (!head.data) {
        setErr("not_found");
        setR(null);
        setItems([]);
        setLoaded(true);
        return;
      }
      setR(head.data as unknown as Receipt);
      setItems((lines.data ?? []) as unknown as Item[]);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [id, reloadKey]);

  // Remember the paper per branch as soon as the receipt is known.
  useEffect(() => {
    if (r) setPaper(loadReceiptPaper(r.branch ?? null));
  }, [r]);

  // Store branding for the branch that issued this receipt (falls back to the
  // register configured on this device).
  useEffect(() => {
    if (!r) return;
    let alive = true;
    const key = r.branch || loadRegisterPrefs().storeKey;
    void fetchStoreProfile(key).then((p) => { if (alive) setStoreProfile(p); });
    return () => { alive = false; };
  }, [r]);

  const changePaper = useCallback(
    (next: PosPaperSize) => {
      setPaper(next);
      saveReceiptPaper(next, r?.branch ?? null);
    },
    [r?.branch],
  );

  /**
   * One `window.print()` per user gesture. Looping with setTimeout for extra
   * copies made Safari close/bounce the page; the copy count is surfaced as a
   * hint so the operator sets it in the browser's own print dialog.
   */
  const doPrint = useCallback(async () => {
    if (printingRef.current) return;
    printingRef.current = true;
    setPrinting(true);
    try {
      await waitForPrintReady();
      window.print();
    } finally {
      setTimeout(() => {
        printingRef.current = false;
        setPrinting(false);
      }, 1200);
    }
  }, []);

  useEffect(() => {
    if (!loaded || !r || !autoPrint || printedRef.current) return;
    printedRef.current = true;
    void doPrint();
  }, [loaded, r, autoPrint, doPrint]);

  async function downloadPdf() {
    if (!r || !bodyRef.current || pdfBusy) return;
    setPdfBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(bodyRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      const widthMm = paper === "58mm" ? 58 : paper === "A4" ? 210 : 80;
      const heightMm = (canvas.height / canvas.width) * widthMm;
      const pdf =
        paper === "A4"
          ? new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
          : new jsPDF({ unit: "mm", format: [widthMm, Math.max(heightMm, 40)] });
      if (paper === "A4") {
        const w = 186;
        pdf.addImage(img, "PNG", 12, 12, w, (canvas.height / canvas.width) * w);
      } else {
        pdf.addImage(img, "PNG", 0, 0, widthMm, heightMm);
      }
      pdf.save(`${r.receipt_number}.pdf`);
    } catch {
      /* PDF is a convenience: printing remains the primary path */
    } finally {
      setPdfBusy(false);
    }
  }

  if (!loaded) return <div className="p-6 text-center text-sm text-muted-foreground">กำลังโหลด…</div>;
  if (!r) {
    const kind = err ?? "not_found";
    const text = ERROR_TEXT[kind];
    return (
      <div className="grid min-h-screen place-items-center px-4" data-testid="receipt-error" data-error={kind}>
        <div className="w-full max-w-sm space-y-3 rounded-2xl border bg-card p-5 text-center">
          <h1 className="text-base font-bold text-destructive">{text.title}</h1>
          <p className="text-sm text-muted-foreground">{text.hint}</p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => setReloadKey((k) => k + 1)} data-testid="receipt-retry">ลองใหม่</Button>
            {(kind === "denied" || kind === "expired") && (
              <Button variant="outline" onClick={() => navigate("/staff/login")} data-testid="receipt-relogin">
                เข้าสู่ระบบใหม่
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate(returnTo)} data-testid="receipt-back">{backLabel}</Button>
          </div>
        </div>
      </div>
    );
  }

  const vat = computeVat(Number(r.total), prefs);
  const fontPx = paperFontPx(paper);
  const bodyWidth = paperBodyWidth(paper);
  const storeName = storeProfile?.shop_name?.trim() || prefs.storeName || prefs.storeLabel || "ร้านเครื่องเขียน";
  const storeAddress = storeProfile?.address || prefs.storeAddress;
  const storePhone = storeProfile?.phone || prefs.storePhone;
  const storeEmail = storeProfile?.email || "";
  const parsedNotes = parsePosNotes(r.notes);
  const isCredit = r.payment_status === "credit";
  /** Credit bills must always carry teacher, school, bill no., status and note. */
  const NOT_SPECIFIED = "ไม่ระบุ";

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      <style>{`
        ${paperPageCss(paper)}
        @media print {
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .receipt {
            width: ${bodyWidth} !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            page-break-inside: auto;
          }
          .receipt tr { page-break-inside: avoid; }
        }
      `}</style>

      <div
        className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="text-sm font-semibold">พิมพ์ใบเสร็จ {r.receipt_number}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={paper} onValueChange={(v) => changePaper(v as PosPaperSize)}>
            <SelectTrigger className="h-8 w-[150px]" data-testid="receipt-paper-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PAPER_LABEL) as PosPaperSize[]).map((p) => (
                <SelectItem key={p} value={p}>{PAPER_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={downloadPdf} disabled={pdfBusy} data-testid="receipt-pdf">
            {pdfBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />} PDF
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openReceiptInNewTab(r.id, { returnTo })}
            data-testid="receipt-newtab"
            title="เปิดใบเสร็จในแท็บใหม่ (ตัวเลือกเสริม)"
          >
            <ExternalLink className="mr-1 h-4 w-4" /> แท็บใหม่
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(returnTo)} data-testid="receipt-back-top">
            <ArrowLeft className="mr-1 h-4 w-4" /> {backLabel}
          </Button>
          <Button size="sm" onClick={() => void doPrint()} disabled={printing || !loaded} data-testid="receipt-print">
            {printing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />} พิมพ์
          </Button>
          {prefs.copies > 1 && (
            <span className="text-[11px] text-muted-foreground" data-testid="receipt-copies-hint">
              ตั้งจำนวนสำเนา {prefs.copies} ชุดในหน้าต่างพิมพ์ของเบราว์เซอร์
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto my-4 w-full overflow-x-auto px-2" style={{ maxWidth: paper === "A4" ? "210mm" : "84mm" }}>
        <div
          ref={bodyRef}
          className="receipt bg-white p-3 text-black shadow border"
          data-testid="receipt-body"
          data-paper={paper}
          style={{
            width: bodyWidth,
            maxWidth: "100%",
            marginInline: "auto",
            fontFamily: "'Sarabun', 'Noto Sans Thai', 'Helvetica Neue', sans-serif",
            fontSize: `${fontPx}px`,
            lineHeight: 1.4,
          }}
        >
          <div className="text-center">
            {storeProfile?.logo_url && (
              <img
                src={storeProfile.logo_url}
                alt={`โลโก้ร้าน${storeName}`}
                data-testid="receipt-store-logo"
                className="mx-auto mb-1 h-12 w-12 rounded object-cover"
                crossOrigin="anonymous"
              />
            )}
            <div className="text-base font-extrabold">{storeName}</div>
            {storeAddress && <div className="text-[11px] whitespace-pre-line" data-testid="receipt-store-address">{storeAddress}</div>}
            {storePhone && <div className="text-[11px]" data-testid="receipt-store-phone">โทร. {storePhone}</div>}
            {storeEmail && <div className="text-[11px]" data-testid="receipt-store-email">อีเมล {storeEmail}</div>}
            {prefs.storeTaxId && <div className="text-[11px]">เลขประจำตัวผู้เสียภาษี {prefs.storeTaxId}</div>}
            <div className="text-[11px] font-semibold">
              {vat.enabled ? "ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ" : "ใบเสร็จรับเงิน"}
            </div>
          </div>
          <div className="my-2 border-t border-dashed" />
          <div className="flex justify-between text-[11px]">
            <span>เลขที่</span>
            <span className="font-mono font-semibold">{r.receipt_number}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span>วันที่</span>
            <span>{formatThaiDateTime(r.created_at)}</span>
          </div>
          {(r.customer_name || isCredit) && (
            <div className="flex justify-between text-[11px]" data-testid="receipt-customer-name">
              <span>คุณครู/ลูกค้า</span>
              <span className="max-w-[45mm] truncate text-right">{r.customer_name || NOT_SPECIFIED}</span>
            </div>
          )}
          {(parsedNotes.org || isCredit) && (
            <div className="flex justify-between text-[11px]" data-testid="receipt-customer-org">
              <span>โรงเรียน/หน่วยงาน</span>
              <span className="max-w-[45mm] truncate text-right">{parsedNotes.org || NOT_SPECIFIED}</span>
            </div>
          )}
          <div className="my-2 border-t border-dashed" />
          <table className="w-full text-[11px]">
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="align-top">
                  <td className="pr-1">
                    <div className="font-medium">{it.name}</div>
                    {it.variant_label && <div className="text-[10px] opacity-80">{it.variant_label}</div>}
                    <div className="text-[10px] opacity-80">
                      {Number(it.qty)} {it.unit || ""} × ฿{formatBaht(it.unit_price)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">฿{formatBaht(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="my-2 border-t border-dashed" />
          <div className="flex justify-between text-[11px]">
            <span>ยอดรวม</span>
            <span className="tabular-nums">฿{formatBaht(r.subtotal)}</span>
          </div>
          {Number(r.discount) > 0 && (
            <div className="flex justify-between text-[11px]">
              <span>ส่วนลด</span>
              <span className="tabular-nums">-฿{formatBaht(r.discount)}</span>
            </div>
          )}
          {vat.enabled && (
            <>
              <div className="flex justify-between text-[11px]" data-testid="receipt-vat-base">
                <span>มูลค่าก่อน VAT</span>
                <span className="tabular-nums">฿{formatBaht(vat.base)}</span>
              </div>
              <div className="flex justify-between text-[11px]" data-testid="receipt-vat">
                <span>VAT {vat.rate}%</span>
                <span className="tabular-nums">฿{formatBaht(vat.vat)}</span>
              </div>
            </>
          )}
          <div className="mt-1 flex justify-between text-sm font-extrabold">
            <span>ยอดสุทธิ</span>
            <span className="tabular-nums">฿{formatBaht(r.total)}</span>
          </div>
          <div className="mt-1 flex justify-between text-[11px]">
            <span>วิธีชำระ</span>
            <span>{PAY_LABEL[r.payment_type] || r.payment_type}</span>
          </div>
          {isCredit && (
            <div className="mt-1 border border-dashed p-1 text-[11px]" data-testid="receipt-credit-block">
              <div className="text-center font-bold" data-testid="receipt-credit-badge">
                บิลลงบัญชี — ยังไม่ชำระเงิน
              </div>
              <div className="mt-1 flex justify-between">
                <span>เลขที่บิล</span>
                <span className="font-mono font-semibold" data-testid="receipt-credit-number">{r.receipt_number}</span>
              </div>
              <div className="flex justify-between">
                <span>คุณครู</span>
                <span className="max-w-[45mm] truncate text-right" data-testid="receipt-credit-teacher">
                  {r.customer_name || NOT_SPECIFIED}
                </span>
              </div>
              <div className="flex justify-between">
                <span>โรงเรียน/หน่วยงาน</span>
                <span className="max-w-[45mm] truncate text-right" data-testid="receipt-credit-org">
                  {parsedNotes.org || NOT_SPECIFIED}
                </span>
              </div>
              <div className="mt-1" data-testid="receipt-credit-note">
                หมายเหตุ: {parsedNotes.note || NOT_SPECIFIED}
              </div>
              <div className="mt-2 flex justify-between gap-2 text-[10px]">
                <span>ผู้รับสินค้า ..................................</span>
                <span>ผู้ขาย ..................................</span>
              </div>
            </div>
          )}
          {!isCredit && parsedNotes.note && (
            <div className="mt-1 text-[11px]" data-testid="receipt-note">
              หมายเหตุ: {parsedNotes.note}
            </div>
          )}
          {r.cash_received != null && (
            <>
              <div className="flex justify-between text-[11px]">
                <span>รับเงิน</span>
                <span className="tabular-nums">฿{formatBaht(r.cash_received)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>เงินทอน</span>
                <span className="tabular-nums">฿{formatBaht(r.change_amount || 0)}</span>
              </div>
            </>
          )}
          {r.cancelled_at && (
            <div
              className="mt-2 rounded border border-dashed border-red-500 py-1 text-center text-[11px] font-bold text-red-600"
              data-testid="receipt-cancelled"
            >
              ** ยกเลิกบิลแล้ว **
              {r.cancelled_reason ? <div className="font-normal">{r.cancelled_reason}</div> : null}
            </div>
          )}
          <div className="my-2 border-t border-dashed" />
          <div className="text-center text-[10px] opacity-80">{prefs.receiptFooter || "ขอบคุณที่ใช้บริการ"}</div>
        </div>
      </div>
    </div>
  );
}