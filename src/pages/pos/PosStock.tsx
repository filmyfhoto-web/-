import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, Search, Plus, Trash2, Boxes, AlertTriangle, PackageX,
  Tag, ImageOff, Crop, Upload, ExternalLink, FileSpreadsheet, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import ImageResizeDialog from "@/components/products/ImageResizeDialog";
import QuickAdjustStockDialog, { type QuickAdjustProduct } from "./QuickAdjustStockDialog";
import { Truck, Sliders } from "lucide-react";
import ProductRelationsSections from "@/components/products/ProductRelationsSections";
import UnitsManagerDialog from "@/components/products/UnitsManagerDialog";
import SkuManager from "@/components/products/SkuManager";
import ProductForm from "@/components/products/ProductForm";
import {
  buildEffectiveStockMap,
  loadAllUnitLinks,
  type EffectiveStockInfo,
  type UnitLinkRow,
} from "@/lib/productUnitLink";

/**
 * /pos/stock — professional stationery stock management for the POS workspace.
 *
 * SHARED DATA CONTRACT (must not diverge from /admin/products):
 *  - Reads and writes public.products (same rows as /admin/products)
 *  - Reads categories from public.categories
 *  - Uses ProductRelationsSections for wholesale tiers, SKU variants, bundles
 *  - No duplicate POS-only product tables; edits appear everywhere.
 *  - Only POS checkout decrements stock (this page does NOT decrement stock
 *    on save; it edits the master record).
 */

type ProductRow = {
  id: string;
  code: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  image_url: string | null;
  stock: number;
  low_stock_threshold: number | null;
  standard_price: number;
  weight_grams: number | null;
  active: boolean;
  category_id: string | null;
  deleted_at: string | null;
  has_variants?: boolean;
};
type Category = { id: string; name: string };

const BUCKET = "product-images";

const EMPTY: Omit<ProductRow, "id"> = {
  code: "",
  barcode: "",
  name: "",
  description: "",
  unit: "ชิ้น",
  image_url: "",
  stock: 0,
  low_stock_threshold: 5,
  standard_price: 0,
  weight_grams: null,
  active: true,
  category_id: null,
  deleted_at: null,
};

type EditorState = { id: string | null } & Omit<ProductRow, "id"> & {
  cost_price: number;
  shopIds: string[];
};

type StatusFilter = "all" | "in_stock" | "low" | "out" | "inactive" | "discounted";

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

function statusOf(p: ProductRow): StatusFilter {
  if (p.deleted_at || !p.active) return "inactive";
  const s = Number(p.stock || 0);
  if (s <= 0) return "out";
  const t = Number(p.low_stock_threshold || 0);
  if (t > 0 && s <= t) return "low";
  return "in_stock";
}

export default function PosStock() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<string | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [cropSource, setCropSource] = useState<Blob | string | null>(null);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [unitLinks, setUnitLinks] = useState<UnitLinkRow[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const pageSize = 20;

  useEffect(() => { document.title = "POS · สต๊อกสินค้า"; }, []);

  async function load() {
    setLoading(true);
    const [{ data: prods }, { data: categories }, links] = await Promise.all([
      supabase
        .from("products")
        .select("id,code,barcode,name,description,unit,image_url,stock,low_stock_threshold,standard_price,weight_grams,active,category_id,deleted_at,has_variants")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase.from("categories").select("id,name").order("name"),
      loadAllUnitLinks().catch(() => []),
    ]);
    setRows(((prods as ProductRow[]) ?? []).map((r) => ({
      ...r,
      stock: Number(r.stock || 0),
      standard_price: Number(r.standard_price || 0),
      low_stock_threshold: r.low_stock_threshold == null ? null : Number(r.low_stock_threshold),
      weight_grams: r.weight_grams == null ? null : Number(r.weight_grams),
    })));
    setCats((categories as Category[]) ?? []);
    setUnitLinks(links as UnitLinkRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const effectiveMap = useMemo(
    () => buildEffectiveStockMap(rows, unitLinks),
    [rows, unitLinks],
  );
  const effectiveOf = (p: ProductRow): EffectiveStockInfo =>
    effectiveMap.get(p.id) ?? {
      productId: p.id, ownStock: p.stock, effectiveStock: p.stock,
      baseId: null, ratio: null, baseStock: null, remainder: null, isLinked: false,
    };
  function statusOfEffective(p: ProductRow): StatusFilter {
    if (p.deleted_at || !p.active) return "inactive";
    const s = effectiveOf(p).effectiveStock;
    if (s <= 0) return "out";
    const t = Number(p.low_stock_threshold || 0);
    if (t > 0 && s <= t) return "low";
    return "in_stock";
  }

  const summary = useMemo(() => {
    let inStock = 0, low = 0, out = 0, inactive = 0, discounted = 0;
    for (const p of rows) {
      const s = statusOfEffective(p);
      if (s === "in_stock") inStock++;
      else if (s === "low") low++;
      else if (s === "out") out++;
      else inactive++;
      // "discounted" placeholder: products with standard_price 0 or matching a
      // future promo table — kept as zero until promos are wired.
      if ((p.standard_price || 0) === 0) discounted++;
    }
    return { inStock, low, out, inactive, discounted };
  }, [rows, effectiveMap]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((p) => {
      if (catId !== "all" && p.category_id !== catId) return false;
      if (status !== "all") {
        if (status === "discounted") {
          if ((p.standard_price || 0) !== 0) return false;
        } else if (statusOfEffective(p) !== status) return false;
      }
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        (p.code || "").toLowerCase().includes(needle) ||
        (p.barcode || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, catId, status, effectiveMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [q, catId, status]);

  async function openEditor(row?: ProductRow) {
    if (row) {
      const [{ data: cost }, { data: shops }] = await Promise.all([
        supabase.from("product_costs").select("cost_price").eq("product_id", row.id).maybeSingle(),
        supabase.from("product_shops").select("store_id").eq("product_id", row.id),
      ]);
      setEditor({
        ...row, id: row.id,
        cost_price: Number((cost as any)?.cost_price ?? 0),
        shopIds: ((shops as any[]) ?? []).map((s) => s.store_id),
      });
    } else {
      setEditor({ id: null, ...EMPTY, cost_price: 0, shopIds: [] });
    }
    setEditorOpen(true);
  }

  function patchEditor(p: Partial<EditorState>) {
    setEditor((prev) => (prev ? { ...prev, ...p } : prev));
  }

  async function onPickImage(file: File | null) {
    if (!file) return;
    setCropSource(file);
  }

  async function uploadCropped(blob: Blob): Promise<string | null> {
    try {
      const path = `pos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
      return data?.signedUrl ?? null;
    } catch (e: any) {
      toast.error("อัปโหลดรูปไม่สำเร็จ: " + (e?.message ?? "error"));
      return null;
    }
  }

  async function handleCropConfirm(blob: Blob) {
    setCropSource(null);
    const url = await uploadCropped(blob);
    if (url) {
      patchEditor({ image_url: url });
      toast.success("อัปเดตรูปสินค้าเรียบร้อย");
    }
  }

  async function softDelete() {
    if (!editor?.id) return;
    if (!confirm("ย้ายสินค้านี้ไปถังขยะ?")) return;
    const { error } = await supabase
      .from("products")
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq("id", editor.id);
    if (error) return toast.error(error.message);
    toast.success("ย้ายไปถังขยะแล้ว");
    setEditorOpen(false);
    setEditor(null);
    await load();
  }

  const SummaryCards = (
    <div
      className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-3"
      data-testid="pos-stock-summary"
    >
      {[
        { key: "in_stock" as StatusFilter, label: "พร้อมขาย", value: summary.inStock, bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-800 dark:text-emerald-200", icon: Package },
        { key: "discounted" as StatusFilter, label: "มีส่วนลด", value: summary.discounted, bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-800 dark:text-amber-200", icon: Tag },
        { key: "inactive" as StatusFilter, label: "ปิดขาย/ถังขยะ", value: summary.inactive, bg: "bg-slate-100 dark:bg-slate-800/60", text: "text-slate-800 dark:text-slate-200", icon: Trash2 },
        { key: "low" as StatusFilter, label: "ใกล้หมด", value: summary.low, bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-800 dark:text-orange-200", icon: AlertTriangle },
        { key: "out" as StatusFilter, label: "หมด", value: summary.out, bg: "bg-rose-100 dark:bg-rose-950/40", text: "text-rose-800 dark:text-rose-200", icon: PackageX },
      ].map((s) => {
        const active = status === s.key;
        return (
          <button
            key={s.label}
            type="button"
            onClick={() => setStatus(active ? "all" : s.key)}
            aria-pressed={active}
            data-testid={`pos-stock-summary-${s.key}`}
            className={`text-left rounded-lg p-3 transition ${s.bg} ${
              active
                ? "ring-2 ring-[hsl(218_60%_22%)] shadow-md"
                : "hover:ring-2 hover:ring-[hsl(218_60%_22%)]/40"
            }`}
          >
            <div className={`flex items-center gap-2 text-xs font-bold ${s.text}`}>
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </div>
            <div className={`mt-1 text-2xl font-extrabold tabular-nums ${s.text}`}>{s.value}</div>
          </button>
        );
      })}
    </div>
  );

  const StatusFilters = (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {[
        { k: "all", label: "ทั้งหมด" },
        { k: "in_stock", label: "พร้อมขาย" },
        { k: "low", label: "ใกล้หมด" },
        { k: "out", label: "หมด" },
        { k: "inactive", label: "ปิดขาย" },
      ].map((o) => (
        <Button
          key={o.k}
          size="sm"
          variant={status === o.k ? "default" : "outline"}
          className="rounded-full h-8 px-3"
          onClick={() => setStatus(o.k as StatusFilter)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );

  const CategoryFilters = (
    <div className="flex flex-wrap gap-1.5 mb-3 overflow-x-auto">
      <Button
        size="sm"
        variant={catId === "all" ? "default" : "outline"}
        className="rounded-full h-8 px-3"
        onClick={() => setCatId("all")}
      >
        ทุกหมวด
      </Button>
      {cats.map((c) => (
        <Button
          key={c.id}
          size="sm"
          variant={catId === c.id ? "default" : "outline"}
          className="rounded-full h-8 px-3 whitespace-nowrap"
          onClick={() => setCatId(c.id)}
        >
          {c.name}
        </Button>
      ))}
    </div>
  );

  const ProductList = (
    <Card className="p-3 md:p-4 flex flex-col" data-testid="pos-stock-list">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาชื่อ / รหัส / บาร์โค้ด…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-11"
            data-testid="pos-stock-search"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-testid="pos-stock-add" className="rounded-full h-11">
              <Plus className="h-4 w-4 mr-1" /> เพิ่ม/แก้ไข <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEditor()} data-testid="pos-stock-add-manual">
              <Plus className="h-4 w-4 mr-2" /> เพิ่มด้วยฟอร์ม
            </DropdownMenuItem>
            <DropdownMenuItem asChild data-testid="pos-stock-add-excel">
              <Link to="/pos/stock/import">
                <FileSpreadsheet className="h-4 w-4 mr-2" /> ผ่านไฟล์ Excel
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {StatusFilters}
      {CategoryFilters}
      <div className="flex-1 min-h-0 overflow-auto rounded-md border">
        <table className="w-full text-sm" data-testid="pos-stock-table">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2 font-medium">รหัส</th>
              <th className="text-left px-3 py-2 font-medium">รูป</th>
              <th className="text-left px-3 py-2 font-medium">ชื่อสินค้า</th>
              <th className="text-right px-3 py-2 font-medium">ราคา</th>
              <th className="text-right px-3 py-2 font-medium">สต๊อก</th>
              <th className="text-left px-3 py-2 font-medium">หมวดหมู่</th>
              <th className="text-left px-3 py-2 font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">กำลังโหลด…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">ไม่มีสินค้า</td></tr>
            ) : pageRows.map((p) => {
              const st = statusOfEffective(p);
              const eff = effectiveOf(p);
              const catName = cats.find((c) => c.id === p.category_id)?.name || "-";
              return (
                <tr
                  key={p.id}
                  onClick={() => openEditor(p)}
                  className="border-t hover:bg-accent/40 cursor-pointer"
                >
                  <td className="px-3 py-2 font-mono text-xs">{p.code || "-"}</td>
                  <td className="px-3 py-2">
                    <div className="h-9 w-9 rounded bg-muted grid place-items-center overflow-hidden">
                      {p.image_url
                        ? <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                        : <ImageOff className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span>{p.name}</span>
                      {eff.isLinked && (
                        <Badge
                          variant="secondary"
                          className="bg-accent text-primary text-[10px] px-1.5 py-0"
                          data-testid={`pos-stock-linked-badge-${p.id}`}
                        >
                          สัมพันธ์
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">฿{fmt(p.standard_price)}</td>
                  <td
                    className="px-3 py-2 text-right tabular-nums"
                    data-testid={`pos-stock-cell-${p.id}`}
                  >
                    {eff.effectiveStock}
                    {eff.isLinked && (
                      <div className="text-[10px] text-muted-foreground">
                        คำนวณจากหน่วยเล็ก
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{catName}</td>
                  <td className="px-3 py-2">
                    {st === "in_stock" && <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">พร้อมขาย</Badge>}
                    {st === "low" && <Badge variant="secondary" className="bg-orange-100 text-orange-800">ใกล้หมด</Badge>}
                    {st === "out" && <Badge variant="secondary" className="bg-rose-100 text-rose-800">หมด</Badge>}
                    {st === "inactive" && <Badge variant="secondary" className="bg-slate-200 text-slate-700">ปิดขาย</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between gap-2 pt-2 text-xs" data-testid="pos-stock-pagination">
          <span className="text-muted-foreground">
            หน้า {page} / {totalPages} · ทั้งหมด {filtered.length} รายการ
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>ก่อนหน้า</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>ถัดไป</Button>
          </div>
        </div>
      )}
    </Card>
  );

  const EditorBody = editor && (
    <div className="flex flex-col h-full" data-testid="pos-stock-editor">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-emerald-600 text-white sticky top-0 z-10">
        <h2 className="font-semibold text-base truncate">
          {editor.id ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}
        </h2>
        <div className="flex gap-2">
          {editor.id && (
            <Button size="sm" variant="secondary" onClick={softDelete} className="rounded-full bg-white/15 text-white hover:bg-white/25 border-0">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Image (shared crop dialog) */}
        <div id="pos-section-basic">
          <div className="text-sm font-medium mb-1">รูปสินค้า</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-24 w-24 rounded-md border overflow-hidden bg-muted grid place-items-center">
              {editor.image_url
                ? <img src={editor.image_url} alt="" className="h-full w-full object-cover" />
                : <ImageOff className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="flex flex-col gap-1">
              <label className="inline-flex items-center gap-1 px-3 h-9 rounded-md border bg-background text-sm cursor-pointer hover:bg-accent">
                <Upload className="h-4 w-4" /> เลือกรูป
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickImage(e.target.files?.[0] || null)}
                  data-testid="pos-stock-file"
                />
              </label>
              {editor.image_url && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCropSource(editor.image_url!)}
                  data-testid="pos-stock-crop"
                >
                  <Crop className="h-4 w-4 mr-1" /> ปรับขนาด
                </Button>
              )}
            </div>
          </div>
        </div>

        <ProductForm
          mode={editor.id ? "update" : "create"}
          productId={editor.id ?? undefined}
          initialValues={{
            code: editor.code ?? "",
            barcode: editor.barcode ?? "",
            name: editor.name,
            category_id: editor.category_id,
            unit: editor.unit ?? "ชิ้น",
            description: editor.description ?? "",
            stock: Number(editor.stock) || 0,
            low_stock_threshold: editor.low_stock_threshold ?? 5,
            cost_price: Number(editor.cost_price) || 0,
            standard_price: Number(editor.standard_price) || 0,
            active: !!editor.active,
            image_url: editor.image_url ?? null,
          }}
          initialShopIds={editor.shopIds}
          imageUrl={editor.image_url ?? null}
          onSaved={async (p) => {
            toast.success(editor.id ? "อัปเดตสินค้าเรียบร้อย" : "เพิ่มสินค้าเรียบร้อย");
            patchEditor({ id: p.id });
            await load();
          }}
          onCancel={() => setEditorOpen(false)}
          advancedSlot={editor.id ? (
            <div className="space-y-4">
              <div className="pt-2 border-t space-y-2" data-testid="pos-stock-actions">
                <div className="font-medium text-sm">สต๊อกสินค้า</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.assign(`/pos/purchase-orders/new?product=${editor.id}`)}
                    data-testid="pos-stock-import-po"
                  >
                    <Truck className="h-4 w-4 mr-1" /> นำเข้า PO
                  </Button>
                  <Button size="sm" onClick={() => setAdjustOpen(true)} data-testid="pos-stock-adjust-open">
                    <Sliders className="h-4 w-4 mr-1" /> ปรับสต๊อก
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setUnitsOpen(true)}>
                    จัดการหน่วยนับ
                  </Button>
                </div>
              </div>
              <div className="pt-2 border-t">
                <SkuManager
                  productId={editor.id}
                  parentCode={editor.code}
                  parentStock={Number(editor.stock) || 0}
                  hasVariants={!!editor.has_variants}
                  onChanged={load}
                />
              </div>
              <div className="pt-2 border-t">
                <ProductRelationsSections productId={editor.id} />
              </div>
            </div>
          ) : null}
        />

        <div className="pt-2 border-t text-xs text-muted-foreground flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          ใช้ตารางเดียวกับ <a href="/admin/products" className="underline">/admin/products</a> — แก้ที่ไหนก็เห็นทุกที่
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-3 md:p-5 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Boxes className="h-5 w-5 text-primary" /> สต๊อกสินค้า
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="pos-stock-header-add">
              <Plus className="h-4 w-4 mr-1" /> เพิ่ม/แก้ไข <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEditor()}>
              <Plus className="h-4 w-4 mr-2" /> เพิ่มด้วยฟอร์ม
            </DropdownMenuItem>
            <DropdownMenuItem asChild data-testid="pos-stock-header-excel">
              <Link to="/pos/stock/import">
                <FileSpreadsheet className="h-4 w-4 mr-2" /> ผ่านไฟล์ Excel
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {SummaryCards}

      {isMobile ? (
        <>
          {ProductList}
          <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
            <SheetContent side="right" className="w-full sm:max-w-full p-0">
              {EditorBody}
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <div
          className="grid gap-3 lg:grid-cols-[minmax(0,64fr)_minmax(0,36fr)]"
          data-testid="pos-stock-split"
        >
          <div className="min-w-0">{ProductList}</div>
          <Card
            className="hidden lg:flex overflow-hidden p-0 sticky top-16 max-h-[calc(100vh-5rem)]"
            data-testid="pos-stock-editor-panel"
          >
            {editor ? EditorBody : (
              <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center w-full min-h-[240px]">
                <Package className="h-8 w-8 mb-2 opacity-60" />
                คลิกสินค้าเพื่อแก้ไข หรือกด "+ เพิ่ม" เพื่อสร้างใหม่
              </div>
            )}
          </Card>
        </div>
      )}

      <ImageResizeDialog
        open={cropSource !== null}
        source={cropSource}
        onOpenChange={(o) => { if (!o) setCropSource(null); }}
        onConfirm={handleCropConfirm}
      />
      <UnitsManagerDialog open={unitsOpen} onOpenChange={setUnitsOpen} />
      <QuickAdjustStockDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        product={((): QuickAdjustProduct | null => {
          if (!editor?.id) return null;
          const row = rows.find((r) => r.id === editor.id);
          if (!row) return null;
          const info = effectiveOf(row);
          const base = info.baseId ? rows.find((r) => r.id === info.baseId) : null;
          return {
            id: row.id, name: row.name, code: row.code, unit: row.unit,
            image_url: row.image_url, stock: info.effectiveStock,
            has_variants: !!row.has_variants,
            is_linked_wrapper: info.isLinked,
            base_id: info.baseId ?? null, base_name: base?.name ?? null,
          };
        })()}
        onDone={() => load()}
        onOpenBase={(baseId) => {
          const base = rows.find((r) => r.id === baseId);
          if (base) openEditor(base);
        }}
      />
    </div>
  );
}