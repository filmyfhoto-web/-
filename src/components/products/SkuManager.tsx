import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2, Wand2, Archive, Layers, ChevronRight } from "lucide-react";

/**
 * Stage 1 SKU Manager for /pos/stock.
 *
 * - Reads/writes canonical public.product_variants (shared with /admin/products)
 * - Uses public.product_attributes (shared reusable attribute library)
 * - Enable/disable goes through secure RPCs enable_product_variants /
 *   disable_product_variants so parent stock conversion is transactional.
 * - Never hard-deletes variants: archive by setting active=false + archived_at.
 */

type AttrDef = {
  id: string; key: string; label_th: string; values: string[];
  is_builtin: boolean; sort_order: number;
};

type Variant = {
  id?: string;
  sku: string;
  name: string;
  barcode: string;
  attributes: Record<string, string>;
  price: string;
  cost_override: string;
  stock: string;
  low_stock_threshold: string;
  active: boolean;
  archived_at: string | null;
  image_url: string | null;
};

type Props = {
  productId: string;
  parentCode: string | null;
  parentStock: number;
  hasVariants: boolean;
  onChanged?: () => void;
};

const MAX_COMBOS = 500;
const WARN_COMBOS = 100;

function normalizeToken(s: string): string {
  return (s || "").trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{M}\p{N}\-_.]/gu, "").toUpperCase();
}

function buildDeterministicSku(parentCode: string | null, attrs: Record<string, string>, orderedKeys: string[]): string {
  const base = normalizeToken(parentCode || "SKU");
  const parts = orderedKeys
    .map((k) => normalizeToken(attrs[k] || ""))
    .filter(Boolean);
  return [base, ...parts].join("-").slice(0, 60);
}

function cartesian(chosen: { key: string; values: string[] }[]): Record<string, string>[] {
  if (!chosen.length) return [];
  return chosen.reduce<Record<string, string>[]>((acc, cur) => {
    if (acc.length === 0) return cur.values.map((v) => ({ [cur.key]: v }));
    const out: Record<string, string>[] = [];
    for (const a of acc) for (const v of cur.values) out.push({ ...a, [cur.key]: v });
    return out;
  }, []);
}

export default function SkuManager({ productId, parentCode, parentStock, hasVariants, onChanged }: Props) {
  const [attrs, setAttrs] = useState<AttrDef[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEnableConfirm, setShowEnableConfirm] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [busyRpc, setBusyRpc] = useState(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  // Combination builder state
  const [pickedKeys, setPickedKeys] = useState<string[]>([]);
  const [pickedValues, setPickedValues] = useState<Record<string, string[]>>({});
  const [canSeeCost, setCanSeeCost] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: v }] = await Promise.all([
        supabase.from("product_attributes").select("id,key,label_th,values,is_builtin,sort_order").order("sort_order"),
        supabase.from("product_variants")
          .select("id,sku,name,barcode,attributes,price,stock,low_stock_threshold,active,archived_at,image_url")
          .eq("product_id", productId)
          .order("sku"),
      ]);
      // ต้นทุนดึงแยกผ่าน RPC ที่ตรวจสิทธิ์ "เห็นต้นทุน" เท่านั้น
      const { data: costRows, error: costErr } = await (supabase as any)
        .rpc("variant_costs", { p_product_id: productId });
      const costMap = new Map<string, number | null>(
        ((costRows as { id: string; cost_override: number | null }[]) ?? []).map((c) => [c.id, c.cost_override]),
      );
      if (!alive) return;
      setCanSeeCost(!costErr);
      setAttrs(((a ?? []) as any[]).map((r) => ({ ...r, values: Array.isArray(r.values) ? r.values : [] })));
      setVariants(((v ?? []) as any[]).map((r) => ({
        id: r.id,
        sku: r.sku ?? "",
        name: r.name ?? "",
        barcode: r.barcode ?? "",
        attributes: (r.attributes ?? {}) as Record<string, string>,
        price: r.price == null ? "" : String(r.price),
        cost_override: costMap.get(r.id) == null ? "" : String(costMap.get(r.id)),
        stock: String(r.stock ?? 0),
        low_stock_threshold: r.low_stock_threshold == null ? "" : String(r.low_stock_threshold),
        active: r.active !== false,
        archived_at: r.archived_at ?? null,
        image_url: r.image_url ?? null,
      })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [productId]);

  const activeVariants = useMemo(() => variants.filter((v) => v.active && !v.archived_at), [variants]);
  const derivedStock = useMemo(
    () => activeVariants.reduce((s, v) => s + (Number(v.stock) || 0), 0),
    [activeVariants],
  );

  /* -------- Attribute library helpers -------- */

  async function upsertAttrValues(key: string, values: string[]) {
    const def = attrs.find((a) => a.key === key);
    if (!def) return;
    const clean = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
    const { error } = await supabase.from("product_attributes").update({ values: clean as any }).eq("id", def.id);
    if (error) return toast.error("บันทึกค่าตัวเลือกไม่สำเร็จ: " + error.message);
    setAttrs((prev) => prev.map((a) => a.id === def.id ? { ...a, values: clean } : a));
  }

  async function addCustomAttribute(labelTh: string) {
    const label = labelTh.trim();
    if (!label) return;
    const key = "attr_" + Math.random().toString(36).slice(2, 8);
    const { data, error } = await supabase.from("product_attributes")
      .insert({ key, label_th: label, values: [] as any, is_builtin: false, sort_order: 100 } as any)
      .select().single();
    if (error) return toast.error("เพิ่มคุณลักษณะไม่สำเร็จ: " + error.message);
    setAttrs((p) => [...p, { ...(data as any), values: [] }]);
    toast.success(`เพิ่มคุณลักษณะ "${label}" แล้ว`);
  }

  /* -------- Combination builder -------- */

  const combos = useMemo(() => {
    const chosen = pickedKeys.slice(0, 3).map((k) => ({ key: k, values: pickedValues[k] || [] }));
    if (chosen.some((c) => c.values.length === 0)) return [];
    return cartesian(chosen);
  }, [pickedKeys, pickedValues]);

  function generateFromBuilder() {
    if (combos.length === 0) return toast.error("เลือกอย่างน้อย 1 คุณลักษณะและค่า");
    if (combos.length > MAX_COMBOS) return toast.error(`เกินเพดาน ${MAX_COMBOS} ชุด`);
    if (combos.length > WARN_COMBOS && !confirm(`จะสร้าง ${combos.length} SKU ยืนยัน?`)) return;
    const existingSkus = new Set(variants.map((v) => v.sku));
    const keys = pickedKeys.slice(0, 3);
    const additions: Variant[] = [];
    for (const c of combos) {
      const sku = buildDeterministicSku(parentCode, c, keys);
      if (existingSkus.has(sku)) continue;
      existingSkus.add(sku);
      additions.push({
        sku, name: keys.map((k) => c[k]).join(" / "), barcode: "",
        attributes: c, price: "", cost_override: "", stock: "0",
        low_stock_threshold: "", active: true, archived_at: null, image_url: null,
      });
    }
    setVariants((prev) => [...prev, ...additions]);
    toast.success(`เพิ่ม ${additions.length} SKU (ยังไม่บันทึก)`);
  }

  /* -------- Grid ops -------- */

  function bulkSet(field: "price" | "cost_override" | "stock" | "low_stock_threshold", value: string) {
    setVariants((prev) => prev.map((v) => v.active && !v.archived_at ? { ...v, [field]: value } : v));
  }

  function bulkToggleActive(active: boolean) {
    setVariants((prev) => prev.map((v) => v.archived_at ? v : { ...v, active }));
  }

  function fillMissingSkus() {
    setVariants((prev) => {
      const seen = new Set(prev.filter((v) => v.sku).map((v) => v.sku));
      return prev.map((v) => {
        if (v.sku) return v;
        let s = buildDeterministicSku(parentCode, v.attributes, Object.keys(v.attributes));
        let n = 1;
        while (seen.has(s)) { s = `${s}-${n++}`; }
        seen.add(s);
        return { ...v, sku: s };
      });
    });
  }

  /* -------- Persist grid (non-conversion path) -------- */

  async function saveVariants() {
    // Validate uniqueness locally
    const skuSeen = new Set<string>();
    const bcSeen = new Set<string>();
    for (const v of variants) {
      if (!v.sku.trim()) return toast.error("มี SKU ว่าง");
      if (skuSeen.has(v.sku)) return toast.error(`SKU ซ้ำ: ${v.sku}`);
      skuSeen.add(v.sku);
      if (v.barcode.trim()) {
        if (bcSeen.has(v.barcode)) return toast.error(`บาร์โค้ดซ้ำ: ${v.barcode}`);
        bcSeen.add(v.barcode);
      }
      if (Number(v.stock) < 0) return toast.error(`สต๊อกติดลบ: ${v.sku}`);
    }
    setSaving(true);
    try {
      for (const v of variants) {
        const payload: any = {
          product_id: productId,
          sku: v.sku.trim(),
          name: v.name.trim() || null,
          barcode: v.barcode.trim() || null,
          attributes: v.attributes,
          price: v.price === "" ? null : Number(v.price),
          stock: Number(v.stock) || 0,
          low_stock_threshold: v.low_stock_threshold === "" ? null : Number(v.low_stock_threshold),
          active: v.active,
          image_url: v.image_url,
        };
        let variantId = v.id;
        if (variantId) {
          const { error } = await supabase.from("product_variants").update(payload).eq("id", variantId);
          if (error) throw error;
        } else {
          const { data: ins, error } = await supabase.from("product_variants").insert(payload).select("id").single();
          if (error) throw error;
          variantId = (ins as any)?.id;
        }
        if (canSeeCost && variantId) {
          const { error: cErr } = await (supabase as any).rpc("set_variant_cost", {
            p_variant_id: variantId,
            p_cost: v.cost_override === "" ? null : Number(v.cost_override),
          });
          if (cErr) throw cErr;
        }
      }
      toast.success("บันทึก SKU แล้ว");
      onChanged?.();
    } catch (e: any) {
      toast.error("บันทึกไม่สำเร็จ: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  /* -------- Conversion RPCs -------- */

  async function performEnable() {
    if (variants.length === 0) return toast.error("ยังไม่มี SKU สำหรับเปิดใช้งาน");
    const allocations = variants.map((v) => ({
      sku: v.sku, name: v.name, barcode: v.barcode || null,
      attributes: v.attributes, price: v.price || null,
      cost_override: v.cost_override || null, stock: v.stock || "0",
      low_stock_threshold: v.low_stock_threshold || null,
      active: v.active, image_url: v.image_url,
    }));
    const total = allocations.reduce((s, a) => s + (Number(a.stock) || 0), 0);
    if (parentStock > 0 && total !== parentStock) {
      return toast.error(`ยอดรวมสต๊อก ${total} ต้องเท่ากับสต๊อกเดิม ${parentStock}`);
    }
    setBusyRpc(true);
    try {
      const { error } = await supabase.rpc("enable_product_variants" as any, {
        _product_id: productId, _allocations: allocations as any,
      });
      if (error) throw error;
      toast.success("เปิดใช้งาน SKU สำเร็จ");
      setShowEnableConfirm(false);
      onChanged?.();
    } catch (e: any) {
      toast.error("เปิดใช้งานไม่สำเร็จ (ยกเลิกทั้งหมด): " + (e?.message || e));
    } finally { setBusyRpc(false); }
  }

  async function performDisable() {
    setBusyRpc(true);
    try {
      const { error } = await supabase.rpc("disable_product_variants" as any, { _product_id: productId });
      if (error) throw error;
      toast.success("ปิดใช้งาน SKU และรวมสต๊อกกลับแล้ว");
      setShowDisableConfirm(false);
      onChanged?.();
    } catch (e: any) {
      toast.error("ปิดใช้งานไม่สำเร็จ: " + (e?.message || e));
    } finally { setBusyRpc(false); }
  }

  if (loading) return <div className="text-xs text-muted-foreground">กำลังโหลด…</div>;

  return (
    <div ref={sectionRef} data-testid="sku-manager" className="space-y-3">
      <div className="flex items-center justify-between rounded-md border p-3 bg-card">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <div>
            <div className="font-semibold text-sm">SKU (สี, ไซส์, ฯลฯ)</div>
            <div className="text-xs text-muted-foreground">
              สถานะ: {hasVariants ? <Badge className="bg-emerald-600">เปิดใช้งาน</Badge> : <Badge variant="secondary">ปิดใช้งาน</Badge>}
              {hasVariants && <span className="ml-2">สต๊อกรวมจาก SKU: <b>{derivedStock}</b></span>}
            </div>
          </div>
        </div>
        <Switch
          checked={hasVariants}
          data-testid="sku-enable-toggle"
          onCheckedChange={(next) => next ? setShowEnableConfirm(true) : setShowDisableConfirm(true)}
        />
      </div>

      {/* Combination builder */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="text-sm font-semibold flex items-center gap-1"><Wand2 className="h-4 w-4" /> เครื่องมือสร้างชุด SKU</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {[0,1,2].map((slot) => {
            const selected = pickedKeys[slot] || "";
            return (
              <div key={slot} className="space-y-1">
                <Label className="text-xs">คุณลักษณะ #{slot+1}</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={selected}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPickedKeys((prev) => {
                      const next = [...prev];
                      next[slot] = val;
                      return next.filter(Boolean);
                    });
                  }}
                  data-testid={`sku-attr-slot-${slot}`}
                >
                  <option value="">— เลือก —</option>
                  {attrs.map((a) => (
                    <option key={a.id} value={a.key}
                      disabled={pickedKeys.includes(a.key) && a.key !== selected}>
                      {a.label_th}
                    </option>
                  ))}
                </select>
                {selected && (
                  <ValueChips
                    def={attrs.find((a) => a.key === selected)!}
                    picked={pickedValues[selected] || []}
                    onPick={(vals) => setPickedValues((p) => ({ ...p, [selected]: vals }))}
                    onAddValueToLibrary={async (v) => {
                      const def = attrs.find((a) => a.key === selected)!;
                      await upsertAttrValues(def.key, Array.from(new Set([...(def.values || []), v])));
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <AddCustomAttribute onAdd={addCustomAttribute} />

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs">
            รวม <b data-testid="sku-combo-count">{combos.length}</b> ชุด
            {combos.length > WARN_COMBOS && <span className="text-amber-600 ml-2">⚠ เกิน {WARN_COMBOS}</span>}
            {combos.length > MAX_COMBOS && <span className="text-rose-600 ml-2">เกินเพดาน {MAX_COMBOS}</span>}
          </div>
          <Button size="sm" onClick={generateFromBuilder} disabled={combos.length === 0 || combos.length > MAX_COMBOS}
            data-testid="sku-generate">
            <Plus className="h-4 w-4 mr-1" /> สร้าง SKU
          </Button>
        </div>
      </div>

      {/* Variant grid */}
      <div className="rounded-md border">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
          <div className="text-sm font-semibold">ตาราง SKU ({variants.length})</div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={fillMissingSkus}>สร้าง SKU ที่ขาด</Button>
            <Button size="sm" variant="outline" onClick={() => bulkToggleActive(true)}>เปิดทั้งหมด</Button>
            <Button size="sm" variant="outline" onClick={() => bulkToggleActive(false)}>ปิดทั้งหมด</Button>
          </div>
        </div>
        <div className="p-2 flex flex-wrap gap-2 border-b bg-muted/20 text-xs items-end">
          {(["price","cost_override","stock","low_stock_threshold"] as const).map((f) => (
            <BulkField key={f} field={f} onApply={(v) => bulkSet(f, v)} />
          ))}
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-2 py-1">SKU</th>
                <th className="text-left px-2 py-1">ชื่อแสดง</th>
                <th className="text-left px-2 py-1">บาร์โค้ด</th>
                <th className="text-right px-2 py-1">ราคา</th>
                <th className="text-right px-2 py-1">ต้นทุน</th>
                <th className="text-right px-2 py-1">สต๊อก</th>
                <th className="text-right px-2 py-1">แจ้งเตือน</th>
                <th className="text-center px-2 py-1">ใช้งาน</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {variants.length === 0 && (
                <tr><td colSpan={9} className="py-4 text-center text-muted-foreground">ยังไม่มี SKU — ใช้เครื่องมือด้านบนเพื่อสร้าง</td></tr>
              )}
              {variants.map((v, i) => (
                <tr key={v.id ?? `n-${i}`} className={`border-t ${v.archived_at ? "opacity-50" : ""}`}>
                  <td className="px-2 py-1"><Input value={v.sku} onChange={(e) => setVariants((p) => p.map((x, ix) => ix === i ? { ...x, sku: e.target.value } : x))} data-testid={`sku-row-sku-${i}`} className="h-8" /></td>
                  <td className="px-2 py-1"><Input value={v.name} onChange={(e) => setVariants((p) => p.map((x, ix) => ix === i ? { ...x, name: e.target.value } : x))} className="h-8" /></td>
                  <td className="px-2 py-1"><Input value={v.barcode} onChange={(e) => setVariants((p) => p.map((x, ix) => ix === i ? { ...x, barcode: e.target.value } : x))} className="h-8" /></td>
                  <td className="px-2 py-1"><Input type="number" min={0} value={v.price} onChange={(e) => setVariants((p) => p.map((x, ix) => ix === i ? { ...x, price: e.target.value } : x))} className="h-8 text-right" /></td>
                  <td className="px-2 py-1"><Input type="number" min={0} value={v.cost_override} disabled={!canSeeCost} title={canSeeCost ? undefined : "ไม่มีสิทธิ์ดู/แก้ไขต้นทุน"} onChange={(e) => setVariants((p) => p.map((x, ix) => ix === i ? { ...x, cost_override: e.target.value } : x))} className="h-8 text-right" /></td>
                  <td className="px-2 py-1"><Input type="number" min={0} value={v.stock} onChange={(e) => setVariants((p) => p.map((x, ix) => ix === i ? { ...x, stock: e.target.value } : x))} data-testid={`sku-row-stock-${i}`} className="h-8 text-right" /></td>
                  <td className="px-2 py-1"><Input type="number" min={0} value={v.low_stock_threshold} onChange={(e) => setVariants((p) => p.map((x, ix) => ix === i ? { ...x, low_stock_threshold: e.target.value } : x))} className="h-8 text-right" /></td>
                  <td className="px-2 py-1 text-center">
                    <Switch checked={v.active} onCheckedChange={(c) => setVariants((p) => p.map((x, ix) => ix === i ? { ...x, active: !!c } : x))} disabled={!!v.archived_at} />
                  </td>
                  <td className="px-2 py-1">
                    {v.id ? (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1" title="ใช้งานอยู่ในประวัติ — เก็บถาวรแทน">
                        <Archive className="h-3 w-3" />
                      </span>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => setVariants((p) => p.filter((_, ix) => ix !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-muted-foreground">
            {hasVariants
              ? "สต๊อกของสินค้าหลักถูกล็อก — แก้ที่ SKU แต่ละรายการ"
              : "การบันทึกที่นี่จะเซฟตาราง SKU (ยังไม่เปลี่ยนโหมดสินค้า) กด Enable ด้านบนเพื่อสลับเป็นโหมด SKU แบบธุรกรรม"}
          </div>
          <Button size="sm" onClick={saveVariants} disabled={saving} data-testid="sku-save-grid">
            {saving ? "กำลังบันทึก…" : "บันทึกตาราง"}
          </Button>
        </div>
      </div>

      {/* Enable confirm */}
      <AlertDialog open={showEnableConfirm} onOpenChange={setShowEnableConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>เปิดใช้งาน SKU?</AlertDialogTitle>
            <AlertDialogDescription>
              จะสร้าง {variants.length} SKU และย้ายสต๊อกสินค้าหลัก ({parentStock}) เข้าไปอยู่ใน SKU ทั้งหมดในธุรกรรมเดียว
              หากยอดรวมสต๊อกไม่เท่าเดิม การเปลี่ยนแปลงจะถูกยกเลิกทั้งหมด
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="sku-enable-cancel">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={performEnable} disabled={busyRpc} data-testid="sku-enable-confirm">
              ยืนยันเปิดใช้งาน <ChevronRight className="h-4 w-4 ml-1" />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable confirm */}
      <AlertDialog open={showDisableConfirm} onOpenChange={setShowDisableConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดใช้งาน SKU?</AlertDialogTitle>
            <AlertDialogDescription>
              จะรวมสต๊อกของ SKU ที่เปิดใช้งานทั้งหมด ({derivedStock}) กลับไปที่สินค้าหลัก และเก็บถาวร SKU (ไม่ลบทิ้ง เพื่อรักษาประวัติการขาย)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="sku-disable-cancel">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={performDisable} disabled={busyRpc} data-testid="sku-disable-confirm">ยืนยันปิดใช้งาน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ValueChips({
  def, picked, onPick, onAddValueToLibrary,
}: {
  def: AttrDef; picked: string[];
  onPick: (v: string[]) => void;
  onAddValueToLibrary: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const all = Array.from(new Set([...(def.values || []), ...picked]));
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {all.map((v) => {
          const on = picked.includes(v);
          return (
            <button
              key={v} type="button"
              onClick={() => onPick(on ? picked.filter((x) => x !== v) : [...picked, v])}
              className={`text-[11px] rounded-full px-2 py-0.5 border ${on ? "bg-primary text-primary-foreground" : "bg-background"}`}
            >{v}</button>
          );
        })}
      </div>
      <div className="flex gap-1">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="เพิ่มค่า…" className="h-7 text-xs" />
        <Button type="button" variant="outline" size="sm" onClick={() => {
          const v = draft.trim(); if (!v) return;
          onPick(Array.from(new Set([...picked, v])));
          onAddValueToLibrary(v);
          setDraft("");
        }}>เพิ่ม</Button>
      </div>
    </div>
  );
}

function AddCustomAttribute({ onAdd }: { onAdd: (label: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-1 items-center pt-1">
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="เพิ่มคุณลักษณะเอง เช่น 'กลิ่น'" className="h-8 text-xs max-w-xs" />
      <Button type="button" size="sm" variant="outline" onClick={() => { onAdd(v); setV(""); }}>
        <Plus className="h-3.5 w-3.5 mr-1" /> เพิ่มคุณลักษณะ
      </Button>
    </div>
  );
}

function BulkField({ field, onApply }: { field: string; onApply: (v: string) => void }) {
  const [v, setV] = useState("");
  const label = ({ price: "ราคา", cost_override: "ต้นทุน", stock: "สต๊อก", low_stock_threshold: "แจ้งเตือน" } as any)[field] || field;
  return (
    <div className="flex items-end gap-1">
      <div>
        <Label className="text-[10px]">ตั้งค่ารวม {label}</Label>
        <Input type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} className="h-7 w-24 text-xs" />
      </div>
      <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => { if (v !== "") onApply(v); }}>ใช้</Button>
    </div>
  );
}

export const __test__ = { buildDeterministicSku, cartesian, normalizeToken };