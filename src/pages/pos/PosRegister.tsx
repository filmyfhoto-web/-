import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Banknote, QrCode, Wallet, CreditCard, Layers, TicketPercent, PauseCircle,
  CheckCircle2, Search, Trash2, Plus, Minus, ChevronUp, ChevronDown, Delete,
  LogOut, Users, RotateCcw, Wifi, WifiOff, MonitorSmartphone,
  Printer, Gift, NotebookPen, Hand, ScanLine, Paperclip, PackagePlus, CloudUpload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BUILD_INFO } from "@/lib/buildInfo";
import logoAsset from "@/assets/nattaporn-logo.jpg.asset.json";
import { refreshAppAssets, forceUpdateApp } from "@/lib/appUpdate";
import PosVersionBar from "@/components/pos/PosVersionBar";
import PhotoBarcodeDialog from "@/components/PhotoBarcodeDialog";
import PosAttachDialog from "@/components/pos/PosAttachDialog";
import QuickAddProductDialog from "./QuickAddProductDialog";
import { usePosAttachments } from "@/lib/posAttachments";
import {
  enqueueCheckout, flushQueue, loadQueue,
} from "@/lib/posOfflineQueue";
import { ToastAction } from "@/components/ui/toast";
import ProductThumb from "./ProductThumb";
import { useAuth } from "@/contexts/AuthContext";
import { useRapidScanner } from "./useRapidScanner";
import { beepOk, beepFail } from "./scanFeedback";
import PaymentCalculatorDialog, { type PosPayType } from "./PaymentCalculatorDialog";
import PosCustomerDialog from "./PosCustomerDialog";
import PosParkedBillsDialog from "./PosParkedBillsDialog";
import PosSaleSuccessDialog, { type PosSaleSuccess } from "./PosSaleSuccessDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { parkBill, loadParkedBills, type ParkedBill } from "./parkedBills";
import { receiptPath } from "./openReceipt";
import { loadPosSettings, computeVat } from "./receiptPrefs";
import { PAY_TYPE_LABEL, mapCheckoutError, newIdemKey, SALE_SOURCES, type PosSaleSource } from "./posCheckout";
import {
  loadRegisterPrefs, saveRegisterPrefs, registerLabel, storeLabel,
  POS_STORES, POS_REGISTERS, loadTouchMode, saveTouchMode,
} from "./posRegisterPrefs";
import {
  resolveScannedCode, variantDisplayLabel, variantEffectivePrice, autoSelectVariant,
  type VariantSummary,
} from "./variantPicker";
import VariantPickerDialog from "./VariantPickerDialog";
import {
  loadAllUnitLinks, buildEffectiveStockMap, computeAggregateBaseDemand,
  type UnitLinkRow,
} from "@/lib/productUnitLink";
import type { PosCustomerRef } from "./posTypes";
import { buildPosNotes } from "@/lib/posNotes";
import { useCustomerDirectory } from "@/lib/posCustomerDirectory";
import { usePosLiveCatalog } from "@/hooks/usePosLiveCatalog";
import { useStoreProfile } from "@/lib/posStoreProfile";
import {
  describeSnapshotAge, readOfflineSnapshot, saveOfflineSnapshot,
} from "@/lib/posOfflineCache";

/**
 * POS หน้าร้าน (touch register) — full-screen cash-register surface for the
 * dedicated 🏪 PWA. Shares the production catalog, stock and `pos_checkout`
 * flow with `/pos`; nothing here is mocked.
 */

type ProductRow = {
  id: string; name: string; code: string; barcode: string | null;
  standard_price: number; stock: number; unit: string; image_url: string | null;
  active: boolean; deleted_at: string | null; has_variants: boolean;
};

type Line = {
  key: string;
  product_id: string;
  variant_id: string | null;
  code: string;
  name: string;
  variant_label: string | null;
  unit: string;
  unit_price: number;
  qty: number;
  stock: number;
  discount: number;
  /** unit-link: base product this line consumes, and how many base units per qty */
  base_id: string | null;
  ratio: number | null;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const lineKey = (p: string, v: string | null) => `${p}::${v ?? "-"}`;

export default function PosRegister() {
  const navigate = useNavigate();
  const { user, isOwner, isAdmin } = useAuth();
  const settings = useMemo(() => loadPosSettings(), []);

  // Offline-first: paint from the last good snapshot so the register opens even
  // when the shop's internet is down.
  const cached = useMemo(
    () => readOfflineSnapshot<{ products: ProductRow[]; variants: VariantSummary[]; unitLinks: UnitLinkRow[] }>("pos.catalog"),
    [],
  );
  const [products, setProducts] = useState<ProductRow[]>(() => cached?.data.products ?? []);
  const [variants, setVariants] = useState<VariantSummary[]>(() => cached?.data.variants ?? []);
  const [unitLinks, setUnitLinks] = useState<UnitLinkRow[]>(() => cached?.data.unitLinks ?? []);
  const [cacheAt, setCacheAt] = useState<Date | null>(cached?.savedAt ?? null);
  const [loading, setLoading] = useState(!cached);
  const [lines, setLines] = useState<Line[]>([]);
  const [sel, setSel] = useState(0);
  const [billDiscount, setBillDiscount] = useState(0);
  const [customer, setCustomer] = useState<PosCustomerRef | null>(null);
  /** เหตุผล/หมายเหตุของบิลลงบัญชี (เก็บลง notes ของใบเสร็จ) */
  const [creditNote, setCreditNote] = useState("");
  // Keep the teacher/customer directory hot: refetched on mount and whenever
  // the POS window regains focus, so a newly added ครู shows up immediately.
  useCustomerDirectory(true);
  const [source, setSource] = useState<PosSaleSource>("storefront");
  const [entry, setEntry] = useState("");
  const [entryMode, setEntryMode] = useState<"qty" | "discount" | "bill">("qty");
  const [q, setQ] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payType, setPayType] = useState<PosPayType>("cash");
  const [pickerFor, setPickerFor] = useState<ProductRow | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [parkedCount, setParkedCount] = useState(0);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  /** สแกนบาร์โค้ดด้วยกล้องมือถือ/แท็บเล็ต (ZXing ในเครื่อง) */
  const [camScanOpen, setCamScanOpen] = useState(false);
  /** แนบไฟล์เอกสารประกอบบิล */
  const [attachOpen, setAttachOpen] = useState(false);
  /** เพิ่มสินค้าใหม่จากหน้าขาย */
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  /** บิลที่รอซิงก์ตอนเน็ตหลุด */
  const [queued, setQueued] = useState(() => loadQueue().length);
  const [submitting, setSubmitting] = useState(false);
  const [sale, setSale] = useState<PosSaleSuccess | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [now, setNow] = useState(() => new Date());
  const [reg, setReg] = useState(() => loadRegisterPrefs());
  /** จอสัมผัส: ปุ่มใหญ่ขึ้น ระยะห่างมากขึ้น (จำค่าไว้ต่ออุปกรณ์) */
  const [touchMode, setTouchMode] = useState(() => loadTouchMode());
  const { profile: storeProfile } = useStoreProfile(reg.storeKey);
  const shopName = storeProfile?.shop_name?.trim() || storeLabel(reg.storeKey);
  const shopLogo = storeProfile?.logo_url || logoAsset.url;
  const idemRef = useRef<string>(newIdemKey());
  const attachments = usePosAttachments(useCallback(() => idemRef.current, []));
  const searchRef = useRef<HTMLInputElement | null>(null);
  /** last accepted scan — collapses double beams / repeated wedge input */
  const lastAcceptedScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => { saveRegisterPrefs(reg); }, [reg]);
  useEffect(() => { setParkedCount(loadParkedBills().length); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const reload = useCallback(async () => {
    const [{ data: prods }, { data: vars }, links] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,code,barcode,standard_price,stock,unit,image_url,active,deleted_at,has_variants")
        .is("deleted_at", null)
        .eq("active", true)
        .order("name", { ascending: true })
        .limit(500),
      supabase
        .from("product_variants")
        .select("id,product_id,sku,barcode,name,attributes,price,price_override,stock,active,archived_at,image_url")
        .is("archived_at", null)
        .eq("active", true)
        .limit(5000),
      loadAllUnitLinks().catch(() => [] as UnitLinkRow[]),
    ]);
    const nextProducts = (prods as unknown as ProductRow[]) ?? [];
    const nextLinks = (links as UnitLinkRow[]) ?? [];
    const nextVariants = ((vars ?? []) as unknown[]).map((raw) => {
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
    });
    setProducts(nextProducts);
    setUnitLinks(nextLinks);
    setVariants(nextVariants);
    saveOfflineSnapshot("pos.catalog", { products: nextProducts, variants: nextVariants, unitLinks: nextLinks });
    setCacheAt(new Date());
  }, []);

  useEffect(() => {
    let alive = true;
    reload().catch(() => { /* offline: keep the cached catalog */ }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reload]);

  /** live catalog: price/stock/variant changes land on screen without reload */
  const { live: catalogLive, syncedAt, refresh: refreshCatalog } = usePosLiveCatalog(reload);

  /** ส่งบิลที่ค้างในคิวออฟไลน์เมื่อกลับมาออนไลน์ */
  const syncQueue = useCallback(async () => {
    if (loadQueue().length === 0) return;
    const { synced, pending } = await flushQueue(async (payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("pos_checkout", payload);
      return { error };
    });
    setQueued(pending);
    if (synced > 0) {
      toast({ title: `ซิงก์บิลออฟไลน์แล้ว ${synced} บิล`, description: pending > 0 ? `ยังค้างอีก ${pending} บิล` : undefined });
      await reload().catch(() => undefined);
    }
  }, [reload]);

  useEffect(() => {
    if (online) void syncQueue();
  }, [online, syncQueue]);

  // ---- totals ----
  // Source of truth is the backend: `pos_checkout` charges
  // greatest(subtotal - discount, 0) and never adds VAT on top, so the amount
  // due here is exactly that, and VAT is *extracted* from it via computeVat —
  // the same helper the printed receipt uses.
  const subTotal = lines.reduce((s, l) => s + l.unit_price * l.qty - l.discount, 0);
  const netTotal = Math.max(0, subTotal - billDiscount);
  const vat = computeVat(netTotal, settings);
  const vatAmount = vat.vat;
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  /**
   * Picture of the line the cashier is on, shown in the green command panel
   * so it is obvious *which* product was just scanned. Image comes from the
   * variant when the line has one, otherwise from the product row.
   */
  const selectedPreview = useMemo(() => {
    const l = lines[sel];
    if (!l) return null;
    const v = l.variant_id ? variants.find((x) => x.id === l.variant_id) ?? null : null;
    const p = products.find((x) => x.id === l.product_id) ?? null;
    return {
      image: (v?.image_url as string | null) ?? p?.image_url ?? null,
      name: l.name,
      variant_label: l.variant_label,
      unit_price: l.unit_price,
      qty: l.qty,
      unit: l.unit,
    };
  }, [lines, sel, products, variants]);

  // ---- stock: unit-linked (wrapper → base) aggregate availability ----
  const effectiveStockMap = useMemo(
    () => buildEffectiveStockMap(products, unitLinks),
    [products, unitLinks],
  );
  const physicalStockById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.id, Number(p.stock ?? 0));
    return m;
  }, [products]);

  /** true when the projected cart would drive a base product past its stock */
  const aggregateBlocked = useCallback(
    (next: Line[]): string | null => {
      const demand = computeAggregateBaseDemand(next);
      for (const [pid, req] of demand) {
        const cap = physicalStockById.get(pid) ?? 0;
        if (req > cap) {
          const base = products.find((p) => p.id === pid);
          return `สต๊อกไม่พอ: ${base?.name ?? "สินค้าหน่วยเล็ก"} คงเหลือ ${cap} ต้องการ ${req}`;
        }
      }
      return null;
    },
    [physicalStockById, products],
  );

  // ---- cart ops ----
  const addByProduct = useCallback((product_id: string, variant_id: string | null, qty = 1) => {
    const p = products.find((x) => x.id === product_id);
    if (!p) { beepFail(); toast({ title: "ไม่พบสินค้า", variant: "destructive" }); return; }
    const v = variant_id ? variants.find((x) => x.id === variant_id) ?? null : null;
    const eff = effectiveStockMap.get(p.id);
    const baseId = v ? null : eff?.baseId ?? null;
    const ratio = v ? null : eff?.ratio ?? null;
    const stock = v
      ? Number(v.stock)
      : eff?.isLinked
        ? Number(eff.effectiveStock ?? 0)
        : Number(p.stock);
    if (stock <= 0) { beepFail(); toast({ title: "สินค้าหมด", description: p.name, variant: "destructive" }); return; }
    const key = lineKey(product_id, variant_id);
    let blocked: string | null = null;
    setLines((prev) => {
      const i = prev.findIndex((l) => l.key === key);
      const projected: Line[] = i >= 0
        ? prev.map((l, idx) => (idx === i ? { ...l, qty: Math.min(stock, l.qty + qty) } : l))
        : [...prev, {
            key, product_id, variant_id,
            code: v?.sku || v?.barcode || p.code || p.barcode || "-",
            name: p.name,
            variant_label: v ? variantDisplayLabel(v) : null,
            unit: p.unit || "ชิ้น",
            unit_price: v ? variantEffectivePrice(v, Number(p.standard_price)) : Number(p.standard_price),
            qty: Math.min(stock, qty),
            stock,
            discount: 0,
            base_id: baseId,
            ratio,
          }];
      const problem = aggregateBlocked(projected);
      if (problem) { blocked = problem; return prev; }
      if (i >= 0) {
        setSel(i);
        return projected;
      }
      setSel(prev.length);
      return projected;
    });
    if (blocked) { beepFail(); toast({ title: "สต๊อกไม่พอ", description: blocked, variant: "destructive" }); return; }
    beepOk();
  }, [products, variants, effectiveStockMap, aggregateBlocked]);

  const variantsFor = useCallback(
    (product_id: string) => variants.filter((v) => v.product_id === product_id),
    [variants],
  );

  /** Add a product, opening the SKU picker when a choice is genuinely needed. */
  const addProductOrPick = useCallback((p: ProductRow) => {
    const list = variantsFor(p.id);
    if (p.has_variants && list.length > 0) {
      const auto = autoSelectVariant(list);
      if (auto) { addByProduct(p.id, auto.id); return; }
      setPickerFor(p);
      return;
    }
    addByProduct(p.id, null);
  }, [variantsFor, addByProduct]);

  const handleCode = useCallback((raw: string) => {
    const code = (raw || "").trim();
    if (!code) return;
    // One physical beam can reach us twice (global wedge listener + the input's
    // own Enter handler). Collapse those into a single cart mutation.
    const nowMs = Date.now();
    if (code === lastAcceptedScan.current.code && nowMs - lastAcceptedScan.current.at < 120) {
      setQ("");
      return;
    }
    lastAcceptedScan.current = { code, at: nowMs };
    const hit = resolveScannedCode(code, products, variants);
    if (!hit) {
      beepFail();
      // ค้นหาต่อได้ทันที: คงรหัสไว้ในช่องค้นหา + ปุ่มสแกนใหม่
      setQ(code);
      searchRef.current?.focus();
      searchRef.current?.select();
      toast({
        title: "ไม่พบสินค้าจากบาร์โค้ดนี้",
        description: `รหัส ${code} — ลองค้นหาด้วยชื่อสินค้าในช่องค้นหา หรือสแกนใหม่อีกครั้ง`,
        variant: "destructive",
        action: (
          <ToastAction altText="สแกนใหม่" onClick={() => { setQ(""); setCamScanOpen(true); }}>
            สแกนใหม่
          </ToastAction>
        ),
      });
      return;
    }
    if (hit.variant_id) {
      addByProduct(hit.product_id, hit.variant_id);
    } else {
      const p = products.find((x) => x.id === hit.product_id);
      if (p) addProductOrPick(p);
    }
    setQ("");
  }, [products, variants, addByProduct, addProductOrPick]);

  useRapidScanner({ enabled: true, onScan: handleCode });

  /**
   * The one and only quantity mutation. Every path (+/-, numpad entry,
   * restore) goes through here so both the line's own stock *and* the
   * aggregate demand on a shared linked base product are always enforced.
   */
  const changeQty = useCallback((i: number, resolve: (current: number) => number) => {
    setLines((prev) => {
      const line = prev[i];
      if (!line) return prev;
      const wanted = resolve(line.qty);
      const clamped = Math.max(1, Math.min(line.stock, Math.floor(wanted)));
      if (clamped === line.qty) return prev;
      const next = prev.map((l, idx) => (idx === i ? { ...l, qty: clamped } : l));
      if (clamped > line.qty) {
        const problem = aggregateBlocked(next);
        if (problem) { toast({ title: "สต๊อกไม่พอ", description: problem, variant: "destructive" }); return prev; }
      }
      return next;
    });
  }, [aggregateBlocked]);

  const setQty = (i: number, qty: number) => changeQty(i, () => qty);
  const bump = (i: number, d: number) => changeQty(i, (cur) => cur + d);
  const removeLine = (i: number) => { setLines((prev) => prev.filter((_, idx) => idx !== i)); setSel((s) => Math.max(0, s - (i <= s ? 1 : 0))); };

  const clearBill = useCallback(() => {
    setLines([]); setBillDiscount(0); setCustomer(null); setCreditNote(""); setEntry(""); setSel(0); setEntryMode("qty");
    idemRef.current = newIdemKey();
    attachments.reset();
  }, [attachments]);

  function handlePark() {
    if (lines.length === 0) { toast({ title: "ตะกร้าว่าง", variant: "destructive" }); return; }
    const label = customer?.name
      ? `${customer.name} · ${lines.length} รายการ`
      : `บิล ${now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · ${lines.length} รายการ`;
    parkBill({
      label,
      lines: lines.map((l) => ({
        product_id: l.product_id, name: l.name, unit: l.unit, unit_price: l.unit_price,
        qty: l.qty, stock: l.stock, variant_id: l.variant_id, variant_label: l.variant_label,
        sku: l.code, image_url: null, base_id: l.base_id, ratio: l.ratio, discount: l.discount,
      })),
      discount: billDiscount,
      customer,
      source,
      store_key: reg.storeKey,
      register_key: reg.registerKey,
    });
    setParkedCount(loadParkedBills().length);
    toast({ title: "พักบิลแล้ว", description: label });
    clearBill();
  }

  function restoreParked(bill: ParkedBill) {
    setLines(
      bill.lines.map((l) => ({
        key: lineKey(l.product_id, l.variant_id),
        product_id: l.product_id,
        variant_id: l.variant_id,
        code: l.sku || "-",
        name: l.name,
        variant_label: l.variant_label,
        unit: l.unit,
        unit_price: l.unit_price,
        qty: l.qty,
        stock: l.stock,
        discount: Number(l.discount ?? 0),
        base_id: l.base_id ?? null,
        ratio: l.ratio ?? null,
      })),
    );
    setBillDiscount(bill.discount || 0);
    setCustomer(bill.customer);
    if (bill.source) setSource(bill.source as PosSaleSource);
    if (bill.store_key || bill.register_key) {
      setReg((r) => ({
        storeKey: bill.store_key || r.storeKey,
        registerKey: bill.register_key || r.registerKey,
      }));
    }
    idemRef.current = newIdemKey();
    setParkedCount(loadParkedBills().length);
    setParkedOpen(false);
  }

  // ---- numpad ----
  const press = (k: string) => {
    setEntry((prev) => {
      if (k === "C") return "";
      if (k === "back") return prev.slice(0, -1);
      if (k === ".") return prev.includes(".") ? prev : (prev || "0") + ".";
      const next = (prev + k).replace(/^0+(\d)/, "$1");
      return next.length > 9 ? prev : next;
    });
  };
  const applyEntry = () => {
    const n = parseFloat(entry || "");
    if (!Number.isFinite(n)) { setEntry(""); return; }
    if (entryMode === "qty") {
      if (lines[sel]) setQty(sel, n);
    } else if (entryMode === "bill") {
      setBillDiscount(Math.max(0, Math.min(subTotal, n)));
    } else if (lines[sel]) {
      setLines((prev) => prev.map((l, i) => (i === sel ? { ...l, discount: Math.max(0, Math.min(l.unit_price * l.qty, n)) } : l)));
    }
    setEntry("");
  };

  // ---- checkout ----
  const openPay = (type: PosPayType) => {
    if (lines.length === 0) { toast({ title: "ตะกร้าว่าง", description: "สแกนหรือค้นหาสินค้าก่อน", variant: "destructive" }); return; }
    setPayType(type);
    setPayOpen(true);
  };

  async function submitCheckout(pay: { paymentType: PosPayType; cashReceived: number | null; note?: string | null }) {
    if (submitting || lines.length === 0) return;
    setSubmitting(true);
    const count = itemCount;
    try {
      const totalLineDiscount = lines.reduce((s, l) => s + l.discount, 0);
      const noteText = (pay.note ?? creditNote).trim();
      const payload = {
        p_idempotency_key: idemRef.current,
        p_items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, qty: l.qty })),
        p_discount: billDiscount + totalLineDiscount,
        p_payment_type: pay.paymentType,
        p_payment_status: pay.paymentType === "credit" ? "credit" : "paid",
        p_cash_received: pay.cashReceived,
        p_customer_name: customer?.name ?? null,
        p_line_user_id: customer?.line_user_id ?? null,
        p_branch: storeLabel(reg.storeKey),
        p_notes: buildPosNotes({
          channel: `${SALE_SOURCES.find((s) => s.key === source)?.label ?? source} / ${registerLabel(reg.registerKey)}`,
          org: customer?.org ?? null,
          note: noteText || null,
        }),
      } as const;
      // เน็ตหลุด: พักบิลไว้ในคิวและซิงก์อัตโนมัติเมื่อกลับมาออนไลน์
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueueCheckout({
          label: `${customer?.name ?? "ลูกค้าทั่วไป"} · ${count} ชิ้น`,
          total: netTotal,
          payload: payload as unknown as Record<string, unknown>,
        });
        setQueued(loadQueue().length);
        toast({
          title: "บันทึกบิลไว้ (ออฟไลน์)",
          description: "ระบบจะส่งออเดอร์ให้อัตโนมัติเมื่ออินเทอร์เน็ตกลับมา",
        });
        clearBill();
        setPayOpen(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("pos_checkout", payload);
      if (error) {
        const offlineish = /fetch|network|timeout|failed to fetch/i.test(error.message ?? "");
        if (offlineish) {
          enqueueCheckout({
            label: `${customer?.name ?? "ลูกค้าทั่วไป"} · ${count} ชิ้น`,
            total: netTotal,
            payload: payload as unknown as Record<string, unknown>,
          });
          setQueued(loadQueue().length);
          toast({ title: "สัญญาณขัดข้อง — เก็บบิลไว้ในคิว", description: "จะส่งให้อัตโนมัติเมื่อเน็ตกลับมา" });
          clearBill();
          setPayOpen(false);
          return;
        }
        toast({ title: "ชำระเงินไม่สำเร็จ", description: mapCheckoutError(error.message ?? ""), variant: "destructive" });
        return;
      }
      const result = data as { receipt_number?: string; receipt_id?: string } | null;
      const total = netTotal;
      const cashReceived = pay.cashReceived;
      const soldTo = customer;
      if (result?.receipt_id) {
        await attachments.commit(result.receipt_id, result.receipt_number ?? null).catch(() => undefined);
      }
      clearBill();
      setPayOpen(false);
      if (result?.receipt_id) {
        setSale({
          receiptId: result.receipt_id,
          receiptNumber: result.receipt_number || result.receipt_id,
          total,
          cashReceived,
          change: cashReceived != null ? Math.max(0, cashReceived - total) : null,
          paymentLabel: PAY_TYPE_LABEL[pay.paymentType] ?? pay.paymentType,
          itemCount: count,
          customerName: soldTo?.name ?? null,
          customerOrg: soldTo?.org ?? null,
          isCredit: pay.paymentType === "credit",
          note: noteText || null,
        });
      } else {
        toast({ title: "บันทึกใบเสร็จแล้ว" });
      }
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  // ---- keyboard shortcuts (never while typing in a field) ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inField = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || (t?.isContentEditable ?? false);
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (inField) return;
      if (e.key === "Escape") { setEntry(""); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(Math.max(0, lines.length - 1), s + 1)); return; }
      if (e.key === "Enter") { e.preventDefault(); if (entry) applyEntry(); else openPay("cash"); return; }
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); return; }
      if (e.key === ".") { e.preventDefault(); press("."); return; }
      if (e.key === "Backspace") { e.preventDefault(); press("back"); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bound each render so it always sees fresh state

  const exitTo = isOwner || isAdmin ? "/admin/home" : "/pos";
  const searchHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(needle) || (p.code || "").toLowerCase().includes(needle) || (p.barcode || "").toLowerCase().includes(needle))
      .slice(0, 8);
  }, [q, products]);

  const payButtons: { key: PosPayType; label: string; icon: typeof Banknote; cls: string }[] = [
    { key: "transfer", label: "โอนเงิน", icon: Wallet, cls: "bg-sky-600 hover:bg-sky-500" },
    { key: "qr", label: "QR Code", icon: QrCode, cls: "bg-primary hover:bg-primary/90" },
    { key: "card", label: "บัตรเครดิต", icon: CreditCard, cls: "bg-primary hover:bg-primary/90" },
    { key: "cash", label: "เงินสด", icon: Banknote, cls: "bg-emerald-700 hover:bg-emerald-600" },
    { key: "credit", label: "ลงบัญชี", icon: NotebookPen, cls: "bg-orange-600 hover:bg-orange-500" },
  ];

  /** ของแถม — make the selected line free without touching its stock draw. */
  const giveAway = () => {
    const l = lines[sel];
    if (!l) { toast({ title: "เลือกรายการก่อน", variant: "destructive" }); return; }
    setLines((prev) => prev.map((x, i) => (i === sel ? { ...x, discount: x.unit_price * x.qty } : x)));
    toast({ title: "ตั้งเป็นของแถมแล้ว", description: l.name });
  };

  return (
    <div
      data-testid="pos-register"
      data-pos-ui="v2"
      data-touch-mode={touchMode ? "on" : "off"}
      className={cn(
        "fixed inset-0 flex flex-col bg-slate-100 text-slate-900 overflow-hidden",
        touchMode && "pos-touch",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <style>{`
        .pos-touch button, .pos-touch [role="button"] { min-height: 3.5rem; font-size: 1.05rem; }
        .pos-touch input { min-height: 3.25rem; font-size: 1.05rem; }
        .pos-touch [data-testid="pos-command-panel"] button { min-height: 4rem; min-width: 9rem; }
        .pos-touch table td, .pos-touch table th { padding-top: .6rem; padding-bottom: .6rem; font-size: 1rem; }
      `}</style>
      {/* ---- blue top bar: due label · huge total · shop identity ---- */}
      <header
        className="shrink-0 grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4 bg-blue-700 text-white px-3 py-2 shadow-md"
        data-testid="pos-topbar"
      >
        <div>
          <div className="text-[11px] sm:text-sm font-bold uppercase tracking-wide text-blue-100">บาทคงค้าง</div>
          <div className="text-xl sm:text-2xl font-extrabold text-white tabular-nums" data-testid="pos-due">
            ฿{fmt(netTotal)}
          </div>
        </div>
        <div className="order-last col-span-2 sm:order-none sm:col-span-1 text-center">
          <div
            className="font-black tabular-nums text-white leading-none text-4xl sm:text-5xl md:text-6xl lg:text-7xl drop-shadow"
            data-testid="pos-net-total"
          >
            {fmt(netTotal)}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 text-right">
          <div className="min-w-0">
          <div className="flex items-center justify-end gap-2 font-bold">
            <span aria-hidden className="text-lg">🏪</span>
            <span className="truncate" data-testid="pos-shop-title">{shopName}</span>
          </div>
          <div className="text-xs text-blue-100 truncate" data-testid="pos-store-name">{storeLabel(reg.storeKey)}</div>
          {settings.storeName && (
            <div className="text-[11px] text-blue-200 truncate" data-testid="pos-store-subtitle">{settings.storeName}</div>
          )}
          {!online && (
            <div className="text-[11px] font-bold text-amber-300 truncate" data-testid="pos-offline-cache">
              ออฟไลน์ · ใช้ข้อมูลที่บันทึกไว้ {describeSnapshotAge(cacheAt)}
            </div>
          )}
          {storeProfile?.address && (
            <div className="text-[11px] text-blue-200 truncate" data-testid="pos-store-address">{storeProfile.address}</div>
          )}
          {(storeProfile?.phone || storeProfile?.email) && (
            <div className="text-[11px] text-blue-200 truncate" data-testid="pos-store-contact">
              {[storeProfile?.phone ? `โทร. ${storeProfile.phone}` : null, storeProfile?.email]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          <div className="mt-0.5 flex items-center justify-end gap-1.5">
            <button
              type="button"
              data-testid="pos-touch-toggle"
              aria-pressed={touchMode}
              onClick={() => { const v = !touchMode; setTouchMode(v); saveTouchMode(v); }}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold inline-flex items-center gap-1",
                touchMode ? "bg-amber-400 text-slate-900" : "bg-blue-900 text-blue-100",
              )}
              title="สลับโหมดจอสัมผัส (ปุ่มใหญ่)"
            >
              <Hand className="w-3 h-3" aria-hidden /> จอสัมผัส
            </button>
            <span
              data-testid="pos-vat-badge"
              className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", settings.vatEnabled ? "bg-emerald-500 text-white" : "bg-blue-900 text-blue-100")}
            >
              {vat.enabled ? `VAT ${vat.rate}%` : "ไม่มี VAT"}
            </span>
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-black text-blue-800" data-testid="pos-version">
              POS v{BUILD_INFO.version}
            </span>
          </div>
          </div>
          {shopLogo ? (
            <img
              src={shopLogo}
              alt={`โลโก้ร้าน${shopName}`}
              data-testid="pos-shop-logo"
              className="block h-10 w-10 sm:h-14 sm:w-14 shrink-0 rounded-lg object-cover ring-2 ring-white/70 bg-white"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div
              data-testid="pos-shop-logo-fallback"
              className="grid h-10 w-10 sm:h-14 sm:w-14 shrink-0 place-items-center rounded-lg bg-white text-xl ring-2 ring-white/70"
              aria-label="ยังไม่ได้ตั้งโลโก้ร้าน"
            >
              🏪
            </div>
          )}
        </div>
      </header>

      {/* ---- green command panel ---- */}
      <div
        className="shrink-0 bg-emerald-600 px-2 py-2 space-y-2 border-b-4 border-emerald-800"
        data-testid="pos-command-panel"
      >
        <div className="flex gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {payButtons.map((b) => (
            <button
              key={b.key}
              type="button"
              data-testid={`pos-pay-${b.key}`}
              onClick={() => openPay(b.key)}
              className={cn("min-h-12 lg:min-h-14 shrink-0 min-w-[6.5rem] lg:min-w-[7.5rem] rounded-lg px-3 lg:px-4 text-white font-bold flex items-center gap-2 shadow ring-1 ring-black/10", b.cls)}
            >
              <b.icon className="w-5 h-5" aria-hidden /> {b.label}
            </button>
          ))}
          <button
            type="button"
            data-testid="pos-bill-discount"
            onClick={() => { setEntryMode("bill"); toast({ title: "ส่วนลดท้ายบิล", description: "พิมพ์จำนวนเงินแล้วกดยืนยัน" }); }}
            className="min-h-12 lg:min-h-14 shrink-0 min-w-[6.5rem] lg:min-w-[7.5rem] rounded-lg px-3 lg:px-4 font-bold flex items-center gap-2 bg-amber-400 text-slate-900 hover:bg-amber-300 shadow"
          >
            <TicketPercent className="w-5 h-5" aria-hidden /> คูปอง/ส่วนลด
          </button>
          <button
            type="button"
            data-testid="pos-park"
            onClick={handlePark}
            className="min-h-12 lg:min-h-14 shrink-0 min-w-[6.5rem] lg:min-w-[7.5rem] rounded-lg px-3 lg:px-4 font-bold flex items-center gap-2 bg-white text-emerald-800 hover:bg-emerald-50 shadow"
          >
            <PauseCircle className="w-5 h-5" aria-hidden /> พักบิล
          </button>
          <button
            type="button"
            data-testid="pos-close-bill"
            onClick={() => openPay("cash")}
            className="min-h-12 lg:min-h-14 shrink-0 min-w-[6.5rem] lg:min-w-[7.5rem] rounded-lg px-3 lg:px-4 font-bold flex items-center gap-2 bg-red-600 text-white hover:bg-red-500 shadow"
          >
            <CheckCircle2 className="w-5 h-5" aria-hidden /> ปิดบิล
          </button>
          <button
            type="button"
            data-testid="pos-pay-split"
            disabled
            title="ยังไม่รองรับการชำระแบบผสม — กรุณาแยกบิล หรือเลือกช่องทางเดียว"
            className="hidden lg:flex min-h-14 min-w-[7.5rem] rounded-lg px-4 font-bold items-center gap-2 bg-emerald-800/60 text-emerald-200 border border-dashed border-emerald-300/60 cursor-not-allowed opacity-70"
          >
            <Layers className="w-5 h-5" aria-hidden /> ชำระแบบผสม (เร็วๆ นี้)
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto lg:flex-wrap lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[11px] font-bold text-emerald-50">ช่องทางรายการ:</span>
          {SALE_SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              data-testid={`pos-source-${s.key}`}
              onClick={() => setSource(s.key)}
              aria-pressed={source === s.key}
              className={cn(
                "min-h-10 lg:min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold border-2",
                source === s.key
                  ? "bg-white text-emerald-800 border-white"
                  : "bg-emerald-700 text-emerald-50 border-emerald-400/50 hover:bg-emerald-600",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- body ---- */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* cart */}
        <section className="flex-1 min-w-0 min-h-0 flex flex-col bg-white border-b lg:border-b-0 lg:border-r border-slate-300">
          <div className="shrink-0 p-2 flex flex-wrap items-center gap-2 relative bg-slate-50 border-b border-slate-200">
            <div className="relative basis-full sm:basis-auto sm:flex-1 min-w-[10rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
              <Input
                ref={searchRef}
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCode(q); } }}
                placeholder="สแกนบาร์โค้ด หรือค้นหาสินค้า (F2)"
                data-testid="pos-scan-input"
                className="h-12 pl-9 pr-2 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 text-base"
              />
              {searchHits.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 top-full mt-1 max-h-72 overflow-auto rounded-xl border border-slate-300 bg-white shadow-xl">
                  {searchHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => { addProductOrPick(p); setQ(""); }}
                        className="w-full text-left px-3 py-3 min-h-12 hover:bg-blue-50 flex justify-between gap-3"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="tabular-nums font-bold text-blue-700">฿{fmt(Number(p.standard_price))}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              variant="secondary"
              className="h-12 min-w-12 shrink-0 bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={() => setCamScanOpen(true)}
              data-testid="pos-cam-scan-btn"
              aria-label="สแกนบาร์โค้ดด้วยกล้อง"
              title="สแกนบาร์โค้ดด้วยกล้อง"
            >
              <ScanLine className="w-5 h-5 shrink-0" />
              <span className="hidden xl:inline ml-1">สแกน</span>
            </Button>
            <Button variant="secondary" className="h-12 min-w-12 shrink-0 max-w-[16rem]" onClick={() => setCustomerOpen(true)} data-testid="pos-customer-btn">
              <Users className="w-5 h-5 shrink-0" />
              <span className="hidden lg:flex ml-1 flex-col items-start leading-tight overflow-hidden">
                <span className="truncate max-w-[12rem]">{customer?.name || "ลูกค้า"}</span>
                {customer?.org ? (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[12rem]" data-testid="pos-customer-org-label">
                    {customer.org}
                  </span>
                ) : null}
              </span>
            </Button>
            <Button variant="secondary" className="h-12 shrink-0 whitespace-nowrap" onClick={() => setParkedOpen(true)} data-testid="pos-held-btn">
              บิลพัก {parkedCount}
            </Button>
            <Button
              variant="secondary"
              className="h-12 min-w-12 shrink-0 bg-sky-600 text-white hover:bg-sky-500"
              onClick={() => setAttachOpen(true)}
              data-testid="pos-attach-btn"
              aria-label="แนบไฟล์เอกสาร"
              title="แนบไฟล์เอกสารประกอบบิล"
            >
              <Paperclip className="w-5 h-5 shrink-0" />
              <span className="hidden xl:inline ml-1">แนบไฟล์</span>
              {attachments.files.length > 0 && (
                <span className="ml-1 rounded bg-white px-1.5 text-xs font-bold text-sky-700" data-testid="pos-attach-count">
                  {attachments.files.length}
                </span>
              )}
            </Button>
            <Button
              variant="secondary"
              className="h-12 min-w-12 shrink-0 bg-emerald-800 text-white hover:bg-emerald-700"
              onClick={() => setQuickAddOpen(true)}
              data-testid="pos-add-product-btn"
              aria-label="เพิ่มสินค้า"
              title="เพิ่มสินค้าใหม่เข้าระบบ"
            >
              <PackagePlus className="w-5 h-5 shrink-0" />
              <span className="hidden xl:inline ml-1">เพิ่มสินค้า</span>
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-auto" data-testid="pos-cart-scroll">
            {/* One table for every screen: secondary columns collapse on
                phones/tablet-portrait so the page never scrolls sideways. */}
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 bg-blue-700 text-white" data-testid="pos-table-head">
                <tr className="text-left">
                  <th className="hidden md:table-cell p-2 font-bold w-32">บาร์โค้ด</th>
                  <th className="p-2 font-bold">รายการสินค้า</th>
                  <th className="p-2 font-bold text-center w-[8.5rem] md:w-40">จำนวน</th>
                  <th className="hidden lg:table-cell p-2 font-bold text-right w-28">ราคาต่อหน่วย</th>
                  <th className="hidden lg:table-cell p-2 font-bold text-right w-24">ส่วนลด</th>
                  <th className="p-2 font-bold text-right w-24 md:w-28">รวมเงิน</th>
                  <th className="p-2 w-14" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={7} className="p-10 text-center text-slate-500">{loading ? "กำลังโหลดสินค้า…" : "ยังไม่มีรายการ — สแกนบาร์โค้ดเพื่อเริ่มขาย"}</td></tr>
                )}
                {lines.map((l, i) => (
                  <tr
                    key={l.key}
                    onClick={() => setSel(i)}
                    data-testid="pos-cart-row"
                    className={cn("border-b border-slate-200 cursor-pointer", i === sel ? "bg-blue-100" : "odd:bg-slate-50 hover:bg-blue-50")}
                  >
                    <td className="hidden md:table-cell p-2 tabular-nums text-slate-600 truncate">{l.code}</td>
                    <td className="p-2 min-w-0">
                      <div className="font-semibold break-words">{l.name}</div>
                      {l.variant_label && <div className="text-xs text-slate-500">{l.variant_label}</div>}
                      <div className="md:hidden text-[11px] text-slate-500 break-all">{l.code}</div>
                      <div className="lg:hidden text-[11px] text-slate-500 tabular-nums">
                        {fmt(l.unit_price)}{l.discount > 0 ? ` − ${fmt(l.discount)}` : ""}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-center gap-0.5 md:gap-1">
                        <Button size="icon" variant="outline" className="h-10 w-10 md:h-11 md:w-11 shrink-0" aria-label="ลดจำนวน" onClick={(e) => { e.stopPropagation(); bump(i, -1); }}><Minus className="w-4 h-4" /></Button>
                        <span className="w-8 md:w-12 text-center font-bold tabular-nums" data-testid="pos-line-qty">{l.qty}</span>
                        <Button size="icon" variant="outline" className="h-10 w-10 md:h-11 md:w-11 shrink-0" aria-label="เพิ่มจำนวน" onClick={(e) => { e.stopPropagation(); bump(i, 1); }}><Plus className="w-4 h-4" /></Button>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell p-2 text-right tabular-nums">{fmt(l.unit_price)}</td>
                    <td className="hidden lg:table-cell p-2 text-right tabular-nums text-amber-700">{fmt(l.discount)}</td>
                    <td className="p-2 text-right tabular-nums font-bold text-blue-800">{fmt(l.unit_price * l.qty - l.discount)}</td>
                    <td className="p-2">
                      <Button size="icon" variant="ghost" className="h-10 w-10 md:h-11 md:w-11 text-red-600" aria-label="ลบรายการ" onClick={(e) => { e.stopPropagation(); removeLine(i); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-300 bg-slate-50 px-3 py-2 text-sm">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <span data-testid="pos-item-count">{lines.length} รายการ · {itemCount} ชิ้น</span>
              {customer?.name ? (
                <span className="truncate text-slate-700" data-testid="pos-summary-customer">
                  คุณครู/ลูกค้า: <b>{customer.name}</b>
                  {customer.org ? <span className="text-slate-500"> · {customer.org}</span> : null}
                </span>
              ) : null}
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-slate-600">ยอดก่อนลด {fmt(subTotal)}</span>
              {billDiscount > 0 && <span className="text-amber-700">ส่วนลดท้ายบิล {fmt(billDiscount)}</span>}
              {settings.vatEnabled && <span className="text-emerald-700">VAT {fmt(vatAmount)}</span>}
              <span className="text-lg font-extrabold text-blue-800 tabular-nums">รวม {fmt(netTotal)}</span>
            </span>
          </div>

          {/* colored function bar */}
          <div
            className="shrink-0 hidden lg:grid grid-cols-6 gap-2 border-t border-slate-300 bg-slate-200 p-2"
            data-testid="pos-function-bar"
          >
            <FnBtn testid="pos-fn-exit" label="ออก" cls="bg-slate-700 hover:bg-slate-600" onClick={() => navigate(exitTo)} />
            <FnBtn testid="pos-fn-reprint" label="พิมพ์ซ้ำ" cls="bg-cyan-700 hover:bg-cyan-600" icon={Printer} onClick={() => navigate("/pos/history")} />
            <FnBtn testid="pos-fn-member" label="สมาชิก" cls="bg-primary hover:bg-primary" icon={Users} onClick={() => setCustomerOpen(true)} />
            <FnBtn testid="pos-fn-gift" label="ของแถม" cls="bg-primary hover:bg-primary" icon={Gift} onClick={giveAway} />
            <FnBtn testid="pos-fn-void" label="ยกเลิก/แก้ไข" cls="bg-amber-600 hover:bg-amber-500" icon={RotateCcw} onClick={clearBill} />
            <FnBtn testid="pos-fn-search" label="ค้นหา" cls="bg-emerald-700 hover:bg-emerald-600" icon={Search} onClick={() => searchRef.current?.focus()} />
          </div>
        </section>

        {/* right rail — desktop/tablet-landscape only. Portrait phones get the
            sticky action bar + numpad sheet below instead of a long rail. */}
        <aside
          className="hidden lg:flex lg:w-[18rem] xl:w-[20rem] max-w-full shrink-0 flex-col bg-blue-800 p-2 gap-2 overflow-y-auto"
          data-testid="pos-numpad-panel"
        >
          {/* product picture of the selected line — side rail only */}
          {selectedPreview && (
            <div
              className="rounded-xl bg-white/95 p-2 shadow ring-1 ring-blue-950/20"
              data-testid="pos-selected-preview"
            >
              <div className="flex items-center gap-2">
                <ProductThumb
                  src={selectedPreview.image}
                  name={selectedPreview.name}
                  className="h-20 w-20"
                  testId="pos-selected-thumb"
                />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-bold text-slate-900">{selectedPreview.name}</div>
                  <div className="truncate text-[11px] text-slate-600">
                    {selectedPreview.variant_label ? `${selectedPreview.variant_label} · ` : ""}
                    {selectedPreview.qty} {selectedPreview.unit}
                  </div>
                  <div className="tabular-nums text-base font-extrabold text-emerald-700">
                    ฿{fmt(selectedPreview.unit_price)}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <RailBtn testid="pos-change" onClick={() => openPay("cash")} label="คำนวณเงินทอน" />
            <RailBtn testid="pos-dropcash" onClick={() => navigate("/pos/reports")} label="นำส่งเงิน" />
            <RailBtn testid="pos-device" onClick={() => setDeviceOpen((v) => !v)} label="เปลี่ยนเครื่อง/ผู้ขาย" />
            <RailBtn testid="pos-park2" onClick={handlePark} label="พักบิล" />
            <RailBtn testid="pos-hotkey" onClick={() => toast({ title: "Hot Key", description: "F2 ค้นหา · ↑↓ เลือกรายการ · ตัวเลข = จำนวน · Enter ยืนยัน/ชำระเงิน · Esc ล้าง" })} label="Hot Key" />
            <RailBtn testid="pos-clear-bill" onClick={clearBill} label="ยกเลิกบิล" />
            <RailBtn
              testid="pos-check-update"
              onClick={() => { toast({ title: "กำลังโหลดเวอร์ชันล่าสุด…" }); void refreshAppAssets(); }}
              label="ตรวจสอบอัปเดต"
            />
            <RailBtn
              testid="pos-force-update-rail"
              onClick={() => { toast({ title: "บังคับอัปเดต — กำลังล้างแคช…" }); void forceUpdateApp(); }}
              label="บังคับอัปเดต"
            />
            <RailBtn testid="pos-gift" onClick={giveAway} label="ของแถม" />
          </div>

          {deviceOpen && (
            <div className="rounded-xl border border-blue-400 bg-blue-900 p-2 space-y-2 text-white" data-testid="pos-device-panel">
              <label className="block text-xs text-blue-100">ร้าน/สาขา
                <select
                  value={reg.storeKey}
                  onChange={(e) => setReg((r) => ({ ...r, storeKey: e.target.value }))}
                  className="mt-1 w-full h-11 rounded-lg bg-white border border-blue-300 px-2 text-slate-900"
                >
                  {POS_STORES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label className="block text-xs text-blue-100">เครื่อง POS
                <select
                  value={reg.registerKey}
                  onChange={(e) => setReg((r) => ({ ...r, registerKey: e.target.value }))}
                  className="mt-1 w-full h-11 rounded-lg bg-white border border-blue-300 px-2 text-slate-900"
                >
                  {POS_REGISTERS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>
          )}

          <NumpadCore
            entry={entry}
            entryMode={entryMode}
            onPress={press}
            onClearEntry={() => setEntry("")}
            onToggleMode={() => setEntryMode((m) => (m === "qty" ? "discount" : "qty"))}
            onSelUp={() => setSel((s) => Math.max(0, s - 1))}
            onSelDown={() => setSel((s) => Math.min(Math.max(0, lines.length - 1), s + 1))}
            onApply={applyEntry}
          />

          <button
            type="button"
            data-testid="pos-checkout"
            disabled={submitting}
            onClick={() => openPay("cash")}
            className="mt-auto min-h-24 rounded-2xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-black text-2xl shadow-lg ring-2 ring-red-300"
          >
            รวมยอด
            <div className="text-3xl tabular-nums">{fmt(netTotal)}</div>
          </button>
        </aside>
      </div>

      {/* ---- mobile sticky action bar (portrait phones / small tablets) ---- */}
      <div
        className="lg:hidden shrink-0 flex items-stretch gap-2 border-t border-slate-300 bg-blue-800 px-2 py-2"
        data-testid="pos-mobile-actions"
      >
        <button
          type="button"
          data-testid="pos-mobile-pad-open"
          onClick={() => setPadOpen(true)}
          className="min-h-14 rounded-xl px-3 font-bold bg-blue-600 text-white"
        >
          ตัวเลข
        </button>
        <button
          type="button"
          data-testid="pos-mobile-park"
          onClick={handlePark}
          className="min-h-14 rounded-xl px-3 font-bold bg-white text-blue-800"
        >
          พักบิล
        </button>
        <button
          type="button"
          data-testid="pos-mobile-checkout"
          disabled={submitting}
          onClick={() => openPay("cash")}
          className="flex-1 min-h-14 rounded-xl bg-red-600 text-white font-black text-lg tabular-nums disabled:opacity-60"
        >
          ชำระเงิน ฿{fmt(netTotal)}
        </button>
      </div>

      {/* ---- navy footer ---- */}
      <footer className="shrink-0 flex items-center justify-between gap-3 bg-blue-950 text-blue-100 px-3 py-1.5 text-xs" data-testid="pos-footer">
        <span className="truncate">แคชเชียร์: <strong className="text-white">{user?.email ?? "-"}</strong></span>
        <span className="hidden sm:flex items-center gap-1 truncate">
          <MonitorSmartphone className="w-3.5 h-3.5" aria-hidden />
          {storeLabel(reg.storeKey)} · {registerLabel(reg.registerKey)}
        </span>
        <span className="tabular-nums">{now.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
        <span className={cn("flex items-center gap-1 font-bold", online ? "text-emerald-300" : "text-red-300")} data-testid="pos-online">
          {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {online ? "ออนไลน์" : "ออฟไลน์"}
        </span>
        {queued > 0 && (
          <button
            type="button"
            onClick={() => void syncQueue()}
            data-testid="pos-queued-bills"
            title="ส่งบิลที่ค้างในคิว"
            className="flex items-center gap-1 font-bold text-amber-300"
          >
            <CloudUpload className="w-3.5 h-3.5" aria-hidden /> รอส่ง {queued}
          </button>
        )}
        <button
          type="button"
          onClick={refreshCatalog}
          data-testid="pos-live-status"
          data-live={catalogLive ? "on" : "off"}
          title="ซิงก์สินค้า/สต๊อกล่าสุด"
          className={cn("flex items-center gap-1 font-bold", catalogLive ? "text-emerald-300" : "text-amber-300")}
        >
          <span className={cn("h-2 w-2 rounded-full", catalogLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} aria-hidden />
          {catalogLive ? "เรียลไทม์" : "ซิงก์"}
          {syncedAt && (
            <span className="hidden md:inline tabular-nums font-normal">
              {syncedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </button>
        <span className="hidden sm:inline font-black text-white" data-testid="pos-version-footer">POS v{BUILD_INFO.version}</span>
        <Button size="sm" variant="secondary" className="min-h-9" data-testid="pos-exit" onClick={() => navigate(exitTo)}>
          <LogOut className="w-4 h-4 mr-1" /> ออก
        </Button>
      </footer>

      {/* always-visible build badge + update/debug surface */}
      <PosVersionBar />

      {/* mobile numpad sheet — full-height, scrollable body, sticky footer */}
      <Sheet open={padOpen} onOpenChange={setPadOpen}>
        <SheetContent
          side="bottom"
          className="lg:hidden top-auto bottom-0 max-h-[100dvh] h-[88dvh] flex flex-col gap-0 bg-blue-800 border-blue-900 text-white p-0"
          data-testid="pos-mobile-pad"
        >
          <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
            <SheetTitle className="text-white text-left">ตัวเลข/จำนวน</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            <NumpadCore
              prefix="m-"
              entry={entry}
              entryMode={entryMode}
              onPress={press}
              onClearEntry={() => setEntry("")}
              onToggleMode={() => setEntryMode((m) => (m === "qty" ? "discount" : "qty"))}
              onSelUp={() => setSel((s) => Math.max(0, s - 1))}
              onSelDown={() => setSel((s) => Math.min(Math.max(0, lines.length - 1), s + 1))}
              onApply={applyEntry}
            />
          </div>
          <div className="shrink-0 border-t border-blue-900 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              className="w-full h-12 bg-red-600 hover:bg-red-500 text-white font-bold"
              data-testid="pos-mobile-pad-done"
              onClick={() => { applyEntry(); setPadOpen(false); }}
            >
              ยืนยันและปิด
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <PaymentCalculatorDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        netTotal={netTotal}
        submitting={submitting}
        initialMethod={payType}
        items={lines.map((l) => ({ name: l.name, qty: l.qty, lineTotal: l.unit_price * l.qty - l.discount }))}
        customerName={customer?.name ?? null}
        customerOrg={customer?.org ?? null}
        note={creditNote}
        onNoteChange={setCreditNote}
        onConfirm={({ paymentType, cashReceived, note }) => void submitCheckout({ paymentType: paymentType ?? payType, cashReceived, note })}
      />
      <VariantPickerDialog
        open={pickerFor != null}
        productName={pickerFor?.name ?? ""}
        productStandardPrice={Number(pickerFor?.standard_price ?? 0)}
        productImageUrl={pickerFor?.image_url ?? null}
        variants={pickerFor ? variantsFor(pickerFor.id) : []}
        onCancel={() => setPickerFor(null)}
        onPick={(v) => { const p = pickerFor; setPickerFor(null); if (p) addByProduct(p.id, v.id); }}
      />
      <PosCustomerDialog open={customerOpen} onOpenChange={setCustomerOpen} value={customer} onSave={(v) => { setCustomer(v); setCustomerOpen(false); }} />
      <PosParkedBillsDialog open={parkedOpen} onOpenChange={setParkedOpen} onRestore={restoreParked} />
      <PhotoBarcodeDialog
        open={camScanOpen}
        onOpenChange={setCamScanOpen}
        onDecoded={(code) => {
          setCamScanOpen(false);
          setQ(code);
          handleCode(code);
        }}
      />
      <PosAttachDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        files={attachments.files}
        busy={attachments.busy}
        onPick={(picked) => {
          void attachments.upload(picked).then((err) => {
            if (err) toast({ title: "อัปโหลดไฟล์ไม่สำเร็จ", description: err, variant: "destructive" });
          });
        }}
        onRemove={(f) => void attachments.remove(f)}
      />
      <QuickAddProductDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onCreated={(p) => {
          void reload().then(() => addByProduct(p.id, null));
          toast({ title: "เพิ่มสินค้าแล้ว", description: p.name });
        }}
      />
      <PosSaleSuccessDialog
        sale={sale}
        onClose={() => setSale(null)}
        onPrint={(s) => navigate(receiptPath(s.receiptId, { returnTo: "/pos/register" }), { state: { returnTo: "/pos/register" } })}
        onView={(s) => navigate(receiptPath(s.receiptId, { returnTo: "/pos/register" }), { state: { returnTo: "/pos/register" } })}
      />
    </div>
  );
}

function FnBtn({
  label, onClick, cls, testid, icon: Icon,
}: { label: string; onClick: () => void; cls: string; testid?: string; icon?: typeof Printer }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      className={cn("min-h-12 rounded-lg text-white text-sm font-bold px-2 flex items-center justify-center gap-1.5 shadow", cls)}
    >
      {Icon && <Icon className="w-4 h-4" aria-hidden />}
      {label}
    </button>
  );
}

function RailBtn({ label, onClick, testid }: { label: string; onClick: () => void; testid?: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      className="min-h-14 rounded-xl bg-blue-600 hover:bg-blue-500 border border-blue-300/40 text-white text-sm font-bold px-2 shadow"
    >
      {label}
    </button>
  );
}

function PadBtn({
  label, onClick, tone = "default", icon: Icon, testid,
}: { label: string; onClick: () => void; tone?: "default" | "muted" | "accent"; icon?: typeof Delete; testid?: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      aria-label={label || "ปุ่ม"}
      className={cn(
        "min-h-14 rounded-xl font-bold text-xl grid place-items-center border shadow-sm",
        tone === "muted" && "bg-blue-900 hover:bg-blue-800 border-blue-500 text-white text-base",
        tone === "accent" && "bg-amber-400 hover:bg-amber-300 border-amber-200 text-slate-900 text-base",
        tone === "default" && "bg-white hover:bg-blue-50 border-blue-200 text-blue-900",
      )}
    >
      {Icon ? <Icon className="w-5 h-5" aria-hidden /> : label}
    </button>
  );
}

/**
 * Shared numpad body. Rendered twice (desktop rail + mobile sheet) but never
 * at the same time, and the mobile copy prefixes its test ids so the two
 * instances can't collide in queries.
 */
function NumpadCore({
  entry, entryMode, onPress, onClearEntry, onToggleMode, onSelUp, onSelDown, onApply, prefix = "",
}: {
  entry: string;
  entryMode: "qty" | "discount" | "bill";
  onPress: (k: string) => void;
  onClearEntry: () => void;
  onToggleMode: () => void;
  onSelUp: () => void;
  onSelDown: () => void;
  onApply: () => void;
  prefix?: string;
}) {
  const id = (s: string) => `${prefix}${s}`;
  return (
    <div className="flex flex-col gap-2" data-testid={`${prefix}pos-numpad`}>
      <div className="grid grid-cols-3 gap-2">
        <PadBtn onClick={onClearEntry} label="Esc" tone="muted" />
        <PadBtn onClick={onToggleMode} label={entryMode === "qty" ? "Qty" : entryMode === "bill" ? "บิล" : "ลด"} tone="accent" testid={id("pos-entry-mode")} />
        <PadBtn onClick={() => onPress("back")} label="ลบ" tone="muted" icon={Delete} />
      </div>

      <div className="rounded-xl bg-white border border-blue-300 px-3 py-2 text-right">
        <div className="text-[11px] text-slate-500">{entryMode === "qty" ? "จำนวน" : entryMode === "bill" ? "ส่วนลดท้ายบิล" : "ส่วนลดรายการ"}</div>
        <div className="text-2xl font-bold tabular-nums text-blue-900" data-testid={id("pos-entry")}>{entry || "0"}</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "C"].map((k) => (
          <PadBtn key={k} onClick={() => onPress(k)} label={k} testid={id(`pos-key-${k}`)} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PadBtn onClick={onSelUp} label="เลือกขึ้น" icon={ChevronUp} tone="muted" testid={id("pos-sel-up")} />
        <PadBtn onClick={onSelDown} label="เลือกลง" icon={ChevronDown} tone="muted" testid={id("pos-sel-down")} />
      </div>
      <Button className="h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold" onClick={onApply} data-testid={id("pos-apply-entry")}>
        ยืนยัน
      </Button>
    </div>
  );
}
