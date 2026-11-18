import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
  Search,
  PackagePlus,
  Plus,
  Minus,
  Trash2,
  Info,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ProductThumb from "./ProductThumb";
import type { ScanResultView } from "./scanResult";

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

/** auto-dismiss delay when the cashier is not interacting with the popup */
export const SCAN_POPUP_AUTO_CLOSE_MS = 7000;

type Props = {
  result: ScanResultView;
  /** current quantity of the scanned line in the cart (0 when not added) */
  cartQty: number;
  onDismiss: () => void;
  /** put the scanned code into the POS text search */
  onSearchCode?: (code: string) => void;
  /** jump to product creation for an unknown barcode */
  onAddProduct?: (code: string) => void;
  /** quantity controls for the scanned cart line */
  onIncrease?: () => void;
  onDecrease?: () => void;
  onRemove?: () => void;
  /** open the product detail page */
  onViewDetails?: () => void;
};

/**
 * Large "last scanned product" popup — a real-POS style panel.
 *
 * - desktop/tablet: floating panel (≈480px) anchored bottom-right
 * - mobile: full-width bottom card that sits above the payment bar and the
 *   safe area, capped at half the viewport height
 * - never steals focus (plain div, no Radix dialog) so the cashier can keep
 *   scanning; closes on X, Escape, outside tap, or after a timeout when the
 *   cashier is not touching it.
 */
export default function ScanResultCard({
  result,
  cartQty,
  onDismiss,
  onSearchCode,
  onAddProduct,
  onIncrease,
  onDecrease,
  onRemove,
  onViewDetails,
}: Props) {
  const ok = result.status === "added";
  const needsPick = result.status === "variant_required";
  const warn = result.status === "unavailable";
  const missing = result.status === "not_found" || result.status === "invalid";
  const tone = ok
    ? "border-emerald-500/60 bg-emerald-500/5"
    : needsPick
      ? "border-primary/60 bg-primary/5"
      : warn
        ? "border-amber-500/60 bg-amber-500/5"
        : "border-destructive/60 bg-destructive/5";
  const Icon = ok ? CheckCircle2 : needsPick ? Layers : warn ? AlertTriangle : XCircle;
  const iconTone = ok
    ? "text-emerald-600"
    : needsPick
      ? "text-primary"
      : warn
        ? "text-amber-600"
        : "text-destructive";

  const ref = useRef<HTMLDivElement | null>(null);
  const [interacting, setInteracting] = useState(false);

  // Escape + outside tap close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onDismiss();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [onDismiss]);

  // Auto-close — paused while the cashier is hovering/touching/editing.
  useEffect(() => {
    if (interacting) return;
    const t = setTimeout(onDismiss, SCAN_POPUP_AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [interacting, onDismiss, result.seq, result.at, cartQty]);

  const hold = () => setInteracting(true);
  const release = () => setInteracting(false);

  return (
    <div
      ref={ref}
      className={
        "fixed left-2 right-2 z-40 max-w-full max-h-[50vh] overflow-x-hidden overflow-y-auto rounded-xl border-2 shadow-2xl backdrop-blur " +
        "bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] bg-card/95 p-3 " +
        "sm:left-auto sm:right-4 sm:bottom-4 sm:w-[480px] sm:max-w-[calc(100vw-2rem)] sm:max-h-[70vh] sm:p-4 " +
        "animate-in fade-in-0 zoom-in-95 duration-150 " +
        tone
      }
      data-testid="pos-scan-result"
      data-status={result.status}
      data-interacting={interacting ? "1" : "0"}
      role="status"
      aria-live="polite"
      onMouseEnter={hold}
      onMouseLeave={release}
      onTouchStart={hold}
      onFocusCapture={hold}
      onBlurCapture={release}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <ProductThumb
          src={result.imageUrl}
          name={result.name}
          className="h-[104px] w-[104px] shrink-0 sm:h-[136px] sm:w-[136px]"
          testId="pos-scan-result-image"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} aria-hidden />
            <span
              className="break-words text-base font-bold leading-snug sm:text-lg"
              title={result.name ?? undefined}
              data-testid="pos-scan-result-name"
            >
              {result.name ?? "ไม่พบสินค้านี้"}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="break-all font-mono" data-testid="pos-scan-result-code">
              {result.barcode || result.productCode || result.code}
            </span>
            {result.sku && (
              <span className="break-all font-mono" data-testid="pos-scan-result-sku">
                SKU: {result.sku}
              </span>
            )}
            {result.attributes && (
              <span data-testid="pos-scan-result-attrs">{result.attributes}</span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {result.price != null && result.name && (
              <span
                className="text-2xl font-bold tabular-nums sm:text-3xl"
                data-testid="pos-scan-result-price"
              >
                ฿{fmt(result.price)}
              </span>
            )}
            {result.stock != null && result.name && (
              <span className="text-xs text-muted-foreground" data-testid="pos-scan-result-stock">
                คงเหลือ {result.stock} {result.unit || "ชิ้น"}
              </span>
            )}
          </div>

          {ok && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-emerald-50"
                data-testid="pos-scan-result-qty"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> เพิ่มลงตะกร้าแล้ว · รวม {cartQty}{" "}
                {result.unit || "ชิ้น"}
              </span>
              <span className="text-xs text-muted-foreground" data-testid="pos-scan-result-added-qty">
                ครั้งนี้ +1
              </span>
            </div>
          )}

          {!ok && (
            <div className="mt-2 text-sm font-medium" data-testid="pos-scan-result-message">
              {result.message}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="ปิดผลการสแกน"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          data-testid="pos-scan-result-dismiss"
        >
          <X className="h-4 w-4" aria-hidden />
          <span className="sr-only">×</span>
        </button>
      </div>

      {ok && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-10 w-10"
              aria-label="ลดจำนวน"
              data-testid="pos-scan-result-dec"
              onClick={() => {
                hold();
                onDecrease?.();
              }}
            >
              <Minus className="h-4 w-4" aria-hidden />
            </Button>
            <span
              className="min-w-[2.5rem] text-center text-lg font-bold tabular-nums"
              data-testid="pos-scan-result-cart-qty"
            >
              {cartQty}
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-10 w-10"
              aria-label="เพิ่มจำนวน"
              data-testid="pos-scan-result-inc"
              onClick={() => {
                hold();
                onIncrease?.();
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-10 text-destructive hover:text-destructive"
            data-testid="pos-scan-result-remove"
            onClick={() => {
              hold();
              onRemove?.();
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" aria-hidden /> ลบรายการ
          </Button>
          {onViewDetails && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto h-10"
              data-testid="pos-scan-result-details"
              onClick={onViewDetails}
            >
              <Info className="mr-1 h-4 w-4" aria-hidden /> รายละเอียด
            </Button>
          )}
        </div>
      )}

      {missing && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10"
            onClick={() => onSearchCode?.(result.code)}
            data-testid="pos-scan-result-search"
          >
            <Search className="mr-1 h-4 w-4" aria-hidden /> ค้นหาสินค้า
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10"
            onClick={() => onAddProduct?.(result.code)}
            data-testid="pos-scan-result-add"
          >
            <PackagePlus className="mr-1 h-4 w-4" aria-hidden /> เพิ่มสินค้า
          </Button>
        </div>
      )}
    </div>
  );
}
