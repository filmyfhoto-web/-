import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProductForm from "@/components/products/ProductForm";
import QuickAdjustStockDialog, { type QuickAdjustProduct } from "@/pages/pos/QuickAdjustStockDialog";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeRefresh } from "@/hooks/useRealtimeTable";
import { ImageOff, Plus, RefreshCw, Search, Pencil, History } from "lucide-react";
import { Link } from "react-router-dom";

type Row = {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  unit: string | null;
  stock: number;
  standard_price: number;
  low_stock_threshold: number | null;
  image_url: string | null;
  has_variants: boolean;
  active: boolean;
};

/**
 * อัพเดตสินค้าและสต๊อก (เชียงกลาง) — หน้าเดียวจบ: ค้นหา → ปรับสต๊อกด่วน →
 * แก้ไข/เพิ่มสินค้า โดยไม่ต้องออกจากหน้า.
 */
export default function AdminProductStockUpdate() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [adjust, setAdjust] = useState<QuickAdjustProduct | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("id,name,code,barcode,unit,stock,standard_price,low_stock_threshold,image_url,has_variants,active")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(300);
    setRows((data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(["products", "stock_movements"], () => load());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (lowOnly && Number(r.stock) > Number(r.low_stock_threshold ?? 5)) return false;
      if (!needle) return true;
      return [r.name, r.code, r.barcode].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [rows, q, lowOnly]);

  return (
    <AdminLayout>
      <SeoHead
        title="อัพเดตสินค้าและสต๊อก"
        description="ค้นหาสินค้า ปรับสต๊อกด่วน และแก้ไข/เพิ่มสินค้าในหน้าเดียว"
        path="/admin/product-stock"
      />
      <div className="space-y-4" data-testid="product-stock-update">
        <header className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h1 className="text-2xl font-bold">อัพเดตสินค้าและสต๊อก</h1>
            <p className="text-sm text-muted-foreground">ร้านนัฐภรณ์ เชียงกลาง · ปรับสต๊อกและแก้ไขสินค้าได้ทันที</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="product-stock-add">
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มสินค้า
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/stock"><History className="mr-1.5 h-4 w-4" /> ประวัติสต๊อก</Link>
          </Button>
        </header>

        <Card className="rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="ค้นหาชื่อสินค้า / รหัส / บาร์โค้ด"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="product-stock-search"
              />
            </div>
            <Button
              variant={lowOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setLowOnly((v) => !v)}
            >
              เฉพาะสต๊อกต่ำ
            </Button>
            <div className="ml-auto text-xs text-muted-foreground">{filtered.length} รายการ</div>
          </div>

          <div className="divide-y rounded-xl border">
            {loading && <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด…</div>}
            {!loading && filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">ไม่พบสินค้า</div>
            )}
            {filtered.map((r) => {
              const low = Number(r.stock) <= Number(r.low_stock_threshold ?? 5);
              return (
                <div key={r.id} className="flex items-center gap-3 p-3" data-testid="product-stock-row">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded bg-muted grid place-items-center">
                    {r.image_url
                      ? <img src={r.image_url} alt={r.name} loading="lazy" className="h-full w-full object-cover" />
                      : <ImageOff className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.code || "—"} · {Number(r.standard_price).toLocaleString("th-TH")} บาท
                      {r.has_variants ? " · มี SKU ย่อย" : ""}
                    </div>
                  </div>
                  <Badge variant={low ? "destructive" : "secondary"} className="shrink-0">
                    {Number(r.stock)} {r.unit || ""}
                  </Badge>
                  <Button
                    size="sm"
                    onClick={() => setAdjust({
                      id: r.id, name: r.name, code: r.code, unit: r.unit,
                      image_url: r.image_url, stock: Number(r.stock), has_variants: r.has_variants,
                    })}
                    data-testid="product-stock-adjust"
                  >
                    ปรับสต๊อก
                  </Button>
                  <Button variant="outline" size="icon-sm" aria-label="แก้ไขสินค้า" onClick={() => setEditId(r.id)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <QuickAdjustStockDialog
        open={!!adjust}
        onOpenChange={(o) => { if (!o) setAdjust(null); }}
        product={adjust}
        onDone={() => load()}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>เพิ่มสินค้า</DialogTitle></DialogHeader>
          <ProductForm mode="create" onCancel={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editId} onOpenChange={(o) => { if (!o) setEditId(null); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>แก้ไขสินค้า</DialogTitle></DialogHeader>
          {editId && (
            <ProductForm
              mode="update"
              productId={editId}
              onCancel={() => setEditId(null)}
              onSaved={() => { setEditId(null); load(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
