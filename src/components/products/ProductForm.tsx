import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Camera, Wand2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PhotoBarcodeDialog from "@/components/PhotoBarcodeDialog";
import {
  saveProduct, ProductSaveError,
  type ProductFormValues, type SavedProduct, type ProductLine,
} from "@/lib/productSave";

/**
 * ProductForm — canonical add / edit product form used by every entry point
 * (POS quick-add, POS stock sheet, admin dialog, staff intake). Same layout,
 * same fields, same save path. Sections are toggleable via props so each
 * shell can hide anything it doesn't need (e.g. staff hides shop assignment,
 * quick-add hides advanced tabs), but nothing about the layout changes.
 */

type Store = { id: string; name: string };
type Category = { id: string; name: string };

const PRODUCT_LINES: Array<{ value: ProductLine; label: string }> = [
  { value: "other", label: "อื่นๆ" },
  { value: "print", label: "การพิมพ์" },
  { value: "colorlab", label: "คัลเลอร์แล็ป" },
];

function randomNumericCode(len = 13) {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

const EMPTY: Required<Omit<ProductFormValues, "image_url" | "status">> & {
  image_url: string | null;
  status?: ProductFormValues["status"];
} = {
  code: "",
  barcode: "",
  name: "",
  category_id: null,
  product_line: "other",
  unit: "ชิ้น",
  description: "",
  stock: 0,
  low_stock_threshold: 5,
  cost_price: 0,
  standard_price: 0,
  active: true,
  image_url: null,
};

export type ProductFormProps = {
  mode: "create" | "update";
  productId?: string;
  initialValues?: Partial<ProductFormValues>;
  /** Initial shop ids (edit mode). undefined = don't touch shops on save. */
  initialShopIds?: string[];
  /** create-mode status override (staff → 'pending_review'). */
  createStatus?: ProductFormValues["status"];
  /** Section toggles */
  showShops?: boolean;
  showCost?: boolean;
  showActiveToggle?: boolean;
  showProductLine?: boolean;
  /** Optional label on the primary save button. */
  submitLabel?: string;
  /** Called with the saved row. Parent closes the shell. */
  onSaved: (p: SavedProduct) => void;
  onCancel?: () => void;
  /** Slot below the form (e.g. Units/SKU/Wholesale sub-panels in edit mode). */
  advancedSlot?: React.ReactNode;
  /** Optional slot rendered ABOVE ข้อมูลพื้นฐาน (e.g. main image editor). */
  headerSlot?: React.ReactNode;
  /** Controlled image_url — overrides internal value; parent owns image widget. */
  imageUrl?: string | null;
};

export default function ProductForm({
  mode,
  productId,
  initialValues,
  initialShopIds,
  createStatus,
  showShops = true,
  showCost = true,
  showActiveToggle = true,
  showProductLine = true,
  submitLabel,
  onSaved,
  onCancel,
  advancedSlot,
  headerSlot,
  imageUrl,
}: ProductFormProps) {
  const [values, setValues] = useState({ ...EMPTY, ...(initialValues || {}) });
  const [shopIds, setShopIds] = useState<string[]>(initialShopIds ?? []);
  const [stores, setStores] = useState<Store[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [nextCode, setNextCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const wantsShops = showShops;

  // Sync parent-controlled image_url into internal values on every change.
  useEffect(() => {
    if (imageUrl !== undefined) setValues((v) => ({ ...v, image_url: imageUrl }));
  }, [imageUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const promises: Promise<any>[] = [
        Promise.resolve(supabase.from("categories").select("id,name").order("name")),
      ];
      if (wantsShops)
        promises.push(Promise.resolve(supabase.from("rds_stores").select("id,name").order("name")));
      if (mode === "create")
        promises.push(Promise.resolve(supabase.rpc("peek_next_fy_code" as never)));
      const res = await Promise.all(promises);
      if (cancelled) return;
      setCats((res[0]?.data as Category[] | null) ?? []);
      let idx = 1;
      if (wantsShops) {
        const list = (res[idx++]?.data as Store[] | null) ?? [];
        setStores(list);
        if (mode === "create" && (initialShopIds == null || initialShopIds.length === 0)) {
          setShopIds(list.map((s) => s.id));
        }
      }
      if (mode === "create") {
        const peek = res[idx];
        if (typeof peek?.data === "string") setNextCode(peek.data);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const codePlaceholder = useMemo(
    () => (nextCode ? `${nextCode} (สร้างอัตโนมัติ)` : "FYxxxxx (สร้างอัตโนมัติ)"),
    [nextCode],
  );

  function patch(p: Partial<typeof values>) {
    setValues((v) => ({ ...v, ...p }));
  }

  function toggleShop(id: string, on: boolean) {
    setShopIds((prev) =>
      on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id),
    );
  }

  async function generateBarcode() {
    for (let i = 0; i < 8; i++) {
      const code = randomNumericCode(13);
      const { data } = await supabase
        .from("products")
        .select("id")
        .eq("barcode", code)
        .maybeSingle();
      if (!data) {
        patch({ barcode: code });
        toast.success("สร้างบาร์โค้ดแล้ว");
        return;
      }
    }
    toast.error("สร้างบาร์โค้ดไม่สำเร็จ ลองใหม่");
  }

  async function handlePhotoDecoded(raw: string) {
    const bc = (raw || "").replace(/\D/g, "");
    if (!bc || bc.length < 6) return toast.error("อ่านบาร์โค้ดจากรูปไม่สำเร็จ");
    const { data: dupe } = await supabase
      .from("products")
      .select("id,name")
      .eq("barcode", bc)
      .maybeSingle();
    if (dupe && dupe.id !== productId)
      return toast.error(`บาร์โค้ดนี้มีอยู่แล้ว: ${dupe.name}`);
    patch({ barcode: bc });
    toast.success("อ่านบาร์โค้ดสำเร็จ");
    setPhotoOpen(false);
  }

  async function handleSave() {
    if (wantsShops && shopIds.length === 0 && stores.length > 0)
      return toast.error("กรุณาเลือกอย่างน้อย 1 ร้านที่จะวางขาย");
    setSaving(true);
    try {
      const saved = await saveProduct({
        mode,
        productId,
        values: {
          ...values,
          cost_price: showCost ? Number(values.cost_price) || 0 : undefined,
          status: mode === "create" ? createStatus : undefined,
        },
        shopIds: wantsShops ? shopIds : null,
        nextAutoCode: nextCode || undefined,
      });
      toast.success(
        mode === "create" ? `เพิ่ม "${saved.name}" แล้ว` : `บันทึก "${saved.name}" แล้ว`,
      );
      onSaved(saved);
    } catch (e) {
      if (e instanceof ProductSaveError) toast.error(e.message);
      else toast.error((e as Error)?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="product-form">
      {headerSlot}
      {/* ---- Section: ข้อมูลพื้นฐาน ---- */}
      <section className="space-y-3">
        <h3 className="text-sm text-muted-foreground border-b pb-1">ข้อมูลพื้นฐาน</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>รหัสสินค้า</Label>
            <Input
              value={values.code ?? ""}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder={codePlaceholder}
              data-testid="pf-code"
            />
          </div>
          <div>
            <Label>ชื่อสินค้า <span className="text-destructive">*</span></Label>
            <Input
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
              autoFocus
              data-testid="pf-name"
            />
          </div>
        </div>
        <div>
          <Label>บาร์โค้ด / รหัสสแกน</Label>
          <div className="flex gap-2">
            <Input
              value={values.barcode ?? ""}
              onChange={(e) => patch({ barcode: e.target.value })}
              placeholder="กรอกเอง หรือสแกน/สร้างอัตโนมัติ"
              data-testid="pf-barcode"
            />
            <Button
              type="button" variant="outline" size="icon"
              onClick={() => setPhotoOpen(true)}
              title="ถ่ายรูป/อัปโหลด → อ่านบาร์โค้ด (ไม่ใช้ AI)"
              data-testid="pf-photo-barcode"
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Button
              type="button" variant="outline" size="icon"
              onClick={generateBarcode} title="สร้างรหัสอัตโนมัติ"
            >
              <Wand2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>หมวดหมู่</Label>
            <Select
              value={values.category_id ?? "__none"}
              onValueChange={(v) => patch({ category_id: v === "__none" ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="— ไม่มีหมวดหมู่ —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— ไม่มีหมวดหมู่ —</SelectItem>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>หน่วยนับ</Label>
            <Input
              value={values.unit ?? ""}
              onChange={(e) => patch({ unit: e.target.value })}
            />
          </div>
        </div>
        {showProductLine && (
          <div>
            <Label>สายงาน</Label>
            <Select
              value={values.product_line ?? "other"}
              onValueChange={(v) => patch({ product_line: v as ProductLine })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCT_LINES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      {/* ---- Section: สต๊อกและราคา ---- */}
      <section className="space-y-3">
        <h3 className="text-sm text-muted-foreground border-b pb-1">สต๊อกและราคา</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>สต๊อกคงเหลือ</Label>
            <Input
              type="number" min={0}
              value={values.stock ?? 0}
              onChange={(e) => patch({ stock: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label>จุดเตือนสต๊อกต่ำ</Label>
            <Input
              type="number" min={0}
              value={values.low_stock_threshold ?? 5}
              onChange={(e) => patch({ low_stock_threshold: Number(e.target.value) || 0 })}
            />
          </div>
          {showCost && (
            <div>
              <Label>ราคาทุน</Label>
              <Input
                type="number" min={0}
                value={values.cost_price ?? 0}
                onChange={(e) => patch({ cost_price: Number(e.target.value) || 0 })}
              />
            </div>
          )}
          <div>
            <Label>ราคามาตรฐาน</Label>
            <Input
              type="number" min={0}
              value={values.standard_price ?? 0}
              onChange={(e) => patch({ standard_price: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
        <div>
          <Label>รายละเอียด</Label>
          <Textarea
            rows={3}
            value={values.description ?? ""}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </div>
        {showActiveToggle && (
          <div className="flex items-center gap-2">
            <Switch
              id="pf-active"
              checked={!!values.active}
              onCheckedChange={(v) => patch({ active: v })}
            />
            <Label htmlFor="pf-active" className="cursor-pointer">เปิดขาย</Label>
          </div>
        )}
      </section>

      {/* ---- Section: ใช้กับร้าน ---- */}
      {wantsShops && (
        <section className="rounded-md border p-3 space-y-2">
          <div className="font-semibold text-sm">
            ใช้กับร้าน{" "}
            <span className="text-xs text-muted-foreground font-normal">
              (เลือกอย่างน้อย 1)
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {stores.length === 0 && (
              <div className="text-xs text-muted-foreground">— ยังไม่มีร้าน —</div>
            )}
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={shopIds.includes(s.id)}
                  onCheckedChange={(v) => toggleShop(s.id, !!v)}
                />
                {s.name}
              </label>
            ))}
          </div>
        </section>
      )}

      {advancedSlot && <section>{advancedSlot}</section>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            ยกเลิก
          </Button>
        )}
        <Button
          type="button" onClick={handleSave} disabled={saving}
          className="bg-gradient-to-r from-blue-600 to-blue-500 text-white"
          data-testid="pf-save"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          {submitLabel || (mode === "create" ? "เพิ่มสินค้า" : "บันทึกการแก้ไข")}
        </Button>
      </div>

      <PhotoBarcodeDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        onDecoded={handlePhotoDecoded}
      />
    </div>
  );
}