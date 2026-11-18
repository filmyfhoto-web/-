import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Search,
  PackageX,
  Boxes,
  Users,
  ClipboardList,
  PauseCircle,
  History,
  Eraser,
  FolderOpen,
  Truck,
  Calculator,
  CreditCard,
  ShoppingBag,
  MoreVertical,
  ScanLine,
  X,
  Undo2,
  Maximize2,
} from "lucide-react";
import { Camera } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startBarcodeScan, type StopScan } from "@/lib/barcode";
import { useRapidScanner } from "./useRapidScanner";
import { beepOk, beepFail, flashOk } from "./scanFeedback";
import { loadScanPrefs, saveScanPrefs, profileTimings, type ScanPrefs } from "./scanPrefs";
import { loadBarcodeRules, normalizeBarcode } from "./barcodeRules";
import { pushScanHistory, type ScanHistorySource } from "./scanHistoryStore";
import PhotoBarcodeDialog from "@/components/PhotoBarcodeDialog";
import QuickAddProductDialog, { type QuickAddCreated } from "./QuickAddProductDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import PaymentCalculatorDialog, { type PosPayType } from "./PaymentCalculatorDialog";
import { PAY_TYPE_LABEL, mapCheckoutError, newIdemKey } from "./posCheckout";
import VariantPickerDialog from "./VariantPickerDialog";
import ScanResultCard from "./ScanResultCard";
import PosSaleSuccessDialog, { type PosSaleSuccess } from "./PosSaleSuccessDialog";
import { receiptPath } from "./openReceipt";
import { loadPosSettings } from "./receiptPrefs";
import {
  acceptScanResult,
  classifyScan,
  pickScanImage,
  type ScanProductLike,
  toScanResultView,
  type ScanResultView,
} from "./scanResult";
import { usePosLiveCatalog } from "@/hooks/usePosLiveCatalog";
import { cn } from "@/lib/utils";
import ProductThumb from "./ProductThumb";
import PosCustomerDialog from "./PosCustomerDialog";
import PosSummaryDialog from "./PosSummaryDialog";
import PosParkedBillsDialog from "./PosParkedBillsDialog";
import { parkBill, loadParkedBills, type ParkedBill } from "./parkedBills";
import type { PosCustomerRef } from "./posTypes";
import {
  type VariantSummary,
  autoSelectVariant,
  cartMergeKey,
  isVariantSellable,
  resolveScannedCode,
  variantAttributesLabel,
  variantDisplayLabel,
  variantEffectivePrice,
} from "./variantPicker";
import {
  buildEffectiveStockMap,
  computeAggregateBaseDemand,
  loadAllUnitLinks,
  type EffectiveStockInfo,
  type UnitLinkRow,
} from "@/lib/productUnitLink";

/**
 * Central POS ("POS ขายหน้าร้าน") — single shared hub.
 * UI-only in this phase: reads the canonical `public.products` catalog
 * (same source of truth as /admin/products) and manages a local cart.
 * No branch picker, no store filter, no stock mutations here.
 */

type ProductRow = {
  id: string;
  name: string;
  code: string;
  barcode: string | null;
  category_id: string | null;
  standard_price: number;
  stock: number;
  unit: string;
  image_url: string | null;
  active: boolean;
  deleted_at: string | null;
  has_variants: boolean;
};

type CategoryRow = { id: string; name: string };

type CartLine = {
  product_id: string;
  name: string;
  unit: string;
  unit_price: number;
  qty: number;
  stock: number;
  variant_id: string | null;
  variant_label: string | null;
  sku: string | null;
  /** SKU image first, parent product image second, null → placeholder */
  image_url: string | null;
  /** wrapper cart lines carry base identity + ratio so aggregate validation
   *  can compare total base demand against physical base stock. */
  base_id: string | null;
  ratio: number | null;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

/**
 * Over-sell policy for this POS. The cart caps quantities at available stock
 * and `pos_checkout` rejects `insufficient_stock`, so scanning a zero-stock
 * item must not add a line. Flip to `true` only together with those rules.
 */
const POS_ALLOWS_NEGATIVE_STOCK = false;

export default function CentralPOS() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  // Full variant catalog: used for search, barcode scanning, picker and cart validation.
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [unitLinks, setUnitLinks] = useState<UnitLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<string | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "price_asc" | "price_desc" | "stock_desc">("name");
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [bigButtons, setBigButtons] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("pos_big_buttons") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("pos_big_buttons", bigButtons ? "1" : "0"); } catch { /* noop */ }
  }, [bigButtons]);
  // Rapid-fire barcode scanner (USB keyboard-wedge). Default ON — cashier
  // can toggle from the toolbar; the setting is remembered per browser.
  const [rapidScan, setRapidScan] = useState<boolean>(() => {
    return loadScanPrefs().rapidScanEnabled;
  });
  const [scanPrefs, setScanPrefs] = useState<ScanPrefs>(() => loadScanPrefs());
  useEffect(() => {
    saveScanPrefs({ ...scanPrefs, rapidScanEnabled: rapidScan });
    setScanPrefs((p) => ({ ...p, rapidScanEnabled: rapidScan }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapidScan]);
  const [rapidCount, setRapidCount] = useState(0);
  // Camera dialog — continuous mode keeps the dialog open between hits.
  const [scanContinuous, setScanContinuous] = useState<boolean>(() => {
    return loadScanPrefs().continuousCamera;
  });
  useEffect(() => {
    saveScanPrefs({ ...loadScanPrefs(), continuousCamera: scanContinuous });
  }, [scanContinuous]);
  const [photoScanOpen, setPhotoScanOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const lastCamScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  /** Recent scan/add history — newest first, capped. Each entry is what
   *  the user just added; tapping it re-adds the same line. */
  type ScanHistEntry = { key: string; product_id: string; variant_id: string | null; name: string; variant_label: string | null; at: number };
  const [scanHistory, setScanHistory] = useState<ScanHistEntry[]>([]);
  /** Last scanned product feedback (image + name + code + price + cart qty). */
  const [scanResult, setScanResult] = useState<ScanResultView | null>(null);
  const scanSeqRef = useRef(0);
  /** cart line key highlighted right after a scan/add (cleared after ~1.6s) */
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** last accepted scan — blocks a single beam being handled twice by the
   *  rapid-scanner listener and the search input's own Enter handler. */
  const lastAcceptedScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [cart, setCart] = useState<CartLine[]>([]);
  /** Multi-step undo stack: each entry is a snapshot of the cart *before*
   *  an add/scan operation. Capped so we don't grow unbounded during long
   *  sessions. Newest snapshot at the end. */
  type UndoEntry = { cart: CartLine[]; label: string; at: number };
  const UNDO_MAX = 20;
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const undoLastAdd = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const restore = prev[prev.length - 1];
      setCart(restore.cart);
      setScanHistory((sh) => sh.slice(1));
      sonnerToast(`ย้อนกลับ: ${restore.label}`, {
        description: next.length > 0 ? `ย้อนกลับได้อีก ${next.length} ขั้น` : "ย้อนกลับครบทั้งหมดแล้ว",
        duration: 2500,
      });
      return next;
    });
  };
  const [discount, setDiscount] = useState<number>(0);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState<ProductRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [saleSuccess, setSaleSuccess] = useState<PosSaleSuccess | null>(null);
  const idemRef = useRef<string>(newIdemKey());
  const [customer, setCustomer] = useState<PosCustomerRef | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [parkedCount, setParkedCount] = useState<number>(() => loadParkedBills().length);
  const navigate = useNavigate();
  const [scanOpen, setScanOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopScanRef = useRef<StopScan | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.title = "POS ขายหน้าร้าน · Natta";
  }, []);

  // Camera barcode scanner lifecycle — starts when dialog opens, stops on close.
  useEffect(() => {
    if (!scanOpen) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!videoRef.current || cancelled) return;
      try {
        stopScanRef.current = await startBarcodeScan(videoRef.current, (text) => {
          const code = (text || "").trim();
          if (!code) return;
          // De-dup identical frames within ~800ms so a barcode held in view
          // doesn't add itself repeatedly.
          const now = performance.now();
          const last = lastCamScanRef.current;
          if (last.code === code && now - last.at < 800) return;
          lastCamScanRef.current = { code, at: now };
          const hit = handleScannedCode(code, "camera");
          if (hit && !scanContinuous) {
            stopScanRef.current?.();
            stopScanRef.current = null;
            setScanOpen(false);
          }
        });
      } catch (e: unknown) {
        toast({
          title: "เปิดกล้องไม่สำเร็จ",
          description: e instanceof Error ? e.message : "โปรดอนุญาตการใช้กล้องในเบราว์เซอร์",
          variant: "destructive",
        });
        setScanOpen(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
      stopScanRef.current?.();
      stopScanRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanOpen, scanContinuous]);

  // Rapid-fire USB barcode scanner. Always mounted; the hook itself gates on `enabled`.
  const rapidTimings = profileTimings(scanPrefs.deviceProfile);
  useRapidScanner({
    enabled: rapidScan,
    minLen: rapidTimings.minLen,
    maxInterval: rapidTimings.maxInterval,
    onScan: (code) => {
      const source: ScanHistorySource =
        scanPrefs.deviceProfile === "mobile-app" ? "mobile" : "usb";
      handleScannedCode(code, source);
    },
  });

  const reload = useCallback(async () => {
    const [{ data: prods }, { data: cats }, { data: vars }, links] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id,name,code,barcode,category_id,standard_price,stock,unit,image_url,active,deleted_at,has_variants",
        )
        .is("deleted_at", null)
        .eq("active", true)
        .order("name", { ascending: true })
        .limit(500),
      supabase.from("categories").select("id,name").order("name", { ascending: true }),
      supabase
        .from("product_variants")
        .select(
          "id,product_id,sku,barcode,name,attributes,price,price_override,stock,active,archived_at,image_url",
        )
        .is("archived_at", null)
        .eq("active", true)
        .limit(5000),
      loadAllUnitLinks().catch(() => []),
    ]);
    setProducts((prods as ProductRow[]) ?? []);
    setCategories((cats as CategoryRow[]) ?? []);
    setUnitLinks(links as UnitLinkRow[]);
    setVariants(
      ((vars ?? []) as unknown[]).map((raw) => {
        const v = raw as Record<string, unknown>;
        return {
          id: String(v.id),
          product_id: String(v.product_id),
          sku: (v.sku as string | null) ?? null,
          barcode: (v.barcode as string | null) ?? null,
          name: (v.name as string | null) ?? null,
          attributes: (v.attributes as Record<string, string>) ?? {},
          price: v.price == null ? null : Number(v.price),
          price_override: v.price_override == null ? null : Number(v.price_override),
          stock: Number(v.stock ?? 0),
          active: Boolean(v.active),
          archived_at: (v.archived_at as string | null) ?? null,
          image_url: (v.image_url as string | null) ?? null,
        } satisfies VariantSummary;
      }),
    );
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    reload().finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  /** live catalog: price/stock/variant edits appear without a manual reload */
  const { live: catalogLive, syncedAt: catalogSyncedAt } = usePosLiveCatalog(reload);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const variantMatchedIds = needle
      ? new Set(
          variants
            .filter(
              (v) =>
                (v.sku || "").toLowerCase().includes(needle) ||
                (v.barcode || "").toLowerCase().includes(needle),
            )
            .map((v) => v.product_id),
        )
      : null;
    const list = products.filter((p) => {
      if (catId !== "all" && p.category_id !== catId) return false;
      if (inStockOnly) {
        if (Number(p.stock ?? 0) <= 0) return false;
      }
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        (p.code || "").toLowerCase().includes(needle) ||
        (p.barcode || "").toLowerCase().includes(needle) ||
        (variantMatchedIds ? variantMatchedIds.has(p.id) : false)
      );
    });
    const sorted = [...list];
    switch (sortBy) {
      case "price_asc":
        sorted.sort((a, b) => Number(a.standard_price ?? 0) - Number(b.standard_price ?? 0));
        break;
      case "price_desc":
        sorted.sort((a, b) => Number(b.standard_price ?? 0) - Number(a.standard_price ?? 0));
        break;
      case "stock_desc":
        sorted.sort((a, b) => Number(b.stock ?? 0) - Number(a.stock ?? 0));
        break;
      case "name":
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name, "th"));
    }
    return sorted;
  }, [products, q, catId, variants, sortBy, inStockOnly]);

  const variantsFor = useCallback(
    (product_id: string) => variants.filter((v) => v.product_id === product_id),
    [variants],
  );

  const effectiveStockMap = useMemo(
    () => buildEffectiveStockMap(products, unitLinks),
    [products, unitLinks],
  );
  const effectiveOfProduct = (p: ProductRow): EffectiveStockInfo =>
    effectiveStockMap.get(p.id) ?? {
      productId: p.id, ownStock: Number(p.stock ?? 0), effectiveStock: Number(p.stock ?? 0),
      baseId: null, ratio: null, baseStock: null, remainder: null, isLinked: false,
    };

  /** physical stock per product id — base stock for wrappers, own stock otherwise. */
  const physicalStockById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.id, Number(p.stock ?? 0));
    return m;
  }, [products]);

  /**
   * Validate that a projected cart with `nextLine` (product_id/base/ratio/qty)
   * does not drive any base product past its physical stock. Handles a
   * repeated line (identified by cart merge key) by replacing rather than
   * adding when the line already exists.
   */
  function checkAggregateCart(nextLines: CartLine[]): { ok: boolean; msg?: string } {
    const demand = computeAggregateBaseDemand(nextLines);
    for (const [pid, req] of demand) {
      const cap = physicalStockById.get(pid) ?? 0;
      if (req > cap) {
        const base = products.find((p) => p.id === pid);
        return {
          ok: false,
          msg: `สต๊อกไม่พอ: ${base?.name ?? "สินค้าหน่วยเล็ก"} คงเหลือ ${cap} ต้องการ ${req}`,
        };
      }
    }
    return { ok: true };
  }

  function addLine(p: ProductRow, v: VariantSummary | null) {
    const price = v
      ? variantEffectivePrice(v, Number(p.standard_price ?? 0))
      : Number(p.standard_price ?? 0);
    // Flash the affected cart row so the cashier sees the hit land.
    const hlKey = cartMergeKey(p.id, v?.id ?? null);
    setHighlightKey(hlKey);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightKey(null), 1600);
    const eff = effectiveOfProduct(p);
    // Wrappers: cap by derived (effective) stock; SKU picks: keep variant stock;
    // otherwise: own product stock.
    const stockCap = v
      ? Number(v.stock ?? 0)
      : eff.isLinked
        ? Number(eff.effectiveStock ?? 0)
        : Number(p.stock ?? 0);
    const baseId = v ? null : eff.baseId;
    const ratio = v ? null : eff.ratio;
    const key = cartMergeKey(p.id, v?.id ?? null);
    // Snapshot cart before mutation so Undo can restore exactly (multi-step).
    const snapshot = cart;
    const undoLabel = `${p.name}${v ? " · " + variantDisplayLabel(v) : ""}`;
    setCart((prev) => {
      const idx = prev.findIndex(
        (l) => cartMergeKey(l.product_id, l.variant_id) === key,
      );
      const buildNext = (nextQty: number, existing?: CartLine): CartLine[] => {
        const line: CartLine = existing
          ? { ...existing, qty: nextQty, stock: stockCap }
          : {
              product_id: p.id,
              name: p.name,
              unit: p.unit || "ชิ้น",
              unit_price: price,
              qty: nextQty,
              stock: stockCap,
              variant_id: v?.id ?? null,
              variant_label: v ? variantDisplayLabel(v) : null,
              sku: v?.sku ?? null,
              image_url: pickScanImage(v, p),
              base_id: baseId,
              ratio,
            };
        const arr = existing
          ? prev.map((l, i) => (i === idx ? line : l))
          : [...prev, line];
        return arr;
      };
      if (idx >= 0) {
        const next = [...prev];
        const line = next[idx];
        const cap = Math.max(0, stockCap);
        if (line.qty >= cap) {
          toast({
            title: "จำนวนเกินสต๊อกที่มี",
            description: `คงเหลือ ${cap} ${line.unit}`,
            variant: "destructive",
          });
          return prev;
        }
        const nextQty = Math.min(line.qty + 1, cap);
        const projected = buildNext(nextQty, line);
        const check = checkAggregateCart(projected);
        if (!check.ok) {
          toast({ title: "สต๊อกหน่วยเล็กไม่พอ", description: check.msg, variant: "destructive" });
          return prev;
        }
        return projected;
      }
      const projected = buildNext(1);
      const check = checkAggregateCart(projected);
      if (!check.ok) {
        toast({ title: "สต๊อกหน่วยเล็กไม่พอ", description: check.msg, variant: "destructive" });
        return prev;
      }
      return projected;
    });
    // Update recent scan history + show Undo toast.
    const label = v ? variantDisplayLabel(v) : null;
    setScanHistory((prev) => {
      const entry: ScanHistEntry = {
        key: cartMergeKey(p.id, v?.id ?? null),
        product_id: p.id,
        variant_id: v?.id ?? null,
        name: p.name,
        variant_label: label,
        at: Date.now(),
      };
      const dedup = prev.filter((e) => e.key !== entry.key);
      return [entry, ...dedup].slice(0, 10);
    });
    sonnerToast.success(`เพิ่ม ${p.name}${label ? " · " + label : ""}`, {
      duration: 3500,
      action: {
        label: "เลิกทำ",
        onClick: () => {
          setCart(snapshot);
          setUndoStack((prev) => prev.filter((e) => e.at !== undoAt));
          setScanHistory((sh) => sh.filter((e) => e.at !== undoAt));
        },
      },
    });
    // Push after cart update queued; use same timestamp so toast's undo can
    // find and remove this entry without disturbing older ones.
    const undoAt = Date.now();
    setScanHistory((sh) => {
      // sync latest history entry timestamp so undo matches
      if (sh.length === 0) return sh;
      const [first, ...rest] = sh;
      return [{ ...first, at: undoAt }, ...rest];
    });
    setUndoStack((prev) => {
      const nextStack = [...prev, { cart: snapshot, label: undoLabel, at: undoAt }];
      return nextStack.length > UNDO_MAX ? nextStack.slice(nextStack.length - UNDO_MAX) : nextStack;
    });
  }

  function addToCart(p: ProductRow) {
    if (p.has_variants) {
      const vs = variantsFor(p.id);
      const auto = autoSelectVariant(vs);
      if (auto) {
        addLine(p, auto);
        return;
      }
      if (vs.filter(isVariantSellable).length === 0) {
        toast({
          title: "ไม่มีตัวเลือกที่พร้อมขาย",
          description: p.name,
          variant: "destructive",
        });
        return;
      }
      setPickerFor(p);
      return;
    }
    addLine(p, null);
  }

  /** Publish the scanned-product feedback panel, ignoring stale results. */
  function publishScanResult(view: ScanResultView) {
    setScanResult((prev) => acceptScanResult(prev, view));
  }

  /**
   * Resolve a normalized code against the local catalog, mutate the cart when
   * appropriate and surface the cashier-facing result. Returns true when a
   * line was added to the cart.
   */
  function tryScannedCode(code: string, seq: number) {
    const effStockOf = (p: ScanProductLike) => {
      const row = products.find((x) => x.id === p.id);
      return row ? Number(effectiveOfProduct(row).effectiveStock ?? row.stock ?? 0) : 0;
    };
    const cls = classifyScan(code, products, variants, {
      stockOf: effStockOf,
      // Follow the store's existing policy instead of hard-coding a stricter
      // rule: the cart/checkout already cap at available stock today.
      allowNegativeStock: POS_ALLOWS_NEGATIVE_STOCK,
    });
    const stockOverride = cls.variant
      ? Number(cls.variant.stock ?? 0)
      : cls.product
        ? effStockOf(cls.product as ScanProductLike)
        : null;
    publishScanResult(toScanResultView(cls, seq, Date.now(), stockOverride));

    if (cls.status === "added" && cls.product) {
      addLine(cls.product as ProductRow, cls.variant);
      setQ("");
      return cls.status;
    }
    if (cls.status === "variant_required" && cls.product) {
      setPickerFor(cls.product as ProductRow);
      setQ("");
      return cls.status;
    }
    if (cls.status === "unavailable") {
      toast({ title: cls.message, variant: "destructive" });
      return cls.status;
    }
    return cls.status;
  }

  /** Normalize with the store's barcode rules, run lookup, log history,
   *  play feedback. Returns true when a product was added to the cart. */
  function handleScannedCode(raw: string, source: ScanHistorySource): boolean {
    const rules = loadBarcodeRules();
    const normalized = normalizeBarcode(raw, rules);
    // One physical beam can reach us twice (global rapid-scanner listener +
    // the search input's Enter handler, or a scanner that repeats the code).
    // Collapse those into a single cart mutation.
    const nowMs = Date.now();
    const dedupeKey = normalized ?? raw;
    if (
      dedupeKey === lastAcceptedScan.current.code &&
      nowMs - lastAcceptedScan.current.at < 120
    ) {
      refocusScanInput();
      return false;
    }
    lastAcceptedScan.current = { code: dedupeKey, at: nowMs };
    const seq = ++scanSeqRef.current;
    if (normalized === null) {
      beepFail();
      pushScanHistory({ raw, normalized: null, status: "invalid", source });
      sonnerToast.error("บาร์โค้ดไม่ตรงกฎที่ตั้งไว้", { description: raw });
      publishScanResult(
        toScanResultView(
          { status: "invalid", code: raw, product: null, variant: null, message: `บาร์โค้ดไม่ตรงกฎที่ตั้งไว้: ${raw}` },
          seq,
        ),
      );
      refocusScanInput();
      return false;
    }
    const status = tryScannedCode(normalized, seq);
    if (status === "added" || status === "variant_required") {
      beepOk();
      flashOk(normalized);
      setRapidCount((n) => n + 1);
      const resolved = resolveScannedCode(normalized, products, variants);
      const parent = resolved ? products.find((p) => p.id === resolved.product_id) : null;
      pushScanHistory({
        raw,
        normalized,
        status: "matched",
        productName: parent?.name ?? null,
        source,
      });
      refocusScanInput();
      return status === "added";
    }
    beepFail();
    pushScanHistory({ raw, normalized, status: "not_found", source });
    if (status === "not_found") notifyBarcodeMiss(normalized, source === "camera");
    refocusScanInput();
    return false;
  }

  /** Keep the cashier's caret in the search/scan box so the next beam lands. */
  function refocusScanInput() {
    if (typeof document === "undefined") return;
    const el = searchRef.current;
    if (!el) return;
    const active = document.activeElement;
    // Never steal focus away from a dialog/other field the cashier is using.
    if (active && active !== document.body && active !== el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }

  /** Show a rich toast when a scanned/typed barcode has no match.
   *  Offers a one-click action to fall back to text search. */
  function notifyBarcodeMiss(code: string, fromScanner: boolean) {
    sonnerToast.error("ไม่พบสินค้านี้", {
      description: code,
      action: {
        label: "ค้นหาด้วยข้อความ",
        onClick: () => {
          setQ(code);
          if (fromScanner) setScanOpen(false);
          setTimeout(() => searchRef.current?.focus(), 50);
        },
      },
    });
  }

  function setLineQty(key: string, qty: number) {
    setCart((prev) => {
      const projected = prev
        .map((l) => {
          if (cartMergeKey(l.product_id, l.variant_id) !== key) return l;
          const cap = Math.max(0, l.stock || 0);
          const q = Math.max(0, Math.floor(qty));
          return { ...l, qty: cap > 0 ? Math.min(q, cap) : q };
        })
        .filter((l) => l.qty > 0);
      const check = checkAggregateCart(projected);
      if (!check.ok) {
        toast({ title: "สต๊อกหน่วยเล็กไม่พอ", description: check.msg, variant: "destructive" });
        return prev;
      }
      return projected;
    });
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => cartMergeKey(l.product_id, l.variant_id) !== key));
  }

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const totalItems = cart.reduce((s, l) => s + l.qty, 0);
  const netTotal = Math.max(0, subtotal - (Number.isFinite(discount) ? discount : 0));

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setCustomer(null);
    idemRef.current = newIdemKey();
  };

  function handleParkBill() {
    if (cart.length === 0) {
      toast({ title: "ตะกร้าว่าง", description: "ยังไม่มีสินค้าให้พักบิล", variant: "destructive" });
      return;
    }
    const label = customer?.name
      ? `${customer.name} · ${cart.length} รายการ`
      : `บิล ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · ${cart.length} รายการ`;
    parkBill({ label, lines: cart, discount, customer });
    setParkedCount(loadParkedBills().length);
    toast({ title: "พักบิลแล้ว", description: label });
    setCart([]);
    setDiscount(0);
    setCustomer(null);
    idemRef.current = newIdemKey();
  }

  function restoreParked(bill: ParkedBill) {
    // Bills parked by older builds have no image; re-derive name/thumbnail
    // from the live catalog so restored rows never fall back to a bare code.
    setCart(
      (bill.lines as CartLine[]).map((l) => {
        if (l.image_url) return l;
        const p = products.find((x) => x.id === l.product_id) ?? null;
        const v = l.variant_id ? variants.find((x) => x.id === l.variant_id) ?? null : null;
        return {
          ...l,
          name: l.name || p?.name || l.product_id,
          image_url: pickScanImage(v, p),
        };
      }),
    );
    setDiscount(bill.discount || 0);
    setCustomer(bill.customer);
    idemRef.current = newIdemKey();
    setParkedCount(loadParkedBills().length);
    toast({ title: "เรียกบิลที่พักกลับมาแล้ว", description: bill.label });
  }

  async function submitCheckout(pay?: { paymentType: PosPayType; cashReceived: number | null }) {
    if (submitting) return;
    if (cart.length === 0) return;
    setSubmitting(true);
    const itemCount = cart.reduce((s, l) => s + l.qty, 0);
    try {
      const payload = {
        p_idempotency_key: idemRef.current,
        p_items: cart.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          qty: l.qty,
        })),
        p_discount: Number.isFinite(discount) ? discount : 0,
        p_payment_type: pay?.paymentType ?? "cash",
        p_cash_received: pay?.cashReceived ?? null,
        p_customer_name: customer?.name ?? null,
        p_line_user_id: customer?.line_user_id ?? null,
      } as const;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("pos_checkout", payload);
      if (error) {
        toast({
          title: "ชำระเงินไม่สำเร็จ",
          description: mapCheckoutError(error.message ?? ""),
          variant: "destructive",
        });
        return;
      }
      const result = data as { receipt_number?: string; receipt_id?: string } | null;
      const receiptNo = result?.receipt_number;
      toast({
        title: "บันทึกใบเสร็จแล้ว",
        description: receiptNo ? `เลขที่ ${receiptNo}` : "สำเร็จ",
      });
      const grandTotal = netTotal;
      const cashReceived = pay?.cashReceived ?? null;
      setCart([]);
      setDiscount(0);
      idemRef.current = newIdemKey();
      setPayOpen(false);
      if (result?.receipt_id) {
        const sale: PosSaleSuccess = {
          receiptId: result.receipt_id,
          receiptNumber: receiptNo || result.receipt_id,
          total: grandTotal,
          cashReceived,
          change: cashReceived != null ? Math.max(0, cashReceived - grandTotal) : null,
          paymentLabel: PAY_TYPE_LABEL[pay?.paymentType ?? "cash"] ?? (pay?.paymentType ?? "cash"),
          itemCount,
        };
        // Auto-print goes straight to the printable page; otherwise the
        // cashier decides from the success dialog (which stays open either way
        // so a blocked popup never loses the receipt number).
        // Never auto-navigate away from the success dialog: the cashier
        // decides when to open the printable receipt.
        setSaleSuccess(sale);
      }
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Same-tab React Router navigation to the printable receipt. Popups were
   * the cause of the "หน้าเด้ง" reports on iOS Safari / PWA; navigating keeps
   * the session, the guard and the back button intact. The sale is already
   * committed, so leaving the POS screen loses nothing.
   */
  function openReceiptWindow(receiptId: string) {
    navigate(receiptPath(receiptId, { returnTo: "/pos" }), { state: { returnTo: "/pos" } });
  }

  // ---- Shortcut actions (bottom bar + right rail + keyboard) ----
  const openParkOrHold = useCallback(() => {
    if (cart.length > 0) handleParkBill();
    else setParkedOpen(true);
  }, [cart.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const notReady = useCallback((label: string) => {
    toast({ title: label, description: "กำลังพัฒนา" });
  }, []);

  const shortcutActions = useMemo(
    () => ({
      documents: { label: "เอกสาร", hint: "Ctrl+T", icon: FolderOpen, run: () => navigate("/pos/history") },
      customer: { label: "ลูกค้า", hint: "Ctrl+M", icon: Users, run: () => setCustomerOpen(true) },
      drawer: { label: "ลิ้นชัก", hint: "Ctrl+D", icon: Calculator, run: () => navigate("/pos/reports") },
      clear: { label: "เคลียร์", hint: "Ctrl+E", icon: Eraser, run: () => clearCart() },
      park: { label: "จอง", hint: "Ctrl+P", icon: PauseCircle, run: openParkOrHold },
      delivery: { label: "เดลิเวอรี่", hint: "", icon: Truck, run: () => navigate("/pos/delivery") },
      summary: { label: "สรุป", hint: "", icon: ClipboardList, run: () => setSummaryOpen(true) },
      members: { label: "สมาชิก", hint: "", icon: Users, run: () => navigate("/pos/customers") },
      credit: { label: "ค้างจ่าย", hint: "", icon: CreditCard, run: () => navigate("/pos/history?filter=credit") },
      ecom: { label: "อีคอมฯ", hint: "", icon: ShoppingBag, run: () => notReady("อีคอมเมิร์ซ") },
    }),
    [navigate, openParkOrHold, notReady],
  );

  // Keyboard shortcuts (guarded against typing in inputs)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || (t?.isContentEditable ?? false);
      const isSearch = t === searchRef.current;
      // Ctrl/Cmd+K → focus product search from anywhere
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      // Esc → close scan dialog if open; otherwise blur the POS search box
      // (never intercepts Esc from other inputs so dialogs/menus keep it).
      if (e.key === "Escape") {
        if (scanOpen) {
          setScanOpen(false);
          return;
        }
        if (isSearch) {
          (searchRef.current as HTMLInputElement | null)?.blur();
          return;
        }
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      // Ctrl-chords must never fire while typing in another input.
      if (inField) return;
      const key = e.key.toLowerCase();
      const map: Record<string, () => void> = {
        t: shortcutActions.documents.run,
        m: shortcutActions.customer.run,
        d: shortcutActions.drawer.run,
        e: shortcutActions.clear.run,
        p: shortcutActions.park.run,
      };
      const fn = map[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutActions, scanOpen]);

  const bottomBarItems = [
    shortcutActions.documents,
    shortcutActions.customer,
    shortcutActions.drawer,
    shortcutActions.clear,
    shortcutActions.park,
    shortcutActions.delivery,
    shortcutActions.summary,
  ];
  const railItems = [
    { ...shortcutActions.clear, badge: null as number | null },
    { ...shortcutActions.members, badge: null },
    { ...shortcutActions.summary, badge: null },
    { ...shortcutActions.drawer, badge: null },
    { ...shortcutActions.park, label: "พักจอง", badge: parkedCount > 0 ? parkedCount : null },
    { ...shortcutActions.documents, badge: null },
    { ...shortcutActions.delivery, label: "เดลิเวฯ", badge: null },
    { ...shortcutActions.credit, badge: null },
    { ...shortcutActions.ecom, badge: null },
  ];

  const checkoutPanel = (
    <div className="flex h-full flex-col" data-testid="pos-cart">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <h2 className="font-semibold flex items-center gap-2 text-base">
          <ShoppingCart className="h-4 w-4 text-primary" />
          ตะกร้า
          <span className="text-xs font-normal text-muted-foreground">
            {totalItems} รายการ
          </span>
        </h2>
        <Button
          type="button"
          variant={bigButtons ? "default" : "ghost"}
          size="sm"
          className="h-8 lg:hidden"
          onClick={() => setBigButtons((v) => !v)}
          aria-pressed={bigButtons}
          data-testid="pos-cart-big-buttons"
          title="โหมดปุ่มใหญ่สำหรับใช้งานด้วยนิ้วเดียว"
        >
          <Maximize2 className="h-4 w-4 mr-1" /> ปุ่มใหญ่
        </Button>
      </div>

      {/* Line items */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {cart.length === 0 ? (
          <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <ShoppingCart className="h-8 w-8 mb-2 opacity-60" aria-hidden />
            แตะสินค้าทางซ้ายเพื่อเพิ่มลงตะกร้า
          </div>
        ) : (
          <ul className="space-y-2">
            {cart.map((l) => {
              const key = cartMergeKey(l.product_id, l.variant_id);
              const hl = highlightKey === key;
              return (
              <li
                key={key}
                className={`rounded-lg border bg-card p-2 transition-all duration-300 ${hl ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/40 scale-[1.01]" : "scale-100"}`}
                data-testid={`pos-cart-line-${key}`}
                data-highlight={hl ? "1" : "0"}
              >
                <div className="flex items-start justify-between gap-2">
                  <ProductThumb
                    src={l.image_url}
                    name={l.name}
                    className="h-10 w-10 sm:h-11 sm:w-11"
                    testId="pos-cart-thumb"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" title={l.name} data-testid="pos-cart-line-name">
                      {l.name}
                    </div>
                    {l.variant_label && (
                      <div className="text-[11px] text-primary truncate" data-testid="pos-cart-variant-label">
                        {l.variant_label}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      ฿{fmt(l.unit_price)} / {l.unit}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`${bigButtons ? "h-14 w-14" : "h-11 w-11 sm:h-9 sm:w-9"} -mr-1 text-muted-foreground hover:text-destructive`}
                    aria-label={`ลบ ${l.name}`}
                    data-testid="pos-cart-remove"
                    onClick={() => removeLine(key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <div className={`flex items-center ${bigButtons ? "gap-2" : "gap-1"}`}>
                    <Button
                      size="icon"
                      variant="outline"
                      className={bigButtons ? "h-14 w-14" : "h-11 w-11 sm:h-9 sm:w-9"}
                      aria-label="ลดจำนวน"
                      onClick={() => setLineQty(key, l.qty - 1)}
                    >
                      <Minus className={bigButtons ? "h-6 w-6" : "h-3.5 w-3.5"} />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      value={l.qty}
                      onChange={(e) => setLineQty(key, Number(e.target.value))}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      className={`${bigButtons ? "h-14 w-20 text-xl" : "h-11 sm:h-9 w-16"} text-center px-1 tabular-nums`}
                      aria-label={`จำนวน ${l.name}`}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className={bigButtons ? "h-14 w-14" : "h-11 w-11 sm:h-9 sm:w-9"}
                      aria-label="เพิ่มจำนวน"
                      onClick={() => setLineQty(key, l.qty + 1)}
                    >
                      <Plus className={bigButtons ? "h-6 w-6" : "h-3.5 w-3.5"} />
                    </Button>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">
                    ฿{fmt(l.qty * l.unit_price)}
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Totals + pay */}
      <div className="border-t bg-card/60 px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-16" htmlFor="pos-discount">
            ส่วนลด
          </label>
          <Input
            id="pos-discount"
            type="number"
            min={0}
            value={Number.isFinite(discount) ? discount : 0}
            onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
            className="h-10 text-right tabular-nums"
            data-testid="pos-discount"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>ยอดรวม</span>
            <span className="tabular-nums">฿{fmt(subtotal)}</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-xs text-muted-foreground">ยอดสุทธิ</span>
            <span
              className="text-3xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400"
              data-testid="pos-net-total"
            >
              ฿{fmt(netTotal)}
            </span>
          </div>
        </div>
        <Button
          className="ng-btn-brand w-full h-14 text-lg font-semibold rounded-xl shadow-md disabled:opacity-60"
          disabled={submitting || cart.length === 0}
          onClick={() => setPayOpen(true)}
          data-testid="pos-checkout"
        >
          {submitting ? "กำลังบันทึก…" : `ชำระเงิน · ฿${fmt(netTotal)}`}
        </Button>
      </div>
      <PaymentCalculatorDialog
        open={payOpen}
        onOpenChange={(v) => !submitting && setPayOpen(v)}
        netTotal={netTotal}
        submitting={submitting}
        items={cart.map((l) => ({
          name: l.variant_label ? `${l.name} · ${l.variant_label}` : l.name,
          qty: l.qty,
          lineTotal: l.unit_price * l.qty,
        }))}
        onConfirm={(p) => submitCheckout({ paymentType: p.paymentType, cashReceived: p.cashReceived })}
      />
    </div>
  );

  return (
    <div>
      <div className="ng-page-wide px-3 md:px-5 py-3 md:py-4 pb-24 lg:pb-20">
        <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_360px_76px] xl:grid-cols-[200px_minmax(0,1fr)_420px_88px]">
          {/* LEFT RAIL: หมวดหมู่สินค้า (เดสก์ท็อป) */}
          <aside
            className="ng-card hidden lg:flex flex-col gap-1 p-2 h-fit lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] overflow-y-auto"
            aria-label="หมวดหมู่สินค้า"
            data-testid="pos-category-rail"
          >
            <div className="px-2 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              หมวดหมู่
            </div>
            <button
              type="button"
              onClick={() => setCatId("all")}
              className={`text-left rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                catId === "all" ? "admin-nav-item-active" : "hover:bg-accent"
              }`}
            >
              ทั้งหมด
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatId(c.id)}
                className={`text-left rounded-lg px-3 py-2 text-[13px] font-medium truncate transition-colors ${
                  catId === c.id ? "admin-nav-item-active" : "hover:bg-accent"
                }`}
              >
                {c.name}
              </button>
            ))}
          </aside>

          {/* LEFT: search + category + product grid */}
          <Card className="p-3 md:p-4 flex flex-col min-h-[calc(100vh-8rem)]">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  placeholder="ค้นหาชื่อสินค้า / รหัส / บาร์โค้ด…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && q.trim()) {
                      const code = q.trim();
                      e.preventDefault();
                      handleScannedCode(code, "manual");
                    }
                  }}
                  className="pl-9 pr-10 h-11 text-base"
                  data-testid="pos-search"
                  aria-label="ค้นหาสินค้า (Ctrl+K)"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    aria-label="ล้างคำค้น"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded hover:bg-accent text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label="สแกนบาร์โค้ดด้วยกล้อง"
                onClick={() => setScanOpen(true)}
                data-testid="pos-scan-open"
              >
                <ScanLine className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label="ถ่ายรูปอ่านบาร์โค้ด"
                title="ถ่ายรูปสินค้าเพื่ออ่านบาร์โค้ด (ไม่ใช้ AI เครดิต)"
                onClick={() => setPhotoScanOpen(true)}
                data-testid="pos-photo-scan-open"
              >
                <Camera className="h-5 w-5" />
              </Button>
              <Button
                asChild
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                title="ประวัติการสแกน"
              >
                <Link to="/pos/scan-history" aria-label="ประวัติการสแกน" data-testid="pos-scan-history-link">
                  <History className="h-5 w-5" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 shrink-0 gap-1"
                onClick={() => setQuickAddOpen(true)}
                title="เพิ่มสินค้าใหม่เข้าสต๊อกและใส่ตะกร้าทันที"
                data-testid="pos-quick-add-open"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden md:inline">เพิ่มสินค้า</span>
              </Button>
              <span
                data-testid="pos-live-status"
                data-live={catalogLive ? "on" : "off"}
                title={catalogSyncedAt ? `ซิงก์ล่าสุด ${catalogSyncedAt.toLocaleTimeString("th-TH")}` : "กำลังเชื่อมต่อเรียลไทม์"}
                className="hidden sm:inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold text-muted-foreground"
              >
                <span
                  className={cn("h-2 w-2 rounded-full", catalogLive ? "bg-emerald-500 animate-pulse" : "bg-amber-500")}
                  aria-hidden
                />
                {catalogLive ? "เรียลไทม์" : "กำลังเชื่อมต่อ"}
              </span>
              <Button
                type="button"
                variant={rapidScan ? "default" : "outline"}
                size="sm"
                className="h-11 shrink-0 gap-1"
                onClick={() => setRapidScan((v) => !v)}
                aria-pressed={rapidScan}
                data-testid="pos-rapid-scan-toggle"
                title="โหมดยิงบาร์โค้ดรัวๆ (USB scanner) — เพิ่มลงตะกร้าอัตโนมัติ"
              >
                <ScanLine className="h-4 w-4" />
                <span className="hidden md:inline">ยิงรัว</span>
                {rapidScan && rapidCount > 0 && (
                  <span
                    className="ml-1 rounded-full bg-background/25 px-1.5 text-xs font-semibold"
                    data-testid="pos-rapid-scan-count"
                  >
                    {rapidCount}
                  </span>
                )}
              </Button>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger
                  className="h-11 w-[140px] shrink-0 hidden sm:flex"
                  aria-label="จัดเรียงผลการค้นหา"
                  data-testid="pos-sort"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">ชื่อ (ก-ฮ)</SelectItem>
                  <SelectItem value="price_asc">ราคาน้อย → มาก</SelectItem>
                  <SelectItem value="price_desc">ราคามาก → น้อย</SelectItem>
                  <SelectItem value="stock_desc">คงเหลือมากสุด</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={inStockOnly ? "default" : "outline"}
                size="sm"
                className="h-11 shrink-0 hidden sm:inline-flex"
                onClick={() => setInStockOnly((v) => !v)}
                aria-pressed={inStockOnly}
                data-testid="pos-in-stock-toggle"
                title="แสดงเฉพาะสินค้าที่มีสต๊อก"
              >
                มีสต๊อก
              </Button>
            </div>
            {/* Mobile-only sort selector (compact) */}
            <div className="sm:hidden mb-2">
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="h-9 flex-1" aria-label="จัดเรียง" data-testid="pos-sort-mobile">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">ชื่อ (ก-ฮ)</SelectItem>
                    <SelectItem value="price_asc">ราคาน้อย → มาก</SelectItem>
                    <SelectItem value="price_desc">ราคามาก → น้อย</SelectItem>
                    <SelectItem value="stock_desc">คงเหลือมากสุด</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant={inStockOnly ? "default" : "outline"}
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => setInStockOnly((v) => !v)}
                  aria-pressed={inStockOnly}
                  data-testid="pos-in-stock-toggle-mobile"
                >
                  มีสต๊อก
                </Button>
                <Button
                  type="button"
                  variant={bigButtons ? "default" : "outline"}
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => setBigButtons((v) => !v)}
                  aria-pressed={bigButtons}
                  data-testid="pos-big-buttons-toggle"
                  title="โหมดปุ่มใหญ่สำหรับใช้งานด้วยนิ้วเดียว"
                >
                  <Maximize2 className="h-4 w-4 mr-1" /> ปุ่มใหญ่
                </Button>
              </div>
            </div>

            {scanResult && (
              <ScanResultCard
                result={scanResult}
                cartQty={
                  cart.find(
                    (l) =>
                      cartMergeKey(l.product_id, l.variant_id) ===
                      cartMergeKey(scanResult.productId ?? "", scanResult.variantId),
                  )?.qty ?? 0
                }
                onDismiss={() => setScanResult(null)}
                onIncrease={() => {
                  const key = cartMergeKey(scanResult.productId ?? "", scanResult.variantId);
                  const line = cart.find((l) => cartMergeKey(l.product_id, l.variant_id) === key);
                  if (line) setLineQty(key, line.qty + 1);
                }}
                onDecrease={() => {
                  const key = cartMergeKey(scanResult.productId ?? "", scanResult.variantId);
                  const line = cart.find((l) => cartMergeKey(l.product_id, l.variant_id) === key);
                  if (line) setLineQty(key, line.qty - 1);
                }}
                onRemove={() => {
                  removeLine(cartMergeKey(scanResult.productId ?? "", scanResult.variantId));
                  setScanResult(null);
                }}
                onViewDetails={
                  scanResult.productId
                    ? () => navigate(`/staff/products/${scanResult.productId}`)
                    : undefined
                }
                onSearchCode={(code) => {
                  setQ(code);
                  setScanOpen(false);
                  setTimeout(() => searchRef.current?.focus(), 50);
                }}
                onAddProduct={(code) => {
                  setScanOpen(false);
                  navigate(`/staff/products/new?barcode=${encodeURIComponent(code)}`);
                }}
              />
            )}

            {(scanHistory.length > 0 || undoStack.length > 0) && (
              <div
                className="mb-2 flex items-center gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1"
                data-testid="pos-scan-history"
                aria-label="ประวัติสแกนล่าสุด"
              >
                {undoStack.length > 0 && (
                  <button
                    type="button"
                    onClick={undoLastAdd}
                    className="shrink-0 rounded-full border border-destructive/40 bg-destructive/5 hover:bg-destructive/10 text-[11px] px-2.5 py-1 text-destructive font-semibold"
                    data-testid="pos-undo-btn"
                    title="ย้อนกลับการเพิ่มสินค้าล่าสุด"
                    aria-label={`เลิกทำ (ย้อนกลับได้ ${undoStack.length} ขั้น)`}
                  >
                    ↶ เลิกทำ ({undoStack.length})
                  </button>
                )}
                <span className="text-[11px] text-muted-foreground shrink-0 mr-1">ล่าสุด:</span>
                {scanHistory.map((h) => (
                  <button
                    key={h.at}
                    type="button"
                    onClick={() => {
                      const p = products.find((x) => x.id === h.product_id);
                      if (!p) return;
                      if (h.variant_id) {
                        const v = variants.find((x) => x.id === h.variant_id) ?? null;
                        if (v && isVariantSellable(v)) { addLine(p, v); return; }
                      }
                      addToCart(p);
                    }}
                    className="shrink-0 max-w-[180px] truncate rounded-full border border-primary/40 bg-primary/5 hover:bg-primary/10 text-[11px] px-2.5 py-1 text-primary"
                    data-testid={`pos-scan-hist-${h.key}`}
                    title={`เพิ่ม ${h.name}${h.variant_label ? " · " + h.variant_label : ""} อีกครั้ง`}
                  >
                    + {h.name}{h.variant_label ? ` · ${h.variant_label}` : ""}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setScanHistory([])}
                  className="ml-1 shrink-0 text-[11px] text-muted-foreground hover:text-destructive"
                  aria-label="ล้างประวัติสแกน"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div
              className="lg:hidden flex flex-wrap gap-1.5 mb-3 -mx-1 px-1 overflow-x-auto scrollbar-thin"
              data-testid="pos-categories"
            >
              <Button
                size="sm"
                variant={catId === "all" ? "default" : "outline"}
                className="rounded-full h-8 min-h-11 sm:min-h-8 px-3"
                onClick={() => setCatId("all")}
              >
                ทั้งหมด
              </Button>
              {categories.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={catId === c.id ? "default" : "outline"}
                  className="rounded-full h-8 min-h-11 sm:min-h-8 px-3 whitespace-nowrap"
                  onClick={() => setCatId(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
              {loading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  กำลังโหลดสินค้า…
                </div>
              ) : products.length === 0 ? (
                <div
                  className="py-16 px-4 text-center max-w-md mx-auto"
                  data-testid="pos-onboarding"
                >
                  <PackageX className="mx-auto h-12 w-12 text-muted-foreground mb-4" aria-hidden />
                  <h2 className="text-xl font-bold mb-2">ไม่มีสินค้าในสต๊อก</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    เริ่มต้นด้วยการเพิ่มสินค้า หรือเปิดหน้าสต๊อกเต็มรูปแบบ
                    เพื่อจัดการรายการสินค้า ราคา หมวดหมู่ และรูปภาพในที่เดียว
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button asChild size="lg" className="rounded-xl min-h-12">
                      <Link
                        to="/admin/products?quick=1"
                        data-testid="pos-onboarding-add"
                      >
                        <Plus className="mr-1 h-4 w-4" /> เพิ่มสินค้า
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="rounded-xl min-h-12"
                    >
                      <Link
                        to="/admin/products"
                        data-testid="pos-onboarding-fullstock"
                      >
                        <Boxes className="mr-1 h-4 w-4" /> สต๊อก (เต็มรูปแบบ)
                      </Link>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-4">
                    หน้าสต๊อกเต็มรูปแบบใช้เพิ่ม / แก้ / ปิดใช้งาน และปรับจำนวนสินค้าระยะยาว
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center" data-testid="pos-empty">
                  <PackageX className="mx-auto h-10 w-10 text-muted-foreground mb-3" aria-hidden />
                  <p className="text-sm text-muted-foreground mb-3">ไม่พบสินค้าตามคำค้น</p>
                </div>
              ) : (
                <div
                  className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5"
                  data-testid="pos-product-grid"
                >
                  {filtered.map((p) => {
                    const eff = effectiveOfProduct(p);
                    const shownStock = eff.effectiveStock;
                    const out = shownStock <= 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => !out && addToCart(p)}
                        disabled={out}
                        aria-label={`เพิ่ม ${p.name} ลงตะกร้า`}
                        className="group text-left rounded-md border border-border bg-card p-2 hover:border-primary/60 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/60 focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed min-h-11"
                        data-testid={`pos-product-card-${p.id}`}
                      >
                        <div className="aspect-square rounded-md bg-muted overflow-hidden mb-1.5 grid place-items-center">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ShoppingCart className="h-7 w-7 text-muted-foreground/60" aria-hidden />
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate flex items-center gap-1">
                          <span className="truncate">{p.code}</span>
                          {eff.isLinked && (
                            <span
                              className="ml-auto rounded bg-accent text-primary px-1 py-0 text-[9px] font-semibold"
                              data-testid={`pos-card-linked-${p.id}`}
                            >
                              สัมพันธ์
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] font-medium leading-snug line-clamp-2 min-h-[2.4rem]">
                          {p.name}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-sm font-bold text-blue-700 dark:text-sky-300 tabular-nums">
                            ฿{fmt(Number(p.standard_price ?? 0))}
                          </span>
                          <span
                            className={`text-[11px] tabular-nums ${
                              out ? "text-destructive font-semibold" : "text-muted-foreground"
                            }`}
                          >
                            {out ? "หมด" : `คงเหลือ ${shownStock}`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* RIGHT: checkout panel (desktop / tablet landscape) */}
          <Card
            className="hidden lg:flex overflow-hidden p-0 h-fit lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)]"
            data-testid="pos-checkout-panel"
          >
            {checkoutPanel}
          </Card>

          {/* FAR RIGHT: vertical icon rail (desktop / tablet landscape) */}
          <aside
            className="hidden lg:flex flex-col gap-1.5 rounded-md bg-[hsl(220_45%_18%)] text-white p-1.5 h-fit lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] overflow-y-auto"
            data-testid="pos-icon-rail"
            aria-label="เมนูลัด POS"
          >
            {railItems.map((it, idx) => (
              <button
                key={`${it.label}-${idx}`}
                type="button"
                onClick={it.run}
                className="relative flex flex-col items-center justify-center gap-1 w-full aspect-square rounded-md bg-white/5 hover:bg-white/15 active:bg-white/20 transition text-white text-[10px] font-medium leading-tight px-1"
                data-testid={`pos-rail-${idx}`}
              >
                <it.icon className="h-5 w-5" aria-hidden />
                <span className="truncate max-w-full">{it.label}</span>
                {it.badge != null && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-[9px] font-bold flex items-center justify-center">
                    {it.badge}
                  </span>
                )}
              </button>
            ))}
          </aside>
        </div>
      </div>

      {/* Bottom shortcut bar (desktop/tablet) */}
      <div
        className="hidden lg:flex fixed inset-x-0 bottom-0 z-30 bg-neutral-900 text-white border-t border-white/10 px-2 py-2 gap-2"
        data-testid="pos-bottom-shortcuts"
        role="toolbar"
        aria-label="ทางลัด POS"
      >
        <button
          type="button"
          className="h-11 w-11 rounded-md bg-white/5 hover:bg-white/15 flex items-center justify-center shrink-0"
          aria-label="เมนูเพิ่มเติม"
          onClick={() => shortcutActions.members.run()}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
        <div className="flex-1 grid grid-cols-7 gap-2">
          {bottomBarItems.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={it.run}
              className="h-11 rounded-md bg-white/5 hover:bg-white/15 active:bg-white/20 flex items-center justify-center gap-2 px-2 text-sm font-medium truncate"
              data-testid={`pos-shortcut-${it.label}`}
            >
              <it.icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{it.label}</span>
              {it.hint && (
                <span className="hidden xl:inline text-[10px] text-white/50 font-normal">{it.hint}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile / tablet portrait: sticky cart bar + drawer */}
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-card shadow-[0_-6px_20px_-8px_rgba(0,0,0,0.15)]"
        data-testid="pos-mobile-bar"
      >
        <button
          type="button"
          onClick={() => setMobileCartOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 min-h-14 text-left"
          aria-expanded={mobileCartOpen}
          aria-controls="pos-mobile-cart"
        >
          <span className="flex items-center gap-2 font-semibold">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {totalItems} รายการ
          </span>
          <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
            ฿{fmt(netTotal)}
          </span>
        </button>
        {mobileCartOpen && (
          <div
            id="pos-mobile-cart"
            className="max-h-[70vh] overflow-hidden border-t bg-background"
          >
            <div className="h-[70vh] flex flex-col">{checkoutPanel}</div>
          </div>
        )}
      </div>

      {pickerFor && (
        <VariantPickerDialog
          open={!!pickerFor}
          productName={pickerFor.name}
          productStandardPrice={Number(pickerFor.standard_price ?? 0)}
          productImageUrl={pickerFor.image_url ?? null}
          variants={variantsFor(pickerFor.id)}
          onCancel={() => setPickerFor(null)}
          onPick={(v) => {
            addLine(pickerFor, v);
            setPickerFor(null);
          }}
        />
      )}

      <PosCustomerDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        value={customer}
        onSave={setCustomer}
      />
      <PosSummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        lines={cart}
        subtotal={subtotal}
        discount={Number.isFinite(discount) ? discount : 0}
        netTotal={netTotal}
        customer={customer}
      />
      <PosParkedBillsDialog
        open={parkedOpen}
        onOpenChange={setParkedOpen}
        onRestore={restoreParked}
      />
      <PosSaleSuccessDialog
        sale={saleSuccess}
        onClose={() => {
          setSaleSuccess(null);
          searchRef.current?.focus();
        }}
        onPrint={(s) => openReceiptWindow(s.receiptId)}
        onView={(s) => openReceiptWindow(s.receiptId)}
      />

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>สแกนบาร์โค้ดสินค้า</DialogTitle>
          </DialogHeader>
          <div className="rounded-md overflow-hidden bg-black aspect-[4/3]">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            หันกล้องไปที่บาร์โค้ด ระบบจะเพิ่มลงตะกร้าอัตโนมัติเมื่ออ่านสำเร็จ
          </p>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                checked={scanContinuous}
                onChange={(e) => setScanContinuous(e.target.checked)}
                data-testid="pos-scan-continuous"
              />
              ยิงต่อเนื่อง (ไม่ต้องเปิดกล้องใหม่)
            </label>
            <Button variant="outline" onClick={() => setScanOpen(false)}>ปิด</Button>
          </div>
        </DialogContent>
      </Dialog>
      <PhotoBarcodeDialog
        open={photoScanOpen}
        onOpenChange={setPhotoScanOpen}
        onDecoded={(code) => handleScannedCode(code, "photo")}
      />
      <QuickAddProductDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onCreated={(p: QuickAddCreated) => {
          setProducts((prev) => {
            if (prev.some((x) => x.id === p.id)) return prev;
            return [...prev, p as unknown as ProductRow].sort((a, b) =>
              (a.name || "").localeCompare(b.name || ""),
            );
          });
          addToCart(p as unknown as ProductRow);
          sonnerToast.success(`เพิ่ม "${p.name}" ในตะกร้าแล้ว`);
          void reload();
        }}
      />
    </div>
  );
}
