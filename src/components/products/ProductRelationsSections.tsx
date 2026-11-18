import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import {
  coerceRatio,
  deriveWrapperAvailability,
  loadUnitLink,
  loadAllUnitLinks,
  removeUnitLink,
  saveUnitLink,
  translateLinkRpcError,
  validateLinkInput,
  LINK_ERROR_MESSAGES_TH,
} from "@/lib/productUnitLink";

/**
 * Phase 3B UI: three collapsible relation editors bound to the product edit dialog.
 * Each section is self-contained (loads on mount, saves on demand) so a failure in
 * one section never leaves the product row half-written — the parent product row is
 * saved first, then the user opens each section, edits, and saves independently.
 *
 * Uses native <details> for collapse to avoid pulling extra UI deps.
 */

type Tier = { id?: string; min_qty: string; unit_price: string };
type Variant = {
  id?: string;
  sku: string;
  barcode: string;
  color: string;
  size: string;
  pattern: string;
  price: string;
  stock: string;
};
type Bundle = { id?: string; child_id: string; conversion_qty: string };
type ProductLite = { id: string; name: string; code: string | null };

function nonNegNumber(v: string): number | null {
  const n = Number(v);
  if (v === "" || !Number.isFinite(n) || n < 0) return null;
  return n;
}
function posNumber(v: string): number | null {
  const n = Number(v);
  if (v === "" || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

function Section({
  title,
  testid,
  defaultOpen,
  children,
}: {
  title: string;
  testid: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      data-testid={testid}
      className="md:col-span-2 rounded-xl border border-border bg-card/40 group"
    >
      <summary className="cursor-pointer select-none list-none flex items-center justify-between px-3 py-2 font-semibold text-sm">
        <span>{title}</span>
        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="p-3 pt-1 border-t border-border">{children}</div>
    </details>
  );
}

/* ---------------- Wholesale Tiers ---------------- */

function TiersEditor({ productId }: { productId: string }) {
  const [rows, setRows] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("product_wholesale_tiers")
        .select("id,min_qty,unit_price")
        .eq("product_id", productId)
        .order("min_qty", { ascending: true });
      if (!alive) return;
      if (error) toast.error(`โหลดราคาขายส่งไม่สำเร็จ: ${error.message}`);
      setRows(((data ?? []) as any[]).map((r) => ({
        id: r.id,
        min_qty: String(r.min_qty),
        unit_price: String(r.unit_price),
      })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [productId]);

  async function save() {
    // Validate: unique min_qty per product, all positive/nonneg
    const seen = new Set<number>();
    for (const r of rows) {
      const q = posNumber(r.min_qty);
      const p = nonNegNumber(r.unit_price);
      if (q == null) return toast.error("จำนวนขั้นต่ำต้องเป็นตัวเลขและมากกว่า 0");
      if (p == null) return toast.error("ราคาต่อหน่วยต้องเป็นตัวเลขและไม่ติดลบ");
      if (seen.has(q)) return toast.error(`จำนวนขั้นต่ำซ้ำ: ${q}`);
      seen.add(q);
    }
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("product_wholesale_tiers")
        .select("id")
        .eq("product_id", productId);
      const existingIds = new Set((existing ?? []).map((r: any) => r.id));
      const keepIds = new Set(rows.filter((r) => r.id).map((r) => r.id!));
      const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
      if (toDelete.length) {
        const { error } = await supabase.from("product_wholesale_tiers").delete().in("id", toDelete);
        if (error) throw error;
      }
      for (const r of rows) {
        const payload = {
          product_id: productId,
          min_qty: Number(r.min_qty),
          unit_price: Number(r.unit_price),
        };
        if (r.id) {
          const { error } = await supabase.from("product_wholesale_tiers").update(payload).eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("product_wholesale_tiers").insert(payload);
          if (error) throw error;
        }
      }
      toast.success("บันทึกราคาขายส่งแล้ว");
    } catch (e: any) {
      toast.error(`บันทึกไม่สำเร็จ: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-xs text-muted-foreground">กำลังโหลด…</div>;
  return (
    <div className="space-y-2" data-testid="tiers-editor">
      {rows.length === 0 && (
        <div className="text-xs text-muted-foreground">ยังไม่มีราคาขายส่ง</div>
      )}
      {rows.map((r, i) => (
        <div key={r.id ?? `new-${i}`} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">จำนวนขั้นต่ำ</Label>
            <Input
              type="number"
              min={1}
              value={r.min_qty}
              onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, min_qty: e.target.value } : x))}
              data-testid={`tier-min-qty-${i}`}
            />
          </div>
          <div>
            <Label className="text-xs">ราคาต่อหน่วย</Label>
            <Input
              type="number"
              min={0}
              value={r.unit_price}
              onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, unit_price: e.target.value } : x))}
              data-testid={`tier-price-${i}`}
            />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => setRows((rs) => rs.filter((_, ix) => ix !== i))} aria-label="ลบ">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { min_qty: "", unit_price: "" }])} data-testid="add-tier">
          <Plus className="w-4 h-4 mr-1" /> เพิ่มขั้นราคา
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving} data-testid="save-tiers">
          บันทึกราคาขายส่ง
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Variants ---------------- */

function VariantsEditor({ productId }: { productId: string }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,sku,barcode,attributes,price,stock")
        .eq("product_id", productId)
        .order("sku", { ascending: true });
      if (!alive) return;
      if (error) toast.error(`โหลด SKU ย่อยไม่สำเร็จ: ${error.message}`);
      setRows(((data ?? []) as any[]).map((r) => {
        const attrs = (r.attributes ?? {}) as any;
        return {
          id: r.id,
          sku: r.sku ?? "",
          barcode: r.barcode ?? "",
          color: attrs.color ?? "",
          size: attrs.size ?? "",
          pattern: attrs.pattern ?? "",
          price: r.price == null ? "" : String(r.price),
          stock: String(r.stock ?? 0),
        };
      }));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [productId]);

  async function save() {
    const skuSeen = new Set<string>();
    const bcSeen = new Set<string>();
    for (const r of rows) {
      const sku = r.sku.trim();
      if (!sku) return toast.error("SKU ห้ามว่าง");
      if (skuSeen.has(sku)) return toast.error(`SKU ซ้ำในฟอร์ม: ${sku}`);
      skuSeen.add(sku);
      const bc = r.barcode.trim();
      if (bc) {
        if (bcSeen.has(bc)) return toast.error(`บาร์โค้ด SKU ซ้ำในฟอร์ม: ${bc}`);
        bcSeen.add(bc);
      }
      if (r.price !== "" && nonNegNumber(r.price) == null) return toast.error(`ราคา SKU ${sku} ต้องไม่ติดลบ`);
      if (nonNegNumber(r.stock) == null) return toast.error(`สต๊อก SKU ${sku} ต้องไม่ติดลบ`);
    }
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("product_variants")
        .select("id")
        .eq("product_id", productId);
      const existingIds = new Set((existing ?? []).map((r: any) => r.id));
      const keepIds = new Set(rows.filter((r) => r.id).map((r) => r.id!));
      const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
      if (toDelete.length) {
        const { error } = await supabase.from("product_variants").delete().in("id", toDelete);
        if (error) throw error;
      }
      for (const r of rows) {
        const attrs: Record<string, string> = {};
        if (r.color.trim()) attrs.color = r.color.trim();
        if (r.size.trim()) attrs.size = r.size.trim();
        if (r.pattern.trim()) attrs.pattern = r.pattern.trim();
        const payload: any = {
          product_id: productId,
          sku: r.sku.trim(),
          barcode: r.barcode.trim() || null,
          attributes: attrs,
          price: r.price === "" ? null : Number(r.price),
          stock: Number(r.stock),
        };
        if (r.id) {
          const { error } = await supabase.from("product_variants").update(payload).eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("product_variants").insert(payload);
          if (error) throw error;
        }
      }
      toast.success("บันทึก SKU ย่อยแล้ว");
    } catch (e: any) {
      const msg = String(e.message || e);
      if (msg.includes("product_variants_product_id_sku_key")) toast.error("SKU ซ้ำในฐานข้อมูล");
      else if (msg.includes("product_variants_barcode_uidx")) toast.error("บาร์โค้ด SKU ซ้ำในฐานข้อมูล");
      else toast.error(`บันทึกไม่สำเร็จ: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-xs text-muted-foreground">กำลังโหลด…</div>;
  return (
    <div className="space-y-3" data-testid="variants-editor">
      {rows.length === 0 && <div className="text-xs text-muted-foreground">ยังไม่มี SKU ย่อย</div>}
      {rows.map((r, i) => (
        <div key={r.id ?? `new-${i}`} className="rounded-lg border border-border p-2 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><Label className="text-xs">SKU *</Label><Input value={r.sku} onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, sku: e.target.value } : x))} data-testid={`variant-sku-${i}`} /></div>
            <div><Label className="text-xs">บาร์โค้ด</Label><Input value={r.barcode} onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, barcode: e.target.value } : x))} /></div>
            <div><Label className="text-xs">ราคา</Label><Input type="number" min={0} value={r.price} onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, price: e.target.value } : x))} data-testid={`variant-price-${i}`} /></div>
            <div><Label className="text-xs">สต๊อก</Label><Input type="number" min={0} value={r.stock} onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, stock: e.target.value } : x))} data-testid={`variant-stock-${i}`} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">สี</Label><Input value={r.color} onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, color: e.target.value } : x))} /></div>
            <div><Label className="text-xs">ขนาด</Label><Input value={r.size} onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, size: e.target.value } : x))} /></div>
            <div><Label className="text-xs">ลาย</Label><Input value={r.pattern} onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, pattern: e.target.value } : x))} /></div>
          </div>
          <div className="text-right">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => rs.filter((_, ix) => ix !== i))}>
              <Trash2 className="w-4 h-4 mr-1" /> ลบ SKU
            </Button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { sku: "", barcode: "", color: "", size: "", pattern: "", price: "", stock: "0" }])} data-testid="add-variant">
          <Plus className="w-4 h-4 mr-1" /> เพิ่ม SKU
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving} data-testid="save-variants">
          บันทึก SKU ย่อย
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Bundles ---------------- */

function BundlesEditor({ productId }: { productId: string }) {
  const [rows, setRows] = useState<Bundle[]>([]);
  const [candidates, setCandidates] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: b, error: be }, { data: p, error: pe }] = await Promise.all([
        supabase.from("product_bundles").select("id,child_id,conversion_qty,ratio").eq("parent_id", productId),
        supabase.from("products").select("id,name,code").is("deleted_at", null).eq("active", true).order("name").limit(500),
      ]);
      if (!alive) return;
      if (be) toast.error(`โหลดสินค้าสัมพันธ์ไม่สำเร็จ: ${be.message}`);
      if (pe) toast.error(`โหลดรายการสินค้าไม่สำเร็จ: ${pe.message}`);
      setRows(((b ?? []) as any[]).map((r) => ({
        id: r.id,
        child_id: r.child_id,
        conversion_qty: String(r.conversion_qty ?? r.ratio ?? ""),
      })));
      setCandidates(((p ?? []) as any[]).filter((x) => x.id !== productId));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [productId]);

  async function save() {
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.child_id) return toast.error("เลือกสินค้าลูกก่อน");
      if (seen.has(r.child_id)) return toast.error("สินค้าลูกซ้ำ");
      seen.add(r.child_id);
      const q = posNumber(r.conversion_qty);
      if (q == null) return toast.error("จำนวนแปลงหน่วยต้องเป็นตัวเลขและมากกว่า 0");
    }
    setSaving(true);
    try {
      const { data: existing } = await supabase.from("product_bundles").select("id").eq("parent_id", productId);
      const existingIds = new Set((existing ?? []).map((r: any) => r.id));
      const keepIds = new Set(rows.filter((r) => r.id).map((r) => r.id!));
      const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
      if (toDelete.length) {
        const { error } = await supabase.from("product_bundles").delete().in("id", toDelete);
        if (error) throw error;
      }
      for (const r of rows) {
        const q = Number(r.conversion_qty);
        // Legacy `ratio` column is NOT NULL — mirror conversion_qty into it.
        const payload = { parent_id: productId, child_id: r.child_id, conversion_qty: q, ratio: q };
        if (r.id) {
          const { error } = await supabase.from("product_bundles").update(payload).eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("product_bundles").insert(payload);
          if (error) throw error;
        }
      }
      toast.success("บันทึกสินค้าสัมพันธ์แล้ว");
    } catch (e: any) {
      toast.error(`บันทึกไม่สำเร็จ: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-xs text-muted-foreground">กำลังโหลด…</div>;
  return (
    <div className="space-y-2" data-testid="bundles-editor">
      {rows.length === 0 && <div className="text-xs text-muted-foreground">ยังไม่มีสินค้าสัมพันธ์</div>}
      {rows.map((r, i) => (
        <div key={r.id ?? `new-${i}`} className="grid grid-cols-[1fr_140px_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">สินค้าลูก</Label>
            <Select value={r.child_id} onValueChange={(v) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, child_id: v } : x))}>
              <SelectTrigger data-testid={`bundle-child-${i}`}><SelectValue placeholder="เลือกสินค้า" /></SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">อัตราส่วน / ชุด</Label>
            <Input type="number" min={1} value={r.conversion_qty} onChange={(e) => setRows((rs) => rs.map((x, ix) => ix === i ? { ...x, conversion_qty: e.target.value } : x))} data-testid={`bundle-qty-${i}`} />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => setRows((rs) => rs.filter((_, ix) => ix !== i))} aria-label="ลบ">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { child_id: "", conversion_qty: "" }])} data-testid="add-bundle">
          <Plus className="w-4 h-4 mr-1" /> เพิ่มสินค้าลูก
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving} data-testid="save-bundles">
          บันทึกสินค้าสัมพันธ์
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Wrapper ---------------- */

export default function ProductRelationsSections({ productId }: { productId: string | null }) {
  if (!productId) {
    return (
      <div className="md:col-span-2 text-xs text-muted-foreground italic" data-testid="relations-hint">
        บันทึกสินค้าก่อน จึงจะแก้ไขราคาขายส่ง / SKU ย่อย / สินค้าสัมพันธ์ได้
      </div>
    );
  }
  return (
    <div className="md:col-span-2 space-y-2" data-testid="product-relations">
      <Section title="ราคาขายส่งหลายขั้น" testid="section-tiers">
        <TiersEditor productId={productId} />
      </Section>
      <Section title="SKU ย่อย (สี / ขนาด / ลาย)" testid="section-variants">
        <VariantsEditor productId={productId} />
      </Section>
      <Section title="สินค้าสัมพันธ์ (bundle / แปลงหน่วย)" testid="section-bundles">
        <BundlesEditor productId={productId} />
      </Section>
      <Section title="สินค้าสัมพันธ์: หน่วยห่อ/แพ็ค → หน่วยเล็ก" testid="section-unit-link">
        <LinkedUnitEditor productId={productId} />
      </Section>
    </div>
  );
}

/* ---------------- Linked-Unit (wrapper → base × ratio) ---------------- */

function LinkedUnitEditor({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseId, setBaseId] = useState<string>("");
  const [ratio, setRatio] = useState<string>("");
  const [linked, setLinked] = useState<boolean>(false);
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; code: string | null; stock: number; unit: string | null }>>([]);
  const [baseStock, setBaseStock] = useState<number | null>(null);
  const [otherLinks, setOtherLinks] = useState<Array<{ wrapper_id: string; base_id: string; enabled: boolean }>>([]);
  const [flags, setFlags] = useState<{ wrapperHasVariants: boolean; baseHasVariants: boolean }>({ wrapperHasVariants: false, baseHasVariants: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [link, all, prods, self] = await Promise.all([
          loadUnitLink(productId),
          loadAllUnitLinks(),
          supabase.from("products").select("id,name,code,stock,unit,has_variants").is("deleted_at", null).eq("active", true).order("name").limit(1000),
          supabase.from("products").select("has_variants").eq("id", productId).maybeSingle(),
        ]);
        if (!alive) return;
        const list = (prods.data ?? []).filter((p: any) => p.id !== productId);
        setCandidates(list as any);
        setOtherLinks(all.map((l) => ({ wrapper_id: l.wrapper_id, base_id: l.base_id, enabled: l.enabled })));
        setFlags({
          wrapperHasVariants: !!(self.data as any)?.has_variants,
          baseHasVariants: false,
        });
        if (link) {
          setLinked(true);
          setBaseId(link.base_id);
          setRatio(String(link.ratio));
        }
      } catch (e: any) {
        toast.error(`โหลดสินค้าสัมพันธ์ไม่สำเร็จ: ${e.message || e}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [productId]);

  useEffect(() => {
    const b = candidates.find((c) => c.id === baseId);
    setBaseStock(b ? Number(b.stock ?? 0) : null);
    if (!baseId) return;
    // Fetch flags for the base product. This request must be cancelled on
    // unmount / baseId change, and its failure handled — a floating promise
    // here both leaks a setState after unmount and raises an unhandled
    // rejection whenever the query errors.
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("products")
          .select("has_variants")
          .eq("id", baseId)
          .maybeSingle();
        if (!alive) return;
        setFlags((f) => ({ ...f, baseHasVariants: !!(data as any)?.has_variants }));
      } catch {
        // Non-fatal: the variant warning simply stays off. The unit-link
        // loader above already surfaces load failures to the user.
        if (alive) setFlags((f) => ({ ...f, baseHasVariants: false }));
      }
    })();
    return () => { alive = false; };
  }, [baseId, candidates]);

  const ratioNum = coerceRatio(ratio);
  const preview = (() => {
    const base = candidates.find((c) => c.id === baseId);
    if (!base || ratioNum == null) return null;
    const derived = deriveWrapperAvailability(Number(base.stock ?? 0), ratioNum);
    return {
      base,
      msg1: `1 หน่วยห่อ = ${ratioNum} ${base.unit || "หน่วย"}`,
      msg2: `ขาย 2 หน่วยห่อ จะตัดสต๊อก ${ratioNum * 2} ${base.unit || "หน่วย"}`,
      available: derived.available,
      remainder: derived.remainder,
    };
  })();

  const validationErr = (() => {
    if (!baseId || !ratio) return null;
    return validateLinkInput({
      wrapperId: productId,
      baseId,
      ratio,
      otherLinks: otherLinks.filter((l) => l.wrapper_id !== productId),
      wrapperHasVariants: flags.wrapperHasVariants,
      baseHasVariants: flags.baseHasVariants,
    });
  })();

  async function onSave() {
    if (!baseId) return toast.error(LINK_ERROR_MESSAGES_TH.wrapper_and_base_required);
    if (ratioNum == null) return toast.error(LINK_ERROR_MESSAGES_TH.ratio_must_be_positive_integer);
    if (validationErr) return toast.error(LINK_ERROR_MESSAGES_TH[validationErr]);
    if (!linked && !confirm("ยืนยันเปิดสินค้าสัมพันธ์: สต๊อกของสินค้านี้จะคำนวณจากสินค้าหน่วยเล็ก (สต๊อกที่แสดง = สต๊อกหน่วยเล็ก ÷ อัตราส่วน)")) return;
    setSaving(true);
    try {
      await saveUnitLink(productId, baseId, ratioNum);
      setLinked(true);
      toast.success("บันทึกสินค้าสัมพันธ์แล้ว");
    } catch (e: any) {
      toast.error(translateLinkRpcError(e.message));
    } finally {
      setSaving(false);
    }
  }

  async function onUnlink() {
    if (
      !confirm(
        "ปิดการเชื่อมสินค้าสัมพันธ์นี้? หลังปิด สินค้าห่อจะกลับไปใช้สต๊อกของตัวเอง (ค่าปัจจุบันที่บันทึกไว้ในตารางสินค้า) — โปรดตรวจสต๊อกและปรับให้ตรงตามความเป็นจริงก่อนขายอีกครั้ง",
      )
    )
      return;
    setSaving(true);
    try {
      await removeUnitLink(productId);
      setLinked(false);
      setBaseId("");
      setRatio("");
      toast.success("ยกเลิกความสัมพันธ์แล้ว");
    } catch (e: any) {
      toast.error(translateLinkRpcError(e.message));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-xs text-muted-foreground">กำลังโหลด…</div>;

  return (
    <div className="space-y-3" data-testid="linked-unit-editor">
      <div className="text-xs text-muted-foreground leading-relaxed">
        เมื่อผูกแล้ว สต๊อกของสินค้านี้จะคำนวณจากสินค้าหน่วยเล็ก (floor(สต๊อกหน่วยเล็ก ÷ อัตราส่วน)) — การขาย 1 หน่วยห่อจะตัดสต๊อกสินค้าหน่วยเล็กแบบอะตอมิก
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-2">
        <div>
          <Label className="text-xs">สินค้าหน่วยเล็ก (base)</Label>
          <Select value={baseId} onValueChange={setBaseId}>
            <SelectTrigger data-testid="link-base-select"><SelectValue placeholder="เลือกสินค้าหน่วยเล็ก" /></SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}{c.code ? ` (${c.code})` : ""} — คงเหลือ {Number(c.stock ?? 0)} {c.unit || ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">อัตราส่วนต่อ 1 หน่วยใหญ่</Label>
          <Input
            type="number" min={1} step={1} value={ratio}
            onChange={(e) => setRatio(e.target.value)}
            data-testid="link-ratio-input"
          />
        </div>
      </div>
      {preview && (
        <div className="rounded-md bg-muted/40 p-2 text-xs space-y-1" data-testid="link-preview">
          <div>{preview.msg1}</div>
          <div>{preview.msg2}</div>
          <div>คงเหลือสินค้าห่อที่ขายได้ = <b>{preview.available}</b> {preview.remainder > 0 && <span className="text-muted-foreground">(เหลือเศษ {preview.remainder} {preview.base.unit || ""})</span>}</div>
        </div>
      )}
      {validationErr && (
        <div className="text-xs text-destructive" data-testid="link-validation-error">
          {LINK_ERROR_MESSAGES_TH[validationErr]}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onSave} disabled={saving || !!validationErr} data-testid="save-unit-link">
          {linked ? "อัปเดตความสัมพันธ์" : "บันทึกสินค้าสัมพันธ์"}
        </Button>
        {linked && (
          <Button type="button" size="sm" variant="outline" onClick={onUnlink} disabled={saving} data-testid="unlink-unit">
            ยกเลิกความสัมพันธ์
          </Button>
        )}
      </div>
    </div>
  );
}