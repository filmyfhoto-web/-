import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { fmtTHB } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, Plus, Minus, Trash2, Package, ShoppingCart, Tag, LayoutGrid, ArrowLeft } from "lucide-react";
import CustomerLayout from "@/components/layout/CustomerLayout";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import SeoHead from "@/components/SeoHead";

/**
 * Customer-facing catalog rendered in a POS-style layout: a soft blue
 * surface with rectangular product tiles on the left and a sticky cart
 * summary on the right — mirroring the internal /pos experience so
 * customers who prefer that dense, calculator-like layout have an
 * alternative to the marketing-styled /shop page.
 *
 * Data source and checkout flow are identical to /shop (public products
 * view + shared CartContext) so both entry points stay in sync.
 */
export default function ShopPos() {
  const { add, items: cartItems, setQty, remove, count } = useCart();
  const nav = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [pRes, cRes] = await Promise.all([
        supabase.from("products_public" as any).select("*").order("name"),
        supabase.from("categories").select("*").order("name"),
      ]);
      if (cancelled) return;
      setProducts((pRes.data as any[]) ?? []);
      setCategories(cRes.data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => products.filter((p: any) => {
    if (catId && p.category_id !== catId) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (p.name || "").toLowerCase().includes(s)
        || (p.code || "").toLowerCase().includes(s)
        || (p.barcode || "").toLowerCase().includes(s);
  }), [products, q, catId]);

  const total = useMemo(
    () => cartItems.reduce((s, it) => s + Number(it.price ?? 0) * it.qty, 0),
    [cartItems],
  );

  function addToCart(p: any) {
    add({
      product_id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      image_url: p.image_url,
      price: p.standard_price != null && Number(p.standard_price) > 0 ? Number(p.standard_price) : null,
    });
    toast.success(`เพิ่มลงตะกร้า: ${p.name}`);
  }

  return (
    <CustomerLayout>
      <SeoHead
        title="สินค้ามุมมอง POS — ร้านนัฐภรณ์ เชียงกลาง"
        description="เลือกซื้อสินค้าในมุมมอง POS สี่เหลี่ยมสบายตา อ่านง่าย ใช้งานคล้ายเครื่องขายหน้าร้าน"
        path="/shop/pos"
      />
      <div className="-mx-4 md:mx-0 bg-slate-50 rounded-none md:rounded-2xl p-3 md:p-4 min-h-[calc(100vh-8rem)]">
        {/* Top toolbar */}
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="outline"
            className="rounded-xl h-11 bg-[hsl(218_60%_22%)] hover:bg-[hsl(218_60%_28%)] text-white border-2 border-[hsl(218_60%_22%)] font-bold px-3 shrink-0"
            onClick={() => nav(-1)}
            aria-label="กลับ"
            data-testid="shoppos-back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">กลับ</span>
          </Button>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(218_60%_25%)]" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสินค้า / รหัส / บาร์โค้ด"
              className="pl-10 h-11 rounded-xl bg-white border-2 border-[hsl(218_55%_35%)] font-semibold"
              data-testid="shoppos-search"
            />
          </div>
          <Link to="/shop">
            <Button variant="outline" className="rounded-xl h-11 bg-white border-2 border-[hsl(218_60%_25%)] text-[hsl(218_60%_22%)] font-bold hidden md:inline-flex">
              <LayoutGrid className="w-4 h-4 mr-1" /> มุมมองปกติ
            </Button>
          </Link>
          <Button
            className="rounded-xl h-11 bg-[hsl(218_60%_22%)] hover:bg-[hsl(218_60%_28%)] text-white font-bold border-2 border-[hsl(218_60%_22%)]"
            onClick={() => nav("/cart")}
            data-testid="shoppos-cart-button"
          >
            <ShoppingCart className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">ตะกร้า</span>
            {/* `key={count}` retriggers the badge's mount animation so the
                pill visibly refreshes on every add/remove/qty change. The
                cart context already broadcasts `cart:updated` in-tab and
                `storage` events cross-tab, so `count` is always live. */}
            <Badge
              key={count}
              className="ml-2 bg-white text-[hsl(218_60%_22%)] font-bold animate-in fade-in zoom-in duration-150"
              data-testid="shoppos-cart-count"
            >
              {count}
            </Badge>
          </Button>
        </div>

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              onClick={() => setCatId(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition ${!catId ? "bg-[hsl(218_60%_22%)] text-white border-[hsl(218_60%_22%)]" : "bg-white text-[hsl(218_60%_22%)] border-[hsl(218_55%_35%)] hover:bg-slate-100"}`}
            >
              <Tag className="w-3 h-3 inline mr-1" /> ทั้งหมด
            </button>
            {categories.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setCatId(c.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition ${catId === c.id ? "bg-[hsl(218_60%_22%)] text-white border-[hsl(218_60%_22%)]" : "bg-white text-[hsl(218_60%_22%)] border-[hsl(218_55%_35%)] hover:bg-slate-100"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
          {/* Product grid */}
          <div>
            {loading ? (
              <div className="text-center py-16 text-[hsl(218_60%_22%)] font-bold">กำลังโหลดสินค้า…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-[hsl(218_60%_22%)] font-bold">ไม่พบสินค้า</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2" data-testid="shoppos-grid">
                {filtered.map((p: any) => {
                  const price = p.standard_price != null && Number(p.standard_price) > 0 ? Number(p.standard_price) : null;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="group bg-white border-2 border-[hsl(218_60%_22%)] hover:bg-slate-50 rounded-xl p-2 text-left transition shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[hsl(218_60%_22%)]"
                      data-testid="shoppos-product"
                    >
                      <div className="aspect-square w-full rounded-lg bg-slate-100 grid place-items-center overflow-hidden mb-2">
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                          : <Package className="w-8 h-8 text-slate-400" />}
                      </div>
                      <div className="text-sm font-bold text-[hsl(218_60%_15%)] line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs font-semibold text-slate-600">{p.unit || "ชิ้น"}</span>
                        <span className="text-sm font-bold text-[hsl(218_60%_22%)] tabular-nums">
                          {price != null ? fmtTHB(price) : "สอบถาม"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky cart panel */}
          <div className="hidden lg:block">
            <Card className="p-3 sticky top-4 bg-white border-2 border-[hsl(218_60%_22%)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-bold text-[hsl(218_60%_15%)]">
                  <ShoppingCart className="w-4 h-4" /> ตะกร้า
                </div>
                <Badge className="bg-[hsl(218_60%_22%)] text-white font-bold">{count} รายการ</Badge>
              </div>
              <div className="max-h-[55vh] overflow-y-auto space-y-1.5 pr-1 -mr-1">
                {cartItems.length === 0 ? (
                  <div className="text-center text-slate-500 text-xs py-8 font-semibold">
                    <Package className="w-8 h-8 mx-auto mb-1 opacity-40" />
                    ยังไม่มีสินค้า
                  </div>
                ) : cartItems.map((it) => (
                  <div key={it.product_id} className="flex gap-2 p-1.5 rounded-lg border-2 border-[hsl(218_55%_35%)] bg-slate-50">
                    <div className="w-10 h-10 rounded bg-white border border-slate-200 grid place-items-center overflow-hidden shrink-0">
                      {it.image_url
                        ? <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />
                        : <Package className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[hsl(218_60%_15%)] line-clamp-1">{it.name}</div>
                      <div className="text-[10px] font-semibold text-slate-600">{it.price ? fmtTHB(Number(it.price)) : "สอบถาม"}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Button size="icon" variant="outline" className="w-5 h-5 rounded" onClick={() => setQty(it.product_id, it.qty - 1)}><Minus className="w-3 h-3" /></Button>
                        <span className="text-xs w-6 text-center tabular-nums font-bold">{it.qty}</span>
                        <Button size="icon" variant="outline" className="w-5 h-5 rounded" onClick={() => setQty(it.product_id, it.qty + 1)}><Plus className="w-3 h-3" /></Button>
                        <Button size="icon" variant="ghost" className="w-5 h-5 ml-auto text-rose-600" onClick={() => remove(it.product_id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t-2 border-[hsl(218_60%_22%)] space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-[hsl(218_60%_22%)]">ยอดรวม</span>
                  <span className="font-bold text-[hsl(218_60%_15%)] tabular-nums">{fmtTHB(total)}</span>
                </div>
                <Button
                  className="w-full rounded-xl bg-[hsl(218_60%_22%)] hover:bg-[hsl(218_60%_28%)] text-white font-bold border-2 border-[hsl(218_60%_22%)]"
                  disabled={!cartItems.length}
                  onClick={() => nav("/cart")}
                >
                  ดำเนินการสั่งซื้อ
                </Button>
              </div>
            </Card>
          </div>
        </div>

        {/* Mobile floating cart bar */}
        {cartItems.length > 0 && (
          <div className="lg:hidden fixed bottom-3 left-3 right-3 z-30">
            <Button
              className="w-full h-12 rounded-xl bg-[hsl(218_60%_22%)] hover:bg-[hsl(218_60%_28%)] text-white font-bold shadow-lg flex items-center justify-between px-4 border-2 border-[hsl(218_60%_22%)]"
              onClick={() => nav("/cart")}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> {count} รายการ
              </span>
              <span className="tabular-nums font-bold">{fmtTHB(total)}</span>
            </Button>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}