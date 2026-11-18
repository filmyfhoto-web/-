import { livePromos } from "@/lib/shopPromos";
import { liveChannel } from "@/lib/realtimeChannel";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGuest } from "@/contexts/GuestContext";
import { useCart } from "@/contexts/CartContext";
import { PriceResolution } from "@/lib/pricing";
import { fmtTHB } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Minus, Trash2, Package, MessageCircle, Store, ShoppingCart, ScanLine, Camera, Printer, Download, LayoutGrid, List as ListIcon, FileText, Sparkles, Send, AlertTriangle, RefreshCw, Repeat, Star, Phone } from "lucide-react";
import CustomerLayout from "@/components/layout/CustomerLayout";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLineCustomer, readLiffPictureHint } from "@/contexts/LineCustomerContext";
import SeoHead from "@/components/SeoHead";
import CameraCaptureDialog, { type CaptureResult } from "@/components/products/CameraCaptureDialog";
import { trackProductView } from "@/lib/trackProductView";
import { useDebounced } from "@/pages/receipts/master/useDebounced";
import SendToLineDialog from "@/components/shop/SendToLineDialog";
import { SmartImportDialog, type SmartImportRow } from "@/components/import/SmartImportDialog";
import { Upload } from "lucide-react";
import { CustomerBreadcrumbs } from "@/components/layout/CustomerBreadcrumbs";
import AiProductSearch from "@/components/shop/AiProductSearch";
import EntitlementRow from "@/components/shop/home/EntitlementRow";
import ServiceShortcuts, { SERVICE_SHORTCUTS, type ServiceShortcut } from "@/components/shop/home/ServiceShortcuts";
import { useServiceShortcuts, useShopTheme } from "@/hooks/useShopHomeConfig";
import { isSectionVisible } from "@/lib/shopHomeConfig";
import ShopSection from "@/components/shop/home/ShopSection";
import ShopProductCard, { isRush } from "@/components/shop/home/ShopProductCard";
import FeatureColumns, { type FeatureEntry } from "@/components/shop/home/FeatureColumns";
import { useShopFeatureColumns } from "@/hooks/useShopFeatureColumns";
import { leadTimeLabel } from "@/components/shop/home/ShopProductCard";
import type { FeatureColumnRow } from "@/lib/shopFeatureColumns";
import { SHOP_COUPONS } from "@/lib/customerPerks";
import { readRecentOrderedProductIds } from "@/lib/recentOrders";
import { useFreshBuildOnMount } from "@/lib/freshBuild";

export default function Shop() {
  // หน้าร้านลูกค้าเป็นทางเข้าหลัก — ถ้ามีบิลด์ใหม่บนเซิร์ฟเวอร์ให้สลับให้ทันที
  // (กันเครื่องที่ติดตั้งเป็นแอปไว้ค้างหน้าจอรุ่นเก่า เช่น หน้าเพิ่มเพื่อนที่เลิกใช้แล้ว)
  useFreshBuildOnMount();
  const { session } = useGuest();
  const { add, items: cartItems, setQty, remove, count, note } = useCart();

  const nav = useNavigate();
  const orgId = session?.org_id ?? null;
  const orgApproved = session?.org_approved ?? true;

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceResolution>>({});
  const [q, setQ] = useState("");
  const qDebounced = useDebounced(q, 150);
  const [catId, setCatId] = useState<string | null>(null);
  const [promos, setPromos] = useState<any[]>([]);
  const [stats, setStats] = useState({ available: 0, pending: 0, done: 0 });
  const [shop, setShop] = useState<any>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [sendLineOpen, setSendLineOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Hardcoded quick-category filter (per redesign spec — image ref 4).
  // Matches products by category name (case-insensitive substring). The
  // dynamic category chips below still work for org-specific data.
  const [quickCat, setQuickCat] = useState<string>("ทั้งหมด");
  const [activeService, setActiveService] = useState<string | null>(null);
  const [recentIds] = useState<string[]>(() => readRecentOrderedProductIds());
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("shop_view_mode") as "grid" | "list") || "grid";
  });
  useEffect(() => {
    try { localStorage.setItem("shop_view_mode", viewMode); } catch {}
  }, [viewMode]);

  // Bottom-nav deep links: /categories, /deals (or /promotions), ?view=categories.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    const wantsCategories =
      new URLSearchParams(window.location.search).get("view") === "categories" || path === "/categories";
    const wantsPromos = path === "/promotions" || path === "/deals";
    if (!wantsCategories && !wantsPromos) return;
    const target = wantsPromos ? "shop-promos" : "shop-categories";
    // Deep-link only: never move the viewport if the user already started
    // scrolling (iOS Safari treats a programmatic scroll mid-gesture as a jump).
    const startY = window.scrollY;
    const t = window.setTimeout(() => {
      if (Math.abs(window.scrollY - startY) > 8) return;
      document.getElementById(target)?.scrollIntoView({ behavior: "auto", block: "start" });
    }, 250);
    return () => window.clearTimeout(t);
  }, []);

  async function loadData() {
      setLoadingProducts(true);
      setLoadError(null);
      const errors: string[] = [];

      try {
        const [productsRes, categoriesRes] = await Promise.all([
          supabase.from("products_public" as any).select("*").order("name"),
          supabase.from("categories").select("*").order("name"),
        ]);

        if (productsRes.error) {
          errors.push("สินค้า");
          setProducts([]);
          setPrices({});
        } else {
          const ps = ((productsRes.data as any[]) ?? []);
          setProducts(ps);
          // นโยบาย: หน้าร้านลูกค้าจะแสดงเฉพาะ "ราคาหน้าร้านกลาง" (standard_price) เท่านั้น
          // ราคาเฉพาะโรงเรียน/หน่วยงาน จะไม่ถูกโหลดในหน้านี้ — ต้องติดต่อแอดมินเพื่อขอเสนอราคา
          const std: Record<string, PriceResolution> = {};
          for (const p of ps) {
            const v = p.standard_price;
            std[p.id] = {
              productId: p.id,
              price: v != null && Number(v) > 0 ? Number(v) : null,
              source: v != null && Number(v) > 0 ? "standard" : "pending",
            };
          }
          setPrices(std);

          if (session?.guest_id && session?.phone) {
            try {
              const { data: my } = await supabase.rpc("get_guest_orders", {
                p_guest_id: session.guest_id,
                p_phone: session.phone,
              });
              const rows = (my as any[]) ?? [];
              const pending = rows.filter((r) => r.status === "pending_quote").length;
              const done = rows.filter((r) => ["approved", "completed", "quoted"].includes(r.status)).length;
              setStats({ available: ps.length, pending, done });
            } catch {
              setStats((s) => ({ ...s, available: ps.length }));
            }
          } else {
            setStats((s) => ({ ...s, available: ps.length }));
          }
        }

        if (categoriesRes.error) {
          errors.push("หมวดหมู่");
          setCategories([]);
        } else {
          setCategories(categoriesRes.data ?? []);
        }

        try {
          const { data: settingsRows, error } = await supabase.rpc("get_public_settings");
          if (error) errors.push("การตั้งค่าร้าน");
          else setShop(Array.isArray(settingsRows) ? settingsRows[0] : settingsRows);
        } catch {
          errors.push("การตั้งค่าร้าน");
        }

        // Load admin-managed promo cards. Table may not exist yet — swallow errors.
        try {
          const { data: pr } = await (supabase as any)
            .from("shop_promos")
            .select("*")
            .eq("is_active", true)
            .order("sort", { ascending: true });
          // แสดงเฉพาะรายการที่อยู่ในช่วงวันที่ที่แอดมินกำหนด
          setPromos(livePromos(((pr as any[]) ?? []) as any));
        } catch {
          setPromos([]);
        }

        if (errors.length) {
          setLoadError(`โหลดข้อมูล${errors.join(" / ")}ไม่สำเร็จบางส่วน กรุณากดโหลดใหม่`);
        }
      } catch (e: any) {
        setProducts([]);
        setPrices({});
        setLoadError(e?.message || "โหลดสินค้าไม่สำเร็จ กรุณากดโหลดใหม่");
      } finally {
        setLoadingProducts(false);
      }
  }

  useEffect(() => {
    loadData();
    // Realtime: refresh when products/promos/orders change so any update
    // made from POS / admin / another customer tab shows here immediately.
    // (Customer still only sees their own orders — RLS enforces that.)
    const channel = liveChannel("shop-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => { loadData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_promos" }, () => { loadData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => { loadData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, session?.guest_id, session?.phone]);

  // Deep-link support: `/shop?p=<code>` or `/shop?product=<id>` scrolls to and
  // highlights the matching product once data is loaded. Also clears filters
  // so the target is visible.
  useEffect(() => {
    if (!products.length) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("p") || params.get("code") || "").trim();
    const pid = (params.get("product") || params.get("id") || "").trim();
    if (!code && !pid) return;
    const match = products.find((p: any) =>
      (pid && p.id === pid) || (code && (p.code || "").toLowerCase() === code.toLowerCase())
    );
    if (!match) {
      toast.error(`ไม่พบสินค้า${code ? ` รหัส ${code}` : ""}`);
      return;
    }
    setCatId(null);
    setQ("");
    setHighlightId(match.id);
    setTimeout(() => {
      const el = document.getElementById(`product-card-${match.id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    setTimeout(() => setHighlightId(null), 3500);
    trackProductView({ productId: match.id, source: "deep_link", guestPhone: session?.phone });
  }, [products, session?.phone]);

  const filtered = useMemo(() => products.filter(p => {
    if (catId && p.category_id !== catId) return false;
    if (quickCat && quickCat !== "ทั้งหมด") {
      const catName = (categories.find((c: any) => c.id === p.category_id)?.name ?? "").toLowerCase();
      if (!catName.includes(quickCat.toLowerCase())) return false;
    }
    if (qDebounced) {
      const s = qDebounced.toLowerCase();
      const hit = p.name.toLowerCase().includes(s)
        || (p.code || "").toLowerCase().includes(s)
        || (p.barcode || "").toLowerCase().includes(s);
      if (!hit) return false;
    }
    return true;
  }), [products, qDebounced, catId, quickCat, categories]);

  const cartTotal = useMemo(() => cartItems.reduce((s, it) => s + (Number(prices[it.product_id]?.price ?? 0) * it.qty), 0), [cartItems, prices]);

  /** จำนวนที่อยู่ในตะกร้าของแต่ละสินค้า — ใช้โชว์ badge บนการ์ดสินค้า */
  const qtyById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of cartItems) m[it.product_id] = it.qty;
    return m;
  }, [cartItems]);

  // ข้อมูลติดต่อร้าน — มาจากหน้าตั้งค่าเท่านั้น (ไม่ hardcode)
  const shopLineUrl: string = String(shop?.line_add_friend_url ?? shop?.line_url ?? "").trim();
  const shopLogoUrl: string = String(shop?.logo_url ?? "").trim();

  /** เพิ่มสินค้าลงตะกร้าจากการ์ดหน้าแรก */
  function addToCart(p: any, qty = 1) {
    trackProductView({ productId: p.id, source: "shop_add_to_cart", guestPhone: session?.phone });
    add({ product_id: p.id, code: p.code, name: p.name, unit: p.unit, image_url: p.image_url, price: prices[p.id]?.price ?? null }, qty);
    toast.success(`เพิ่ม ${p.name} ลงตะกร้าแล้ว (${qty})`);
  }

  /** เลือกหมวดหมู่จากแถบด้านบน — ตั้งค่า query, กรองสินค้า และเลื่อนไปที่รายการ */
  function pickCategory(id: string | null, name?: string) {
    const next = catId === id ? null : id;
    setCatId(next);
    setQ("");
    setQuickCat("ทั้งหมด");
    setActiveService(null);
    if (next && name) toast.success(`กรองหมวด: ${name}`);
    setTimeout(() => {
      document.getElementById("shop-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  // Marketplace home sections. Hidden while the customer is actively
  // searching/filtering so the result grid stays the single focus.
  const browsing = !qDebounced && !catId && (!quickCat || quickCat === "ทั้งหมด") && !activeService;
  const { activeShortcuts } = useServiceShortcuts();
  const { theme } = useShopTheme();
  // ข้อมูลร้านและการเปิด/ปิดแต่ละส่วน — แอดมินตั้งได้ที่ /admin/shop-home
  const storeName = (theme.shop_name || "นัฐภรณ์ เชียงกลาง").trim();
  const storeLogo = (theme.shop_logo_url || shopLogoUrl || "").trim();
  const storeLineId = (theme.shop_line_id || "").trim();
  // โปรไฟล์ลูกค้า (LINE) — ใช้แสดงว่าใครกำลังใช้งานแอป และเปิดห้องแชทของคนนี้
  const { profile: lineCustomer } = useLineCustomer();
  const customerPicture = lineCustomer?.picture_url || readLiffPictureHint();
  const customerName = (lineCustomer?.customer_name || lineCustomer?.display_name || "").trim();

  const storeVisible = isSectionVisible(theme.sections, "store");
  const servicesVisible = isSectionVisible(theme.sections, "services");
  const bannersVisible = isSectionVisible(theme.sections, "banners");
  const recommendedVisible = isSectionVisible(theme.sections, "recommended");
  const serviceTerms = useMemo(() => {
    const fromDb = activeShortcuts
      .filter((s) => s.target_type === "search")
      .map((s) => s.target_value)
      .filter(Boolean);
    return fromDb.length ? fromDb : SERVICE_SHORTCUTS.map((s) => s.term).filter(Boolean);
  }, [activeShortcuts]);
  const popularServices = useMemo(
    () => products.filter((p: any) => serviceTerms.some((t) => String(p.name || "").includes(t))).slice(0, 10),
    [products, serviceTerms],
  );
  const reorderProducts = useMemo(
    () => recentIds.map((id) => products.find((p: any) => p.id === id)).filter(Boolean).slice(0, 10) as any[],
    [recentIds, products],
  );
  const rushProducts = useMemo(() => products.filter((p: any) => isRush(p)).slice(0, 10), [products]);
  const recommended = useMemo(() => {
    const seen = new Set([...popularServices, ...rushProducts].map((p: any) => p.id));
    return products.filter((p: any) => !seen.has(p.id)).slice(0, 10);
  }, [products, popularServices, rushProducts]);

  // เมนูพิเศษ 3 คอลัมน์ — แอดมินจัดการที่ /admin/shop-home
  const { columns: featureColumns, items: featureItems } = useShopFeatureColumns();
  const [featureView, setFeatureView] = useState<FeatureColumnRow | null>(null);
  const productEntry = (p: any): FeatureEntry => ({
    id: p.id,
    title: p.name,
    subtitle: leadTimeLabel(p),
    image_url: p.image_url,
    price_text: prices[p.id]?.price ? `เริ่มต้น ${fmtTHB(Number(prices[p.id]?.price))}` : "ขอใบเสนอราคา",
    badge_text: isRush(p) ? "รับได้ทันที" : null,
  });
  const autoEntries = useMemo(
    () => ({
      popular: popularServices.map(productEntry),
      rush: rushProducts.map(productEntry),
      recommended: recommended.map(productEntry),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [popularServices, rushProducts, recommended, prices],
  );
  const featureViewProducts = useMemo(() => {
    if (!featureView) return [] as any[];
    if (featureView.auto_source === "popular") return popularServices;
    if (featureView.auto_source === "rush") return rushProducts;
    if (featureView.auto_source === "recommended") return recommended;
    return [] as any[];
  }, [featureView, popularServices, rushProducts, recommended]);

  function buildExportRows() {
    const catName = (id: string | null) => categories.find((c: any) => c.id === id)?.name ?? "";
    return filtered.map((p: any) => {
      const price = prices[p.id]?.price;
      return {
        "รหัส": p.code ?? "",
        "บาร์โค้ด": p.barcode ?? "",
        "ชื่อสินค้า": p.name ?? "",
        "หมวดหมู่": catName(p.category_id),
        "หน่วย": p.unit ?? "",
        "สต๊อก": Number(p.stock ?? 0),
        "ราคา": price != null ? Number(price) : "รอเสนอราคา",
      };
    });
  }
  function todayStamp() {
    const d = new Date();
    const z = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}`;
  }
  async function exportCsv() {
    const rows = buildExportRows();
    if (!rows.length) { toast.error("ไม่มีสินค้าให้ดาวน์โหลด"); return; }
    const { downloadCsv } = await import("@/lib/csv");
    downloadCsv(`สินค้า-นัฐภรณ์-${todayStamp()}.csv`, rows, undefined, undefined, {
      storeName: "นัฐภรณ์ เชียงกลาง",
      subtitle: `รายการสินค้า ${rows.length} รายการ`,
    });
    toast.success(`ดาวน์โหลด CSV (${rows.length} รายการ)`);
  }
  async function exportXlsx() {
    const rows = buildExportRows();
    if (!rows.length) { toast.error("ไม่มีสินค้าให้ดาวน์โหลด"); return; }
    const { downloadXlsx } = await import("@/lib/xlsx");
    downloadXlsx(`สินค้า-นัฐภรณ์-${todayStamp()}`, { "สินค้า": rows }, undefined, {
      storeName: "นัฐภรณ์ เชียงกลาง",
      subtitle: `รายการสินค้า ${rows.length} รายการ — ดาวน์โหลด ${new Date().toLocaleString("th-TH")}`,
    });
    toast.success(`ดาวน์โหลด XLSX (${rows.length} รายการ)`);
  }
  // PDF download removed — PDF renderer does not support Thai script reliably.

  function handleScan(r: CaptureResult) {
    const bc = (r.barcode || "").replace(/\s/g, "");
    if (!bc) { toast.error("ไม่พบบาร์โค้ด ลองอีกครั้ง"); return; }
    const match = products.find((p: any) => (p.barcode || "").trim() === bc);
    if (!match) {
      setQ(bc);
      toast.error(`ไม่พบสินค้าสำหรับบาร์โค้ด ${bc}`);
      return;
    }
    add({ product_id: match.id, code: match.code, name: match.name, unit: match.unit, image_url: match.image_url, price: prices[match.id]?.price ?? null });
    toast.success(`เพิ่มลงตะกร้าแล้ว: ${match.name}`);
    setQ("");
    setHighlightId(match.id);
    setTimeout(() => {
      const el = document.getElementById(`product-card-${match.id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    setTimeout(() => setHighlightId(null), 2500);
  }

  const CartPanel = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-bold text-lg">
          <ShoppingCart className="w-5 h-5 text-primary" /> ตะกร้าสินค้า
        </div>
        <Badge variant="outline" className="rounded-full">{count} รายการ</Badge>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1 min-h-0">
        {cartItems.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-10">
            <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
            ยังไม่มีสินค้าในตะกร้า
          </div>
        ) : cartItems.map(it => {
          const price = Number(prices[it.product_id]?.price ?? 0);
          return (
            <div key={it.product_id} className="flex gap-2 p-2 rounded-xl border border-border bg-background/50">
              <div className="w-12 h-12 rounded-lg bg-accent/40 grid place-items-center overflow-hidden shrink-0">
                {it.image_url ? <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-primary/40" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium line-clamp-2">{it.name}</div>
                <div className="text-[11px] text-muted-foreground">{it.unit} · {price ? fmtTHB(price) : "รอเสนอราคา"}</div>
                <div className="flex items-center gap-1 mt-1">
                  <Button size="icon" variant="outline" aria-label="ลดจำนวน" className="w-6 h-6 rounded-md" onClick={() => setQty(it.product_id, it.qty - 1)}><Minus className="w-3 h-3" /></Button>
                  <span className="text-xs w-7 text-center">{it.qty}</span>
                  <Button size="icon" variant="outline" aria-label="เพิ่มจำนวน" className="w-6 h-6 rounded-md" onClick={() => setQty(it.product_id, it.qty + 1)}><Plus className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" aria-label="ลบสินค้าออกจากตะกร้า" className="w-6 h-6 ml-auto text-destructive" onClick={() => remove(it.product_id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">ยอดรวมประมาณการ</span>
          <span className="font-bold text-primary">{fmtTHB(cartTotal)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => { setCartOpen(false); nav("/cart"); }} disabled={!cartItems.length}>ดูตะกร้า</Button>
          <Button className="rounded-xl bg-gradient-primary text-primary-foreground" onClick={() => { setCartOpen(false); nav("/cart"); }} disabled={!cartItems.length}>ขอเสนอราคา</Button>
        </div>
        <Button
          className="w-full rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white"
          onClick={() => { setCartOpen(false); setSendLineOpen(true); }}
          disabled={!cartItems.length}
        >
          <Send className="w-4 h-4 mr-1" /> ส่งออเดอร์ไป LINE แอดมิน
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-xl"
          onClick={() => { setCartOpen(false); setImportOpen(true); }}
        >
          <Upload className="w-4 h-4 mr-1" /> นำเข้ารายการ (วาง/ไฟล์)
        </Button>
        <div className="text-[11px] text-muted-foreground text-center">
          กรอก ชื่อ · เบอร์ · โครงการ ในหน้าตะกร้า เพื่อขอเสนอราคาโดยไม่ต้องเข้าสู่ระบบ
        </div>
      </div>
    </div>
  );

  return (
    <CustomerLayout>
      <SeoHead
        title="สินค้าและราคา — ร้านนัฐภรณ์ เชียงกลาง"
        description="เลือกซื้อสินค้าจากร้านนัฐภรณ์ เชียงกลาง ดูราคาพิเศษสำหรับหน่วยงาน โรงเรียน องค์กร และร้านค้า พร้อมส่งคำสั่งซื้อออนไลน์"
        path="/shop"
      />
      <h1 className="sr-only">สินค้าทั้งหมด ร้านนัฐภรณ์ เชียงกลาง</h1>
      <div className="hidden md:block"><CustomerBreadcrumbs current="shop" /></div>
      {/* Nattapron storefront surface — warm cream tint from the customer
          theme tokens so nested cards stay white and readable. */}
      <div className="-mx-4 md:mx-0 overflow-x-hidden rounded-none md:rounded-2xl p-3 md:p-4 -mt-2 bg-gradient-to-b from-background via-secondary/40 to-primary/10">
      {/* Sticky top bar — search + cart + history (image ref 4). */}
      <div className="sticky top-0 z-30 -mx-3 md:mx-0 mb-3 bg-background/95 backdrop-blur px-3 pt-2 pb-2 border-b border-border md:border-b-0 md:px-0 md:py-0 md:static md:bg-transparent md:backdrop-blur-none">
        <div className="flex items-center gap-2 pb-2 md:hidden">
          <span className="inline-flex items-center gap-2 font-extrabold tracking-tight text-primary" data-testid="shop-brand">
            <span className="w-8 h-8 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground text-xs font-black">นภ</span>
            นัฐภรณ์ เชียงกลาง
          </span>
          <button
            type="button"
            onClick={() => nav("/account")}
            className="ml-auto flex items-center gap-2 min-w-0"
            aria-label={customerName ? `บัญชีของ ${customerName}` : "บัญชีของฉัน"}
            data-testid="shop-customer-chip"
          >
            <span className="max-w-[110px] truncate text-xs text-muted-foreground">{customerName || "บัญชีของฉัน"}</span>
            <span className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-primary/20 bg-muted grid place-items-center text-[10px] font-bold text-muted-foreground">
              {customerPicture
                ? <img src={customerPicture} alt={customerName ? `รูปโปรไฟล์ของ ${customerName}` : "รูปโปรไฟล์ลูกค้า"} className="w-full h-full object-cover" loading="lazy" />
                : (customerName.slice(0, 2) || "ฉัน")}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาบริการหรือสินค้า"
              aria-label="ค้นหาบริการหรือสินค้า"
              className="rounded-full pl-11 pr-24 h-14 md:h-11 bg-card border-border shadow-card text-base"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="ล้างคำค้นหา"
                className="absolute right-12 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-muted text-muted-foreground grid place-items-center"
              >
                ×
              </button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full text-primary hover:bg-primary/10 border-l border-border"
              title="ค้นหาด้วยกล้อง / สแกนบาร์โค้ด"
              aria-label="ค้นหาด้วยกล้อง / สแกนบาร์โค้ด"
              onClick={() => setScanOpen(true)}
            >
              <Camera className="w-5 h-5" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => nav("/notifications")}
            className="relative shrink-0 h-11 w-11 sm:w-auto sm:px-3 rounded-full bg-card border border-border gap-1.5 inline-flex items-center justify-center text-sm hover:border-primary/50 transition"
            title="ข้อความและแจ้งเตือนจากร้าน"
            aria-label="ข้อความและแจ้งเตือนจากร้าน"
            data-testid="shop-notifications-entry"
          >
            <MessageCircle className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">ข้อความ</span>
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#06C755] text-white text-[10px] font-bold grid place-items-center tabular-nums">
                {count}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => nav("/cart")}
            className="relative shrink-0 h-11 w-11 rounded-full bg-card border border-border inline-flex items-center justify-center hover:border-primary/50 transition"
            title="ตะกร้าสินค้า"
            aria-label={`ตะกร้าสินค้า ${count} รายการ`}
            data-testid="shop-cart-icon"
          >
            <ShoppingCart className="w-5 h-5 text-primary" />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center tabular-nums">
                {count}
              </span>
            )}
          </button>
        </div>
        <div className="mt-2 hidden md:flex">
          <AiProductSearch onSearch={(term) => { setQ(term); setCatId(null); setQuickCat("ทั้งหมด"); }} />
        </div>
      </div>
      {/* การ์ดข้อมูลร้าน — โลโก้ ชื่อร้าน LINE และสรุปสิทธิ์ 3 ช่อง */}
      {storeVisible && (
      <section className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-card" data-testid="shop-store-card">
        <div className="flex items-center gap-3">
          <span
            className="w-14 h-14 shrink-0 rounded-full overflow-hidden ring-2 ring-primary/15 bg-gradient-primary grid place-items-center text-primary-foreground text-sm font-black"
            data-testid="shop-store-logo"
          >
            {storeLogo ? (
              <img src={storeLogo} alt={`โลโก้ร้าน ${storeName}`} width={56} height={56} className="w-full h-full object-cover" decoding="async" />
            ) : (
              <Store className="w-6 h-6" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <div className="text-primary font-bold text-fluid-lg leading-tight truncate" data-testid="shop-store-name">{storeName}</div>
            <div className="text-fluid-xs text-muted-foreground truncate" data-testid="shop-store-line">
              {storeLineId ? `LINE: ${storeLineId}` : shopLineUrl ? "LINE พร้อมให้บริการ" : "งานพิมพ์ · เครื่องเขียน · บริการครบวงจร"}
            </div>
          </div>
        </div>
        {/* สรุปสิทธิ์ของลูกค้า — คูปอง / งานที่กำลังทำ / โปรวันนี้ */}
        <EntitlementRow
          couponCount={SHOP_COUPONS.length}
          activeJobs={stats.pending}
          promoCount={promos.length}
          orderCount={stats.pending + stats.done}
        />
      </section>
      )}

      {/* Info banner — moved up to appear right after category chips (per image
          ref 4). The rich banner further down is kept for orgs. */}
      <div className="mb-4 hidden md:block rounded-xl bg-accent/40 border border-border px-3 py-2 text-xs text-muted-foreground">
        ราคาที่แสดงเป็น <span className="font-semibold text-foreground">"ราคาหน้าร้านกลาง"</span> —
        หากต้องการราคาพิเศษสำหรับโรงเรียน/หน่วยงานของท่าน กรุณาติดต่อแอดมินเพื่อขอเสนอราคา
      </div>

      {/* เมนูลัดบริการ */}
      {servicesVisible && (
      <ServiceShortcuts
        active={activeService}
        items={activeShortcuts}
        size={theme.icon_size}
        columns={theme.icon_columns}
        onPick={(s: ServiceShortcut) => {
          if (s.target_type === "route" && s.target_value) {
            nav(s.target_value);
            return;
          }
          const next = activeService === s.key ? null : s.key;
          setActiveService(next);
          setQ(next ? s.term : "");
          setCatId(null);
          setQuickCat("ทั้งหมด");
        }}
      />
      )}

      {/* Promo showcase — 3-column grid, admin-managed via shop_promos. */}
      {bannersVisible && (
      <section aria-label="โปรโมชันวันนี้" id="shop-promos" className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold">โปรโมชันวันนี้</h2>
          </div>
          {promos.length === 0 ? (
            <div
              data-testid="shop-promo-empty"
              className="relative overflow-hidden rounded-2xl bg-gradient-primary text-primary-foreground px-4 py-4 shadow-glow"
            >
              <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-primary-foreground/10" />
              <div aria-hidden className="pointer-events-none absolute -right-4 bottom-[-3rem] h-28 w-28 rounded-full bg-primary-foreground/10" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-extrabold leading-tight">พิมพ์งานคุณภาพ</div>
                  <div className="text-xl font-black leading-tight">เสร็จไว ทันใจ ✨</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] opacity-90">
                    <span>✓ งานคมชัด</span>
                    <span>✓ วัสดุคุณภาพ</span>
                    <span>✓ บริการตรงเวลา</span>
                  </div>
                </div>
                <div className="shrink-0 grid place-items-center">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-foreground/15">
                    <Printer className="h-7 w-7" aria-hidden />
                  </span>
                </div>
              </div>
            </div>
          ) : (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 snap-x scroll-smooth" data-testid="shop-promo-carousel">
            {promos.slice(0, 8).map((pm: any) => {
              const inner = (
                <>
                  <div className="aspect-[16/9] bg-gradient-to-br from-secondary via-accent to-primary/25 overflow-hidden">
                    {pm.image_url ? (
                      <img src={pm.image_url} alt={pm.title || "โปรโมชั่น"} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full grid place-items-center">
                        <Sparkles className="w-6 h-6 text-primary/50" />
                      </div>
                    )}
                  </div>
                  {(pm.title || pm.subtitle) && (
                    <div className="p-2.5">
                      {pm.title && <div className="text-sm font-semibold line-clamp-1">{pm.title}</div>}
                      {pm.subtitle && <div className="text-xs text-muted-foreground line-clamp-1">{pm.subtitle}</div>}
                    </div>
                  )}
                </>
              );
              return pm.link_url ? (
                <a
                  key={pm.id}
                  href={pm.link_url}
                  target={pm.link_url.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="shrink-0 snap-start w-[78%] sm:w-[46%] lg:w-[32%] rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/50 transition shadow-card"
                >
                  {inner}
                </a>
              ) : (
                <div key={pm.id} className="shrink-0 snap-start w-[78%] sm:w-[46%] lg:w-[32%] rounded-2xl border border-border bg-card overflow-hidden shadow-card">
                  {inner}
                </div>
              );
            })}
          </div>
          )}
      </section>
      )}

      {/* LINE connection banner removed per request (2026-07-14). Customer-facing
          entry gate is handled by RequireLineLink phone form. LIFF flows on
          dedicated routes (/l/shop, /liff-link, /verify-line) are untouched. */}
      {recommendedVisible && browsing && !loadingProducts && (
        <div data-testid="shop-home-sections">
          <FeatureColumns
            columns={featureColumns}
            items={featureItems}
            autoEntries={autoEntries}
            onPick={(entry, col) => {
              if (entry.link_url) {
                if (entry.link_url.startsWith("http")) window.open(entry.link_url, "_blank", "noopener");
                else nav(entry.link_url);
                return;
              }
              const p = products.find((x: any) => x.id === entry.id);
              if (p) { addToCart(p); return; }
              setActiveService(null);
              setCatId(null);
              setQuickCat("ทั้งหมด");
              setQ(entry.title);
              void col;
            }}
            onViewAll={(col) => {
              if (col.link_url) {
                if (col.link_url.startsWith("http")) window.open(col.link_url, "_blank", "noopener");
                else nav(col.link_url);
                return;
              }
              if (col.auto_source && col.auto_source !== "none") {
                setFeatureView((cur) => (cur?.id === col.id ? null : col));
                return;
              }
              setActiveService(null);
              setCatId(null);
              setQuickCat("ทั้งหมด");
              setQ(col.title);
            }}
          />

          {featureView && (
            <ShopSection
              title={featureView.title}
              icon={<Star className="w-4 h-4 text-primary" aria-hidden />}
              count={featureViewProducts.length}
              testId="feature-expanded"
              emptyText="ยังไม่มีรายการในหมวดนี้"
              action={
                <Button type="button" variant="ghost" size="sm" className="min-h-11 rounded-xl" onClick={() => setFeatureView(null)}>
                  ปิด
                </Button>
              }
            >
              {featureViewProducts.map((p: any) => (
                <ShopProductCard key={p.id} product={p} price={prices[p.id]?.price ?? null} onAdd={() => addToCart(p)} highlighted={highlightId === p.id} />
              ))}
            </ShopSection>
          )}

          <ShopSection
            title="สั่งซ้ำจากครั้งก่อน"
            icon={<Repeat className="w-4 h-4 text-primary" aria-hidden />}
            count={reorderProducts.length}
            testId="section-reorder"
            emptyText="เมื่อคุณสั่งงานครั้งแรกแล้ว รายการจะขึ้นที่นี่เพื่อกดสั่งซ้ำได้ทันที"
          >
            {reorderProducts.map((p: any) => (
              <ShopProductCard key={p.id} product={p} price={prices[p.id]?.price ?? null} onAdd={() => addToCart(p)} />
            ))}
          </ShopSection>
        </div>
      )}
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">
        <div className="min-w-0">
      {!orgApproved && (
        <div className="mb-4 rounded-2xl p-4 bg-warning/15 text-warning border border-warning/30 text-sm">
          หน่วยงานของคุณยังไม่ได้รับการอนุมัติ คุณสามารถดูสินค้าและส่งรายการได้ ทางร้านจะอนุมัติและเสนอราคาให้
        </div>
      )}
      {/* Compact view/download toolbar (search + cart + history moved to the
          sticky top bar above). */}
      <div className="flex items-center gap-2 mb-4 justify-end">
        <div className="inline-flex rounded-2xl border border-border bg-card overflow-hidden shrink-0" role="group" aria-label="เลือกมุมมอง">
          <Button
            type="button"
            size="icon"
            variant={viewMode === "grid" ? "default" : "ghost"}
            className="h-10 w-10 rounded-none"
            title="มุมมองรูปภาพ"
            aria-label="มุมมองรูปภาพ"
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="w-5 h-5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={viewMode === "list" ? "default" : "ghost"}
            className="h-10 w-10 rounded-none"
            title="มุมมองรายการ"
            aria-label="มุมมองรายการ"
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
          >
            <ListIcon className="w-5 h-5" />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="h-10 rounded-2xl shrink-0 gap-2" title="ดาวน์โหลดรายการสินค้า" aria-label="ดาวน์โหลดรายการสินค้า">
              <Download className="w-4 h-4" /> <span>ดาวน์โหลด</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportCsv}>ดาวน์โหลด CSV (.csv)</DropdownMenuItem>
            <DropdownMenuItem onClick={exportXlsx}>ดาวน์โหลด Excel (.xlsx)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="-mx-2 md:mx-0 mb-4" id="shop-categories">
        <h2 className="px-2 md:px-0 mb-2 text-sm font-bold">หมวดหมู่สินค้า</h2>
        <div className="flex gap-2 overflow-x-auto pb-3 px-2 md:px-0 snap-x">
          <button
            type="button"
            onClick={() => pickCategory(null)}
            aria-pressed={catId === null}
            data-active={catId === null ? "true" : "false"}
            className={`shrink-0 snap-start rounded-2xl border p-2 flex items-center gap-2 min-w-[96px] transition ${catId === null ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-border bg-card"}`}
          >
            <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center">
              <Package className="w-5 h-5 text-primary/60" />
            </div>
            <div className="text-left text-xs">
              <div className={`${catId === null ? "font-semibold" : ""}`}>ทั้งหมด</div>
              <div className="text-[10px] text-muted-foreground">{products.length} รายการ</div>
            </div>
          </button>
          {categories.map((c) => {
            const thumb = Array.isArray(c.image_urls) && c.image_urls[0];
            const count = products.filter((p) => p.category_id === c.id).length;
            const active = catId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCategory(c.id, c.name)}
                aria-pressed={active}
                data-active={active ? "true" : "false"}
                className={`shrink-0 snap-start rounded-2xl border p-2 flex items-center gap-2 min-w-[120px] transition ${active ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-border bg-card"}`}
                title={c.name}
                data-testid={`shop-cat-chip-${c.id}`}
                data-has-image={thumb ? "true" : "false"}
              >
                <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center overflow-hidden">
                  {thumb
                    ? <img src={thumb} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                    : <Package className="w-5 h-5 text-primary/60" data-testid="shop-cat-chip-placeholder" />}
                </div>
                <div className="text-left text-xs min-w-0">
                  <div className={`truncate max-w-[110px] ${active ? "font-semibold" : ""}`}>{c.name}</div>
                  <div className="text-[10px] text-muted-foreground">{count} รายการ</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div id="shop-results" className="mb-2 text-[11px] text-muted-foreground scroll-mt-24">
        พบ <span className="font-semibold text-foreground">{filtered.length}</span> รายการ
        {(qDebounced || catId || (quickCat && quickCat !== "ทั้งหมด")) && (
          <button
            type="button"
            onClick={() => { setQ(""); setCatId(null); setQuickCat("ทั้งหมด"); setActiveService(null); }}
            className="ml-2 text-primary underline underline-offset-2"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>
      {loadError && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {loadError}</span>
          <Button size="sm" variant="outline" className="h-8 rounded-lg shrink-0" onClick={() => void loadData()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> โหลดใหม่
          </Button>
        </div>
      )}
      {loadingProducts ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" role="status" aria-live="polite" aria-label="กำลังโหลดสินค้า">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-2 animate-pulse">
              <div className="aspect-square rounded-lg bg-muted mb-1.5" />
              <div className="h-3 w-1/3 bg-muted rounded mb-1" />
              <div className="h-3 w-4/5 bg-muted rounded mb-2" />
              <div className="h-4 w-1/2 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : viewMode === "grid" ? (
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" data-testid="shop-product-list">
        <h2 className="sr-only">รายการสินค้า</h2>
        {filtered.map((p) => {
          const pr = prices[p.id];
          const stock = Number(p.stock ?? 0);
          const low = stock <= Number(p.low_stock_threshold);
          const out = stock <= 0 && !p.has_variants;
          return (
            <button
              key={p.id}
              type="button"
              id={`product-card-${p.id}`}
              onClick={() => addToCart(p, 1)}
              aria-label={`เพิ่ม ${p.name} ลงตะกร้า`}
              style={{ contentVisibility: "auto", containIntrinsicSize: "220px" } as any}
              className={`group text-left rounded-xl border bg-card p-2 hover:border-primary/60 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/60 focus:outline-none transition min-h-11 ${
                highlightId === p.id ? "border-primary ring-2 ring-primary/40" : "border-border"
              }`}
            >
              <div className="relative aspect-square rounded-lg bg-muted overflow-hidden mb-1.5 grid place-items-center">
                {qtyById[p.id] > 0 && (
                  <span
                    className="absolute top-1 right-1 z-10 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center tabular-nums"
                    data-testid={`shop-card-qty-${p.id}`}
                  >
                    {qtyById[p.id]}
                  </span>
                )}
                {p.image_url
                  ? <img
                      src={p.image_url}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover opacity-0 transition-opacity duration-300"
                      onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
                    />
                  : <Package className="w-7 h-7 text-muted-foreground/60" />}
              </div>
              <div className="text-[11px] font-mono text-muted-foreground truncate">{p.code}</div>
              <div className="text-[13px] font-medium leading-snug line-clamp-2 min-h-[2.4rem]">{p.name}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-bold text-primary tabular-nums">
                  {pr?.price != null ? `฿${Number(pr.price).toLocaleString("th-TH")}` : <span className="text-muted-foreground text-xs font-normal">รอเสนอราคา</span>}
                </span>
                <span className={`text-[11px] tabular-nums ${out ? "text-destructive font-semibold" : low ? "text-warning" : "text-muted-foreground"}`}>
                  {out ? "หมด" : `คงเหลือ ${stock}`}
                </span>
              </div>
              {/* ปุ่มบอกวิธีใช้งาน — แตะการ์ดคือเพิ่มลงตะกร้า */}
              <span
                aria-hidden
                data-testid={`shop-card-add-${p.id}`}
                className="mt-1.5 flex items-center justify-center gap-1 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold py-1.5 group-hover:bg-primary group-hover:text-primary-foreground transition"
              >
                <Plus className="w-3.5 h-3.5" /> เพิ่มลงตะกร้า
              </span>

            </button>
          );
        })}
      </div>
      ) : (
      <div className="rounded-2xl border border-border overflow-hidden bg-card">
        <table className="w-full text-sm" role="table">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2 w-16">รูป</th>
              <th className="text-left p-2">ชื่อสินค้า / รหัส</th>
              <th className="text-left p-2 hidden md:table-cell">หน่วย</th>
              <th className="text-left p-2 hidden md:table-cell">สต๊อก</th>
              <th className="text-right p-2">ราคา</th>
              <th className="p-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const pr = prices[p.id];
              const low = Number(p.stock) <= Number(p.low_stock_threshold);
              return (
                <tr
                  key={p.id}
                  id={`product-row-${p.id}`}
                  onClick={() => trackProductView({ productId: p.id, source: "shop_row", guestPhone: session?.phone })}
                  className={`border-t border-border hover:bg-accent/30 ${highlightId === p.id ? "bg-primary/10" : ""}`}
                >
                  <td className="p-2">
                    <div className="w-12 h-12 rounded-lg bg-accent/40 grid place-items-center overflow-hidden">
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                        : <Package className="w-5 h-5 text-primary/40" />}
                    </div>
                  </td>
                  <td className="p-2 min-w-0">
                    <div className="font-medium line-clamp-2">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{p.code}</span>
                      {p.barcode && <span className="font-mono">{p.barcode}</span>}
                      {low && <Badge variant="outline" className="text-[10px] border-warning text-warning">ใกล้หมด</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground md:hidden mt-1">{p.unit} · สต๊อก {Number(p.stock)}</div>
                  </td>
                  <td className="p-2 hidden md:table-cell">{p.unit}</td>
                  <td className="p-2 hidden md:table-cell">{Number(p.stock)}</td>
                  <td className="p-2 text-right font-bold text-primary whitespace-nowrap">
                    {pr?.price != null ? fmtTHB(pr.price) : <span className="text-muted-foreground text-xs font-normal">รอเสนอราคา</span>}
                  </td>
                  <td className="p-2">
                    <Button
                      size="sm"
                      className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(p, 1);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" /> เพิ่ม{qtyById[p.id] ? ` (${qtyById[p.id]})` : ""}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      {!loadingProducts && filtered.length === 0 && <div className="text-center text-muted-foreground py-12">ไม่พบสินค้า</div>}
        </div>

        {/* Sticky cart (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 bg-card border border-border rounded-2xl shadow-card p-4 max-h-[calc(100vh-6rem)] flex flex-col">
            {CartPanel}
          </div>
        </aside>
      </div>

      {/* ปุ่มลอยเดียว — โชว์เมื่อมีสินค้าในตะกร้าเท่านั้น จะได้ไม่บังการ์ดสินค้า */}
      {cartItems.length > 0 && (
        <div
          className="lg:hidden fixed right-4 z-40"
          style={{ bottom: "calc(var(--shop-nav-h, 4.5rem) + env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
        >
          <button
            onClick={() => setSendLineOpen(true)}
            className="relative h-12 w-12 rounded-full bg-[#06C755] text-white shadow-glow flex items-center justify-center"
            aria-label="ส่งออเดอร์ไป LINE แอดมิน"
            title="ส่งออเดอร์ไป LINE แอดมิน"
          >
            <Send className="w-5 h-5" />
            {count > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center tabular-nums"
                data-testid="shop-fab-cart-count"
              >
                {count}
              </span>
            )}
          </button>
        </div>
      )}


      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl h-[85vh] flex flex-col">
          <SheetHeader><SheetTitle className="sr-only">ตะกร้าสินค้า</SheetTitle></SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">{CartPanel}</div>
        </SheetContent>
      </Sheet>

      <CameraCaptureDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        focus="barcode"
        onCapture={handleScan}
      />

      <SendToLineDialog
        open={sendLineOpen}
        onOpenChange={setSendLineOpen}
        items={cartItems}
        prices={prices}
        note={note}
        lineUrl={shop?.line_url}
        shopName={shop?.shop_name}
      />

      <SmartImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="นำเข้ารายการเข้าตะกร้า"
        description="วางข้อความจาก LINE หรืออัปโหลด CSV/Excel — ระบบจะจับคู่กับสินค้าตามรหัสหรือชื่อ"
        onConfirm={async (rows: SmartImportRow[]) => {
          let matched = 0, skipped = 0;
          for (const r of rows) {
            const codeKey = (r.product_code || "").toLowerCase().trim();
            const nameKey = (r.product_name || "").toLowerCase().trim();
            const p = products.find((x: any) =>
              (codeKey && String(x.code || "").toLowerCase() === codeKey) ||
              (nameKey && String(x.name || "").toLowerCase().includes(nameKey))
            );
            if (!p) { skipped++; continue; }
            for (let i = 0; i < Math.max(1, r.qty); i++) {
              add({ product_id: p.id, code: p.code, name: p.name, unit: p.unit, image_url: p.image_url, price: prices[p.id]?.price ?? null });
            }
            matched++;
          }
          if (skipped > 0) toast.warning(`ไม่พบสินค้าที่ตรงกัน ${skipped} รายการ`);
          if (matched === 0) throw new Error("ไม่สามารถจับคู่สินค้าได้");
        }}
      />

      {shop?.phone && (
        <a
          href={`tel:${shop.phone}`}
          className="hidden lg:flex fixed bottom-6 right-6 z-40 rounded-full bg-primary text-primary-foreground px-4 py-3 shadow-glow items-center gap-2 text-sm font-medium"
        >
          <Phone className="w-4 h-4" /> ติดต่อร้าน
        </a>
      )}

      </div>
    </CustomerLayout>
  );
}